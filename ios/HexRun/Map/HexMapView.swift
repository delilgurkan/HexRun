import MapLibre
import SwiftUI
import UIKit
import HexRunKit

/// Haritada çizilecek her şey (değer tipi; değişince kaynaklar güncellenir).
struct MapContent: Equatable {
    var cells: [MapCell] = []
    var myId: String?
    var players: [MapPlayer] = []
    var attackers: Int = 0
    /// Çevrimdışı: son bilinen harita soluk.
    var faded = false
    /// İlk halka önerisi (kesikli).
    var suggestion: [LatLng] = []
    /// Koşu izi.
    var trace: [LatLng] = []
    var start: LatLng?
    var captureRadiusM: Double = Rules.loopCloseM
    /// Kapanış modunda taralı önizleme.
    var previewRing: [LatLng] = []
    var highlight: [String] = []
    var selection: [String] = []
    var selectionSlot: Slot?
    var route: [LatLng] = []
    var showPlayers = true
}

struct MapCamera: Equatable {
    var center: LatLng
    var zoom: Double
    /// Artınca kamera yeniden merkeze uçar.
    var token: Int = 0
    var animated = true
}

enum PaintPhase { case began, changed, ended }

/// MapLibre Native haritası: petekler `slot` rengine göre GeoJSON dolgu/çizgi katmanları,
/// mürekkep kılıf, kuşatılan petekler saldırgan renginde taralı ve 2 sn nefes alan kenar.
struct HexMapView: UIViewRepresentable {
    var content: MapContent
    var camera: MapCamera?
    var painting = false
    var interactive = true
    var onBoundsChange: ((BBox) -> Void)?
    var onTapCell: ((String) -> Void)?
    var onPlayerTap: ((MapPlayer) -> Void)?
    var onPaint: ((PaintPhase, String?) -> Void)?
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MLNMapView {
        let c = context.coordinator
        c.bind(self)
        let map = MLNMapView(frame: .zero, styleURL: AppConfig.mapStyleURL(dark: theme.isDark))
        map.delegate = c
        map.logoView.isHidden = true
        map.compassView.isHidden = true
        map.isPitchEnabled = false
        map.isRotateEnabled = false
        map.minimumZoomLevel = 11
        map.maximumZoomLevel = 19
        map.attributionButtonPosition = .bottomLeft
        map.backgroundColor = theme.raw("land")
        let cam = camera?.center ?? defaultMapCenter
        map.setCenter(CLLocationCoordinate2D(latitude: cam.lat, longitude: cam.lng), zoomLevel: camera?.zoom ?? 15, animated: false)
        let tap = UITapGestureRecognizer(target: c, action: #selector(Coordinator.handleTap(_:)))
        tap.delegate = c
        map.addGestureRecognizer(tap)
        let pan = UIPanGestureRecognizer(target: c, action: #selector(Coordinator.handlePaint(_:)))
        pan.maximumNumberOfTouches = 1
        pan.delegate = c
        map.addGestureRecognizer(pan)
        c.paintRecognizer = pan
        c.mapView = map
        c.lastCameraToken = camera?.token ?? 0
        c.isDark = theme.isDark
        return map
    }

    func updateUIView(_ map: MLNMapView, context: Context) {
        let c = context.coordinator
        c.bind(self)
        map.isScrollEnabled = interactive && !painting
        map.isZoomEnabled = interactive
        c.paintRecognizer?.isEnabled = painting
        c.painting = painting
        if c.isDark != theme.isDark {
            c.isDark = theme.isDark
            c.styleReady = false
            map.styleURL = AppConfig.mapStyleURL(dark: theme.isDark)
        }
        if let cam = camera, cam.token != c.lastCameraToken {
            c.lastCameraToken = cam.token
            map.setCenter(CLLocationCoordinate2D(latitude: cam.center.lat, longitude: cam.center.lng), zoomLevel: cam.zoom, animated: cam.animated && !reduceMotion)
        }
        c.apply(content, theme: theme, reduceMotion: reduceMotion)
    }

    static func dismantleUIView(_ map: MLNMapView, coordinator: Coordinator) {
        coordinator.breathTimer?.invalidate()
    }

    final class Coordinator: NSObject, MLNMapViewDelegate, UIGestureRecognizerDelegate {
        var onBoundsChange: ((BBox) -> Void)?
        var onTapCell: ((String) -> Void)?
        var onPlayerTap: ((MapPlayer) -> Void)?
        var onPaint: ((PaintPhase, String?) -> Void)?
        var painting = false
        var pending: MapContent?
        var theme = Theme(isDark: true)
        weak var mapView: MLNMapView?
        weak var paintRecognizer: UIPanGestureRecognizer?
        var styleReady = false
        var isDark = true
        var lastCameraToken = 0
        var applied: MapContent?
        var appliedDark: Bool?
        var breathTimer: Timer?
        var breathPhase = 0.0
        var lastPaintCell: String?
        var reduceMotion = false
        private var playerAnnotations: [String: PlayerAnnotation] = [:]

        // MARK: Stil

        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            styleReady = true
            applied = nil
            appliedDark = nil
            playerAnnotations.values.forEach { mapView.removeAnnotation($0) }
            playerAnnotations = [:]
            setupLayers(style, theme: theme)
            if let content = pending { apply(content, theme: theme, reduceMotion: reduceMotion) }
        }

        static let sourceIds = ["cells", "highlight", "selection", "preview", "suggestion", "route", "trace", "start-rings", "start-tri"]

        private func setupLayers(_ style: MLNStyle, theme: Theme) {
            for id in Self.sourceIds where style.source(withIdentifier: id) == nil {
                style.addSource(MLNShapeSource(identifier: id, shape: nil, options: nil))
            }
            guard let cells = style.source(withIdentifier: "cells") else { return }
            let ink = theme.raw("ink")
            for slot in Slot.allCases {
                style.setImage(Self.hatchImage(theme.playerUI(slot)), forName: "hatch-\(slot.rawValue)")
                let fill = MLNFillStyleLayer(identifier: "cells-fill-\(slot.rawValue)", source: cells)
                fill.predicate = NSPredicate(format: "slot == %@", slot.rawValue)
                fill.fillColor = NSExpression(forConstantValue: theme.playerUI(slot))
                fill.fillOpacity = NSExpression(forConstantValue: theme.cellFillOpacity)
                style.addLayer(fill)
            }
            for slot in Slot.allCases {
                let hatch = MLNFillStyleLayer(identifier: "cells-hatch-\(slot.rawValue)", source: cells)
                hatch.predicate = NSPredicate(format: "siege == YES AND atk == %@", slot.rawValue)
                hatch.fillPattern = NSExpression(forConstantValue: "hatch-\(slot.rawValue)")
                hatch.fillOpacity = NSExpression(forConstantValue: 0.85)
                style.addLayer(hatch)
            }
            let casing = MLNLineStyleLayer(identifier: "cells-casing", source: cells)
            casing.lineColor = NSExpression(forConstantValue: theme.raw("casing"))
            casing.lineWidth = NSExpression(forConstantValue: 1)
            casing.lineOpacity = NSExpression(forConstantValue: 0.55)
            style.addLayer(casing)
            let ghost = MLNLineStyleLayer(identifier: "cells-ghost", source: cells)
            ghost.predicate = NSPredicate(format: "ghost == YES")
            ghost.lineColor = NSExpression(forConstantValue: theme.raw("ink3"))
            ghost.lineWidth = NSExpression(forConstantValue: 1)
            ghost.lineDashPattern = NSExpression(forConstantValue: [0.5, 2])
            ghost.lineOpacity = NSExpression(forConstantValue: 0.6)
            style.addLayer(ghost)
            for slot in Slot.allCases {
                let edge = MLNLineStyleLayer(identifier: "cells-siege-\(slot.rawValue)", source: cells)
                edge.predicate = NSPredicate(format: "siege == YES AND atk == %@", slot.rawValue)
                edge.lineColor = NSExpression(forConstantValue: theme.playerUI(slot))
                edge.lineWidth = NSExpression(forConstantValue: 2.5)
                edge.lineDashPattern = NSExpression(forConstantValue: [1.5, 1])
                style.addLayer(edge)
            }
            let siegeInk = MLNLineStyleLayer(identifier: "cells-siege-ink", source: cells)
            siegeInk.predicate = NSPredicate(format: "siege == YES AND atk == ''")
            siegeInk.lineColor = NSExpression(forConstantValue: ink)
            siegeInk.lineWidth = NSExpression(forConstantValue: 2.5)
            siegeInk.lineDashPattern = NSExpression(forConstantValue: [1.5, 1])
            style.addLayer(siegeInk)
            let attack = MLNLineStyleLayer(identifier: "cells-attack", source: cells)
            attack.predicate = NSPredicate(format: "attacking == YES")
            attack.lineColor = NSExpression(forConstantValue: ink)
            attack.lineWidth = NSExpression(forConstantValue: 2)
            attack.lineDashPattern = NSExpression(forConstantValue: [2, 1.5])
            attack.lineOpacity = NSExpression(forConstantValue: 0.8)
            style.addLayer(attack)

            func line(_ id: String, _ src: String, color: UIColor, width: Double, dash: [Double]? = nil) {
                guard let s = style.source(withIdentifier: src) else { return }
                let l = MLNLineStyleLayer(identifier: id, source: s)
                l.lineColor = NSExpression(forConstantValue: color)
                l.lineWidth = NSExpression(forConstantValue: width)
                l.lineCap = NSExpression(forConstantValue: "round")
                l.lineJoin = NSExpression(forConstantValue: "round")
                if let dash { l.lineDashPattern = NSExpression(forConstantValue: dash) }
                style.addLayer(l)
            }
            func fill(_ id: String, _ src: String, color: UIColor, opacity: Double) {
                guard let s = style.source(withIdentifier: src) else { return }
                let f = MLNFillStyleLayer(identifier: id, source: s)
                f.fillColor = NSExpression(forConstantValue: color)
                f.fillOpacity = NSExpression(forConstantValue: opacity)
                style.addLayer(f)
            }
            line("highlight-line", "highlight", color: ink, width: 2.5)
            fill("selection-fill", "selection", color: ink, opacity: 0.35)
            line("selection-line", "selection", color: ink, width: 2)
            fill("preview-fill", "preview", color: ink, opacity: 0.12)
            line("preview-line", "preview", color: ink, width: 2, dash: [2, 2])
            line("suggestion-line", "suggestion", color: ink, width: 3, dash: [2, 1.5])
            line("route-line", "route", color: ink, width: 3, dash: [1, 1.2])
            line("trace-casing", "trace", color: ink, width: 7)
            line("trace-line", "trace", color: theme.raw("trace"), width: 3.5)
            line("start-rings-line", "start-rings", color: ink, width: 1.5)
            fill("start-tri-fill", "start-tri", color: ink, opacity: 1)
        }

        static func hatchImage(_ color: UIColor) -> UIImage {
            let size = CGSize(width: 8, height: 8)
            return UIGraphicsImageRenderer(size: size).image { ctx in
                let cg = ctx.cgContext
                cg.setStrokeColor(color.cgColor)
                cg.setLineWidth(2.2)
                cg.move(to: CGPoint(x: -2, y: 10)); cg.addLine(to: CGPoint(x: 10, y: -2))
                cg.move(to: CGPoint(x: -6, y: 6)); cg.addLine(to: CGPoint(x: 6, y: -6))
                cg.move(to: CGPoint(x: 2, y: 14)); cg.addLine(to: CGPoint(x: 14, y: 2))
                cg.strokePath()
            }
        }

        // MARK: Veri

        func apply(_ content: MapContent, theme: Theme, reduceMotion: Bool) {
            self.reduceMotion = reduceMotion
            self.theme = theme
            pending = content
            guard styleReady, let map = mapView, let style = map.style else { return }
            let old = applied
            if old?.cells != content.cells || old?.myId != content.myId {
                set(style, "cells", GeoJSON.cells(content.cells))
            }
            if old?.faded != content.faded || appliedDark != theme.isDark {
                let k = content.faded ? 0.45 : 1
                for slot in Slot.allCases {
                    (style.layer(withIdentifier: "cells-fill-\(slot.rawValue)") as? MLNFillStyleLayer)?.fillOpacity = NSExpression(forConstantValue: theme.cellFillOpacity * k)
                }
                (style.layer(withIdentifier: "cells-casing") as? MLNLineStyleLayer)?.lineOpacity = NSExpression(forConstantValue: content.faded ? 0.25 : 0.55)
            }
            if old?.highlight != content.highlight { set(style, "highlight", GeoJSON.cellIds(content.highlight)) }
            if old?.selection != content.selection { set(style, "selection", GeoJSON.cellIds(content.selection)) }
            if old?.selectionSlot != content.selectionSlot || appliedDark != theme.isDark {
                let color = content.selectionSlot.map(theme.playerUI) ?? theme.raw("ink")
                (style.layer(withIdentifier: "selection-fill") as? MLNFillStyleLayer)?.fillColor = NSExpression(forConstantValue: color)
            }
            if old?.previewRing != content.previewRing { set(style, "preview", content.previewRing.count >= 4 ? GeoJSON.polygon(content.previewRing) : GeoJSON.empty) }
            if old?.suggestion != content.suggestion { set(style, "suggestion", content.suggestion.count >= 2 ? GeoJSON.line(content.suggestion) : GeoJSON.empty) }
            if old?.route != content.route { set(style, "route", content.route.count >= 2 ? GeoJSON.line(content.route) : GeoJSON.empty) }
            if old?.trace != content.trace { set(style, "trace", content.trace.count >= 2 ? GeoJSON.line(content.trace) : GeoJSON.empty) }
            if old?.start != content.start || old?.captureRadiusM != content.captureRadiusM {
                if let s = content.start {
                    set(style, "start-rings", GeoJSON.lines([Geo.circle(center: s, radiusM: content.captureRadiusM), Geo.circle(center: s, radiusM: content.captureRadiusM * 0.8)]))
                    set(style, "start-tri", GeoJSON.polygon(Geo.triangle(center: s)))
                } else {
                    set(style, "start-rings", GeoJSON.empty)
                    set(style, "start-tri", GeoJSON.empty)
                }
            }
            if old?.players != content.players || old?.showPlayers != content.showPlayers || old?.attackers != content.attackers || appliedDark != theme.isDark {
                syncPlayers(content, theme: theme)
            }
            applied = content
            appliedDark = theme.isDark
            updateBreathing(enabled: content.cells.contains { $0.duel == .defending } && !content.faded)
        }

        private func set(_ style: MLNStyle, _ id: String, _ data: Data) {
            guard let src = style.source(withIdentifier: id) as? MLNShapeSource else { return }
            src.shape = try? MLNShape(data: data, encoding: String.Encoding.utf8.rawValue)
        }

        /// Kuşatma kenarı 2 sn döngüyle nefes alır; "Hareketi azalt" açıkken sabit.
        private func updateBreathing(enabled: Bool) {
            guard let style = mapView?.style else { return }
            let layers = (Slot.allCases.map { "cells-siege-\($0.rawValue)" } + ["cells-siege-ink"]).compactMap { style.layer(withIdentifier: $0) as? MLNLineStyleLayer }
            if !enabled || reduceMotion {
                breathTimer?.invalidate()
                breathTimer = nil
                layers.forEach { $0.lineOpacity = NSExpression(forConstantValue: 0.9) }
                return
            }
            guard breathTimer == nil else { return }
            breathTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                guard let self, let style = self.mapView?.style else { return }
                self.breathPhase += 0.1 / Motion.breathe
                let o = 0.35 + 0.65 * (0.5 + 0.5 * sin(self.breathPhase * 2 * .pi))
                for id in Slot.allCases.map({ "cells-siege-\($0.rawValue)" }) + ["cells-siege-ink"] {
                    (style.layer(withIdentifier: id) as? MLNLineStyleLayer)?.lineOpacity = NSExpression(forConstantValue: o)
                }
            }
        }

        // MARK: Oyuncular

        private func syncPlayers(_ content: MapContent, theme: Theme) {
            guard let map = mapView else { return }
            let wanted = content.showPlayers ? content.players.filter { $0.marker != nil } : []
            let ids = Set(wanted.map(\.id))
            for (id, a) in playerAnnotations where !ids.contains(id) {
                map.removeAnnotation(a)
                playerAnnotations[id] = nil
            }
            for p in wanted {
                let isMe = p.id == content.myId
                let key = "\(p.id)-\(p.slot.rawValue)-\(p.initials)-\(p.hidden)-\(p.goldFrame)-\(isMe ? content.attackers : -1)-\(theme.isDark)"
                if let existing = playerAnnotations[p.id], existing.key == key {
                    existing.coordinate = CLLocationCoordinate2D(latitude: p.marker!.lat, longitude: p.marker!.lng)
                    continue
                }
                if let existing = playerAnnotations[p.id] { map.removeAnnotation(existing) }
                let a = PlayerAnnotation()
                a.player = p
                a.key = key
                a.isMe = isMe
                a.attackers = isMe ? content.attackers : 0
                a.isDark = theme.isDark
                a.coordinate = CLLocationCoordinate2D(latitude: p.marker!.lat, longitude: p.marker!.lng)
                a.title = p.hidden ? S.map.hiddenPlayer : "\(p.displayName), \(S.common.cells(p.cells))"
                playerAnnotations[p.id] = a
                map.addAnnotation(a)
            }
        }

        func mapView(_ mapView: MLNMapView, imageFor annotation: MLNAnnotation) -> MLNAnnotationImage? {
            guard let a = annotation as? PlayerAnnotation, let p = a.player else { return nil }
            let image: UIImage? = MainActor.assumeIsolated {
                let badge = PlayerBadge(slot: p.slot, initials: p.initials, size: a.isMe ? 40 : 32, goldFrame: p.goldFrame,
                                        attackers: a.isMe ? a.attackers : nil, hidden: p.hidden, ring: a.isMe)
                    .padding(8)
                    .environment(\.theme, Theme(isDark: a.isDark))
                let r = ImageRenderer(content: badge)
                r.scale = 3
                return r.uiImage
            }
            guard let image else { return nil }
            return MLNAnnotationImage(image: image, reuseIdentifier: a.key)
        }

        func mapView(_ mapView: MLNMapView, annotationCanShowCallout annotation: MLNAnnotation) -> Bool { false }

        func mapView(_ mapView: MLNMapView, didSelect annotation: MLNAnnotation) {
            mapView.deselectAnnotation(annotation, animated: false)
            guard let a = annotation as? PlayerAnnotation, let p = a.player else { return }
            onPlayerTap?(p)
        }

        func mapView(_ mapView: MLNMapView, regionDidChangeAnimated animated: Bool) {
            let b = mapView.visibleCoordinateBounds
            onBoundsChange?(BBox(minLat: b.sw.latitude, minLng: b.sw.longitude, maxLat: b.ne.latitude, maxLng: b.ne.longitude))
        }

        // MARK: Hareketler

        private func cell(at point: CGPoint) -> String? {
            guard let map = mapView else { return nil }
            let c = map.convert(point, toCoordinateFrom: map)
            return H3.cellOf(lat: c.latitude, lng: c.longitude)
        }

        @objc func handleTap(_ g: UITapGestureRecognizer) {
            guard g.state == .ended, let map = mapView, let id = cell(at: g.location(in: map)) else { return }
            if painting {
                onPaint?(.began, id)
                onPaint?(.ended, nil)
            } else {
                onTapCell?(id)
            }
        }

        @objc func handlePaint(_ g: UIPanGestureRecognizer) {
            guard let map = mapView else { return }
            let id = cell(at: g.location(in: map))
            switch g.state {
            case .began:
                lastPaintCell = id
                onPaint?(.began, id)
            case .changed:
                if id != lastPaintCell {
                    lastPaintCell = id
                    onPaint?(.changed, id)
                }
            default:
                lastPaintCell = nil
                onPaint?(.ended, nil)
            }
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            g is UITapGestureRecognizer
        }
    }
}

extension HexMapView.Coordinator {
    @MainActor func bind(_ v: HexMapView) {
        onBoundsChange = v.onBoundsChange
        onTapCell = v.onTapCell
        onPlayerTap = v.onPlayerTap
        onPaint = v.onPaint
    }
}

final class PlayerAnnotation: MLNPointAnnotation {
    var player: MapPlayer?
    var key = ""
    var isMe = false
    var attackers = 0
    var isDark = true
}

/// GeoJSON üretimi ([lng, lat] sırası).
enum GeoJSON {
    static let empty = Data(#"{"type":"FeatureCollection","features":[]}"#.utf8)

    static func ring(_ pts: [LatLng]) -> [[Double]] {
        var r = pts.map { [$0.lng, $0.lat] }
        if let f = r.first, f != r.last { r.append(f) }
        return r
    }

    static func encode(_ features: [[String: Any]]) -> Data {
        (try? JSONSerialization.data(withJSONObject: ["type": "FeatureCollection", "features": features])) ?? empty
    }

    static func cells(_ cells: [MapCell]) -> Data {
        encode(cells.map { c in
            [
                "type": "Feature",
                "geometry": ["type": "Polygon", "coordinates": [ring(H3.boundary(c.id))]],
                "properties": [
                    "id": c.id,
                    "slot": c.slot?.rawValue ?? "",
                    "siege": c.duel == .defending,
                    "atk": c.duel == .defending ? (c.attackerSlot?.rawValue ?? "") : "",
                    "attacking": c.duel == .attacking,
                    "ghost": c.ghost > 0,
                ] as [String: Any],
            ]
        })
    }

    static func cellIds(_ ids: [String]) -> Data {
        encode(ids.map { ["type": "Feature", "geometry": ["type": "Polygon", "coordinates": [ring(H3.boundary($0))]], "properties": ["id": $0]] })
    }

    static func polygon(_ pts: [LatLng]) -> Data {
        encode([["type": "Feature", "geometry": ["type": "Polygon", "coordinates": [ring(pts)]], "properties": [String: Any]()]])
    }

    static func line(_ pts: [LatLng]) -> Data {
        lines([pts])
    }

    static func lines(_ list: [[LatLng]]) -> Data {
        encode(list.map { pts in ["type": "Feature", "geometry": ["type": "LineString", "coordinates": pts.map { [$0.lng, $0.lat] }], "properties": [String: Any]()] })
    }
}

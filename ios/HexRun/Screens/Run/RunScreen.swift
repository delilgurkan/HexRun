import SwiftUI
import UIKit
import HexRunKit

/// 05/06/07 · Koşu modu: tam ekran, sekme çubuğu yok. Üç metrik güneşte okunur; ≤300 m'de
/// "halkayı kapat" moduna geçer; halka kapanınca fetih anı (koşu durmaz). Tüm eylemler altta, ≥64 pt.
struct RunScreen: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(RunController.self) private var run
    @Environment(AppModel.self) private var app
    @Environment(\.theme) private var t
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var camera: MapCamera?
    @State private var finishing = false
    @State private var cells: [MapCell] = []

    private var stacked: Bool { typeSize.isAccessibilitySize }

    var body: some View {
        ZStack {
            t.c.bg.ignoresSafeArea()
            if let snap = run.snapshot {
                content(snap)
            } else {
                Color.clear.accessibilityIdentifier("run-starting")
            }
            if let c = run.conquest, let snap = run.snapshot {
                ConquestOverlay(conquest: c, snap: snap, haptics: env.haptics, onContinue: { run.dismissConquest() }, onFinish: finish)
                    .transition(.opacity)
            }
            if run.locked { lockOverlay }
        }
        .task {
            cells = Array(app.mapCache.cells.values)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                run.refresh()
            }
        }
        .onChange(of: run.snapshot?.pointCount) { _, _ in
            if let p = run.snapshot?.lastPoint {
                camera = MapCamera(center: p.latLng, zoom: 16, token: (camera?.token ?? 0) + 1)
            }
        }
        .interactiveDismissDisabled()
        .accessibilityIdentifier("run-screen")
    }

    private func gpsLabel(_ q: GpsQuality) -> String {
        q == .strong ? S.run.gpsStrong : q == .weak ? S.run.gpsWeak : S.run.gpsSearching
    }

    @ViewBuilder private func content(_ snap: RunSnapshot) -> some View {
        let tr = snap.tracker
        let closing = run.isClosing
        let paused = snap.status == .paused
        let events = EventsPresenter.activeNow()
        GeometryReader { geo in
            VStack(spacing: 0) {
                ZStack(alignment: .top) {
                    HexMapView(
                        content: MapContent(cells: cells, faded: true, trace: run.trace, start: tr.start?.latLng, captureRadiusM: snap.closeRadiusM,
                                            previewRing: closing ? run.previewRing : [], showPlayers: false),
                        camera: camera ?? MapCamera(center: tr.start?.latLng ?? app.mapCache.cells.values.first.map { H3.center($0.id) } ?? defaultMapCenter, zoom: 16),
                        interactive: false
                    )
                    .accessibilityIdentifier("run-map")
                    HStack(spacing: 8) {
                        Chip(label: gpsLabel(run.gps), icon: .locate, glass: true).accessibilityIdentifier("gps-chip")
                        if !events.isEmpty { Chip(label: EventsPresenter.shortLabel(events), glass: true) }
                        if let id = snap.context.defendDuelId, let d = app.mapCache.defending.first(where: { $0.id == id }) {
                            Chip(label: S.run.defending(d.attacker.displayName), icon: .defend, glass: true)
                        }
                        Spacer()
                        IconButton(.lock, label: S.run.lockA11y, glass: true) { run.setLocked(true) }.accessibilityIdentifier("lock")
                    }
                    .padding(.horizontal, Space.gutterRun)
                    .padding(.top, geo.safeAreaInsets.top + 8)
                    if closing, let pv = run.closingPreview {
                        VStack {
                            Spacer()
                            HStack {
                                Chip(label: S.run.closingCells(pv.cells.count), icon: .area, glass: true).accessibilityIdentifier("preview-cells")
                                Spacer()
                            }
                            .padding(.horizontal, Space.gutterRun)
                            .padding(.bottom, 12)
                        }
                    }
                }
                .frame(height: (geo.size.height + geo.safeAreaInsets.top) * (closing ? 0.58 : 0.42))
                .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: Radii.l, bottomTrailingRadius: Radii.l))

                VStack(alignment: .leading, spacing: 12) {
                    if closing { closingHud(snap) } else { runHud(snap, paused: paused) }
                    Spacer(minLength: 0)
                    HStack(spacing: 12) {
                        HXButton(paused ? S.run.resume : S.run.pause, kind: .secondary, icon: paused ? .play : .pause, big: true, minHeight: Target.runBar) {
                            paused ? run.resume() : run.pause()
                        }
                        .accessibilityIdentifier("pause")
                        HoldButton(label: S.run.finish, hint: S.run.holdHint, icon: .stop, onComplete: finish)
                            .accessibilityIdentifier("finish")
                    }
                    .padding(.bottom, 12)
                }
                .padding(.horizontal, Space.gutterRun)
                .padding(.top, 16)
            }
            .ignoresSafeArea(edges: .top)
        }
    }

    private func metric(_ label: String, _ value: String, big: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).hx(.label, tone: 2)
            Text(value)
                .hx(big ? .hudXl : .hudM)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        .frame(maxWidth: stacked ? nil : .infinity, alignment: .leading)
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(value)")
    }

    private func metricsRow(_ items: [(String, String)]) -> some View {
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12)) : AnyLayout(HStackLayout(alignment: .top, spacing: 16))
        return layout {
            ForEach(Array(items.enumerated()), id: \.offset) { _, it in metric(it.0, it.1) }
        }
    }

    private func runHud(_ snap: RunSnapshot, paused: Bool) -> some View {
        let tr = snap.tracker
        return VStack(alignment: .leading, spacing: 8) {
            Text(paused ? S.run.paused : tr.start != nil ? S.run.toStart(Fmt.distanceLabel(tr.distToStartM)) : S.run.gpsSearching).hx(.callout, tone: 2)
            metric(S.run.distanceKm, Fmt.km(tr.distanceM), big: true)
            metricsRow([(S.run.pacePerKm, Fmt.pace(tr.paceSecPerKm)), (S.run.time, Fmt.duration(snap.elapsedMs))])
        }
        .accessibilityIdentifier("run-hud")
    }

    private func closingHud(_ snap: RunSnapshot) -> some View {
        let tr = snap.tracker
        let remaining = closingRemainingM(tr.distToStartM)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .lastTextBaseline, spacing: 12) {
                Text(S.run.closingLeft(remaining)).hx(.hudXl).lineLimit(1).minimumScaleFactor(0.5)
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .accessibilityLabel(S.run.voiceClosing(remaining))
                Text(S.run.closingCta).hx(.title2)
            }
            if let pv = run.closingPreview {
                Text(S.run.closingPreview(pv.empty)).hx(.body, tone: 2)
                if let d = pv.duels.first { Text(S.run.duelCoverage(d.duel.defender.firstName, d.inside, d.total)).hx(.data, tone: 2) }
            }
            metricsRow([(S.common.distance, Fmt.km(tr.distanceM)), (S.common.pace, Fmt.pace(tr.paceSecPerKm)), (S.common.time, Fmt.duration(snap.elapsedMs))])
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("closing-hud")
    }

    private var lockOverlay: some View {
        Color.black.opacity(0.001)
            .ignoresSafeArea()
            .overlay(alignment: .bottom) {
                HStack(spacing: 8) {
                    Text(S.run.locked).font(HXFont.font(.archivo, .bold, 15))
                    Text("· \(S.run.unlockHint)").font(HXFont.font(.archivo, .medium, 13))
                }
                .foregroundStyle(t.c.invInk)
                .padding(.horizontal, 20).padding(.vertical, 12)
                .background(Capsule().fill(t.c.inv))
                .padding(.bottom, 120)
            }
            .onLongPressGesture(minimumDuration: 1.5) { run.setLocked(false) }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(S.run.locked)
            .accessibilityHint(S.run.unlockHint)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { run.setLocked(false) }
            .accessibilityIdentifier("lock-overlay")
    }

    private func finish() {
        guard !finishing else { return }
        finishing = true
        Task { await env.finishRun() }
    }
}

/// 07 · Fetih anı: üç vuruş, toplam 2,4 sn; koşu durmaz. 1) 0–0,3 sn kapanış 2) 0,3–1,8 sn dolum
/// (m² sayacı) 3) 2,0 sn → sonuç; kart 5 sn sonra kendiliğinden kapanır. "Hareketi azalt" → tek kare.
struct ConquestOverlay: View {
    let conquest: ConquestState
    let snap: RunSnapshot
    let haptics: Haptics
    let onContinue: () -> Void
    let onFinish: () -> Void
    @Environment(\.theme) private var t
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var beat = 1
    @State private var counted = 0.0
    @State private var left = Motion.conquestAutoDismiss

    var body: some View {
        let p = conquest.preview
        let eventNames = EventsPresenter.names(EventsPresenter.activeNow())
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            if beat == 1 {
                Text(S.conquest.closed).hx(.display).frame(maxWidth: .infinity).accessibilityAddTraits(.isHeader)
            } else if beat == 2 {
                VStack(spacing: 8) {
                    Text("\(Fmt.int(counted)) m²").font(HXFont.font(.archivo, .heavy, 72)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(t.c.ink)
                    if let d = p.duels.first { Text(S.conquest.duelLine(d.duel.defender.firstName)).hx(.body, tone: 2) }
                }
                .frame(maxWidth: .infinity)
            } else {
                Text(S.conquest.title(TRDate.hhmm(Date(epochMs: conquest.loop.closedAt)), eventNames)).hx(.label, tone: 2)
                Text(p.gained ? S.conquest.conquered : S.conquest.closed).hx(.display).accessibilityAddTraits(.isHeader)
                Text(S.conquest.headline(p.empty + p.own, p.empty, p.own)).hx(.title2)
                Text("+\(Fmt.area(p.newAreaM2))").hx(.title1)
                HStack(spacing: 8) {
                    Chip(label: S.conquest.newCells(p.empty))
                    if p.own > 0 { Chip(label: S.conquest.reinforced(p.own)) }
                    if let d = p.duels.first { Chip(label: S.conquest.covered(d.inside, d.total)) }
                }
                Text(S.conquest.serverNote).hx(.callout, tone: 3)
                HStack(spacing: 16) {
                    Stat(label: S.common.distance, value: Fmt.km(snap.tracker.distanceM))
                    Stat(label: S.common.pace, value: Fmt.pace(snap.tracker.paceSecPerKm))
                    Stat(label: S.common.time, value: Fmt.duration(snap.elapsedMs))
                }
                .padding(.vertical, 8)
                .overlay(alignment: .top) { Divider2() }
                HStack(spacing: 12) {
                    HXButton("\(S.conquest.continue) \(left)", big: true, action: onContinue).layoutPriority(2).accessibilityIdentifier("conquest-continue")
                    HXButton(S.conquest.finish, kind: .secondary, big: true, action: onFinish)
                }
            }
            Spacer()
        }
        .padding(.horizontal, Space.gutter)
        .background(t.c.bg.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityIdentifier("conquest")
        .task(id: conquest.loop.index) { await play() }
    }

    private func play() async {
        let p = conquest.preview
        beat = 1
        counted = 0
        left = Motion.conquestAutoDismiss
        haptics.playConquest(cells: p.cells.count)
        func sleep(_ s: Double) async { try? await Task.sleep(nanoseconds: UInt64(s * 1_000_000_000)) }
        await sleep(Motion.conquestBeat1)
        beat = 2
        if reduceMotion {
            counted = p.areaM2
        } else {
            let steps = 30
            for i in 1...steps {
                await sleep(1.5 / Double(steps))
                if Task.isCancelled { return }
                counted = (p.areaM2 * Double(i) / Double(steps)).rounded()
            }
        }
        if !p.duels.isEmpty { haptics.crack() }
        await sleep(max(0, 2.0 - Motion.conquestBeat1 - (reduceMotion ? 0 : 1.5)))
        beat = 3
        counted = p.areaM2
        UIAccessibility.post(notification: .announcement, argument: S.conquest.headline(p.empty + p.own, p.empty, p.own))
        while left > 0 {
            await sleep(1)
            if Task.isCancelled { return }
            left -= 1
        }
        onContinue()
    }
}

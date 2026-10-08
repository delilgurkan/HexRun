import Foundation

/// Telefondan saate (WatchConnectivity) aynalanan canlı koşu durumu. Saat yalnız gösterir.
public struct WatchRunState: Codable, Hashable, Sendable {
    public enum Phase: String, Codable, Sendable { case idle, running, paused, closing, conquest }
    public var phase: Phase
    public var distanceM: Double
    public var paceSecPerKm: Double?
    public var elapsedMs: Int64
    /// Başlangıca kalan (5 m'ye yuvarlı) mesafe.
    public var remainingM: Int
    /// Başlangıç yönü (derece, kuzeyden); bilinmiyorsa nil.
    public var bearingToStart: Double?
    public var duelName: String?
    public var duelInside: Int?
    public var duelTotal: Int?
    public var conquestCells: Int?
    public var conquestAreaM2: Double?
    /// Saatte titreşim: "tick", "double", "close", "success".
    public var haptic: String?
    public var sentAt: Int64

    public init(phase: Phase, distanceM: Double = 0, paceSecPerKm: Double? = nil, elapsedMs: Int64 = 0, remainingM: Int = 0, bearingToStart: Double? = nil,
                duelName: String? = nil, duelInside: Int? = nil, duelTotal: Int? = nil, conquestCells: Int? = nil, conquestAreaM2: Double? = nil,
                haptic: String? = nil, sentAt: Int64 = Date().epochMs) {
        self.phase = phase; self.distanceM = distanceM; self.paceSecPerKm = paceSecPerKm; self.elapsedMs = elapsedMs
        self.remainingM = remainingM; self.bearingToStart = bearingToStart; self.duelName = duelName; self.duelInside = duelInside
        self.duelTotal = duelTotal; self.conquestCells = conquestCells; self.conquestAreaM2 = conquestAreaM2; self.haptic = haptic; self.sentAt = sentAt
    }

    public static let idle = WatchRunState(phase: .idle)

    /// WatchConnectivity sözlüğü (`["state": Data]`).
    public var message: [String: Any] {
        ["state": (try? JSONEncoder().encode(self)) ?? Data()]
    }

    public init?(message: [String: Any]) {
        guard let d = message["state"] as? Data, let s = try? JSONDecoder().decode(WatchRunState.self, from: d) else { return nil }
        self = s
    }

    /// Saat ekranı metinleri (s17 · saat panoları).
    public struct Face: Hashable, Sendable {
        public var kicker: String
        public var value: String
        public var unit: String
        public var foot: String
        /// 0…1 düello halkası; nil → halka yok.
        public var ring: Double?
        public var accent: Bool
    }

    public var face: Face {
        switch phase {
        case .idle:
            return Face(kicker: S.watch.idleTitle, value: "–", unit: "", foot: S.watch.idleBody, ring: nil, accent: false)
        case .closing:
            return Face(kicker: S.watch.closeLoop, value: "\(remainingM) m", unit: S.watch.startAhead,
                        foot: "\(Fmt.km(distanceM)) km · \(Fmt.duration(elapsedMs))", ring: nil, accent: true)
        case .conquest:
            return Face(kicker: S.watch.conquest, value: "\(conquestCells ?? 0)", unit: S.watch.conquestCells,
                        foot: "+\(Fmt.area(conquestAreaM2 ?? 0))", ring: 1, accent: true)
        case .running, .paused:
            if let name = duelName, let inside = duelInside, let total = duelTotal, total > 0 {
                return Face(kicker: S.watch.duel(name), value: "\(inside)/\(total)", unit: S.watch.duelCells,
                            foot: "\(Fmt.km(distanceM, digits: 1)) km · \(Fmt.duration(elapsedMs))", ring: Double(inside) / Double(total), accent: false)
            }
            let kicker = phase == .paused ? S.watch.paused : S.watch.loopOpen(Fmt.distanceLabel(Double(remainingM)))
            return Face(kicker: kicker, value: Fmt.km(distanceM), unit: S.watch.km,
                        foot: "\(Fmt.pace(paceSecPerKm)) · \(Fmt.duration(elapsedMs))", ring: nil, accent: true)
        }
    }
}

/// İki nokta arası ilk yön (derece).
public func initialBearing(from a: LatLng, to b: LatLng) -> Double {
    let p1 = a.lat * .pi / 180, p2 = b.lat * .pi / 180
    let dl = (b.lng - a.lng) * .pi / 180
    let y = sin(dl) * cos(p2)
    let x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
    return (atan2(y, x) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
}

import Foundation

public struct LoopOptions: Codable, Hashable, Sendable {
    /// Yakalama yarıçapı (m): 50, Halka Ustası ile 60.
    public var closeRadiusM: Double?
    /// Asgari halka çevresi (m).
    public var minLoopLengthM: Double?
    /// Doğruluğu bundan kötü noktalar yok sayılır (m).
    public var maxAccuracyM: Double?
    /// Bundan hızlı ani sıçramalar (m/s) yok sayılır.
    public var maxJumpSpeedMps: Double?

    public init(closeRadiusM: Double? = nil, minLoopLengthM: Double? = nil, maxAccuracyM: Double? = nil, maxJumpSpeedMps: Double? = nil) {
        self.closeRadiusM = closeRadiusM
        self.minLoopLengthM = minLoopLengthM
        self.maxAccuracyM = maxAccuracyM
        self.maxJumpSpeedMps = maxJumpSpeedMps
    }
}

public struct ClosedLoop: Codable, Hashable, Sendable {
    /// Koşu içinde 1'den başlayan sıra.
    public var index: Int
    /// Halkayı oluşturan noktalar (başlangıca kapatılmış).
    public var ring: [TrackPoint]
    public var lengthM: Double
    public var areaM2: Double
    public var closedAt: Int64
    public var startedAt: Int64
}

public struct TrackerState: Hashable, Sendable {
    public var distanceM: Double
    public var durationMs: Int64
    /// Başlangıç noktasına kuş uçuşu mesafe.
    public var distToStartM: Double
    /// Halka kuruldu mu (başlangıçtan yeterince uzaklaşıldı ve asgari çevre aşıldı).
    public var armed: Bool
    /// HUD'un "halkayı kapat" modu (≤300 m).
    public var closingMode: Bool
    /// Ortalama tempo sn/km (yeterli veri yoksa nil).
    public var paceSecPerKm: Double?
    public var loops: [ClosedLoop]
    public var start: TrackPoint?

    public static let empty = TrackerState(distanceM: 0, durationMs: 0, distToStartM: 0, armed: false, closingMode: false, paceSecPerKm: nil, loops: [], start: nil)
}

/// Artımlı halka dedektörü; core `LoopTracker` ile birebir aynı sonuçları verir
/// (`shared/test-vectors/loops.json`). Sunucu yetkilidir; bu sınıf HUD içindir.
public final class LoopTracker {
    private let closeR: Double
    private let minLen: Double
    private let maxAcc: Double
    private let maxJump: Double
    private var pts: [TrackPoint] = []
    private var segStart = 0
    private var segLen = 0.0
    private var maxSegDist = 0.0
    private var dist = 0.0
    private var movingMs: Int64 = 0
    private var start: TrackPoint?
    private var loops: [ClosedLoop] = []
    private var lastDistToStart = 0.0
    private var paused = false
    private var resumeGap = false

    public init(_ opts: LoopOptions = LoopOptions()) {
        closeR = opts.closeRadiusM ?? Rules.loopCloseM
        minLen = opts.minLoopLengthM ?? Rules.minLoopLengthM
        maxAcc = opts.maxAccuracyM ?? 50
        maxJump = opts.maxJumpSpeedMps ?? 12
    }

    public var closeRadiusM: Double { closeR }

    /// Duraklatma: duraklatılmış süre ve mesafe sayılmaz; devamda sıçrama yok sayılır.
    public func pause() { paused = true }

    public func resume() {
        paused = false
        resumeGap = true
    }

    public var isPaused: Bool { paused }

    /// Yeni GPS noktası. Halka kapandıysa onu döndürür.
    @discardableResult
    public func push(_ p: TrackPoint) -> ClosedLoop? {
        if paused { return nil }
        if !p.lat.isFinite || !p.lng.isFinite { return nil }
        if let acc = p.acc, acc > maxAcc { return nil }
        if let prev = pts.last {
            if p.t <= prev.t { return nil }
            let d = Geo.haversineM(prev, p)
            let dt = Double(p.t - prev.t) / 1000
            if d / dt > maxJump, !resumeGap { return nil }
            if resumeGap {
                // Duraklatmadan dönüş: arada geçen mesafe/süre koşuya eklenmez.
                resumeGap = false
            } else {
                dist += d
                segLen += d
                movingMs += p.t - prev.t
            }
        } else {
            start = p
        }
        pts.append(p)
        let s = start!
        let ds = Geo.haversineM(s, p)
        lastDistToStart = ds
        if ds > maxSegDist { maxSegDist = ds }

        if isArmed, ds <= closeR {
            var ring = Array(pts[segStart...])
            let first = ring[0]
            if first.lat != s.lat || first.lng != s.lng {
                ring.insert(TrackPoint(lat: s.lat, lng: s.lng, t: first.t, acc: s.acc), at: 0)
            }
            ring.append(TrackPoint(lat: s.lat, lng: s.lng, t: p.t, acc: s.acc))
            let loop = ClosedLoop(
                index: loops.count + 1,
                ring: ring,
                lengthM: segLen + ds,
                areaM2: Geo.polygonAreaM2(ring.map(\.latLng)),
                closedAt: p.t,
                startedAt: first.t
            )
            loops.append(loop)
            segStart = pts.count - 1
            segLen = 0
            maxSegDist = ds
            return loop
        }
        return nil
    }

    private var isArmed: Bool {
        maxSegDist > closeR + Rules.loopArmExtraM && segLen >= minLen
    }

    public func state() -> TrackerState {
        let armed = isArmed
        return TrackerState(
            distanceM: dist,
            durationMs: movingMs,
            distToStartM: lastDistToStart,
            armed: armed,
            closingMode: armed && lastDistToStart <= Rules.closingModeM,
            paceSecPerKm: dist >= 50 ? Double(movingMs) / 1000 / (dist / 1000) : nil,
            loops: loops,
            start: start
        )
    }

    /// Halka açıkken kapanırsa alınacak önizleme poligonu (başlangıca düz kapatılmış).
    public func previewRing() -> [LatLng] {
        guard let s = start else { return [] }
        return [s.latLng] + pts[segStart...].map(\.latLng) + [s.latLng]
    }

    public var points: [TrackPoint] { pts }
    public var pointCount: Int { pts.count }
}

public func detectLoops(_ points: [TrackPoint], _ opts: LoopOptions = LoopOptions()) -> [ClosedLoop] {
    let tr = LoopTracker(opts)
    for p in points { tr.push(p) }
    return tr.state().loops
}

/// Koşu özeti istatistikleri.
public func trackStats(_ points: [TrackPoint]) -> (distanceM: Double, durationMs: Int64, paceSecPerKm: Double?) {
    let tr = LoopTracker(LoopOptions(minLoopLengthM: .infinity))
    for p in points { tr.push(p) }
    let s = tr.state()
    return (s.distanceM, s.durationMs, s.paceSecPerKm)
}

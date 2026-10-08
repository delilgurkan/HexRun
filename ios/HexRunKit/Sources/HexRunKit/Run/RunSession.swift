import Foundation

public enum RunStatusState: String, Codable, Sendable { case idle, running, paused, finished }

public enum RunSessionEvent: Hashable, Sendable {
    case loopClosed(ClosedLoop)
    case closingEnter
    case closingExit
    case tick(TickStrength)
}

public enum RunSessionError: Error, Equatable { case invalidState(RunStatusState) }

public struct RunSnapshot: Hashable, Sendable {
    public var status: RunStatusState
    public var clientRunId: String
    public var startedAt: Int64
    /// Duraklatmalar hariç geçen süre.
    public var elapsedMs: Int64
    public var tracker: TrackerState
    public var pointCount: Int
    public var lastPoint: TrackPoint?
    public var closeRadiusM: Double
    public var context: RunContext
    public var loopsShown: Int
}

/// Koşu oturumu durum makinesi: idle → running ⇄ paused → finished.
/// Her GPS noktası ve duraklat/devam yalnız eklenen bir günlüğe yazılır; uygulama öldürülürse
/// günlük `LoopTracker`'a yeniden oynatılarak koşu aynen geri gelir.
public final class RunSession {
    private var tracker: LoopTracker
    private var header: RunHeader
    public private(set) var status: RunStatusState
    private let store: RunStore
    private let now: () -> Int64
    private var wasClosing = false

    private init(header: RunHeader, log: [RunLogEntry], store: RunStore, now: @escaping () -> Int64, status: RunStatusState) {
        self.header = header
        self.store = store
        self.now = now
        self.status = status
        tracker = RunSession.buildTracker(header, log)
        wasClosing = tracker.state().closingMode
    }

    static func buildTracker(_ h: RunHeader, _ log: [RunLogEntry]) -> LoopTracker {
        let tr = LoopTracker(LoopOptions(closeRadiusM: h.closeRadiusM, minLoopLengthM: h.minLoopLengthM))
        for e in log {
            switch e {
            case let .point(p): tr.push(p)
            case .pause: tr.pause()
            case .resume: tr.resume()
            }
        }
        return tr
    }

    /// Yeni oturum (henüz başlamadı).
    public static func create(store: RunStore, clientRunId: String = UUID().uuidString.lowercased(), options: LoopOptions = LoopOptions(), context: RunContext = RunContext(), now: @escaping () -> Int64 = { Date().epochMs }) -> RunSession {
        let h = RunHeader(
            clientRunId: clientRunId, startedAt: now(), status: "running",
            closeRadiusM: options.closeRadiusM ?? Rules.loopCloseM,
            minLoopLengthM: options.minLoopLengthM ?? Rules.minLoopLengthM,
            pausedMs: 0, pausedAt: nil, loopsShown: 0, context: context
        )
        return RunSession(header: h, log: [], store: store, now: now, status: .idle)
    }

    /// Kalıcı depodan yarım kalan koşuyu geri yükler.
    public static func restore(store: RunStore, now: @escaping () -> Int64 = { Date().epochMs }) -> RunSession? {
        guard let (h, log) = store.load(), !h.clientRunId.isEmpty else { return nil }
        let st: RunStatusState = h.status == "paused" ? .paused : .running
        return RunSession(header: h, log: log, store: store, now: now, status: st)
    }

    public var id: String { header.clientRunId }
    public var context: RunContext { header.context }

    public func start() throws {
        guard status == .idle else { throw RunSessionError.invalidState(status) }
        status = .running
        header.startedAt = now()
        header.status = "running"
        store.clear()
        store.writeHeader(header)
    }

    public func pause() {
        guard status == .running else { return }
        let t = now()
        status = .paused
        header.status = "paused"
        header.pausedAt = t
        tracker.pause()
        store.append([.pause(t)])
        store.writeHeader(header)
    }

    public func resume() {
        guard status == .paused else { return }
        let t = now()
        status = .running
        header.status = "running"
        if let p = header.pausedAt { header.pausedMs += max(0, t - p) }
        header.pausedAt = nil
        tracker.resume()
        store.append([.resume(t)])
        store.writeHeader(header)
    }

    /// GPS noktalarını işler; halka kapanışı, kapanış modu ve haptik tık olaylarını döner.
    @discardableResult
    public func addPoints(_ points: [TrackPoint]) -> [RunSessionEvent] {
        guard status == .running else { return [] }
        var events: [RunSessionEvent] = []
        var accepted: [RunLogEntry] = []
        for p in points.sorted(by: { $0.t < $1.t }) {
            let before = tracker.state()
            let prevLen = tracker.pointCount
            let loop = tracker.push(p)
            if tracker.pointCount == prevLen { continue } // reddedilen nokta
            accepted.append(.point(p))
            let after = tracker.state()
            if let loop {
                events.append(.loopClosed(loop))
                wasClosing = false
                continue
            }
            if after.closingMode && !wasClosing { events.append(.closingEnter) }
            if !after.closingMode && wasClosing { events.append(.closingExit) }
            if after.closingMode && before.closingMode {
                for s in closingTicks(prev: before.distToStartM, next: after.distToStartM, closeRadiusM: header.closeRadiusM) {
                    events.append(.tick(s))
                }
            }
            wasClosing = after.closingMode
        }
        store.append(accepted)
        return events
    }

    /// Fetih anı gösterildi (geri yüklemede tekrar gösterilmesin).
    public func markLoopsShown(_ n: Int) {
        header.loopsShown = max(header.loopsShown, n)
        store.writeHeader(header)
    }

    public func snapshot() -> RunSnapshot {
        let t = now()
        let pausedNow = header.pausedAt.map { max(0, t - $0) } ?? 0
        let elapsed = status == .idle ? 0 : max(0, t - header.startedAt - header.pausedMs - pausedNow)
        return RunSnapshot(
            status: status, clientRunId: header.clientRunId, startedAt: header.startedAt, elapsedMs: elapsed,
            tracker: tracker.state(), pointCount: tracker.pointCount, lastPoint: tracker.points.last,
            closeRadiusM: header.closeRadiusM, context: header.context, loopsShown: header.loopsShown
        )
    }

    public func previewRing() -> [LatLng] { tracker.previewRing() }
    public var points: [TrackPoint] { tracker.points }

    /// Koşuyu bitirir: gönderim isteğini döner ve yarım koşu kaydını siler.
    public func finish(source: RunSource = .phone, device: String? = nil) throws -> SubmitRunRequest {
        guard status == .running || status == .paused else { throw RunSessionError.invalidState(status) }
        if status == .paused, let p = header.pausedAt {
            header.pausedMs += max(0, now() - p)
            header.pausedAt = nil
        }
        status = .finished
        store.clear()
        return SubmitRunRequest(clientRunId: header.clientRunId, source: source, points: tracker.points.map(TrackPointDto.init), device: device)
    }

    /// Koşuyu kaydetmeden at.
    public func discard() {
        status = .finished
        store.clear()
    }
}

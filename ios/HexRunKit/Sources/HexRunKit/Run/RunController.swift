import Foundation
import Observation

/// Konum kaynağı (CoreLocation uygulama katmanında).
@MainActor
public protocol LocationProvider: AnyObject {
    func startRunUpdates(_ onPoints: @escaping @MainActor ([TrackPoint]) -> Void)
    func stopRunUpdates()
}

@MainActor
public protocol RunHaptics: AnyObject {
    func tick(_ s: TickStrength)
    /// Kare 1: tek sert darbe.
    func closeImpact()
    /// Kare 2: her 10 petekte hafif tık.
    func cellTick()
    /// Rakip petek çatlarken çift tık.
    func crack()
    /// Kare 3: başarı.
    func success()
}

@MainActor
public protocol ScreenAwake: AnyObject { func setAwake(_ on: Bool) }

/// Saat aynası (WatchConnectivity): `hud` sürekli durum, diğerleri anlık olay.
@MainActor
public protocol RunMirror: AnyObject { func publish(_ p: WatchPayload) }

public struct ConquestState: Hashable, Sendable {
    public var loop: ClosedLoop
    public var preview: ConquestPreview
    public var shownAt: Int64
}

/// Koşu modu denetleyicisi: oturum + konum + haptik + ekranı açık tutma + gönderim kuyruğu.
@MainActor
@Observable
public final class RunController {
    public private(set) var snapshot: RunSnapshot?
    public var conquest: ConquestState?
    public private(set) var gps: GpsQuality = .searching
    public var locked = false
    public private(set) var recovered = false
    /// Kapanış modunda açık halkanın önizlemesi (her 3 noktada bir güncellenir).
    public private(set) var closingPreview: ConquestPreview?
    public private(set) var trace: [LatLng] = []

    @ObservationIgnored private var session: RunSession?
    @ObservationIgnored private let store: RunStore
    @ObservationIgnored private let location: LocationProvider
    @ObservationIgnored private let haptics: RunHaptics
    @ObservationIgnored private let awake: ScreenAwake
    @ObservationIgnored private let queue: RunQueue
    @ObservationIgnored private let now: () -> Int64
    @ObservationIgnored public var mirror: RunMirror?
    @ObservationIgnored public var onActivity: ((Bool) -> Void)?
    @ObservationIgnored public var conquestContext: () -> ConquestContext = { .empty }
    @ObservationIgnored public var device: String?
    @ObservationIgnored private var lastPreviewBucket = -1

    public init(store: RunStore, location: LocationProvider, haptics: RunHaptics, awake: ScreenAwake, queue: RunQueue, now: @escaping () -> Int64 = { Date().epochMs }) {
        self.store = store
        self.location = location
        self.haptics = haptics
        self.awake = awake
        self.queue = queue
        self.now = now
    }

    public var isActive: Bool { session != nil && session?.status != .finished }
    public var status: RunStatusState { session?.status ?? .idle }
    public var isClosing: Bool { (snapshot?.tracker.closingMode ?? false) && conquest == nil }
    public var previewRing: [LatLng] { session?.previewRing() ?? [] }

    private func publish() {
        snapshot = session?.snapshot()
        trace = session?.points.map(\.latLng) ?? []
        mirror?.publish(.hud(watchHud()))
    }

    /// Uygulama açılışında yarım kalan koşuyu geri yükler.
    @discardableResult
    public func recover() -> Bool {
        if session != nil { return true }
        guard let s = RunSession.restore(store: store, now: now) else { return false }
        session = s
        recovered = true
        begin()
        return true
    }

    public func start(context: RunContext = RunContext(), options: LoopOptions = LoopOptions()) throws {
        if isActive { return }
        let s = RunSession.create(store: store, options: options, context: context, now: now)
        try s.start()
        session = s
        conquest = nil
        locked = false
        recovered = false
        gps = .searching
        closingPreview = nil
        lastPreviewBucket = -1
        begin()
    }

    private func begin() {
        awake.setAwake(true)
        onActivity?(true)
        location.startRunUpdates { [weak self] pts in self?.ingest(pts) }
        publish()
    }

    /// GPS noktaları (ön plan ya da arka plan).
    public func ingest(_ points: [TrackPoint]) {
        guard let last = points.last, let s = session else { return }
        gps = gpsQuality(last.acc)
        let events = s.addPoints(points)
        var instant: [WatchPayload] = []
        for e in events {
            switch e {
            case let .tick(st):
                haptics.tick(st)
                instant.append(.tick)
            case let .loopClosed(loop):
                haptics.closeImpact()
                let preview = Conquest.preview(loop: loop, conquestContext())
                conquest = ConquestState(loop: loop, preview: preview, shownAt: now())
                s.markLoopsShown(loop.index)
                instant.append(.conquest(.init(cells: preview.empty + preview.own + preview.duels.reduce(0) { $0 + $1.inside }, areaM2: preview.areaM2, captured: preview.duels.reduce(0) { $0 + $1.inside })))
            case .closingEnter, .closingExit:
                lastPreviewBucket = -1
            }
        }
        updateClosingPreview()
        snapshot = s.snapshot()
        trace = s.points.map(\.latLng)
        mirror?.publish(.hud(watchHud()))
        for p in instant { mirror?.publish(p) }
    }

    private func updateClosingPreview() {
        guard let s = session, isClosing else { closingPreview = nil; return }
        let bucket = s.points.count / 3
        guard bucket != lastPreviewBucket else { return }
        lastPreviewBucket = bucket
        closingPreview = Conquest.previewOpenRing(s.previewRing(), conquestContext())
    }

    public func dismissConquest() {
        conquest = nil
        publish()
    }

    public func pause() { session?.pause(); publish() }
    public func resume() { session?.resume(); publish() }
    public func setLocked(_ l: Bool) { locked = l }

    /// Saniyelik HUD yenilemesi (süre).
    public func refresh() { if session != nil { snapshot = session?.snapshot(); mirror?.publish(.hud(watchHud())) } }

    /// Saatten gelen komut (pause/resume; finish uygulama katmanında özet akışıyla işlenir).
    /// `finish` için true döner: çağıran `finish()` ile bitirip özeti açar.
    public func handle(_ action: WatchPayload.Action) -> Bool {
        switch action {
        case .pause: pause(); return false
        case .resume: resume(); return false
        case .finish: return isActive
        }
    }

    /// Bitir: kuyruğa koy, göndermeyi dene, oturumu kapat. clientRunId döner (nokta yoksa nil).
    public func finish() async -> String? {
        guard let s = session else { return nil }
        location.stopRunUpdates()
        awake.setAwake(false)
        let closedAny = !(snapshot?.tracker.loops.isEmpty ?? true)
        let req = try? s.finish(source: .phone, device: device)
        onActivity?(false)
        if !closedAny { mirror?.publish(.loopOpen) }
        end(finished: true)
        guard let req, req.points.count >= 2 else { return nil }
        await queue.enqueue(req)
        Task { await queue.flush() }
        return req.clientRunId
    }

    public func discard() {
        location.stopRunUpdates()
        awake.setAwake(false)
        session?.discard()
        onActivity?(false)
        end(finished: false)
    }

    private func end(finished: Bool) {
        session = nil
        snapshot = nil
        conquest = nil
        locked = false
        closingPreview = nil
        trace = []
        mirror?.publish(.hud(WatchPayload.Hud(state: finished ? .finished : .idle, ts: now())))
    }

    /// Saate giden sürekli HUD durumu.
    public func watchHud() -> WatchPayload.Hud {
        guard let snap = snapshot ?? session?.snapshot() else { return WatchPayload.Hud(state: .idle, ts: now()) }
        let t = snap.tracker
        let duel = (closingPreview?.duels.first).map { WatchPayload.Duel(opponent: Fmt.firstName($0.duel.defender.displayName), coveredCells: $0.inside, totalCells: $0.total) }
        return WatchPayload.Hud(
            state: snap.status == .paused ? .paused : .running, distanceM: t.distanceM, durationMs: snap.elapsedMs,
            paceSecPerKm: t.paceSecPerKm, distToStartM: t.distToStartM, armed: t.armed, closingMode: t.closingMode,
            events: GameEvents.active(ms: now()).map(\.id.rawValue), duel: duel, ts: now()
        )
    }
}

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

/// Saat aynası (WatchConnectivity).
@MainActor
public protocol RunMirror: AnyObject { func publish(_ s: WatchRunState) }

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
        mirror?.publish(watchState())
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
        var haptic: String?
        for e in events {
            switch e {
            case let .tick(st):
                haptics.tick(st)
                haptic = st == .double ? "double" : "tick"
            case let .loopClosed(loop):
                haptics.closeImpact()
                let preview = Conquest.preview(loop: loop, conquestContext())
                conquest = ConquestState(loop: loop, preview: preview, shownAt: now())
                s.markLoopsShown(loop.index)
                haptic = "close"
            case .closingEnter, .closingExit:
                lastPreviewBucket = -1
            }
        }
        updateClosingPreview()
        snapshot = s.snapshot()
        trace = s.points.map(\.latLng)
        var w = watchState()
        w.haptic = haptic
        mirror?.publish(w)
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
    public func refresh() { if session != nil { snapshot = session?.snapshot(); mirror?.publish(watchState()) } }

    /// Bitir: kuyruğa koy, göndermeyi dene, oturumu kapat. clientRunId döner (nokta yoksa nil).
    public func finish() async -> String? {
        guard let s = session else { return nil }
        location.stopRunUpdates()
        awake.setAwake(false)
        let req = try? s.finish(source: .phone, device: device)
        onActivity?(false)
        end()
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
        end()
    }

    private func end() {
        session = nil
        snapshot = nil
        conquest = nil
        locked = false
        closingPreview = nil
        trace = []
        mirror?.publish(.idle)
    }

    public func watchState() -> WatchRunState {
        guard let snap = snapshot ?? session?.snapshot() else { return .idle }
        let t = snap.tracker
        let phase: WatchRunState.Phase = conquest != nil ? .conquest : snap.status == .paused ? .paused : t.closingMode ? .closing : .running
        let duel = closingPreview?.duels.first
        var bearing: Double?
        if let s = t.start, let l = snap.lastPoint { bearing = initialBearing(from: l.latLng, to: s.latLng) }
        return WatchRunState(
            phase: phase, distanceM: t.distanceM, paceSecPerKm: t.paceSecPerKm, elapsedMs: snap.elapsedMs,
            remainingM: closingRemainingM(t.distToStartM), bearingToStart: bearing,
            duelName: duel.map { Fmt.firstName($0.duel.defender.displayName) }, duelInside: duel?.inside, duelTotal: duel?.total,
            conquestCells: conquest.map { $0.preview.empty + $0.preview.own }, conquestAreaM2: conquest?.preview.areaM2,
            sentAt: now()
        )
    }
}

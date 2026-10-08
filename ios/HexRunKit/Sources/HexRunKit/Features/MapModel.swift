import Foundation
import Observation

/// Kadıköy: konum yokken harita merkezi.
public let defaultMapCenter = LatLng(lat: 40.9875, lng: 29.0297)

/// 03 · Ana harita: dolu, boş (ilk halka önerisi), yükleniyor, çevrimdışı (soluk + tekrar dene).
@MainActor
@Observable
public final class MapModel: RemoteLoading {
    public var bbox: BBox?
    public var map = Remote<MapResponse>()
    public var duels = Remote<DuelsResponse>()
    public var stats = Remote<StatsResponse>()
    public var events = Remote<[ActiveEvent]>()
    public var unread = 0
    public var firstLoop: FirstLoopSuggestion?
    public var position: LatLng?
    /// Konum düzeltmesi alındı mı (yoksa CTA "Konum bulunuyor…").
    public var hasFix = false
    public private(set) var lastMap: AppModel.LastMap?
    @ObservationIgnored private let app: AppModel
    @ObservationIgnored private var mapTask: Task<Void, Never>?
    @ObservationIgnored private var firstLoopFor: String?

    public init(app: AppModel) {
        self.app = app
        lastMap = app.lastMap()
    }

    public var offline: Bool { !app.isOnline || (map.error?.isNetwork ?? false) }
    public var data: MapResponse? { map.value ?? (offline ? lastMap?.res : nil) }
    public var loading: Bool { data == nil && !offline }
    public var myId: String? { app.me?.id }

    public var myCells: Int {
        if let s = stats.value { return s.cells }
        if let p = data?.players.first(where: { $0.id == myId }) { return p.cells }
        return data?.cells.filter { $0.ownerId != nil && $0.ownerId == myId }.count ?? 0
    }

    public var isEmpty: Bool { data != nil && !offline && myCells == 0 && !app.prefs.firstLoopDismissed }
    public var suggestion: FirstLoopSuggestion? { isEmpty ? firstLoop : nil }

    public var activeEvents: [ActiveEvent] {
        EventsPresenter.resolve(data?.activeEvents ?? events.value).filter(\.active)
    }

    public var eventsChip: String? {
        let a = activeEvents
        return a.isEmpty ? nil : "\(S.map.eventsChip(a.count)) · \(EventsPresenter.shortLabel(a))"
    }

    /// %70 eşiğini aşan en tehlikeli kuşatma.
    public var siege: DuelSummary? {
        (duels.value?.defending ?? [])
            .filter { $0.status == .active && Hat.siegeLevel(power: $0.power, progress: $0.progress) != .none }
            .max { $0.progress / max(1, $0.power) < $1.progress / max(1, $1.power) }
    }

    public var waitingGps: Bool { (app.location == .whenInUse || app.location == .always) && !hasFix }

    public var ctaLabel: String {
        app.runLocked ? S.map.runLocked : waitingGps ? S.map.locating : S.map.start
    }

    public var offlineMinutes: Int { lastMap.map { TRDate.minutesAgo($0.at) } ?? 0 }

    public func setPosition(_ p: LatLng, fix: Bool) {
        position = p
        if fix { hasFix = true }
        if bbox == nil { bbox = .around(p) }
    }

    /// Kamera değişince (bbox) haritayı yükler; önceki istek iptal edilir.
    public func setBBox(_ b: BBox) {
        bbox = b
        mapTask?.cancel()
        mapTask = Task { await self.loadMap() }
    }

    public func loadMap() async {
        if bbox == nil { bbox = .around(position ?? defaultMapCenter) }
        guard let b = bbox else { return }
        await load(\.map) { try await app.api.map(b) }
        if let v = map.value {
            app.mapCache.remember(v, myId: myId)
            app.saveLastMap(v)
            app.isOnline = true
        } else if map.error?.isNetwork == true {
            lastMap = app.lastMap()
        }
        await loadFirstLoopIfNeeded()
    }

    public func loadAll() async {
        let api = app.api
        let tasks = [
            Task { await self.loadMap() },
            Task { await self.loadDuels() },
            Task { await self.load(\.stats) { try await api.stats() } },
            Task { await self.load(\.events) { try await api.events() } },
            Task { await self.loadUnread() },
        ]
        for t in tasks { await t.value }
        await loadFirstLoopIfNeeded()
    }

    public func loadDuels() async {
        await load(\.duels) { try await app.api.duels() }
        if let d = duels.value {
            app.mapCache.attacking = d.attacking
            app.mapCache.defending = d.defending
        }
    }

    public func loadUnread() async {
        if let page = try? await app.api.notifications(filter: .all) { unread = page.items.filter { !$0.read }.count }
    }

    func loadFirstLoopIfNeeded() async {
        guard isEmpty, let p = position else { return }
        let key = String(format: "%.3f,%.3f", p.lat, p.lng)
        guard firstLoopFor != key else { return }
        firstLoopFor = key
        firstLoop = try? await app.api.firstLoop(lat: p.lat, lng: p.lng)
    }

    public func dismissFirstLoop() { app.prefs.firstLoopDismissed = true }
}

/// 04 · Bölge sayfası sunumu.
public enum RegionPresenter {
    public enum CTA: Equatable, Sendable {
        case loop(label: String)
        case duel
        case run
        public var label: String {
            switch self {
            case let .loop(l): return l
            case .duel: return S.region.startDuel
            case .run: return S.region.runHere
            }
        }
    }

    public static func isMine(_ r: RegionDetail, me: Me?) -> Bool { r.owner != nil && r.owner?.id == me?.id }

    public static func ownerName(_ r: RegionDetail) -> String? {
        r.hidden ? S.map.hiddenPlayer : r.owner.map { $0.firstName }
    }

    public static func title(_ r: RegionDetail, me: Me?) -> String {
        if r.owner == nil && !r.hidden { return S.region.emptyTitle }
        if isMine(r, me: me) { return S.region.myTitle }
        return S.region.title(ownerName(r) ?? "")
    }

    public static func cta(_ r: RegionDetail, me: Me?) -> CTA {
        let attackEvent = r.activeEvents.first { $0.active && $0.move == .attack }
        let gainEvent = r.activeEvents.first { $0.active && $0.move == .gain }
        if r.myDuel != nil {
            return .loop(label: attackEvent.map { S.region.loopHereBoost(EventsPresenter.shortLabel([$0])) } ?? S.region.loopHere)
        }
        if isMine(r, me: me) {
            return .loop(label: gainEvent.map { S.region.loopHereBoost(EventsPresenter.shortLabel([$0])) } ?? S.region.loopHere)
        }
        if r.owner != nil, !r.hidden, r.canStartDuel { return .duel }
        return .run
    }

    public static func eventChip(_ e: ActiveEvent, now: Date = Date()) -> String {
        var s = "\(e.name) · \(EventsPresenter.shortLabel([e]))"
        if e.endsInMin != nil { s += " · \(S.region.eventUntil(EventsPresenter.endsAtLabel(e.endsInMin, now: now) ?? ""))" }
        return s
    }

    public static func duelLine(_ r: RegionDetail) -> String? {
        guard let d = r.myDuel else { return nil }
        let attackEvent = r.activeEvents.first { $0.active && $0.move == .attack }
        return "\(S.region.duelHp(Hat.duelHp(power: d.power, progress: d.progress), d.cells.count)) · \(S.region.loopsToCapture(d.loopsToCapture, attackEvent.map(EventsPresenter.shortName)))"
    }

    public static func slotsFull(_ r: RegionDetail, me: Me?) -> Bool {
        !r.canStartDuel && r.owner != nil && !isMine(r, me: me) && r.myDuel == nil && r.duelSlotsLeft == 0
    }
}

@MainActor
@Observable
public final class RegionModel: RemoteLoading {
    public let cell: String
    public var region = Remote<RegionDetail>()
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel, cell: String) { self.app = app; self.cell = cell }
    public func load() async { await load(\.region) { try await app.api.region(cell: cell) } }
}

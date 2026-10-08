import Foundation
import Observation

/// 11 · Lig: yerel bölge, kategori ve dönem; senin satırın altta sabit.
@MainActor
@Observable
public final class LeagueModel: RemoteLoading {
    public var scope: LeagueScope = .individual
    public var period: LeaguePeriod = .week
    public var league = Remote<LeagueResponse>()
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel) { self.app = app }

    public func load() async {
        let (s, p) = (scope, period)
        await load(\.league) { try await app.api.league(scope: s, period: p) }
    }

    public func select(scope: LeagueScope? = nil, period: LeaguePeriod? = nil) async {
        if let scope { self.scope = scope }
        if let period { self.period = period }
        await load()
    }

    public var loading: Bool { league.value == nil && league.error == nil }
    public var failed: Bool { league.error != nil }
    public var empty: Bool { league.value?.rows.isEmpty ?? false }
    public var region: String { league.value?.regionName ?? "" }

    public var metric: String {
        switch period {
        case .week: return S.league.metricWeek
        case .month: return S.league.metricMonth
        case .all: return S.league.metricAll
        }
    }

    public func endsIn(now: Date = Date()) -> String? {
        guard period != .all, let e = league.value?.endsAt else { return nil }
        let ms = max(0, e.timeIntervalSince(now))
        let h = Int(ms / 3600)
        return S.league.endsIn(h / 24, h % 24)
    }

    public var meRow: LeagueRow? {
        if let m = league.value?.me { return m }
        guard let me = app.me else { return nil }
        return LeagueRow(rank: 0, id: me.id, name: me.displayName, initials: me.initials, slot: me.slot, valueM2: 0, delta: nil, subtitle: nil, isMe: true)
    }

    public func staleLabel(now: Date = Date()) -> String? {
        guard failed, let v = league.value else { return nil }
        return S.league.errorBody("\(TRDate.dayGroup(v.updatedAt, now: now) == .today ? "bugün " : "")\(TRDate.hhmm(v.updatedAt))")
    }

    public nonisolated static func deltaLabel(_ d: Int?) -> String? {
        guard let d else { return nil }
        return d > 0 ? "▲ \(d)" : d < 0 ? "▼ \(-d)" : "·"
    }
}

/// 12 · Takım: üyelerin toplam m²'si ile sıralanır; savunma bireysel.
@MainActor
@Observable
public final class TeamModel: RemoteLoading {
    /// value == .some(nil) → takım yok.
    public var team = Remote<TeamResponse?>()
    public var league = Remote<LeagueResponse>()
    public var name = ""
    public var code = ""
    public var error: String?
    public var busy = false
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel) { self.app = app }

    public func load() async {
        await load(\.team) { try await app.api.myTeam() }
        if case .some(.some) = team.value { await load(\.league) { try await app.api.league(scope: .team, period: .all) } }
    }

    public var hasTeam: Bool { if case .some(.some) = team.value { return true }; return false }
    public var noTeam: Bool { if case .some(.none) = team.value { return true }; return false }

    func mutate(_ op: () async throws -> TeamResponse?) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            team.value = .some(try await op())
            await app.refreshMe()
        } catch {
            self.error = errorText(error)
        }
    }

    public func create() async { let n = name.trimmingCharacters(in: .whitespaces); await mutate { try await app.api.createTeam(name: n) } }
    public func join() async { let c = code.trimmingCharacters(in: .whitespaces); await mutate { try await app.api.joinTeam(code: c) } }
    public func leave() async { await mutate { try await app.api.leaveTeam(); return nil } }

    public func subtitle(_ t: TeamResponse) -> String {
        [S.team.captain(t.captain.displayName), S.team.members(t.members.count), S.team.rank(league.value?.regionName, t.regionRank)]
            .filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// Yerel bildirim zamanlayıcı ("Hatırlat").
@MainActor
public protocol ReminderScheduler: AnyObject {
    func schedule(id: String, title: String, body: String, afterSeconds: Int, deeplink: String) async
    func cancel(id: String) async
}

/// 12 · Etkinlik: aktif pencere ve diğer çarpanlar; sayaçlar yerel `eventWindow` ile.
@MainActor
@Observable
public final class EventsModel: RemoteLoading {
    public var server = Remote<[ActiveEvent]>()
    public var now = Date()
    @ObservationIgnored private let app: AppModel
    @ObservationIgnored public var reminders: ReminderScheduler?
    public init(app: AppModel) { self.app = app }

    public func load() async { await load(\.server) { try await app.api.events() } }
    public func tick(_ d: Date = Date()) { now = d }

    public var events: [ActiveEvent] { EventsPresenter.resolve(server.value, now: now) }
    public var hero: ActiveEvent? { events.first(where: \.active) }
    public var others: [ActiveEvent] { events.filter { $0.id != hero?.id } }
    public func isReminded(_ id: EventId) -> Bool { app.prefs.remind.contains(id) }

    public nonisolated static func hm(_ min: Int) -> (h: Int, m: Int) { (min / 60, min % 60) }

    public func toggleRemind(_ e: ActiveEvent) async {
        let on = isReminded(e.id)
        let ident = "event-\(e.id.rawValue)"
        if on { await reminders?.cancel(id: ident) } else {
            await reminders?.schedule(id: ident, title: e.name, body: e.description, afterSeconds: max(60, e.startsInMin * 60), deeplink: "hexrun://events")
        }
        try? await app.api.remindEvent(e.id, on: !on)
        app.prefs.remind = on ? app.prefs.remind.filter { $0 != e.id } : app.prefs.remind + [e.id]
    }

    public func label(_ e: ActiveEvent) -> String {
        "\(e.window) · \(S.events.everywhere) · \(S.events.moves[e.move] ?? "") \(Fmt.multiplier(e.multiplier))"
    }
}

/// 13 · Bildirim merkezi: filtreler, gün grupları, satır içi eylem.
@MainActor
@Observable
public final class NotificationsModel: RemoteLoading {
    public var filter: NotificationFilter = .all
    public var items = Remote<[NotificationDto]>()
    public var nextCursor: String?
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel) { self.app = app }

    public func load() async {
        let f = filter
        await load(\.items) {
            let p = try await app.api.notifications(filter: f)
            nextCursor = p.nextCursor
            return p.items
        }
    }

    public func select(_ f: NotificationFilter) async {
        filter = f
        items = Remote()
        await load()
    }

    public func loadMore() async {
        guard let c = nextCursor, let p = try? await app.api.notifications(filter: filter, cursor: c) else { return }
        items.value = (items.value ?? []) + p.items
        nextCursor = p.nextCursor
    }

    public struct Section: Identifiable, Sendable {
        public var group: TRDate.DayGroup
        public var title: String
        public var items: [NotificationDto]
        public var id: String { group.rawValue }
    }

    public func sections(now: Date = Date()) -> [Section] {
        let list = items.value ?? []
        return TRDate.DayGroup.allCases.compactMap { g in
            let xs = list.filter { TRDate.dayGroup($0.createdAt, now: now) == g }
            return xs.isEmpty ? nil : Section(group: g, title: TRDate.groupLabel(g), items: xs)
        }
    }

    public func markRead(_ ids: [String]? = nil) async {
        try? await app.api.markRead(ids)
        if let ids { for id in ids { if let i = items.value?.firstIndex(where: { $0.id == id }) { items.value?[i].read = true } } } else {
            items.value = items.value?.map { var n = $0; n.read = true; return n }
        }
    }

    /// Satıra dokununca: okundu işaretle, eylemin hedefini döndür.
    public func open(_ n: NotificationDto) async -> DeepLink? {
        if !n.read { await markRead([n.id]) }
        return DeepLink.parse(n.action?.deeplink)
    }

    public nonisolated static func timeLabel(_ n: NotificationDto, now: Date = Date()) -> String {
        let g = TRDate.dayGroup(n.createdAt, now: now)
        return g == .today || g == .yesterday ? TRDate.hhmm(n.createdAt) : TRDate.shortDate(n.createdAt)
    }

    public enum IconKind: Sendable { case hatch, swap, ghost, events, team, eye, defend, bell }

    /// Oyun dilinden ikon: kuşatma = tarama, el değiştirme = iki renk, erime = hayalet segment.
    public nonisolated static func icon(_ k: NotificationKind) -> IconKind {
        switch k {
        case .siegeWarn, .siegeAlarm, .duelStarted: return .hatch
        case .cellsLost, .duelWon: return .swap
        case .decayWarning, .decayLost: return .ghost
        case .eventStarted: return .events
        case .team: return .team
        case .reviewResult: return .eye
        case .badge: return .defend
        default: return .bell
        }
    }
}

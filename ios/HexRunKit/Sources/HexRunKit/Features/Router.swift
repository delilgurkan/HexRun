import Foundation
import Observation

public enum MainTab: String, Hashable, Sendable, CaseIterable { case map, league, team, events }

/// Harita yığınına itilen ekranlar.
public enum Route: Hashable, Sendable {
    case profile(tab: ProfileTab)
    case settings
    case privacy
    case integrations
    case badge(String)
    case notifications
    case duel(String)
}

public enum ProfileTab: String, Hashable, Sendable, CaseIterable { case stats, badges, friends }

public struct DuelSelectRequest: Hashable, Sendable, Identifiable {
    public var cell: String
    public var preselected: [String]
    public var defenderId: String?
    public var id: String { cell + preselected.joined() }
    public init(cell: String, preselected: [String] = [], defenderId: String? = nil) {
        self.cell = cell; self.preselected = preselected; self.defenderId = defenderId
    }
}

public enum SummaryRequest: Hashable, Sendable {
    case queued(clientRunId: String)
    case remote(runId: String)
}

/// Tam ekran katman: koşu, özet, düello alanı seçimi.
public enum Cover: Hashable, Sendable, Identifiable {
    case run
    case summary(SummaryRequest)
    case duelSelect(DuelSelectRequest)

    public var id: String {
        switch self {
        case .run: return "run"
        case let .summary(s): return "summary-\(s)"
        case let .duelSelect(d): return "duel-\(d.id)"
        }
    }
}

/// Gezinme durumu (SwiftUI `NavigationStack` yolları, sayfalar ve tam ekranlar).
@MainActor
@Observable
public final class Router {
    public var tab: MainTab = .map
    public var mapPath: [Route] = []
    public var leaguePath: [Route] = []
    public var teamPath: [Route] = []
    public var eventsPath: [Route] = []
    /// Bölge sayfası (sheet) için dokunulan petek.
    public var regionCell: String?
    /// Paylaşım kartı (sheet).
    public var shareRunId: String?
    public var cover: Cover?
    /// Derin bağlantıyla gelen arkadaş/davet kodu.
    public var inviteCode: String?
    /// Koşu başlatma isteği (deep link): uygulama katmanı izin kontrolüyle başlatır.
    public var runRequest: RunContext?

    /// "Geri al": kaybedilen düello alanına rövanş seçimi (API ile çözülür).
    public var revengeDuelId: String?

    public init() {}

    /// Rövanş: kaybedilen alan artık saldırganın; aynı peteklerle düello seçimi açılır.
    public func resolveRevenge(api: HexRunAPI) async {
        guard let id = revengeDuelId else { return }
        revengeDuelId = nil
        if let d = try? await api.duel(id), let first = d.cells.first {
            cover = .duelSelect(DuelSelectRequest(cell: first, preselected: d.cells, defenderId: d.attacker.id))
        } else {
            push(.duel(id))
        }
    }

    public func push(_ r: Route) {
        tab = .map
        mapPath.append(r)
    }

    public func popToRoot() {
        mapPath = []
        regionCell = nil
    }

    /// Derin bağlantıyı gezinme durumuna çevirir. Koşu başlatma `runRequest` ile bildirilir.
    public func handle(_ link: DeepLink) {
        if case .run = link {} else if cover == .run { return } // koşu sırasında yalnız koşu bağlantıları
        switch link {
        case .map: tab = .map; popToRoot()
        case let .run(defend, attack): runRequest = RunContext(defendDuelId: defend, attackDuelId: attack)
        case let .duel(id): regionCell = nil; push(.duel(id))
        case let .duelRevenge(id): regionCell = nil; revengeDuelId = id
        case let .duelSelect(cell): cover = .duelSelect(DuelSelectRequest(cell: cell))
        case let .region(cell): tab = .map; regionCell = cell
        case .notifications: push(.notifications)
        case let .profile(t): push(.profile(tab: t.flatMap(ProfileTab.init(rawValue:)) ?? .stats))
        case let .badge(id): push(.badge(id))
        case .settings: push(.settings)
        case .privacy: push(.privacy)
        case .integrations: push(.integrations)
        case let .share(id): shareRunId = id
        case let .summary(runId): cover = .summary(.remote(runId: runId))
        case let .friends(code): inviteCode = code; push(.profile(tab: .friends))
        case let .invite(code): inviteCode = code; push(.profile(tab: .friends))
        case .league: tab = .league
        case .team: tab = .team
        case .events: tab = .events
        }
    }
}

import Foundation

// HexRun API v1 sözleşmesi (`packages/contracts/src/index.ts`) ile birebir Codable modeller.
// Zamanlar ISO-8601 → `Date`; mesafe metre; alan m²; tempo sn/km.

public enum Platform: String, Codable, Sendable { case ios, android }

public enum PushProvider: String, Codable, Sendable { case apns, fcm, expo }

public enum RunSource: String, Codable, Sendable {
    case phone, apple_watch, wear_os, garmin, coros, suunto, polar, strava, apple_health, health_connect
}

public struct ApiErrorBody: Codable, Sendable {
    public struct Inner: Codable, Sendable {
        public var code: String
        public var message: String?
        public var details: JSONValue?
    }
    public var error: Inner
}

/* ─────────────── Kimlik ─────────────── */

public struct EmailStartRequest: Codable, Sendable { public var email: String }
public struct EmailStartResponse: Codable, Sendable {
    public var sent: Bool
    public var devCode: String?
    public init(sent: Bool, devCode: String? = nil) { self.sent = sent; self.devCode = devCode }
}
public struct EmailVerifyRequest: Codable, Sendable { public var email: String; public var code: String }
public struct AppleAuthRequest: Codable, Sendable { public var identityToken: String; public var fullName: String? }
public struct GoogleAuthRequest: Codable, Sendable { public var idToken: String }
public struct RefreshRequest: Codable, Sendable { public var refreshToken: String }

public struct AuthResponse: Codable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    /// Erişim jetonunun ömrü (sn).
    public var expiresIn: Double
    public var user: Me
    public var needsProfile: Bool
}

/* ─────────────── Profil ─────────────── */

public struct PublicPlayer: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var username: String
    public var displayName: String
    public var initials: String
    public var slot: Slot
    public var teamName: String?
    public var insignia: [String]
    public var goldFrame: Bool

    public init(id: String, username: String, displayName: String, initials: String, slot: Slot, teamName: String? = nil, insignia: [String] = [], goldFrame: Bool = false) {
        self.id = id; self.username = username; self.displayName = displayName; self.initials = initials
        self.slot = slot; self.teamName = teamName; self.insignia = insignia; self.goldFrame = goldFrame
    }

    public var firstName: String { Fmt.firstName(displayName) }
}

public struct PrivacyState: Codable, Hashable, Sendable {
    public var enabled: Bool
    public var radiusM: Double?
}

public struct Me: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var username: String
    public var displayName: String
    public var initials: String
    public var slot: Slot
    public var teamName: String?
    public var insignia: [String]
    public var goldFrame: Bool
    public var email: String?
    public var createdAt: Date
    public var newbieDaysLeft: Int
    public var teamId: String?
    public var privacy: PrivacyState
    public var canChangeInsignia: Bool
    public var locale: String

    public var asPlayer: PublicPlayer {
        PublicPlayer(id: id, username: username, displayName: displayName, initials: initials, slot: slot, teamName: teamName, insignia: insignia, goldFrame: goldFrame)
    }
}

public struct UpdateMeRequest: Codable, Sendable {
    public var username: String?
    public var displayName: String?
    public var slot: Slot?
    public init(username: String? = nil, displayName: String? = nil, slot: Slot? = nil) {
        self.username = username; self.displayName = displayName; self.slot = slot
    }
}

public struct UsernameAvailability: Codable, Sendable, Hashable {
    public enum Reason: String, Codable, Sendable { case taken, invalid, reserved }
    public var username: String
    public var available: Bool
    public var reason: Reason?
}

public struct PrivacyRequest: Codable, Sendable {
    public var home: LatLng?
    public var radiusM: Double?
    public init(home: LatLng?, radiusM: Double? = nil) { self.home = home; self.radiusM = radiusM }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        // `home: null` gizlilik bölgesini kapatır; anahtar her zaman yazılır.
        try c.encode(home, forKey: .home)
        try c.encodeIfPresent(radiusM, forKey: .radiusM)
    }
}

public struct PushTokenRequest: Codable, Sendable {
    public var token: String
    public var platform: Platform
    public var provider: PushProvider?
}

/* ─────────────── Harita ─────────────── */

public enum DuelRelation: String, Codable, Sendable { case defending, attacking }

public struct MapCell: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var ownerId: String?
    public var power: Double
    public var slot: Slot?
    public var duel: DuelRelation?
    public var progress: Double?
    public var attackerSlot: Slot?
    public var ghost: Double

    public init(id: String, ownerId: String?, power: Double, slot: Slot?, duel: DuelRelation? = nil, progress: Double? = nil, attackerSlot: Slot? = nil, ghost: Double = 0) {
        self.id = id; self.ownerId = ownerId; self.power = power; self.slot = slot
        self.duel = duel; self.progress = progress; self.attackerSlot = attackerSlot; self.ghost = ghost
    }

    public var isHidden: Bool { ownerId?.hasPrefix("hidden:") ?? false }
}

public struct MapPlayer: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var displayName: String
    public var initials: String
    public var slot: Slot
    public var goldFrame: Bool
    public var hidden: Bool
    public var marker: LatLng?
    public var cells: Int
}

public struct ActiveEvent: Codable, Hashable, Sendable, Identifiable {
    public var id: EventId
    public var name: String
    public var move: MoveKind
    public var multiplier: Double
    public var window: String
    public var description: String
    public var active: Bool
    public var endsInMin: Int?
    public var startsInMin: Int
    public var participantsToday: Int

    public init(id: EventId, name: String, move: MoveKind, multiplier: Double, window: String, description: String, active: Bool, endsInMin: Int?, startsInMin: Int, participantsToday: Int) {
        self.id = id; self.name = name; self.move = move; self.multiplier = multiplier; self.window = window
        self.description = description; self.active = active; self.endsInMin = endsInMin; self.startsInMin = startsInMin
        self.participantsToday = participantsToday
    }
}

public struct MapResponse: Codable, Hashable, Sendable {
    public var cells: [MapCell]
    public var players: [MapPlayer]
    public var attackersLast48h: Int
    public var activeEvents: [ActiveEvent]
    public var truncated: Bool
    public var serverTime: Date
}

public struct FirstLoopSuggestion: Codable, Hashable, Sendable {
    public var ring: [LatLng]
    public var lengthM: Double
    public var areaM2: Double
    public var emptyCells: Int
}

public struct RegionHistoryItem: Codable, Hashable, Sendable {
    public var at: Date
    public var text: String
}

public struct RegionDetail: Codable, Hashable, Sendable {
    public var owner: PublicPlayer?
    public var hidden: Bool
    public var cells: [String]
    public var areaM2: Double
    public var avgPower: Double
    public var ownedSinceDays: Int?
    public var lastDefenseAt: Date?
    public var myDuel: DuelSummary?
    public var incomingDuels: [DuelSummary]
    public var history: [RegionHistoryItem]
    public var activeEvents: [ActiveEvent]
    public var canStartDuel: Bool
    public var duelSlotsLeft: Int
}

/* ─────────────── Koşu ─────────────── */

public struct TrackPointDto: Codable, Hashable, Sendable {
    public var lat: Double
    public var lng: Double
    public var t: Int64
    public var acc: Double?
    public init(_ p: TrackPoint) { lat = p.lat; lng = p.lng; t = p.t; acc = p.acc }
}

public struct SubmitRunRequest: Codable, Hashable, Sendable {
    public var clientRunId: String
    public var source: RunSource
    public var points: [TrackPointDto]
    public var externalId: String?
    public var device: String?
    public init(clientRunId: String, source: RunSource, points: [TrackPointDto], externalId: String? = nil, device: String? = nil) {
        self.clientRunId = clientRunId; self.source = source; self.points = points; self.externalId = externalId; self.device = device
    }
}

public enum LoopStatus: String, Codable, Sendable { case applied, review, rejected, stats_only }

public struct DuelHitDto: Codable, Hashable, Sendable {
    public enum Role: String, Codable, Sendable { case attack, defense }
    public enum Reason: String, Codable, Sendable { case coverage, daily_limit, too_small }
    public var duelId: String
    public var role: Role
    public var counted: Bool
    public var reason: Reason?
    public var opponent: PublicPlayer?
    public var hpBefore: Double
    public var hpAfter: Double
    public var captured: Bool
    public var cells: Int
}

public struct Multipliers: Codable, Hashable, Sendable {
    public var gain: Double
    public var attack: Double
    public var pushback: Double
}

public struct LoopResult: Codable, Hashable, Sendable {
    public var index: Int
    public var status: LoopStatus
    public var closedAt: Date
    public var lengthM: Double
    public var areaM2: Double
    public var cells: Int
    public var newCells: Int
    public var reinforced: Int
    public var capturedCells: Int
    public var gainedAreaM2: Double
    public var hits: [DuelHitDto]
    public var multipliers: Multipliers
}

public struct DuelSuggestion: Codable, Hashable, Sendable {
    public var defender: PublicPlayer
    public var cells: [String]
    public var avgPower: Double
    public var routeLengthM: Double
}

public struct BadgeInsignia: Codable, Hashable, Sendable {
    public var kind: String
    public var effect: String
    public var slot: Bool
    public var counter: String
}

public struct BadgeDto: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var category: String
    public var how: String
    public var earned: Bool
    public var earnedAt: Date?
    /// [şimdiki, hedef]
    public var progress: [Double]
    public var insignia: BadgeInsignia?

    public var progressValue: Double { progress.first ?? 0 }
    public var progressTarget: Double { progress.count > 1 ? progress[1] : 1 }
}

public enum RunStatus: String, Codable, Sendable { case applied, review, open, stats_only, duplicate }

public struct RunReview: Codable, Hashable, Sendable {
    public var reasons: [String]
    public var paceSecPerKm: Double?
    public var segmentM: Double?
    public var note: String?
}

public struct RunSummary: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var source: RunSource
    public var startedAt: Date
    public var endedAt: Date
    public var distanceM: Double
    public var durationMs: Double
    public var paceSecPerKm: Double?
    public var loops: [LoopResult]
    public var openGapM: Double?
    public var status: RunStatus
    public var review: RunReview?
    public var newBadges: [BadgeDto]
    public var streakDays: Int
    public var monthDistanceM: Double
    public var suggestions: [DuelSuggestion]
    public var totalGainedAreaM2: Double
}

public struct RunListItem: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var source: RunSource
    public var startedAt: Date
    public var endedAt: Date
    public var distanceM: Double
    public var durationMs: Double
    public var status: RunStatus
    public var gainedAreaM2: Double
    public var loops: Int
}

public struct Page<T: Codable & Sendable>: Codable, Sendable {
    public var items: [T]
    public var nextCursor: String?
    public init(items: [T], nextCursor: String?) { self.items = items; self.nextCursor = nextCursor }
}

/* ─────────────── Düello ─────────────── */

public struct CreateDuelRequest: Codable, Sendable { public var cells: [String] }

public enum DuelStatus: String, Codable, Sendable { case active, won, expired, closed, reset, cancelled }

public struct DuelSummary: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var status: DuelStatus
    public var attacker: PublicPlayer
    public var defender: PublicPlayer
    public var cells: [String]
    public var hp: Double
    public var power: Double
    public var progress: Double
    public var createdAt: Date
    public var firstCountedAt: Date?
    public var lastAttackAt: Date?
    public var attacksToday: Int
    public var attackLimitToday: Int
    public var defensesToday: Int
    public var loopsToCapture: Int
    public var route: [LatLng]
    public var routeLengthM: Double
    public var expiresAt: Date?
}

public struct DuelsResponse: Codable, Hashable, Sendable {
    public var attacking: [DuelSummary]
    public var defending: [DuelSummary]
}

public struct DuelPreview: Codable, Hashable, Sendable {
    public enum Failure: String, Codable, Sendable {
        case `self`, size, not_owned, mixed_owner, not_connected, limit, overlap, duplicate_cells
    }
    public var ok: Bool
    public var error: Failure?
    public var cells: Int
    public var areaM2: Double
    public var avgPower: Double
    public var routeLengthM: Double
    public var estMinutes: Int
    public var slotsLeft: Int
}

/* ─────────────── İlerleme ─────────────── */

public struct DayGain: Codable, Hashable, Sendable {
    public var day: String
    public var gainedM2: Double
    public var ran: Bool
}

public struct RecentItem: Codable, Hashable, Sendable {
    public var at: Date
    public var text: String
    public var delta: String
}

public struct Defenses: Codable, Hashable, Sendable {
    public var won: Int
    public var total: Int
}

public struct StatsResponse: Codable, Hashable, Sendable {
    public var territoryM2: Double
    public var cells: Int
    public var regionRank: Int?
    public var regionName: String?
    public var monthDistanceM: Double
    public var avgPaceSecPerKm: Double?
    public var defenses: Defenses
    public var biggestLoopM2: Double
    public var streakDays: Int
    public var bestStreakDays: Int
    public var last14Days: [DayGain]
    public var recent: [RecentItem]
    public var silhouettes: [[LatLng]]
}

public struct BadgesResponse: Codable, Hashable, Sendable {
    public var earned: Int
    public var total: Int
    public var badges: [BadgeDto]
    public var nearest: [BadgeDto]
    public var slots: [String?]
    public var canChangeInsignia: Bool
}

public struct SetInsigniaRequest: Codable, Sendable {
    public var slots: [String?]
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        var arr = c.nestedUnkeyedContainer(forKey: .slots)
        for s in slots { if let s { try arr.encode(s) } else { try arr.encodeNil() } }
    }
}

public struct ShieldRequest: Codable, Sendable { public var cells: [String] }

/* ─────────────── Lig, takım, sosyal ─────────────── */

public enum LeagueScope: String, Codable, Sendable, CaseIterable { case individual, team }
public enum LeaguePeriod: String, Codable, Sendable, CaseIterable { case week, month, all }

public struct LeagueRow: Codable, Hashable, Sendable, Identifiable {
    public var rank: Int
    public var id: String
    public var name: String
    public var initials: String
    public var slot: Slot
    public var valueM2: Double
    public var delta: Int?
    public var subtitle: String?
    public var isMe: Bool

    public init(rank: Int, id: String, name: String, initials: String, slot: Slot, valueM2: Double, delta: Int?, subtitle: String?, isMe: Bool) {
        self.rank = rank; self.id = id; self.name = name; self.initials = initials; self.slot = slot
        self.valueM2 = valueM2; self.delta = delta; self.subtitle = subtitle; self.isMe = isMe
    }
}

public struct LeagueResponse: Codable, Hashable, Sendable {
    public var regionId: String
    public var regionName: String
    public var scope: LeagueScope
    public var period: LeaguePeriod
    public var rows: [LeagueRow]
    public var me: LeagueRow?
    public var meNote: String?
    public var endsAt: Date?
    public var updatedAt: Date
}

public struct TeamMember: Codable, Hashable, Sendable {
    public enum Role: String, Codable, Sendable { case captain, member }
    public var player: PublicPlayer
    public var role: Role
    public var territoryM2: Double
}

public struct TeamResponse: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var slot: Slot
    public var inviteCode: String?
    public var captain: PublicPlayer
    public var members: [TeamMember]
    public var territoryM2: Double
    public var weekGainM2: Double
    public var cells: Int
    public var regionRank: Int?
}

public struct CreateTeamRequest: Codable, Sendable { public var name: String }
public struct JoinTeamRequest: Codable, Sendable { public var code: String }

public struct FriendItem: Codable, Hashable, Sendable {
    public enum Status: String, Codable, Sendable { case besieging_you, running, idle, you_besiege }
    public var player: PublicPlayer
    public var relation: String
    public var status: Status
}

public struct FriendsResponse: Codable, Hashable, Sendable {
    public var friends: [FriendItem]
    public var inviteCode: String
}

public struct FeedItem: Codable, Hashable, Sendable, Identifiable {
    public enum Kind: String, Codable, Sendable { case conquest, badge, streak }
    public var id: String
    public var player: PublicPlayer
    public var kind: Kind
    public var title: String
    public var subtitle: String
    public var timeLabel: String
    public var claps: Int
    public var clappedByMe: Bool
    public var silhouette: [[LatLng]]?
}

/* ─────────────── Bildirim, etkinlik ─────────────── */

public struct NotificationKind: RawRepresentable, Codable, Hashable, Sendable {
    public var rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }
    public init(from decoder: Decoder) throws { rawValue = try decoder.singleValueContainer().decode(String.self) }
    public func encode(to encoder: Encoder) throws { var c = encoder.singleValueContainer(); try c.encode(rawValue) }

    public static let duelStarted = NotificationKind(rawValue: "duel_started")
    public static let siegeWarn = NotificationKind(rawValue: "siege_warn")
    public static let siegeAlarm = NotificationKind(rawValue: "siege_alarm")
    public static let cellsLost = NotificationKind(rawValue: "cells_lost")
    public static let duelWon = NotificationKind(rawValue: "duel_won")
    public static let duelReset = NotificationKind(rawValue: "duel_reset")
    public static let duelExpired = NotificationKind(rawValue: "duel_expired")
    public static let decayWarning = NotificationKind(rawValue: "decay_warning")
    public static let decayLost = NotificationKind(rawValue: "decay_lost")
    public static let eventStarted = NotificationKind(rawValue: "event_started")
    public static let badge = NotificationKind(rawValue: "badge")
    public static let team = NotificationKind(rawValue: "team")
    public static let reviewResult = NotificationKind(rawValue: "review_result")
}

public enum NotificationFilter: String, Codable, Sendable, CaseIterable { case all, siege, region, team }

public struct NotificationAction: Codable, Hashable, Sendable {
    public var label: String
    public var deeplink: String
}

public struct NotificationDto: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var kind: NotificationKind
    public var category: String
    public var title: String
    public var body: String
    public var createdAt: Date
    public var read: Bool
    public var action: NotificationAction?
}

/* ─────────────── Entegrasyon, paylaşım ─────────────── */

public enum IntegrationProvider: String, Codable, Sendable, CaseIterable {
    case garmin, coros, suunto, polar, strava, apple_health, health_connect, apple_watch, wear_os
}

public struct IntegrationDto: Codable, Hashable, Sendable {
    public var provider: IntegrationProvider
    public var connected: Bool
    public var importEnabled: Bool
    public var exportEnabled: Bool
    public var lastSyncAt: Date?
    public var device: String?
}

public struct IntegrationUpdate: Codable, Sendable {
    public var importEnabled: Bool?
    public var exportEnabled: Bool?
    public init(importEnabled: Bool? = nil, exportEnabled: Bool? = nil) { self.importEnabled = importEnabled; self.exportEnabled = exportEnabled }
}

public struct ShareCard: Codable, Hashable, Sendable {
    public var dateLabel: String
    public var kicker: String
    public var gainedAreaM2: Double
    public var line: String
    public var distanceM: Double
    public var durationMs: Double
    public var paceSecPerKm: Double?
    public var username: String
    public var teamName: String?
    public var slot: Slot
    public var silhouette: [[LatLng]]
}

public struct ActivityRequest: Codable, Sendable { public var running: Bool }
public struct RemindRequest: Codable, Sendable { public var on: Bool }
public struct ConnectRequest: Codable, Sendable { public var device: String? }
public struct ConnectResponse: Codable, Sendable { public var url: String? }
public struct ClapResponse: Codable, Hashable, Sendable { public var claps: Int; public var clappedByMe: Bool }
public struct NoteRequest: Codable, Sendable { public var text: String }
public struct ReadRequest: Codable, Sendable { public var ids: [String]? }

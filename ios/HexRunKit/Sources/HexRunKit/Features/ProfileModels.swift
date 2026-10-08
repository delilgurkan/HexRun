import Foundation
import Observation

@MainActor
@Observable
public final class StatsModel: RemoteLoading {
    public var stats = Remote<StatsResponse>()
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel) { self.app = app }
    public func load() async { await load(\.stats) { try await app.api.stats() } }

    /// Son 14 gün çubuk yükseklikleri (6…40 pt).
    public nonisolated static func barHeights(_ s: StatsResponse) -> [Double] {
        let mx = max(1, s.last14Days.map(\.gainedM2).max() ?? 1)
        return s.last14Days.map { $0.ran ? 10 + 30 * $0.gainedM2 / mx : 6 }
    }
}

/// 10b · Rozetler: boş (yapılacaklar), yükleniyor, hata (son bilinen sayı korunur).
@MainActor
@Observable
public final class BadgesModel: RemoteLoading {
    public static let lastKey = "hexrun.badges.last.v1"
    public struct Known: Codable, Sendable, Equatable { public var earned: Int; public var total: Int }

    public var badges = Remote<BadgesResponse>()
    public var saving = false
    public var error: String?
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel) { self.app = app }

    public func load() async {
        await load(\.badges) { try await app.api.badges() }
        if let b = badges.value { app.kv.setValue(Known(earned: b.earned, total: b.total), forKey: Self.lastKey) }
    }

    public var lastKnown: Known { app.kv.value(Known.self, forKey: Self.lastKey) ?? Known(earned: 0, total: Insignia.totalBadges) }
    public var errorCode: String { "RZ-\(badges.error?.status ?? 0)" }
    public var showIntro: Bool { (badges.value?.earned ?? 0) >= 2 && !app.prefs.insigniaIntroSeen }
    public func dismissIntro() { app.prefs.insigniaIntroSeen = true }

    public var nearest: [BadgeDto] {
        guard let b = badges.value else { return [] }
        return Array((b.nearest.isEmpty ? b.badges.filter { !$0.earned } : b.nearest).prefix(3))
    }

    @discardableResult
    public func setSlots(_ slots: [String?]) async -> Bool {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let res = try await app.api.setInsignia(slots)
            badges.value = res
            app.me?.canChangeInsignia = res.canChangeInsignia
            app.me?.insignia = res.slots.compactMap { $0 }
            return true
        } catch {
            self.error = errorText(error)
            return false
        }
    }
}

/// 14B · Nişan takma planı: hangi slota, kimin yerine (günde 1 değişiklik, koşuda kilitli).
public struct InsigniaPlan: Equatable, Sendable {
    public var badge: BadgeDto
    public var equippedAt: Int?
    public var slottable: Bool
    public var target: Int?
    public var targetBadge: BadgeDto?
    public var locked: Bool

    public init(data: BadgesResponse, badgeId: String, chosen: Int?, running: Bool) {
        let byId = Dictionary(data.badges.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        badge = byId[badgeId] ?? data.badges[0]
        equippedAt = data.slots.firstIndex { $0 == badgeId }
        slottable = badge.insignia?.slot == true
        let firstEmpty = data.slots.firstIndex { $0 == nil }
        target = chosen ?? firstEmpty
        if let t = target, t < data.slots.count, let id = data.slots[t] { targetBadge = byId[id] }
        locked = !data.canChangeInsignia || running
    }

    public func equipSlots(_ slots: [String?]) -> [String?] {
        slots.enumerated().map { i, s in i == target ? badge.id : (s == badge.id ? nil : s) }
    }

    public func unequipSlots(_ slots: [String?]) -> [String?] {
        slots.map { $0 == badge.id ? nil : $0 }
    }

    public var kicker: String {
        let kind = badge.insignia.map { S.badges.kinds[$0.kind] ?? $0.kind } ?? badge.category
        let when = badge.earned && badge.earnedAt != nil ? S.badges.earnedOn(TRDate.shortDate(badge.earnedAt!)) : "\(Int(badge.progressValue))/\(Int(badge.progressTarget))"
        return "\(kind) · \(when)"
    }
}

/// 11 + 18B · Arkadaşlar: oyun ilişkisi listesi ve alkışlı akış.
@MainActor
@Observable
public final class FriendsModel: RemoteLoading {
    public var friends = Remote<FriendsResponse>()
    public var feed = Remote<[FeedItem]>()
    public var nextCursor: String?
    public var code = ""
    public var error: String?
    public var accepting = false
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel) { self.app = app }

    public func load() async {
        await load(\.friends) { try await app.api.friends() }
        await loadFeed()
    }

    public func loadFeed() async {
        await load(\.feed) {
            let p = try await app.api.feed()
            nextCursor = p.nextCursor
            return p.items
        }
    }

    public func loadMore() async {
        guard let c = nextCursor, let p = try? await app.api.feed(cursor: c) else { return }
        feed.value = (feed.value ?? []) + p.items
        nextCursor = p.nextCursor
    }

    /// Alkış: iyimser güncelleme, hata olursa geri al.
    public func clap(_ id: String) async {
        guard var items = feed.value, let i = items.firstIndex(where: { $0.id == id }), !items[i].clappedByMe else { return }
        let prev = items
        items[i].clappedByMe = true
        items[i].claps += 1
        feed.value = items
        do {
            if let r = try await app.api.clap(id), let j = feed.value?.firstIndex(where: { $0.id == id }) {
                feed.value?[j].claps = r.claps
                feed.value?[j].clappedByMe = r.clappedByMe
            }
        } catch {
            feed.value = prev
        }
    }

    public func accept() async {
        let c = code.trimmingCharacters(in: .whitespaces)
        guard c.count >= 4 else { return }
        accepting = true
        error = nil
        defer { accepting = false }
        do {
            friends.value = try await app.api.acceptFriend(code: c)
            code = ""
        } catch {
            self.error = errorText(error)
        }
    }

    public var inviteMessage: String? { friends.value.map { S.friends.inviteMessage($0.inviteCode) } }
}

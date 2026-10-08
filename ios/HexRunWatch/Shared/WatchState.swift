import Foundation
import HexRunKit

/// Saatte çalınacak dokunsal geri bildirim. WatchKit'ten bağımsızdır; `WatchSession` bunu
/// `WKHapticType`'a çevirir (bu dosya Linux'ta da derlenir ve test edilir).
enum WatchHaptic: Equatable, Sendable {
    /// Yaklaşma tıkı (`tick`).
    case click
    /// Halka açık kaldı (`loop_open`), "halkayı kapat" moduna giriş, komut ulaşmadı.
    case notification
    /// Fetih.
    case success
    /// Koşu başladı / devam ediyor.
    case start
    /// Koşu duraklatıldı / bitti.
    case stop
}

/// Saatin tek doğruluk kaynağı: telefondan gelen son HUD + anlık olaylar + bekleyen komut.
/// Saf değer tipi; tüm geçişler `reduce` ile yapılır.
struct WatchState: Equatable, Sendable {
    /// Bağlantı yok uyarısı: koşarken bu kadar süre HUD gelmezse.
    static let staleAfter: TimeInterval = 30
    /// Fetih kartı ekranda kalma süresi.
    static let conquestDuration: TimeInterval = 5
    /// Anlık bilgi şeridi (halka açık kaldı, komut ulaşmadı) süresi.
    static let bannerDuration: TimeInterval = 4
    /// Telefon onaylamazsa iyimser komut durumunun düşürülme süresi.
    static let pendingTimeout: TimeInterval = 5

    struct ConquestCard: Equatable, Sendable {
        var conquest: WatchPayload.Conquest
        var shownAt: Date
    }

    enum BannerKind: Equatable, Sendable {
        case loopOpen
        case unreachable
    }

    struct Banner: Equatable, Sendable {
        var kind: BannerKind
        var shownAt: Date
    }

    struct Pending: Equatable, Sendable {
        var action: WatchPayload.Action
        var sentAt: Date
    }

    var hud: WatchPayload.Hud = .idle
    /// Son HUD'un tazelik zamanı (alındığı an; saklı bağlamda telefon damgası daha eskiyse o).
    var hudAt: Date?
    var conquest: ConquestCard?
    var banner: Banner?
    var pending: Pending?
    var reachable = false
    var activated = false
    /// Son alınan olayın türü (`tick`, `conquest`, `loop_open`) — hata ayıklama / erişilebilirlik.
    var lastEvent: String?

    enum Input: Sendable {
        /// Telefondan gelen yük. `stored`: etkinleştirmede okunan `receivedApplicationContext`.
        case payload(WatchPayload, at: Date, stored: Bool = false)
        case activated(reachable: Bool)
        case reachability(Bool)
        case commandSent(WatchPayload.Action, at: Date)
        case commandFailed(WatchPayload.Action, at: Date)
        case dismissConquest
        /// Zamanlayıcı: süresi dolan kart / şerit / bekleyen komutu temizler.
        case expire(now: Date)
    }

    /// Durumu günceller, çalınacak dokunsal geri bildirimleri döndürür.
    @discardableResult
    mutating func reduce(_ input: Input) -> [WatchHaptic] {
        switch input {
        case let .payload(p, at, stored):
            return apply(p, at: at, stored: stored)
        case let .activated(r):
            activated = true
            reachable = r
            return []
        case let .reachability(r):
            reachable = r
            return []
        case let .commandSent(action, at):
            pending = Pending(action: action, sentAt: at)
            return []
        case let .commandFailed(action, at):
            if pending?.action == action { pending = nil }
            banner = Banner(kind: .unreachable, shownAt: at)
            return [.notification]
        case .dismissConquest:
            conquest = nil
            return []
        case let .expire(now):
            if let c = conquest, now.timeIntervalSince(c.shownAt) >= Self.conquestDuration { conquest = nil }
            if let b = banner, now.timeIntervalSince(b.shownAt) >= Self.bannerDuration { banner = nil }
            if let p = pending, now.timeIntervalSince(p.sentAt) >= Self.pendingTimeout { pending = nil }
            return []
        }
    }

    private mutating func apply(_ p: WatchPayload, at: Date, stored: Bool) -> [WatchHaptic] {
        switch p {
        case let .hud(h):
            // En son durum kazanır: daha eski damgalı HUD yok sayılır.
            if h.ts > 0, hud.ts > 0, h.ts < hud.ts { return [] }
            let prev = hud
            hud = h
            var fresh = at
            if stored, h.ts > 0 {
                let sent = Date(timeIntervalSince1970: TimeInterval(h.ts) / 1000)
                if sent < fresh { fresh = sent }
            }
            hudAt = fresh
            if let pend = pending, Self.confirms(pend.action, h.state) { pending = nil }
            if h.state == .idle || h.state == .finished, pending?.action != .finish { pending = nil }
            if stored { return [] }
            return Self.transitionHaptics(from: prev, to: h)
        case .tick:
            lastEvent = p.type
            return [.click]
        case let .conquest(c):
            lastEvent = p.type
            conquest = ConquestCard(conquest: c, shownAt: at)
            return [.success]
        case .loopOpen:
            lastEvent = p.type
            banner = Banner(kind: .loopOpen, shownAt: at)
            return [.notification]
        case .command:
            // Saat komut almaz (yalnız gönderir).
            return []
        }
    }

    static func confirms(_ action: WatchPayload.Action, _ state: WatchPayload.Hud.State) -> Bool {
        switch action {
        case .pause: return state == .paused
        case .resume: return state == .running
        case .finish: return state == .finished || state == .idle
        }
    }

    static func transitionHaptics(from a: WatchPayload.Hud, to b: WatchPayload.Hud) -> [WatchHaptic] {
        var out: [WatchHaptic] = []
        let wasActive = a.state == .running || a.state == .paused
        switch (a.state, b.state) {
        case (.paused, .running): out.append(.start)
        case (_, .running) where !wasActive: out.append(.start)
        case (.running, .paused): out.append(.stop)
        case (.running, .finished), (.paused, .finished): out.append(.stop)
        default: break
        }
        if b.state == .running, b.closingMode, !(a.state == .running && a.closingMode) { out.append(.notification) }
        return out
    }

    // MARK: - Türetilen durum

    /// Ekranda gösterilen koşu durumu (iyimser komut uygulanmış).
    var displayState: WatchPayload.Hud.State {
        guard let p = pending else { return hud.state }
        switch (p.action, hud.state) {
        case (.pause, .running): return .paused
        case (.resume, .paused): return .running
        default: return hud.state
        }
    }

    var isFinishing: Bool { pending?.action == .finish && (hud.state == .running || hud.state == .paused) }

    /// Koşarken 30 sn'den uzun süredir HUD gelmediyse.
    func isStale(now: Date) -> Bool {
        guard hud.state == .running else { return false }
        guard let t = hudAt else { return true }
        return now.timeIntervalSince(t) > Self.staleAfter
    }

    /// Süre, son HUD'dan bu yana koşarken ileri sarılır (telefon seyrek gönderse de saat akar).
    func displayDurationMs(now: Date) -> Int64 {
        guard displayState == .running, hud.state == .running, let t = hudAt, !isStale(now: now) else { return hud.durationMs }
        let extra = min(max(0, now.timeIntervalSince(t)), Self.staleAfter)
        return hud.durationMs + Int64(extra * 1000)
    }

    /// Bir sonraki süre dolumu (zamanlayıcı kurmak için).
    var nextExpiry: Date? {
        [
            conquest.map { $0.shownAt.addingTimeInterval(Self.conquestDuration) },
            banner.map { $0.shownAt.addingTimeInterval(Self.bannerDuration) },
            pending.map { $0.sentAt.addingTimeInterval(Self.pendingTimeout) },
        ].compactMap { $0 }.min()
    }
}

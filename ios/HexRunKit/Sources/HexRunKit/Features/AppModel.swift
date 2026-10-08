import Foundation
import Observation

public struct Prefs: Codable, Hashable, Sendable {
    public var onboardingDone = false
    public var permissionsDone = false
    public var needsProfile = false
    public var firstLoopDismissed = false
    public var insigniaIntroSeen = false
    /// Hatırlatılacak etkinlikler.
    public var remind: [EventId] = []
    public init() {}
}

public enum LocationPermission: String, Sendable { case unknown, denied, whenInUse, always }
public enum NotificationPermission: String, Sendable { case unknown, granted, denied }

/// Son bilinen harita ve düellolar: koşu sırasında fetih önizlemesi ve düello kapsaması için.
public struct MapCache: Sendable {
    public var myId: String?
    public var cells: [String: MapCell] = [:]
    public var attacking: [DuelSummary] = []
    public var defending: [DuelSummary] = []
    public init() {}

    public mutating func remember(_ res: MapResponse, myId: String?) {
        self.myId = myId
        for c in res.cells { cells[c.id] = c }
        if cells.count > 20_000 {
            for k in cells.keys.prefix(cells.count - 20_000) { cells[k] = nil }
        }
    }

    public var conquestContext: ConquestContext { ConquestContext(myId: myId, cells: cells, attacking: attacking) }
}

/// Uygulama geneli durum: oturum, tercihler, profil, izinler, harita önbelleği.
@MainActor
@Observable
public final class AppModel {
    public enum AuthStatus: Sendable { case loading, signedOut, signedIn }

    public static let prefsKey = "hexrun.prefs.v1"
    public static let lastMapKey = "hexrun.lastMap.v1"

    public let api: HexRunAPI
    public let kv: KeyValueStore
    public let queue: RunQueue
    public var auth: AuthStatus = .loading
    public var prefs: Prefs {
        didSet { kv.setValue(prefs, forKey: Self.prefsKey) }
    }
    public var me: Me?
    public var mapCache = MapCache()
    public var location: LocationPermission = .unknown
    public var notifications: NotificationPermission = .unknown
    public var isOnline = true
    /// Bildirim ya da URL'den gelen, henüz işlenmemiş hedef.
    public var pendingLink: DeepLink?
    /// Koşu sırasında gösterilecek kısa uyarı.
    public var toast: String?

    public init(api: HexRunAPI, kv: KeyValueStore, queue: RunQueue) {
        self.api = api
        self.kv = kv
        self.queue = queue
        prefs = kv.value(Prefs.self, forKey: Self.prefsKey) ?? Prefs()
    }

    /// Açılış: jeton varsa oturum açık say; profil arka planda yüklenir.
    public func boot() async {
        await api.client.setLogoutHandler { [weak self] in
            Task { @MainActor in self?.didLogout() }
        }
        let tokens = await api.client.tokens.get()
        auth = tokens == nil ? .signedOut : .signedIn
        if auth == .signedIn { await refreshMe() }
    }

    public func refreshMe() async {
        do {
            me = try await api.me()
            mapCache.myId = me?.id
        } catch {}
    }

    public func completeSignIn(_ r: AuthResponse) async {
        await api.client.saveAuth(r)
        me = r.user
        mapCache.myId = r.user.id
        prefs.needsProfile = r.needsProfile
        auth = .signedIn
    }

    public func signOut() async {
        if let t = await api.client.tokens.get() { try? await api.logout(refreshToken: t.refreshToken) }
        await api.client.tokens.clear()
        didLogout()
    }

    func didLogout() {
        me = nil
        mapCache = MapCache()
        auth = .signedOut
    }

    /// Kalıcı son harita (çevrimdışı görünüm).
    public struct LastMap: Codable, Sendable {
        public var at: Date
        public var res: MapResponse
    }

    public func saveLastMap(_ res: MapResponse) { kv.setValue(LastMap(at: Date(), res: res), forKey: Self.lastMapKey) }
    public func lastMap() -> LastMap? { kv.value(LastMap.self, forKey: Self.lastMapKey) }

    public var loopOptions: LoopOptions {
        Insignia.loopOptions(insignia: me?.insignia ?? [], newbieDaysLeft: me?.newbieDaysLeft ?? 0)
    }

    public var runLocked: Bool { location == .denied }
}

import Foundation
import Observation

/// 15A · Gizlilik bölgesi (200–800 m). Ev konumu sunucuda saklanmaz.
@MainActor
@Observable
public final class PrivacyModel {
    public var enabled = false
    public var radius: Double = 400
    public var message: String?
    public var saving = false
    @ObservationIgnored private let app: AppModel
    /// Uygulama katmanı: o anki konum (izin yoksa nil).
    @ObservationIgnored public var currentLocation: () async -> LatLng? = { nil }

    public init(app: AppModel) {
        self.app = app
        if let m = app.me {
            enabled = m.privacy.enabled
            if let r = m.privacy.radiusM { radius = r }
        }
    }

    public func save(on: Bool) async {
        saving = true
        defer { saving = false }
        do {
            if !on {
                app.me = try await app.api.privacy(PrivacyRequest(home: nil))
            } else {
                guard let home = await currentLocation() else { message = S.privacy.needLocation; return }
                app.me = try await app.api.privacy(PrivacyRequest(home: home, radiusM: clampPrivacyRadius(radius)))
            }
            message = S.privacy.homeSet
        } catch {
            message = errorText(error)
        }
    }
}

/// 17A · Saat ve uygulamalar.
@MainActor
@Observable
public final class IntegrationsModel: RemoteLoading {
    public static let watches: [IntegrationProvider] = [.apple_watch, .garmin, .coros, .suunto, .polar]
    public static let apps: [IntegrationProvider] = [.strava, .apple_health]
    static let deviceSources: Set<IntegrationProvider> = [.apple_watch, .wear_os, .apple_health, .health_connect]

    public var list = Remote<[IntegrationDto]>()
    public var soon: Set<IntegrationProvider> = []
    public var busy: IntegrationProvider?
    public var error: String?
    @ObservationIgnored private let app: AppModel
    /// OAuth sağlayıcısı için tarayıcı oturumu (ASWebAuthenticationSession).
    @ObservationIgnored public var openAuth: (URL) async -> Void = { _ in }
    @ObservationIgnored public var deviceName: String?

    public init(app: AppModel) { self.app = app }

    public func load() async { await load(\.list) { try await app.api.integrations() } }
    public func dto(_ p: IntegrationProvider) -> IntegrationDto? { list.value?.first { $0.provider == p } }

    public func subtitle(_ p: IntegrationProvider) -> String {
        let health = p == .apple_health || p == .health_connect
        guard let d = dto(p), d.connected else { return health ? S.integrations.healthSub : S.integrations.autoImport }
        let parts = [d.device, d.lastSyncAt.map { S.integrations.lastSync(TRDate.relative($0)) }].compactMap { $0 }
        if !parts.isEmpty { return parts.joined(separator: " · ") }
        if p == .apple_watch || p == .wear_os { return S.integrations.appInstalled }
        return health ? S.integrations.healthSub : ""
    }

    public func connect(_ p: IntegrationProvider) async {
        busy = p
        error = nil
        defer { busy = nil }
        do {
            let r = try await app.api.connect(p, device: Self.deviceSources.contains(p) ? deviceName : nil)
            if let s = r.url, let u = URL(string: s) { await openAuth(u) }
            await load()
        } catch let e as ApiError where e.code == "not_configured" || e.status == 501 {
            soon.insert(p)
        } catch {
            self.error = errorText(error)
        }
    }

    public func disconnect(_ p: IntegrationProvider) async {
        try? await app.api.disconnect(p)
        await load()
    }

    public func set(_ p: IntegrationProvider, importEnabled: Bool? = nil, exportEnabled: Bool? = nil) async {
        if let r = try? await app.api.updateIntegration(p, IntegrationUpdate(importEnabled: importEnabled, exportEnabled: exportEnabled)),
           let i = list.value?.firstIndex(where: { $0.provider == p }) {
            list.value?[i] = r
        }
    }
}

/// Ayarlar: veri dışa aktarma, hesap silme, çıkış.
@MainActor
@Observable
public final class SettingsModel {
    public var exporting = false
    public var error: String?
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel) { self.app = app }

    /// Dışa aktarılan JSON'u geçici dosyaya yazar ve adresini döner.
    public func export(now: Date = Date()) async -> URL? {
        exporting = true
        defer { exporting = false }
        do {
            let data = try await app.api.exportData()
            let pretty = (try? JSONSerialization.jsonObject(with: data)).flatMap { try? JSONSerialization.data(withJSONObject: $0, options: [.prettyPrinted, .sortedKeys]) } ?? data
            let day = String(ISODate.string(now).prefix(10))
            let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("hexrun-verilerim-\(day).json")
            try pretty.write(to: url, options: .atomic)
            return url
        } catch {
            self.error = errorText(error)
            return nil
        }
    }

    public func deleteAccount() async -> Bool {
        do {
            try await app.api.deleteMe()
            await app.signOut()
            return true
        } catch {
            self.error = errorText(error)
            return false
        }
    }

    public func signOut() async { await app.signOut() }
}

/// 18A · Paylaşım kartı (yalnız silüet).
@MainActor
@Observable
public final class ShareModel: RemoteLoading {
    public let runId: String
    public var card = Remote<ShareCard>()
    public var dark = true
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel, runId: String) { self.app = app; self.runId = runId }
    public func load() async { await load(\.card) { try await app.api.share(runId) } }

    public nonisolated static func metricsLine(_ c: ShareCard) -> String {
        "\(Fmt.km(c.distanceM, digits: 1)) km · \(Fmt.duration(c.durationMs)) · \(Fmt.pace(c.paceSecPerKm))/km"
    }

    public nonisolated static func userLine(_ c: ShareCard) -> String { "@\(c.username)" + (c.teamName.map { " · \($0)" } ?? "") }
}

/// Bölge silüeti: yerel düzleme izdüşüm (harita yok, yalnız biçim). Noktalar [0,w]×[0,h].
public enum Silhouette {
    public static func project(_ rings: [[LatLng]], width w: Double, height h: Double, pad: Double = 8) -> [[(x: Double, y: Double)]] {
        let pts = rings.flatMap { $0 }
        guard !pts.isEmpty else { return [] }
        let lat0 = pts.reduce(0) { $0 + $1.lat } / Double(pts.count)
        let k = cos(lat0 * .pi / 180)
        let xs = pts.map { $0.lng * k }, ys = pts.map { -$0.lat }
        let minX = xs.min()!, maxX = xs.max()!, minY = ys.min()!, maxY = ys.max()!
        let sw = max(maxX - minX, 1e-9), sh = max(maxY - minY, 1e-9)
        let s = min((w - pad * 2) / sw, (h - pad * 2) / sh)
        let ox = (w - sw * s) / 2, oy = (h - sh * s) / 2
        return rings.filter { $0.count >= 3 }.map { r in r.map { (ox + ($0.lng * k - minX) * s, oy + (-$0.lat - minY) * s) } }
    }
}

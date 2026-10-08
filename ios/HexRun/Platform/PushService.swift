import UIKit
import UserNotifications
import HexRunKit

/// APNs: izin (gerekçe ekranından sonra), kayıt ve `PUT /v1/me/push-token {platform:"ios", provider:"apns"}`.
/// Bildirime dokununca `data.url` derin bağlantısı açılır.
@MainActor
final class PushService: NSObject, ReminderScheduler, UNUserNotificationCenterDelegate {
    var api: HexRunAPI?
    var onLink: ((DeepLink) -> Void)?
    private(set) var deviceToken: String?
    private var pendingLink: DeepLink?

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    func status() async -> NotificationPermission {
        let s = await UNUserNotificationCenter.current().notificationSettings()
        switch s.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return .granted
        case .denied: return .denied
        default: return .unknown
        }
    }

    func requestAuthorization() async -> Bool {
        let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if ok { UIApplication.shared.registerForRemoteNotifications() }
        return ok
    }

    /// Oturum açıkken ve izin varsa APNs'e kaydol (jeton AppDelegate'ten gelir).
    func registerIfAuthorized() async {
        if await status() == .granted { UIApplication.shared.registerForRemoteNotifications() }
    }

    func didRegister(_ token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        deviceToken = hex
        Task { try? await api?.pushToken(hex, platform: .ios, provider: .apns) }
    }

    func setLinkHandler(_ h: @escaping (DeepLink) -> Void) {
        onLink = h
        if let p = pendingLink { pendingLink = nil; h(p) }
    }

    // MARK: Hatırlat (yerel bildirim)

    func schedule(id: String, title: String, body: String, afterSeconds: Int, deeplink: String) async {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.userInfo = ["url": deeplink]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(max(60, afterSeconds)), repeats: false)
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: trigger))
    }

    func cancel(id: String) async {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
    }

    // MARK: UNUserNotificationCenterDelegate

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .badge])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let link = DeepLink.fromPush(response.notification.request.content.userInfo)
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                if let link {
                    if let h = self.onLink { h(link) } else { self.pendingLink = link }
                }
            }
            completionHandler()
        }
    }
}

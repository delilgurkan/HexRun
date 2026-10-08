import GoogleSignIn
import SwiftUI
import UIKit
import HexRunKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        BackgroundQueue.register { MainActor.assumeIsolated { AppEnvironment.shared.app.queue } }
        if let id = AppConfig.googleClientId { GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: id) }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MainActor.assumeIsolated { AppEnvironment.shared.push.didRegister(deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {}
}

@main
struct HexRunApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @Environment(\.scenePhase) private var phase
    private let env = AppEnvironment.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .environment(env.app)
                .environment(env.router)
                .environment(env.run)
                .onOpenURL { url in
                    if GIDSignIn.sharedInstance.handle(url) { return }
                    env.handleURL(url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { a in
                    if let url = a.webpageURL { env.handleURL(url) }
                }
                .task { await env.boot() }
        }
        .onChange(of: phase) { _, p in
            switch p {
            case .active: env.didBecomeActive()
            case .background: env.didEnterBackground()
            default: break
            }
        }
    }
}

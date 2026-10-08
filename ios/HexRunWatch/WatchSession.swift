import Foundation
import Observation
import WatchConnectivity
import WatchKit
import HexRunKit

/// Telefon bağlantısı (WatchConnectivity). Telefon yetkili kaynaktır; saat yalnız gösterir, titreşir
/// ve `pause` / `resume` / `finish` komutu gönderir (`docs/NATIVE.md` · "Telefon ↔ saat protokolü").
///
/// Tüm durum `WatchState.reduce` üzerinden değişir; bu sınıf yalnız taşıma, zamanlayıcı ve haptiktir.
@MainActor
@Observable
final class WatchSession: NSObject, WCSessionDelegate {
    static let shared = WatchSession()

    private(set) var state = WatchState()

    @ObservationIgnored private var expiryTask: Task<Void, Never>?
    @ObservationIgnored private var activationRequested = false

    var reachable: Bool { state.reachable }

    override private init() {
        super.init()
    }

    /// Uygulama açılırken bir kez çağrılır.
    func activate() {
        guard !activationRequested, WCSession.isSupported() else { return }
        activationRequested = true
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // MARK: - Komutlar (saat → telefon)

    func send(_ action: WatchPayload.Action) {
        let now = Date()
        reduce(.commandSent(action, at: now))
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable else {
            reduce(.commandFailed(action, at: now))
            return
        }
        session.sendMessage(WatchPayload.command(action).dictionary, replyHandler: nil) { [self] _ in
            Task { @MainActor in self.reduce(.commandFailed(action, at: Date())) }
        }
    }

    func dismissConquest() {
        reduce(.dismissConquest)
    }

    // MARK: - Durum

    private func reduce(_ input: WatchState.Input) {
        let haptics = state.reduce(input)
        // Aynı anda birden çok titreşim üst üste binmesin: en anlamlısı.
        if let h = haptics.max(by: { Self.rank($0) < Self.rank($1) }) { play(h) }
        scheduleExpiry()
    }

    private func scheduleExpiry() {
        expiryTask?.cancel()
        guard let next = state.nextExpiry else {
            expiryTask = nil
            return
        }
        let delay = max(0, next.timeIntervalSinceNow) + 0.05
        expiryTask = Task { [self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self.reduce(.expire(now: Date()))
        }
    }

    private static func rank(_ h: WatchHaptic) -> Int {
        switch h {
        case .click: return 0
        case .start, .stop: return 1
        case .notification: return 2
        case .success: return 3
        }
    }

    private func play(_ h: WatchHaptic) {
        let type: WKHapticType
        switch h {
        case .click: type = .click
        case .notification: type = .notification
        case .success: type = .success
        case .start: type = .start
        case .stop: type = .stop
        }
        WKInterfaceDevice.current().play(type)
    }

    private func receive(_ payload: WatchPayload, stored: Bool = false) {
        reduce(.payload(payload, at: Date(), stored: stored))
    }

    // MARK: - WCSessionDelegate (arka plan kuyruğunda çağrılır)

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let reachable = session.isReachable
        let stored = activationState == .activated ? WatchPayload(dictionary: session.receivedApplicationContext) : nil
        Task { @MainActor in
            self.reduce(.activated(reachable: reachable))
            if let stored, case .hud = stored { self.receive(stored, stored: true) }
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in self.reduce(.reachability(reachable)) }
    }

    /// Sürekli HUD durumu (`updateApplicationContext`).
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let p = WatchPayload(dictionary: applicationContext) else { return }
        Task { @MainActor in self.receive(p) }
    }

    /// Anlık olay (`sendMessage`, yanıtsız).
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard let p = WatchPayload(dictionary: message) else { return }
        Task { @MainActor in self.receive(p) }
    }

    /// Anlık olay (`sendMessage`, yanıt bekleyen gönderici için boş yanıt).
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        replyHandler([:])
        guard let p = WatchPayload(dictionary: message) else { return }
        Task { @MainActor in self.receive(p) }
    }

    /// Ulaşılamazken kuyruğa alınan olay (`transferUserInfo`). Gecikmiş yaklaşma tıkı anlamsızdır: atlanır.
    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        guard let p = WatchPayload(dictionary: userInfo), p != .tick else { return }
        Task { @MainActor in self.receive(p) }
    }
}

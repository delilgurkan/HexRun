import Foundation
import WatchConnectivity
import HexRunKit

/// Telefon tarafı saat köprüsü (`docs/NATIVE.md` · Telefon ↔ saat protokolü):
/// `hud` → `updateApplicationContext` (en son durum kazanır), `tick`/`conquest`/`loop_open` →
/// `sendMessage` (ulaşılamazsa `transferUserInfo`). Saatten `command` pause/resume/finish gelir.
@MainActor
final class WatchBridge: NSObject, RunMirror, WCSessionDelegate {
    private let session: WCSession? = WCSession.isSupported() ? .default : nil
    private var lastHudSent: Int64 = 0
    private var lastHud: WatchPayload.Hud?
    /// Saat komutu (uygulama katmanı işler: finish → özet).
    var onCommand: ((WatchPayload.Action) -> Void)?

    override init() {
        super.init()
        session?.delegate = self
        session?.activate()
    }

    private var usable: Bool {
        guard let s = session, s.activationState == .activated else { return false }
        return s.isPaired && s.isWatchAppInstalled
    }

    func publish(_ p: WatchPayload) {
        guard let s = session, usable else { return }
        switch p {
        case let .hud(h):
            // Durum değişimi hemen; aynı durumda en çok saniyede bir.
            let changed = lastHud?.state != h.state || lastHud?.closingMode != h.closingMode
            if !changed, h.ts - lastHudSent < 1_000 { return }
            lastHud = h
            lastHudSent = h.ts
            try? s.updateApplicationContext(p.dictionary)
        case .tick, .conquest, .loopOpen:
            let msg = p.dictionary
            if s.isReachable {
                s.sendMessage(msg, replyHandler: nil) { _ in s.transferUserInfo(msg) }
            } else if case .tick = p {
                // Bayat tık sonradan titreşmesin.
            } else {
                s.transferUserInfo(msg)
            }
        case .command:
            break
        }
    }

    private func handle(_ dict: [String: Any]) {
        if case let .command(a)? = WatchPayload(dictionary: dict) { onCommand?(a) }
    }

    // MARK: WCSessionDelegate

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        let data = WatchPayload(dictionary: message)
        DispatchQueue.main.async { MainActor.assumeIsolated { if case let .command(a)? = data { self.onCommand?(a) } } }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        let data = WatchPayload(dictionary: message)
        replyHandler(["ok": true])
        DispatchQueue.main.async { MainActor.assumeIsolated { if case let .command(a)? = data { self.onCommand?(a) } } }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        let data = WatchPayload(dictionary: userInfo)
        DispatchQueue.main.async { MainActor.assumeIsolated { if case let .command(a)? = data { self.onCommand?(a) } } }
    }
}

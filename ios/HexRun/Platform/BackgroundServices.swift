import BackgroundTasks
import Network
import UIKit
import HexRunKit

/// Çevrimdışı koşu kuyruğu için `BGProcessingTask` (ağ gerektirir).
enum BackgroundQueue {
    static let identifier = "co.hexrun.app.runqueue"

    /// `application(_:didFinishLaunchingWithOptions:)` içinde çağrılmalı.
    static func register(queue: @escaping @Sendable () -> RunQueue?) {
        _ = BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            let work = Task {
                if let q = queue() {
                    await q.flush(force: true)
                    if await !q.pending().isEmpty { schedule() }
                }
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
    }

    static func schedule() {
        let r = BGProcessingTaskRequest(identifier: identifier)
        r.requiresNetworkConnectivity = true
        r.requiresExternalPower = false
        r.earliestBeginDate = Date(timeIntervalSinceNow: 60)
        try? BGTaskScheduler.shared.submit(r)
    }
}

/// Bağlantı izleme: bağlantı gelince kuyruk gönderilir.
@MainActor
final class NetworkMonitor {
    private let monitor = NWPathMonitor()
    var onChange: ((Bool) -> Void)?

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.onChange?(online) } }
        }
        monitor.start(queue: DispatchQueue(label: "co.hexrun.net"))
    }
}

import CoreLocation
import Observation
import SwiftUI
import UIKit
import HexRunKit

/// Uygulamanın bağımlılık kökü: API, depolar, koşu denetleyicisi, platform servisleri.
/// `-uiTestMockAPI` ile sahte sunucu + bellek içi depolar + simüle konum kullanılır.
@MainActor
@Observable
final class AppEnvironment {
    static let shared = AppEnvironment()

    let app: AppModel
    let router = Router()
    let run: RunController
    @ObservationIgnored let location: LocationService
    @ObservationIgnored let haptics = Haptics()
    @ObservationIgnored let push = PushService()
    @ObservationIgnored let watch = WatchBridge()
    @ObservationIgnored let network = NetworkMonitor()
    let mock: Bool
    /// Koşu konum izni olmadan başlatılmak istendi (uyarı).
    var showRunLockedAlert = false
    var booted = false

    private init() {
        mock = AppConfig.uiTestMockAPI
        let tokens: TokenStore
        let kv: KeyValueStore
        let client: APIClient
        let runStore: RunStore
        if mock {
            tokens = MemoryTokenStore()
            kv = MemoryKeyValueStore()
            client = MockBackend.makeClient(tokens: tokens)
            runStore = MemoryRunStore()
        } else {
            tokens = KeychainTokenStore()
            kv = FileKeyValueStore.appSupport()
            client = APIClient(baseURL: AppConfig.apiBaseURL, tokens: tokens)
            runStore = FileRunStore.appSupport()
        }
        let api = HexRunAPI(client: client)
        let queue = RunQueue(kv: kv, submit: { try await api.submitRun($0) })
        app = AppModel(api: api, kv: kv, queue: queue)
        location = LocationService()
        let provider: LocationProvider = mock ? SimulatedLocation() : location
        run = RunController(store: runStore, location: provider, haptics: haptics, awake: ScreenAwakeService(), queue: queue)
        run.mirror = watch
        run.device = UIDevice.current.model
        run.onActivity = { running in Task { try? await api.activity(running: running) } }
        push.api = api
    }

    /// Açılış: oturum, izinler, yarım kalan koşu, bağlantı izleme.
    func boot() async {
        guard !booted else { return }
        booted = true
        let app = self.app
        run.conquestContext = { [weak self] in self?.app.mapCache.conquestContext ?? .empty }
        location.onPermission = { [weak self] p in if self?.mock == false { self?.app.location = p } }
        app.location = mock ? .whenInUse : location.permission
        if mock { app.notifications = .unknown } else { app.notifications = await push.status() }
        push.setLinkHandler { [weak self] link in self?.open(link) }
        watch.onCommand = { [weak self] action in self?.handleWatch(action) }
        network.onChange = { [weak self] online in
            self?.app.isOnline = online
            if online { Task { await app.queue.flush(force: true) } }
        }
        network.start()
        await app.boot()
        if app.auth == .signedIn {
            await push.registerIfAuthorized()
            if run.recover() { router.cover = .run }
        }
        Task { await app.queue.flush() }
    }

    func open(_ link: DeepLink) {
        guard app.auth == .signedIn else { app.pendingLink = link; return }
        router.handle(link)
    }

    func handleURL(_ url: URL) {
        if let link = DeepLink.parse(url.absoluteString) { open(link) }
    }

    /// Koşu modunu başlatır; konum izni yoksa koşu kilitli kalır (uyarı + Ayarlar).
    func startRun(_ context: RunContext = RunContext()) async {
        if !mock {
            var perm = location.permission
            if perm == .unknown { perm = await location.requestPermission() }
            app.location = perm
            guard perm == .whenInUse || perm == .always else { showRunLockedAlert = true; return }
        }
        router.regionCell = nil
        do {
            try run.start(context: context, options: app.loopOptions)
            router.cover = .run
        } catch {}
    }

    /// Bitir: kuyruğa koy, özeti aç.
    func finishRun() async {
        let id = await run.finish()
        router.cover = id.map { .summary(.queued(clientRunId: $0)) }
        if id != nil { BackgroundQueue.schedule() }
    }

    private func handleWatch(_ a: WatchPayload.Action) {
        if run.handle(a) { Task { await finishRun() } }
    }

    func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }

    func currentLocation() async -> LatLng? {
        if mock { return Fixtures.moda }
        guard let l = await location.currentLocation() else { return location.lastKnown }
        return LatLng(lat: l.coordinate.latitude, lng: l.coordinate.longitude)
    }

    /// Sahne arka plana geçince kuyruk için arka plan görevi planla.
    func didEnterBackground() {
        Task {
            if await !app.queue.pending().isEmpty { BackgroundQueue.schedule() }
        }
    }

    func didBecomeActive() {
        if !mock { app.location = location.permission }
        Task {
            if !mock { app.notifications = await push.status() }
            await app.queue.flush()
        }
    }
}

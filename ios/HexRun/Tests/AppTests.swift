import SwiftUI
import XCTest
import HexRunKit
@testable import HexRun

/// Uygulama katmanı testleri: tema token'ları, ikonlar, sahte API ile görünüm modelleri ve
/// derin bağlantıların yönlendirmeye çevrilmesi.
@MainActor
final class AppTests: XCTestCase {
    func makeApp() async -> AppModel {
        MockBackend.state.reset()
        let tokens = MemoryTokenStore(Tokens(accessToken: "mock-access", refreshToken: "mock-refresh", expiresAt: Date().epochMs + 3_600_000))
        let api = HexRunAPI(client: MockBackend.makeClient(tokens: tokens))
        let kv = MemoryKeyValueStore()
        let app = AppModel(api: api, kv: kv, queue: RunQueue(kv: kv, submit: { try await api.submitRun($0) }))
        await app.boot()
        return app
    }

    func testThemeTokens() {
        XCTAssertEqual(ThemeColors.darkRaw["bg"], "#0F1312")
        XCTAssertEqual(ThemeColors.lightRaw["bg"], "#F7F6F1")
        XCTAssertEqual(Theme(isDark: true).cellFillOpacity, 0.5)
        XCTAssertEqual(Theme(isDark: false).cellFillOpacity, 0.55)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(hex: "rgba(26,31,29,0.92)").getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(a, 0.92, accuracy: 0.001)
        UIColor(hex: "#E69F00").getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, 230.0 / 255, accuracy: 0.001)
    }

    func testIconsRenderAndFontsRegistered() {
        for n in IconName.allCases {
            XCTAssertFalse(IconCache.ops(n).isEmpty, n.rawValue)
            XCTAssertEqual(IconCache.image(n).size.width, 24)
        }
        // Fontlar Info.plist UIAppFonts ile yüklenir; yoksa sistem fontuna düşülür.
        XCTAssertTrue(HXFont.available("Archivo-Bold"), "Archivo paketlenmemiş")
        XCTAssertTrue(HXFont.available("IBMPlexMono-Medium"), "IBM Plex Mono paketlenmemiş")
    }

    func testMapModelWithMockAPI() async {
        let app = await makeApp()
        let m = MapModel(app: app)
        await m.loadAll()
        XCTAssertNotNil(m.data)
        XCTAssertEqual(m.siege?.attacker.firstName, "Selin")
        XCTAssertFalse(GeoJSON.cells(m.data!.cells).isEmpty)
    }

    func testGeoJSONShapes() throws {
        let cells = Fixtures.mapCells
        let fc = try XCTUnwrap(try JSONSerialization.jsonObject(with: GeoJSON.cells(cells)) as? [String: Any])
        let features = try XCTUnwrap(fc["features"] as? [[String: Any]])
        XCTAssertEqual(features.count, cells.count)
        let props = try XCTUnwrap(features.first?["properties"] as? [String: Any])
        XCTAssertEqual(props["slot"] as? String, "keh")
        XCTAssertEqual(props["siege"] as? Bool, true)
        XCTAssertEqual(props["atk"] as? String, "gul")
        let ring = try XCTUnwrap(((features.first?["geometry"] as? [String: Any])?["coordinates"] as? [[[Double]]])?.first)
        XCTAssertEqual(ring.count, 7, "altıgen + kapanış")
        XCTAssertEqual(ring.first, ring.last)
    }

    func testRouterDeepLinks() {
        let r = Router()
        r.handle(DeepLink.parse("hexrun://notifications")!)
        XCTAssertEqual(r.mapPath, [.notifications])
        r.handle(DeepLink.parse("hexrun://run?defend=d9")!)
        XCTAssertEqual(r.runRequest?.defendDuelId, "d9")
        r.handle(DeepLink.parse("https://hexrun.co/invite/ABCD")!)
        XCTAssertEqual(r.inviteCode, "ABCD")
    }

    func testDuelSelectionPaintFlow() async {
        let app = await makeApp()
        let ids = Fixtures.mapCells.filter { $0.ownerId == "emre" }.map(\.id)
        let m = DuelSelectModel(app: app, request: DuelSelectRequest(cell: ids[0]), debounceMs: 1)
        await m.load()
        m.beginStroke(at: ids[0])
        ids.dropFirst().forEach { m.continueStroke(at: $0) }
        m.endStroke()
        await m.refreshPreviewNow()
        XCTAssertEqual(m.selected.count, ids.count)
        XCTAssertTrue(m.canConfirm)
    }

    func testSimulatedRunClosesLoop() async throws {
        let app = await makeApp()
        let sim = SimulatedLocation()
        sim.intervalMs = 1
        let rc = RunController(store: MemoryRunStore(), location: sim, haptics: Haptics(), awake: ScreenAwakeService(), queue: app.queue)
        try rc.start()
        for _ in 0..<200 where rc.conquest == nil { try await Task.sleep(nanoseconds: 10_000_000) }
        XCTAssertNotNil(rc.conquest, "simüle halka kapanmalı")
        let id = await rc.finish()
        XCTAssertNotNil(id)
    }

    func testShareCardRenders() {
        let r = ImageRenderer(content: StoryCard(card: Fixtures.shareCard, dark: true, width: 360))
        r.scale = 3
        let img = r.uiImage
        XCTAssertNotNil(img)
        XCTAssertEqual(img?.size.width ?? 0, 360, accuracy: 1)
        XCTAssertEqual(img?.size.height ?? 0, 640, accuracy: 1)
    }
}

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import HexRunKit

/// URLProtocol saplaması: her test kendi işleyicisini kurar.
final class StubProtocol: URLProtocol {
    typealias Handler = @Sendable (URLRequest, Data?) -> (Int, Data, TimeInterval)
    private static let lock = NSLock()
    private static var _handler: Handler?
    private static var _log: [String] = []

    static func set(_ h: @escaping Handler) { lock.lock(); _handler = h; _log = []; lock.unlock() }
    static var log: [String] { lock.lock(); defer { lock.unlock() }; return _log }
    static func record(_ s: String) { lock.lock(); _log.append(s); lock.unlock() }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        let h = Self._handler
        Self.lock.unlock()
        let req = request
        let body = MockBackend.bodyData(req)
        Self.record("\(req.httpMethod ?? "") \(req.url?.path ?? "") \(req.value(forHTTPHeaderField: "Authorization") ?? "-")")
        let (status, data, delay) = h?(req, body) ?? (500, Data(), 0)
        let finish = { [self] in
            let resp = HTTPURLResponse(url: req.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
            client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        }
        if delay > 0 { DispatchQueue.global().asyncAfter(deadline: .now() + delay) { finish() } } else { finish() }
    }

    override func stopLoading() {}

    static func session() -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: c)
    }
}

func authJSON(_ access: String, _ refresh: String) -> Data {
    try! HexJSON.encoder().encode(AuthResponse(accessToken: access, refreshToken: refresh, expiresIn: 900, user: Fixtures.me, needsProfile: false))
}

final class Flag: @unchecked Sendable {
    private let lock = NSLock()
    private var v = 0
    func bump() { lock.lock(); v += 1; lock.unlock() }
    var value: Int { lock.lock(); defer { lock.unlock() }; return v }
}

final class APIClientTests: XCTestCase {
    let base = URL(string: "https://api.test")!
    var farFuture: Int64 { Date().epochMs + 3_600_000 }

    func testBearerHeaderPathAndQuery() async throws {
        StubProtocol.set { req, _ in
            XCTAssertEqual(req.url?.absoluteString, "https://api.test/v1/league?scope=team&period=all")
            return (200, try! HexJSON.encoder().encode(Fixtures.league(scope: .team, period: .all)), 0)
        }
        let tokens = MemoryTokenStore(Tokens(accessToken: "A1", refreshToken: "R1", expiresAt: farFuture))
        let api = HexRunAPI(client: APIClient(baseURL: base, tokens: tokens, session: StubProtocol.session()))
        let l = try await api.league(scope: .team, period: .all)
        XCTAssertEqual(l.regionName, "Kadıköy")
        XCTAssertEqual(StubProtocol.log, ["GET /v1/league Bearer A1"])
    }

    func testApiErrorDecodingKeepsTurkishMessage() async {
        StubProtocol.set { _, _ in (409, Data(#"{"error":{"code":"duel_limit","message":"Aynı anda en çok 3 düellon olabilir."}}"#.utf8), 0) }
        let api = HexRunAPI(client: APIClient(baseURL: base, tokens: MemoryTokenStore(Tokens(accessToken: "A", refreshToken: "R", expiresAt: farFuture)), session: StubProtocol.session()))
        do {
            _ = try await api.createDuel(["a"])
            XCTFail("hata bekleniyordu")
        } catch let e as ApiError {
            XCTAssertEqual(e.status, 409)
            XCTAssertEqual(e.code, "duel_limit")
            XCTAssertEqual(e.message, "Aynı anda en çok 3 düellon olabilir.")
            XCTAssertFalse(e.isRetryable)
            XCTAssertEqual(errorText(e), "Aynı anda en çok 3 düellon olabilir.")
        } catch { XCTFail("\(error)") }
    }

    func testNonJSONErrorFallsBack() async {
        StubProtocol.set { _, _ in (503, Data("oops".utf8), 0) }
        let api = HexRunAPI(client: APIClient(baseURL: base, tokens: MemoryTokenStore(), session: StubProtocol.session()))
        do { _ = try await api.events(); XCTFail() } catch let e as ApiError {
            XCTAssertEqual(e.code, "http_503")
            XCTAssertTrue(e.isRetryable)
            XCTAssertEqual(errorText(e), S.common.genericError)
        } catch { XCTFail("\(error)") }
    }

    func testNoContentAndOptional() async throws {
        StubProtocol.set { _, _ in (204, Data(), 0) }
        let api = HexRunAPI(client: APIClient(baseURL: base, tokens: MemoryTokenStore(), session: StubProtocol.session()))
        let team = try await api.myTeam()
        XCTAssertNil(team)
        try await api.activity(running: true)
    }

    func testRefreshOn401ThenRetry() async throws {
        StubProtocol.set { req, body in
            if req.url?.path == "/v1/auth/refresh" {
                let r = try! JSONDecoder().decode(RefreshRequest.self, from: body!)
                XCTAssertEqual(r.refreshToken, "R1")
                return (200, authJSON("A2", "R2"), 0)
            }
            let auth = req.value(forHTTPHeaderField: "Authorization")
            return auth == "Bearer A2" ? (200, try! HexJSON.encoder().encode(Fixtures.me), 0) : (401, Data(#"{"error":{"code":"unauthorized","message":"Oturum süresi doldu"}}"#.utf8), 0)
        }
        let tokens = MemoryTokenStore(Tokens(accessToken: "A1", refreshToken: "R1", expiresAt: farFuture))
        let client = APIClient(baseURL: base, tokens: tokens, session: StubProtocol.session())
        let me = try await HexRunAPI(client: client).me()
        XCTAssertEqual(me.id, "me")
        let t = await tokens.get()
        XCTAssertEqual(t?.accessToken, "A2")
        XCTAssertEqual(t?.refreshToken, "R2")
        let rc = await client.refreshCount
        XCTAssertEqual(rc, 1)
    }

    func testConcurrent401sShareOneRefresh() async throws {
        let refreshes = Flag()
        StubProtocol.set { req, _ in
            if req.url?.path == "/v1/auth/refresh" {
                refreshes.bump()
                return (200, authJSON("A2", "R2"), 0.15)
            }
            let ok = req.value(forHTTPHeaderField: "Authorization") == "Bearer A2"
            return ok ? (200, try! HexJSON.encoder().encode(Fixtures.stats), 0) : (401, Data(), 0.02)
        }
        let tokens = MemoryTokenStore(Tokens(accessToken: "A1", refreshToken: "R1", expiresAt: farFuture))
        let api = HexRunAPI(client: APIClient(baseURL: base, tokens: tokens, session: StubProtocol.session()))
        try await withThrowingTaskGroup(of: Int.self) { g in
            for _ in 0..<6 { g.addTask { try await api.stats().cells } }
            for try await c in g { XCTAssertEqual(c, 62) }
        }
        XCTAssertEqual(refreshes.value, 1)
    }

    func testRejectedRefreshLogsOut() async {
        let logged = Flag()
        StubProtocol.set { req, _ in
            req.url?.path == "/v1/auth/refresh" ? (401, Data(), 0) : (401, Data(#"{"error":{"code":"unauthorized","message":"Oturum kapandı"}}"#.utf8), 0)
        }
        let tokens = MemoryTokenStore(Tokens(accessToken: "A1", refreshToken: "R1", expiresAt: farFuture))
        let client = APIClient(baseURL: base, tokens: tokens, session: StubProtocol.session())
        await client.setLogoutHandler { logged.bump() }
        do { _ = try await HexRunAPI(client: client).me(); XCTFail() } catch let e as ApiError {
            XCTAssertEqual(e.status, 401)
            XCTAssertEqual(e.message, "Oturum kapandı")
        } catch { XCTFail("\(error)") }
        let t = await tokens.get()
        XCTAssertNil(t)
        XCTAssertEqual(logged.value, 1)
    }

    func testProactiveRefreshWhenExpiring() async throws {
        StubProtocol.set { req, _ in
            if req.url?.path == "/v1/auth/refresh" { return (200, authJSON("A9", "R9"), 0) }
            XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer A9")
            return (200, try! HexJSON.encoder().encode(Fixtures.me), 0)
        }
        let tokens = MemoryTokenStore(Tokens(accessToken: "A1", refreshToken: "R1", expiresAt: Date().epochMs + 5_000))
        _ = try await HexRunAPI(client: APIClient(baseURL: base, tokens: tokens, session: StubProtocol.session())).me()
        XCTAssertEqual(StubProtocol.log.first, "POST /v1/auth/refresh -")
    }

    func testUnauthenticatedEndpointsSendNoBearer() async throws {
        StubProtocol.set { req, body in
            XCTAssertNil(req.value(forHTTPHeaderField: "Authorization"))
            let b = try! JSONDecoder().decode(EmailStartRequest.self, from: body!)
            XCTAssertEqual(b.email, "a@b.co")
            return (200, Data(#"{"sent":true,"devCode":"123456"}"#.utf8), 0)
        }
        let api = HexRunAPI(client: APIClient(baseURL: base, tokens: MemoryTokenStore(Tokens(accessToken: "A", refreshToken: "R", expiresAt: farFuture)), session: StubProtocol.session()))
        let r = try await api.emailStart("a@b.co")
        XCTAssertEqual(r.devCode, "123456")
    }

    func testTimeoutMapsToNetworkError() async {
        StubProtocol.set { _, _ in (200, Data("{}".utf8), 2) }
        let api = HexRunAPI(client: APIClient(baseURL: base, tokens: MemoryTokenStore(), session: StubProtocol.session(), timeout: 0.3))
        do { _ = try await api.events(); XCTFail() } catch let e as ApiError {
            XCTAssertTrue(e.isNetwork, "\(e)")
            XCTAssertTrue(e.isRetryable)
        } catch { XCTFail("\(error)") }
    }

    func testPushTokenBodyHasProvider() async throws {
        StubProtocol.set { req, body in
            XCTAssertEqual(req.httpMethod, "PUT")
            let o = try! JSONSerialization.jsonObject(with: body!) as! [String: String]
            XCTAssertEqual(o, ["token": "abc", "platform": "ios", "provider": "apns"])
            return (204, Data(), 0)
        }
        let api = HexRunAPI(client: APIClient(baseURL: base, tokens: MemoryTokenStore(Tokens(accessToken: "A", refreshToken: "R", expiresAt: farFuture)), session: StubProtocol.session()))
        try await api.pushToken("abc")
    }

    func testBBoxQueryFormat() {
        let b = BBox(minLat: 40.98, minLng: 29.02, maxLat: 41, maxLng: 29.03)
        XCTAssertEqual(b.queryValue, "40.980000,29.020000,41.000000,29.030000")
    }
}

final class ModelCodingTests: XCTestCase {
    func testDecodesContractShapedJSON() throws {
        let json = """
        {"id":"run-1","source":"phone","startedAt":"2026-10-04T03:29:00.000Z","endedAt":"2026-10-04T04:14:00Z","distanceM":8400,"durationMs":2713000,
         "paceSecPerKm":323,"loops":[{"index":1,"status":"applied","closedAt":"2026-10-04T04:14:00Z","lengthM":3000,"areaM2":19220.5,"cells":62,"newCells":14,
         "reinforced":0,"capturedCells":48,"gainedAreaM2":19220,"hits":[],"multipliers":{"gain":2,"attack":2,"pushback":1.5}}],"openGapM":null,"status":"applied",
         "review":null,"newBadges":[],"streakDays":35,"monthDistanceM":126400,"suggestions":[],"totalGainedAreaM2":19220}
        """
        let s = try HexJSON.decoder().decode(RunSummary.self, from: Data(json.utf8))
        XCTAssertEqual(s.loops[0].multipliers.pushback, 1.5)
        XCTAssertEqual(ISODate.string(s.startedAt), "2026-10-04T03:29:00.000Z")
        XCTAssertEqual(SummaryPresenter.variant(s), .closed)
    }

    func testUnknownNotificationKindDecodes() throws {
        let json = #"{"id":"x","kind":"future_kind","category":"other","title":"t","body":"b","createdAt":"2026-10-04T04:14:00Z","read":false,"action":null}"#
        let n = try HexJSON.decoder().decode(NotificationDto.self, from: Data(json.utf8))
        XCTAssertEqual(n.kind.rawValue, "future_kind")
        XCTAssertEqual(NotificationsModel.icon(n.kind), .bell)
    }

    func testISODateVariants() {
        XCTAssertEqual(ISODate.parse("2026-10-05T04:00:00Z")?.epochMs, 1_791_172_800_000)
        XCTAssertEqual(ISODate.parse("2026-10-05T04:00:00.250Z")?.epochMs, 1_791_172_800_250)
        XCTAssertEqual(ISODate.parse("2026-10-05T07:00:00+03:00")?.epochMs, 1_791_172_800_000)
        XCTAssertNil(ISODate.parse("yarın"))
        XCTAssertEqual(ISODate.string(Date(epochMs: 1_791_172_800_250)), "2026-10-05T04:00:00.250Z")
    }

    func testPrivacyNullHomeIsEncoded() throws {
        let d = try HexJSON.encoder().encode(PrivacyRequest(home: nil))
        XCTAssertEqual(String(data: d, encoding: .utf8), #"{"home":null}"#)
        let s = try HexJSON.encoder().encode(SetInsigniaRequest(slots: ["oncu", nil, nil]))
        XCTAssertEqual(String(data: s, encoding: .utf8), #"{"slots":["oncu",null,null]}"#)
    }

    func testFixturesRoundTrip() throws {
        let m = Fixtures.map
        let back = try HexJSON.decoder().decode(MapResponse.self, from: HexJSON.encoder().encode(m))
        XCTAssertEqual(back.cells.count, m.cells.count)
        XCTAssertTrue(m.cells.allSatisfy { H3.isGameCell($0.id) })
    }
}

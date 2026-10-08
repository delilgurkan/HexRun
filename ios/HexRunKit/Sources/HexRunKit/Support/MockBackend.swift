import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Sahte HexRun sunucusu: `-uiTestMockAPI` başlatma argümanı, SwiftUI önizlemeleri ve
/// görünüm modeli testleri için. `URLSessionConfiguration.protocolClasses` üzerinden takılır.
public final class MockBackend: URLProtocol {
    /// Sunucu durumu (tüm örnekler paylaşır).
    public final class State: @unchecked Sendable {
        private let lock = NSLock()
        private var _needsProfile = false
        private var _requests: [String] = []
        private var _failPaths: [String: Int] = [:]
        private var _submitted = 0
        public var latencyMs: Int = 0

        public var needsProfile: Bool {
            get { lock.lock(); defer { lock.unlock() }; return _needsProfile }
            set { lock.lock(); _needsProfile = newValue; lock.unlock() }
        }

        /// "GET /v1/me" biçiminde istek günlüğü.
        public var requests: [String] { lock.lock(); defer { lock.unlock() }; return _requests }
        public var submittedRuns: Int { lock.lock(); defer { lock.unlock() }; return _submitted }

        /// Yol öneki için sabit HTTP hatası (ör. "/v1/league": 500).
        public func fail(_ prefix: String, status: Int) { lock.lock(); _failPaths[prefix] = status; lock.unlock() }
        public func reset() {
            lock.lock()
            _failPaths = [:]; _requests = []; _needsProfile = false; _submitted = 0
            lock.unlock()
        }

        func record(_ s: String) { lock.lock(); _requests.append(s); lock.unlock() }
        func bumpSubmitted() { lock.lock(); _submitted += 1; lock.unlock() }
        func failure(for path: String) -> Int? {
            lock.lock(); defer { lock.unlock() }
            return _failPaths.first { path.hasPrefix($0.key) }?.value
        }
    }

    public static let state = State()
    public static let baseURL = URL(string: "https://mock.hexrun.local")!

    public static func sessionConfiguration() -> URLSessionConfiguration {
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [MockBackend.self]
        return c
    }

    public static func makeClient(tokens: TokenStore = MemoryTokenStore()) -> APIClient {
        APIClient(baseURL: baseURL, tokens: tokens, session: URLSession(configuration: sessionConfiguration()))
    }

    override public class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == baseURL.host
    }

    override public class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override public func startLoading() {
        let req = request
        let (status, body) = Self.respond(req)
        let delay = Self.state.latencyMs
        let send = { [weak self] in
            guard let self else { return }
            let resp = HTTPURLResponse(url: req.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
            self.client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
            if !body.isEmpty { self.client?.urlProtocol(self, didLoad: body) }
            self.client?.urlProtocolDidFinishLoading(self)
        }
        if delay > 0 { DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(delay), execute: send) } else { send() }
    }

    override public func stopLoading() {}

    static func bodyData(_ r: URLRequest) -> Data? {
        if let b = r.httpBody { return b }
        guard let s = r.httpBodyStream else { return nil }
        s.open()
        defer { s.close() }
        var out = Data()
        var buf = [UInt8](repeating: 0, count: 4096)
        while s.hasBytesAvailable {
            let n = s.read(&buf, maxLength: buf.count)
            if n <= 0 { break }
            out.append(buf, count: n)
        }
        return out
    }

    static func json<T: Encodable>(_ v: T, _ status: Int = 200) -> (Int, Data) {
        (status, (try? HexJSON.encoder().encode(v)) ?? Data())
    }

    static func error(_ status: Int, _ code: String, _ message: String) -> (Int, Data) {
        json(ApiErrorBody(error: .init(code: code, message: message, details: nil)), status)
    }

    static let empty = (204, Data())

    /// Yönlendirici.
    public static func respond(_ r: URLRequest) -> (Int, Data) {
        let method = r.httpMethod ?? "GET"
        let path = r.url?.path ?? ""
        state.record("\(method) \(path)")
        if let s = state.failure(for: path) { return error(s, "mock_fail", "Sahte hata") }
        let seg = path.split(separator: "/").map(String.init).dropFirst() // "v1" düşer
        let p = Array(seg)
        let body = bodyData(r)
        func decode<T: Decodable>(_ t: T.Type) -> T? { body.flatMap { try? HexJSON.decoder().decode(T.self, from: $0) } }
        let query = r.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false)?.queryItems } ?? []
        func q(_ name: String) -> String? { query.first { $0.name == name }?.value }

        switch (method, p.first ?? "", p.count) {
        case ("POST", "auth", _):
            switch p.dropFirst().joined(separator: "/") {
            case "email/start": return json(EmailStartResponse(sent: true, devCode: "123456"))
            case "email/verify":
                guard let v = decode(EmailVerifyRequest.self), v.code == "123456" else { return error(400, "invalid_code", "Kod hatalı ya da süresi dolmuş.") }
                return json(Fixtures.auth(needsProfile: state.needsProfile))
            case "apple", "google": return json(Fixtures.auth(needsProfile: state.needsProfile))
            case "refresh": return json(Fixtures.auth())
            case "logout": return empty
            default: break
            }
        case ("GET", "me", 1): return json(Fixtures.me)
        case ("PATCH", "me", 1):
            var me = Fixtures.me
            if let u = decode(UpdateMeRequest.self) {
                if let n = u.username { me.username = n }
                if let d = u.displayName { me.displayName = d; me.initials = Fmt.initials(d) }
                if let s = u.slot { me.slot = s }
            }
            return json(me)
        case ("DELETE", "me", 1): return empty
        case ("GET", "me", 2):
            switch p[1] {
            case "stats": return json(Fixtures.stats)
            case "badges": return json(Fixtures.badgesFull)
            case "export": return json(["user": Fixtures.me.username])
            default: break
            }
        case ("PUT", "me", 2):
            switch p[1] {
            case "privacy":
                var me = Fixtures.me
                if let pr = decode(PrivacyRequest.self) { me.privacy = PrivacyState(enabled: pr.home != nil, radiusM: pr.radiusM) }
                return json(me)
            case "insignia":
                var b = Fixtures.badgesFull
                if let s = decode(SetInsigniaRequest.self) { b.slots = s.slots; b.canChangeInsignia = false }
                return json(b)
            case "push-token", "activity": return empty
            default: break
            }
        case ("POST", "me", 2) where p[1] == "shield": return empty
        case ("GET", "usernames", 2):
            let name = p[1]
            let ok = name.count >= 3 && name != "alinmis"
            return json(UsernameAvailability(username: name, available: ok, reason: ok ? nil : name.count < 3 ? .invalid : .taken))
        case ("GET", "map", 1): return json(Fixtures.map)
        case ("GET", "map", 2):
            if p[1] == "region" { return json(Fixtures.region(cell: q("cell") ?? H3.cellOf(Fixtures.moda))) }
            if p[1] == "first-loop" { return empty }
        case ("POST", "runs", 1):
            state.bumpSubmitted()
            return json(Fixtures.summaryClosed)
        case ("GET", "runs", 1): return json(Page<RunListItem>(items: [], nextCursor: nil))
        case ("GET", "runs", 2): return json(Fixtures.summaryClosed)
        case ("GET", "runs", 3) where p[2] == "share": return json(Fixtures.shareCard)
        case ("POST", "runs", 3) where p[2] == "note": return empty
        case ("POST", "duels", 2) where p[1] == "preview":
            let n = decode(CreateDuelRequest.self)?.cells.count ?? 0
            var pv = Fixtures.preview
            pv.cells = n
            pv.areaM2 = Double(n) * Rules.approxCellAreaM2
            if n < Rules.duelMinCells || n > Rules.duelMaxCells { pv.ok = false; pv.error = .size }
            return json(pv)
        case ("POST", "duels", 1):
            var d = Fixtures.duelAttacking
            d.id = "d-new"
            d.cells = decode(CreateDuelRequest.self)?.cells ?? d.cells
            return json(d)
        case ("GET", "duels", 1): return json(Fixtures.duels)
        case ("GET", "duels", 2):
            return json(p[1] == Fixtures.duelDefending.id ? Fixtures.duelDefending : Fixtures.duelAttacking)
        case ("DELETE", "duels", 2): return empty
        case ("GET", "league", 1):
            return json(Fixtures.league(scope: LeagueScope(rawValue: q("scope") ?? "") ?? .individual, period: LeaguePeriod(rawValue: q("period") ?? "") ?? .week))
        case ("GET", "teams", 2) where p[1] == "mine": return json(Fixtures.team)
        case ("POST", "teams", _): return p.count == 2 && p[1] == "leave" ? empty : json(Fixtures.team)
        case ("GET", "friends", 1): return json(Fixtures.friends)
        case ("POST", "friends", 2): return json(Fixtures.friends)
        case ("DELETE", "friends", 2): return empty
        case ("GET", "feed", 1): return json(Fixtures.feed)
        case ("POST", "feed", 3): return json(ClapResponse(claps: 5, clappedByMe: true))
        case ("GET", "notifications", 1):
            let f = q("filter") ?? "all"
            return json(Page(items: Fixtures.notifications.filter { f == "all" || $0.category == f }, nextCursor: nil))
        case ("POST", "notifications", 2): return empty
        case ("GET", "events", 1): return json(EventsPresenter.resolve(nil))
        case ("POST", "events", 3): return empty
        case ("GET", "integrations", 1): return json(Fixtures.integrations)
        case ("POST", "integrations", 3): return json(ConnectResponse(url: nil))
        case ("PATCH", "integrations", 2):
            var i = Fixtures.integrations.first { $0.provider.rawValue == p[1] } ?? Fixtures.integrations[2]
            if let u = decode(IntegrationUpdate.self) {
                if let v = u.importEnabled { i.importEnabled = v }
                if let v = u.exportEnabled { i.exportEnabled = v }
            }
            return json(i)
        case ("DELETE", "integrations", 2): return empty
        default: break
        }
        return error(404, "not_found", "Bulunamadı")
    }
}

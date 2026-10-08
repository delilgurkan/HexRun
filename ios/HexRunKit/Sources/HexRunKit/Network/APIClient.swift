import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum HTTPMethod: String, Sendable { case GET, POST, PUT, PATCH, DELETE }

/// Tipli URLSession istemcisi: `/v1` taban yolu, Bearer JWT, istek zaman aşımı, 401'de tek
/// paylaşılan jeton yenileme (eşzamanlı isteklerde tek yenileme), yenileme reddedilirse çıkış.
public actor APIClient {
    public nonisolated let baseURL: URL
    public nonisolated let tokens: TokenStore
    private let session: URLSession
    private let defaultTimeout: TimeInterval
    private let now: @Sendable () -> Int64
    private var onLogout: (@Sendable () -> Void)?
    private var refreshTask: Task<Tokens?, Error>?
    /// Test/teşhis: yapılan yenileme isteği sayısı.
    public private(set) var refreshCount = 0

    public init(baseURL: URL, tokens: TokenStore, session: URLSession = .shared, timeout: TimeInterval = 15, now: @escaping @Sendable () -> Int64 = { Date().epochMs }) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session
        self.defaultTimeout = timeout
        self.now = now
    }

    public func setLogoutHandler(_ h: (@Sendable () -> Void)?) { onLogout = h }

    public nonisolated func url(_ path: String, query: [(String, String?)] = []) -> URL {
        let p = path.hasPrefix("/") ? path : "/" + path
        var s = baseURL.absoluteString
        while s.hasSuffix("/") { s.removeLast() }
        s += "/v1" + p
        let items = query.compactMap { k, v in v.map { "\(Self.encode(k))=\(Self.encode($0))" } }
        if !items.isEmpty { s += "?" + items.joined(separator: "&") }
        return URL(string: s)!
    }

    /// `encodeURIComponent` eşdeğeri.
    static func encode(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.!~*'()")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    public func saveAuth(_ r: AuthResponse) async {
        await tokens.set(Tokens(accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: now() + Int64(r.expiresIn * 1000)))
    }

    // MARK: İstek

    public struct Options: Sendable {
        public var auth = true
        public var timeout: TimeInterval?
        public init(auth: Bool = true, timeout: TimeInterval? = nil) { self.auth = auth; self.timeout = timeout }
    }

    /// Ham istek: başarılı yanıtın gövdesi (204 → boş).
    public func send(_ method: HTTPMethod, _ path: String, query: [(String, String?)] = [], body: Data? = nil, options: Options = Options()) async throws -> (Data, Int) {
        var tok = options.auth ? await tokens.get() : nil
        // Süresi dolmak üzereyse önden yenile (30 sn pay).
        if options.auth, let t = tok, t.expiresAt - 30_000 < now() {
            tok = (try? await refresh(t.refreshToken)) ?? tok
        }
        var (data, status) = try await perform(method, path, query, body, options, tok?.accessToken)
        if status == 401, options.auth, let used = tok {
            // Başka bir istek bu arada yenilediyse yeni jetonla tekrar dene.
            let current = await tokens.get()
            var fresh: Tokens?
            if let c = current, c.accessToken != used.accessToken {
                fresh = c
            } else {
                fresh = try await refresh(used.refreshToken)
            }
            guard let f = fresh else {
                await logout()
                throw ApiError.from(status: status, body: data)
            }
            (data, status) = try await perform(method, path, query, body, options, f.accessToken)
            if status == 401 {
                await logout()
                throw ApiError.from(status: status, body: data)
            }
        }
        guard (200..<300).contains(status) else { throw ApiError.from(status: status, body: data) }
        return (data, status)
    }

    public func request<T: Decodable>(_ method: HTTPMethod, _ path: String, query: [(String, String?)] = [], body: (any Encodable)? = nil, options: Options = Options(), as type: T.Type = T.self) async throws -> T {
        let (data, _) = try await send(method, path, query: query, body: try encodeBody(body), options: options)
        do {
            return try HexJSON.decoder().decode(T.self, from: data.isEmpty ? Data("null".utf8) : data)
        } catch {
            throw ApiError.badJSON
        }
    }

    /// 204 / boş gövde → nil.
    public func requestOptional<T: Decodable>(_ method: HTTPMethod, _ path: String, query: [(String, String?)] = [], body: (any Encodable)? = nil, options: Options = Options(), as type: T.Type = T.self) async throws -> T? {
        let (data, status) = try await send(method, path, query: query, body: try encodeBody(body), options: options)
        if status == 204 || data.isEmpty || data == Data("null".utf8) { return nil }
        do {
            return try HexJSON.decoder().decode(T.self, from: data)
        } catch {
            throw ApiError.badJSON
        }
    }

    /// Gövdesi önemsiz istek.
    public func requestVoid(_ method: HTTPMethod, _ path: String, query: [(String, String?)] = [], body: (any Encodable)? = nil, options: Options = Options()) async throws {
        _ = try await send(method, path, query: query, body: try encodeBody(body), options: options)
    }

    private func encodeBody(_ body: (any Encodable)?) throws -> Data? {
        guard let body else { return nil }
        return try HexJSON.encoder().encode(body)
    }

    // MARK: Yenileme

    /// Eşzamanlı 401'ler tek bir yenileme isteğini paylaşır. Ret → nil; ağ hatası fırlatılır.
    public func refresh(_ refreshToken: String? = nil) async throws -> Tokens? {
        if let running = refreshTask { return try await running.value }
        let task = Task<Tokens?, Error> { try await self.doRefresh(refreshToken) }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    private func doRefresh(_ given: String?) async throws -> Tokens? {
        var rt = given
        if rt == nil { rt = await tokens.get()?.refreshToken }
        guard let rt else { return nil }
        refreshCount += 1
        let body = try HexJSON.encoder().encode(RefreshRequest(refreshToken: rt))
        let (data, status) = try await perform(.POST, "/auth/refresh", [], body, Options(auth: false), nil)
        guard (200..<300).contains(status) else { return nil }
        guard let res = try? HexJSON.decoder().decode(AuthResponse.self, from: data) else { return nil }
        await saveAuth(res)
        return await tokens.get()
    }

    public func logout() async {
        await tokens.clear()
        onLogout?()
    }

    // MARK: Taşıma

    private func perform(_ method: HTTPMethod, _ path: String, _ query: [(String, String?)], _ body: Data?, _ options: Options, _ accessToken: String?) async throws -> (Data, Int) {
        var req = URLRequest(url: url(path, query: query))
        req.httpMethod = method.rawValue
        req.timeoutInterval = options.timeout ?? defaultTimeout
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let accessToken { req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization") }
        return try await Self.load(session, req)
    }

    static func load(_ session: URLSession, _ req: URLRequest) async throws -> (Data, Int) {
        let box = TaskBox()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<(Data, Int), Error>) in
                box.attach(cont)
                let task = session.dataTask(with: req) { data, response, error in
                    if let error {
                        let code = (error as? URLError)?.code
                        box.finish(.failure(code == .timedOut ? ApiError.timeout : code == .cancelled ? ApiError.cancelled : ApiError.network))
                        return
                    }
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                    box.finish(.success((data ?? Data(), status)))
                }
                box.set(task)
                // Kendi zaman aşımımız: özel URLProtocol'ler ve bazı ağ durumları timeoutInterval'ı uygulamaz.
                DispatchQueue.global().asyncAfter(deadline: .now() + req.timeoutInterval) {
                    box.finish(.failure(ApiError.timeout))
                }
                task.resume()
            }
        } onCancel: {
            box.finish(.failure(ApiError.cancelled))
        }
    }
}

/// İptal için veri görevini tutar.
final class TaskBox: @unchecked Sendable {
    private let lock = NSLock()
    private var task: URLSessionDataTask?
    private var done = false
    private var continuation: CheckedContinuation<(Data, Int), Error>?

    func attach(_ c: CheckedContinuation<(Data, Int), Error>) {
        lock.lock()
        if done { lock.unlock(); c.resume(throwing: ApiError.cancelled); return }
        continuation = c
        lock.unlock()
    }

    func set(_ t: URLSessionDataTask) {
        lock.lock(); defer { lock.unlock() }
        task = t
        if done { t.cancel() }
    }

    /// Sürekliliği yalnız bir kez sürdürür; zaman aşımı/iptalde görevi iptal eder.
    func finish(_ r: Result<(Data, Int), Error>) {
        lock.lock()
        if done { lock.unlock(); return }
        done = true
        let c = continuation
        continuation = nil
        let t = task
        lock.unlock()
        if case .failure = r { t?.cancel() }
        c?.resume(with: r)
    }
}

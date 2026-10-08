import Foundation

public struct Tokens: Codable, Hashable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    /// Erişim jetonunun bitişi (epoch ms).
    public var expiresAt: Int64
    public init(accessToken: String, refreshToken: String, expiresAt: Int64) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
    }
}

public protocol TokenStore: Sendable {
    func get() async -> Tokens?
    func set(_ tokens: Tokens) async
    func clear() async
}

public actor MemoryTokenStore: TokenStore {
    private var tokens: Tokens?
    public init(_ initial: Tokens? = nil) { tokens = initial }
    public func get() -> Tokens? { tokens }
    public func set(_ t: Tokens) { tokens = t }
    public func clear() { tokens = nil }
}

#if canImport(Security)
import Security

/// Keychain (cihazda, ilk kilit açılışından sonra erişilebilir; yedeğe taşınmaz).
public actor KeychainTokenStore: TokenStore {
    private let service: String
    private let account = "hexrun.tokens.v1"
    private var cache: Tokens??

    public init(service: String = "co.hexrun.app") { self.service = service }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    public func get() -> Tokens? {
        if let c = cache { return c }
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        var t: Tokens?
        if status == errSecSuccess, let d = out as? Data { t = try? JSONDecoder().decode(Tokens.self, from: d) }
        cache = .some(t)
        return t
    }

    public func set(_ t: Tokens) {
        cache = .some(t)
        guard let d = try? JSONEncoder().encode(t) else { return }
        let attrs: [String: Any] = [kSecValueData as String: d, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add.merge(attrs) { $1 }
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    public func clear() {
        cache = .some(nil)
        SecItemDelete(query as CFDictionary)
    }
}
#endif

import Foundation

/// Basit kalıcı anahtar-değer deposu (tercihler, kuyruk, son harita).
public protocol KeyValueStore: AnyObject, Sendable {
    func data(forKey key: String) -> Data?
    func set(_ data: Data?, forKey key: String)
}

public extension KeyValueStore {
    func value<T: Decodable>(_ type: T.Type, forKey key: String) -> T? {
        guard let d = data(forKey: key) else { return nil }
        return try? HexJSON.decoder().decode(T.self, from: d)
    }

    func setValue<T: Encodable>(_ value: T?, forKey key: String) {
        guard let value else { set(nil, forKey: key); return }
        set(try? HexJSON.encoder().encode(value), forKey: key)
    }
}

/// Bellek içi depo (testler).
public final class MemoryKeyValueStore: KeyValueStore, @unchecked Sendable {
    private var storage: [String: Data] = [:]
    private let lock = NSLock()
    public init() {}
    public func data(forKey key: String) -> Data? {
        lock.lock(); defer { lock.unlock() }
        return storage[key]
    }
    public func set(_ data: Data?, forKey key: String) {
        lock.lock(); defer { lock.unlock() }
        storage[key] = data
    }
}

/// Dosya tabanlı depo: her anahtar bir dosya, atomik yazma.
public final class FileKeyValueStore: KeyValueStore, @unchecked Sendable {
    public let directory: URL
    private let lock = NSLock()

    public init(directory: URL) {
        self.directory = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// Uygulama destek klasörü altında (yedeklemeye dahil, kullanıcıya görünmez).
    public static func appSupport(_ name: String = "HexRun") -> FileKeyValueStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return FileKeyValueStore(directory: base.appendingPathComponent(name, isDirectory: true))
    }

    private func url(_ key: String) -> URL {
        let safe = key.map { $0.isLetter || $0.isNumber || $0 == "." || $0 == "-" ? $0 : "_" }
        return directory.appendingPathComponent(String(safe) + ".json")
    }

    public func data(forKey key: String) -> Data? {
        lock.lock(); defer { lock.unlock() }
        return try? Data(contentsOf: url(key))
    }

    public func set(_ data: Data?, forKey key: String) {
        lock.lock(); defer { lock.unlock() }
        let u = url(key)
        if let data { try? data.write(to: u, options: .atomic) } else { try? FileManager.default.removeItem(at: u) }
    }
}

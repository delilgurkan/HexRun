import Foundation

/// Günlük girdisi: GPS noktası ya da duraklat/devam.
public enum RunLogEntry: Codable, Hashable, Sendable {
    case point(TrackPoint)
    case pause(Int64)
    case resume(Int64)

    enum CodingKeys: String, CodingKey { case k, p, t }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .k) {
        case "p": self = .point(try c.decode(TrackPoint.self, forKey: .p))
        case "pause": self = .pause(try c.decode(Int64.self, forKey: .t))
        case "resume": self = .resume(try c.decode(Int64.self, forKey: .t))
        default: throw DecodingError.dataCorruptedError(forKey: .k, in: c, debugDescription: "bilinmeyen günlük girdisi")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .point(p): try c.encode("p", forKey: .k); try c.encode(p, forKey: .p)
        case let .pause(t): try c.encode("pause", forKey: .k); try c.encode(t, forKey: .t)
        case let .resume(t): try c.encode("resume", forKey: .k); try c.encode(t, forKey: .t)
        }
    }
}

/// Koşu bağlamı (derin bağlantı, hedef düello, ilk halka önerisi).
public struct RunContext: Codable, Hashable, Sendable {
    public var defendDuelId: String?
    public var attackDuelId: String?
    public var firstLoop: Bool?
    public init(defendDuelId: String? = nil, attackDuelId: String? = nil, firstLoop: Bool? = nil) {
        self.defendDuelId = defendDuelId; self.attackDuelId = attackDuelId; self.firstLoop = firstLoop
    }
}

/// Yarım kalan koşunun başlığı (günlük ayrı, yalnız eklenir).
public struct RunHeader: Codable, Hashable, Sendable {
    public var v: Int = 1
    public var clientRunId: String
    public var startedAt: Int64
    public var status: String
    public var closeRadiusM: Double
    public var minLoopLengthM: Double
    public var pausedMs: Int64
    public var pausedAt: Int64?
    public var loopsShown: Int
    public var context: RunContext
}

/// Koşu kalıcılığı: başlık + yalnız eklenen günlük. Uygulama öldürülürse günlük yeniden oynatılır.
public protocol RunStore: AnyObject {
    func load() -> (header: RunHeader, log: [RunLogEntry])?
    func writeHeader(_ h: RunHeader)
    func append(_ entries: [RunLogEntry])
    func clear()
}

public final class MemoryRunStore: RunStore {
    public private(set) var header: RunHeader?
    public private(set) var log: [RunLogEntry] = []
    public private(set) var appendCalls = 0
    public init() {}
    public func load() -> (header: RunHeader, log: [RunLogEntry])? { header.map { ($0, log) } }
    public func writeHeader(_ h: RunHeader) { header = h }
    public func append(_ entries: [RunLogEntry]) { appendCalls += 1; log += entries }
    public func clear() { header = nil; log = [] }
}

/// Dosya deposu: `header.json` (atomik) + `log.jsonl` (satır satır eklenir). Yarım yazılmış
/// son satır (çökme) okunurken atlanır.
public final class FileRunStore: RunStore {
    public let directory: URL
    private var headerURL: URL { directory.appendingPathComponent("header.json") }
    private var logURL: URL { directory.appendingPathComponent("log.jsonl") }
    private let encoder = JSONEncoder()

    public init(directory: URL) {
        self.directory = directory
    }

    public static func appSupport() -> FileRunStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return FileRunStore(directory: base.appendingPathComponent("HexRun/activeRun", isDirectory: true))
    }

    public func load() -> (header: RunHeader, log: [RunLogEntry])? {
        guard let hd = try? Data(contentsOf: headerURL), let h = try? JSONDecoder().decode(RunHeader.self, from: hd), h.v == 1 else { return nil }
        var log: [RunLogEntry] = []
        if let raw = try? Data(contentsOf: logURL) {
            for line in raw.split(separator: UInt8(ascii: "\n")) where !line.isEmpty {
                if let e = try? JSONDecoder().decode(RunLogEntry.self, from: Data(line)) { log.append(e) }
            }
        }
        return (h, log)
    }

    public func writeHeader(_ h: RunHeader) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let d = try? encoder.encode(h) { try? d.write(to: headerURL, options: .atomic) }
    }

    public func append(_ entries: [RunLogEntry]) {
        guard !entries.isEmpty else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var chunk = Data()
        for e in entries {
            if let d = try? encoder.encode(e) { chunk.append(d); chunk.append(UInt8(ascii: "\n")) }
        }
        if !FileManager.default.fileExists(atPath: logURL.path) {
            try? chunk.write(to: logURL)
            return
        }
        if let h = try? FileHandle(forWritingTo: logURL) {
            defer { try? h.close() }
            _ = try? h.seekToEnd()
            try? h.write(contentsOf: chunk)
        }
    }

    public func clear() {
        try? FileManager.default.removeItem(at: headerURL)
        try? FileManager.default.removeItem(at: logURL)
    }
}

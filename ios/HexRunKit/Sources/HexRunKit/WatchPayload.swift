import Foundation

/// Telefon ↔ saat protokolü (`docs/NATIVE.md` · "Telefon ↔ saat protokolü").
/// Tüm yükler JSON nesnesidir; watchOS'ta `[String: Any]`. Sürüm alanı yok: bilinmeyen alanlar
/// yok sayılır, eksik alanlar varsayılan değer alır.
public enum WatchPayload: Equatable, Sendable {
    /// Telefon → saat, sürekli durum (`updateApplicationContext`, en son durum kazanır).
    case hud(Hud)
    /// Telefon → saat, yaklaşma tık (`sendMessage`, yoksa `transferUserInfo`).
    case tick
    /// Halka kapandı: fetih.
    case conquest(Conquest)
    /// Koşu halka kapanmadan bitti / halka açık kaldı.
    case loopOpen
    /// Saat → telefon komutu (`sendMessage`).
    case command(Action)

    public enum Action: String, Codable, Sendable { case pause, resume, finish }

    public struct Duel: Codable, Equatable, Sendable {
        public var opponent: String
        public var coveredCells: Int
        public var totalCells: Int
        public init(opponent: String, coveredCells: Int, totalCells: Int) {
            self.opponent = opponent; self.coveredCells = coveredCells; self.totalCells = totalCells
        }
        public init(from d: Decoder) throws {
            let c = try d.container(keyedBy: CodingKeys.self)
            opponent = (try? c.decodeIfPresent(String.self, forKey: .opponent)) ?? ""
            coveredCells = (try? c.decodeIfPresent(Int.self, forKey: .coveredCells)) ?? 0
            totalCells = (try? c.decodeIfPresent(Int.self, forKey: .totalCells)) ?? 0
        }
    }

    public struct Hud: Codable, Equatable, Sendable {
        public enum State: String, Codable, Sendable { case idle, running, paused, finished }
        public var state: State
        public var distanceM: Double
        public var durationMs: Int64
        public var paceSecPerKm: Double?
        public var distToStartM: Double
        public var armed: Bool
        public var closingMode: Bool
        public var events: [String]
        public var duel: Duel?
        public var ts: Int64

        public init(state: State, distanceM: Double = 0, durationMs: Int64 = 0, paceSecPerKm: Double? = nil, distToStartM: Double = 0,
                    armed: Bool = false, closingMode: Bool = false, events: [String] = [], duel: Duel? = nil, ts: Int64 = Date().epochMs) {
            self.state = state; self.distanceM = distanceM; self.durationMs = durationMs; self.paceSecPerKm = paceSecPerKm
            self.distToStartM = distToStartM; self.armed = armed; self.closingMode = closingMode; self.events = events; self.duel = duel; self.ts = ts
        }

        public static let idle = Hud(state: .idle, ts: 0)

        enum CodingKeys: String, CodingKey { case state, distanceM, durationMs, paceSecPerKm, distToStartM, armed, closingMode, events, duel, ts }

        public init(from d: Decoder) throws {
            let c = try d.container(keyedBy: CodingKeys.self)
            state = (try? c.decodeIfPresent(State.self, forKey: .state)) ?? .idle
            distanceM = (try? c.decodeIfPresent(Double.self, forKey: .distanceM)) ?? 0
            durationMs = Int64((try? c.decodeIfPresent(Double.self, forKey: .durationMs)) ?? 0)
            paceSecPerKm = (try? c.decodeIfPresent(Double.self, forKey: .paceSecPerKm)) ?? nil
            distToStartM = (try? c.decodeIfPresent(Double.self, forKey: .distToStartM)) ?? 0
            armed = (try? c.decodeIfPresent(Bool.self, forKey: .armed)) ?? false
            closingMode = (try? c.decodeIfPresent(Bool.self, forKey: .closingMode)) ?? false
            events = (try? c.decodeIfPresent([String].self, forKey: .events)) ?? []
            duel = (try? c.decodeIfPresent(Duel.self, forKey: .duel)) ?? nil
            ts = Int64((try? c.decodeIfPresent(Double.self, forKey: .ts)) ?? 0)
        }

        public func encode(to e: Encoder) throws {
            var c = e.container(keyedBy: CodingKeys.self)
            try c.encode(state, forKey: .state)
            try c.encode(distanceM, forKey: .distanceM)
            try c.encode(durationMs, forKey: .durationMs)
            try c.encode(paceSecPerKm, forKey: .paceSecPerKm)
            try c.encode(distToStartM, forKey: .distToStartM)
            try c.encode(armed, forKey: .armed)
            try c.encode(closingMode, forKey: .closingMode)
            try c.encode(events, forKey: .events)
            try c.encode(duel, forKey: .duel)
            try c.encode(ts, forKey: .ts)
        }

        /// Saatte gösterilen kalan mesafe (5 m'ye yuvarlı).
        public var remainingM: Int { closingRemainingM(distToStartM) }
    }

    public struct Conquest: Codable, Equatable, Sendable {
        public var cells: Int
        public var areaM2: Double
        public var captured: Int
        public init(cells: Int, areaM2: Double, captured: Int) { self.cells = cells; self.areaM2 = areaM2; self.captured = captured }
        public init(from d: Decoder) throws {
            let c = try d.container(keyedBy: CodingKeys.self)
            cells = (try? c.decodeIfPresent(Int.self, forKey: .cells)) ?? 0
            areaM2 = (try? c.decodeIfPresent(Double.self, forKey: .areaM2)) ?? 0
            captured = (try? c.decodeIfPresent(Int.self, forKey: .captured)) ?? 0
        }
    }

    public var type: String {
        switch self {
        case .hud: return "hud"
        case .tick: return "tick"
        case .conquest: return "conquest"
        case .loopOpen: return "loop_open"
        case .command: return "command"
        }
    }

    /// JSON baytları.
    public var json: Data {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        var obj: [String: Any] = [:]
        switch self {
        case let .hud(h): obj = Self.object(try? enc.encode(h))
        case let .conquest(c): obj = Self.object(try? enc.encode(c))
        case let .command(a): obj = ["action": a.rawValue]
        case .tick, .loopOpen: break
        }
        obj["type"] = type
        return (try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])) ?? Data("{}".utf8)
    }

    /// WatchConnectivity sözlüğü (`null` değerler atlanır: plist uyumlu).
    public var dictionary: [String: Any] {
        Self.stripNulls(Self.object(json))
    }

    public init?(json: Data) {
        guard let o = try? JSONSerialization.jsonObject(with: json) as? [String: Any] else { return nil }
        self.init(dictionary: o)
    }

    public init?(dictionary d: [String: Any]) {
        guard let type = d["type"] as? String else { return nil }
        let clean = Self.stripNulls(d)
        let data = (try? JSONSerialization.data(withJSONObject: clean)) ?? Data()
        let dec = JSONDecoder()
        switch type {
        case "hud": guard let h = try? dec.decode(Hud.self, from: data) else { return nil }; self = .hud(h)
        case "tick": self = .tick
        case "conquest": guard let c = try? dec.decode(Conquest.self, from: data) else { return nil }; self = .conquest(c)
        case "loop_open": self = .loopOpen
        case "command":
            guard let a = (d["action"] as? String).flatMap(Action.init(rawValue:)) else { return nil }
            self = .command(a)
        default: return nil
        }
    }

    static func object(_ data: Data?) -> [String: Any] {
        guard let data, let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return o
    }

    static func stripNulls(_ d: [String: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        for (k, v) in d {
            if v is NSNull { continue }
            if let sub = v as? [String: Any] { out[k] = stripNulls(sub) } else { out[k] = v }
        }
        return out
    }
}

import Foundation

/// Oyuncu renk slotu: renk körlüğüne güvenli Okabe–Ito ailesinden 8 slot.
public enum Slot: String, Codable, CaseIterable, Sendable {
    case keh, kir, lim, zum, gok, lac, gul, mer
}

public struct SlotColor: Hashable, Sendable {
    public var name: String
    /// #RRGGBB
    public var hex: String
    /// Koyu temada kenar rengi (Lacivert daha açık).
    public var darkEdge: String
    public var fillDark: String
    public var fillLight: String
}

public enum Palette {
    public static let slots: [Slot] = Slot.allCases

    public static let colors: [Slot: SlotColor] = [
        .keh: SlotColor(name: "Kehribar", hex: "#E69F00", darkEdge: "#E69F00", fillDark: "#7D5C0C", fillLight: "#EAC267"),
        .kir: SlotColor(name: "Kiremit", hex: "#D55E00", darkEdge: "#D55E00", fillDark: "#753C0C", fillLight: "#E19E67"),
        .lim: SlotColor(name: "Limon", hex: "#F0E442", darkEdge: "#F0E442", fillDark: "#827E2D", fillLight: "#F0E88C"),
        .zum: SlotColor(name: "Zümrüt", hex: "#009E73", darkEdge: "#009E73", fillDark: "#0A5C45", fillLight: "#6CC2A7"),
        .gok: SlotColor(name: "Gök", hex: "#56B4E9", darkEdge: "#56B4E9", fillDark: "#356680", fillLight: "#9BCEE8"),
        .lac: SlotColor(name: "Lacivert", hex: "#0072B2", darkEdge: "#1B7EBF", fillDark: "#184C6B", fillLight: "#6CA9C9"),
        .gul: SlotColor(name: "Gül", hex: "#CC79A7", darkEdge: "#CC79A7", fillDark: "#70495F", fillLight: "#DCADC3"),
        .mer: SlotColor(name: "Mercan", hex: "#F9AEA2", darkEdge: "#F9AEA2", fillDark: "#86645C", fillLight: "#F4CAC1"),
    ]

    public static func info(_ s: Slot) -> SlotColor { colors[s]! }

    /// Görüntüleme rengi (koyu temada `darkEdge`).
    public static func hex(_ s: Slot, dark: Bool) -> String { dark ? info(s).darkEdge : info(s).hex }

    /// Baş harf metni oyuncu renginin üstünde: koyu renklerde beyaz.
    public static func inkOnSlotIsLight(_ s: Slot) -> Bool { s == .kir || s == .zum || s == .lac }

    /// Simülasyonda birbirine en yakın düşen dört çift: komşu olamazlar.
    public static let forbiddenPairs: [(Slot, Slot)] = [(.zum, .gul), (.keh, .mer), (.zum, .lac), (.lac, .gul)]

    public static func clash(_ a: Slot, _ b: Slot) -> Bool {
        if a == b { return true }
        return forbiddenPairs.contains { ($0.0 == a && $0.1 == b) || ($0.0 == b && $0.1 == a) }
    }

    /// FNV-1a 32 bit (UTF-16 kod birimleri; JS `charCodeAt` ile aynı).
    static func hash32(_ s: String) -> UInt32 {
        var h: UInt32 = 2_166_136_261
        for u in s.utf16 {
            h ^= UInt32(u)
            h = h &* 16_777_619
        }
        return h
    }

    public struct Node: Hashable, Sendable {
        public var id: String
        public var slot: Slot
        public init(id: String, slot: Slot) {
            self.id = id
            self.slot = slot
        }
    }

    /// Görüntüleyen için renk ataması (DSatur): görüntüleyen sabit, çakışmada rakip kayar.
    public static func assignDisplayColors(viewer: String?, nodes: [Node], edges: [(String, String)]) -> [String: Slot] {
        var adj: [String: Set<String>] = [:]
        var pref: [String: Slot] = [:]
        var order: [String] = []
        for n in nodes {
            if pref[n.id] == nil { order.append(n.id) }
            pref[n.id] = n.slot
            adj[n.id] = []
        }
        for (a, b) in edges where a != b && adj[a] != nil && adj[b] != nil {
            adj[a]!.insert(b)
            adj[b]!.insert(a)
        }
        var out: [String: Slot] = [:]
        if let v = viewer, let p = pref[v] { out[v] = p }
        var remaining = order.filter { out[$0] == nil }
        while !remaining.isEmpty {
            var bestIdx = 0
            var bestKey: (Int, Int, String) = (-1, -1, "")
            for (i, id) in remaining.enumerated() {
                let nb = adj[id]!
                let sat = nb.filter { out[$0] != nil }.count
                let key = (sat, nb.count, id)
                if i == 0 || key.0 > bestKey.0 || (key.0 == bestKey.0 && key.1 > bestKey.1) ||
                    (key.0 == bestKey.0 && key.1 == bestKey.1 && jsLess(key.2, bestKey.2)) {
                    bestIdx = i
                    bestKey = key
                }
            }
            let id = remaining.remove(at: bestIdx)
            let used = adj[id]!.compactMap { out[$0] }
            let want = pref[id]!
            let ok: (Slot) -> Bool = { s in used.allSatisfy { !clash(s, $0) } }
            if ok(want) {
                out[id] = want
                continue
            }
            let wantIdx = slots.firstIndex(of: want)!
            let startIdx = (wantIdx + 1 + Int(hash32("\(viewer ?? "")|\(id)") % 7)) % slots.count
            var chosen: Slot?
            for k in 0..<slots.count {
                let s = slots[(startIdx + k) % slots.count]
                if ok(s) { chosen = s; break }
            }
            if chosen == nil {
                var bestS = want
                var bestCost = Int.max
                for s in slots {
                    let cost = used.reduce(0) { $0 + ($1 == s ? 10 : clash(s, $1) ? 1 : 0) }
                    if cost < bestCost { bestCost = cost; bestS = s }
                }
                chosen = bestS
            }
            out[id] = chosen
        }
        return out
    }

    /// JS dize karşılaştırması (UTF-16 kod birimi sırası).
    static func jsLess(_ a: String, _ b: String) -> Bool {
        a.utf16.lexicographicallyPrecedes(b.utf16)
    }
}

import Foundation

public struct DuelCoverage: Hashable, Sendable {
    public var duel: DuelSummary
    public var inside: Int
    public var total: Int
}

/// İstemci tarafı fetih önizlemesi (kesin sonuç sunucuda; tolerans gösterilmez).
public struct ConquestPreview: Hashable, Sendable {
    public var cells: [String]
    /// Sahipsiz (ya da önbellekte bilinmeyen) petekler: senin olur.
    public var empty: Int
    /// Zaten senin: güçlenir.
    public var own: Int
    /// Rakip petekleri (düello dışında değişmez).
    public var rival: Int
    public var areaM2: Double
    /// Saldırdığın düello alanlarının halka içinde kalan kısmı.
    public var duels: [DuelCoverage]

    public var gained: Bool { empty > 0 || own > 0 || !duels.isEmpty }
    /// Boş peteklerden gelen alan.
    public var newAreaM2: Double { empty > 0 ? jsRound(areaM2 * Double(empty) / Double(max(1, cells.count))) : 0 }
}

/// Son bilinen harita ve düellolar (koşu sırasında fetih önizlemesi için).
public struct ConquestContext: Sendable {
    public var myId: String?
    public var cells: [String: MapCell]
    public var attacking: [DuelSummary]
    public init(myId: String?, cells: [String: MapCell], attacking: [DuelSummary]) {
        self.myId = myId; self.cells = cells; self.attacking = attacking
    }
    public static let empty = ConquestContext(myId: nil, cells: [:], attacking: [])
}

public enum Conquest {
    static func classify(_ ids: [String], _ ctx: ConquestContext) -> ConquestPreview {
        var empty = 0, own = 0, rival = 0
        for id in ids {
            guard let c = ctx.cells[id], let owner = c.ownerId else { empty += 1; continue }
            if let me = ctx.myId, owner == me { own += 1 } else { rival += 1 }
        }
        let set = Set(ids)
        let duels = ctx.attacking.filter { $0.status == .active }
            .map { DuelCoverage(duel: $0, inside: $0.cells.filter(set.contains).count, total: $0.cells.count) }
            .filter { $0.inside > 0 }
        return ConquestPreview(cells: ids, empty: empty, own: own, rival: rival, areaM2: H3.areaM2(ids), duels: duels)
    }

    public static func preview(loop: ClosedLoop, _ ctx: ConquestContext) -> ConquestPreview {
        classify(H3.cellsInPolygon(loop.ring.map(\.latLng)), ctx)
    }

    /// Kapanış modunda açık halkanın düz kapatılmış önizlemesi.
    public static func previewOpenRing(_ ring: [LatLng], _ ctx: ConquestContext) -> ConquestPreview {
        classify(ring.count >= 4 ? H3.cellsInPolygon(ring) : [], ctx)
    }

    /// Dolum dalgası: hücreler 14 ms arayla, toplam en çok 1,5 sn.
    public static func fillSchedule(_ n: Int, perCellMs: Double = 14, maxMs: Double = 1500) -> [Int] {
        guard n > 0 else { return [] }
        let step = Double(n) * perCellMs > maxMs ? maxMs / Double(n) : perCellMs
        return (0..<n).map { Int(jsRound(Double($0) * step)) }
    }
}

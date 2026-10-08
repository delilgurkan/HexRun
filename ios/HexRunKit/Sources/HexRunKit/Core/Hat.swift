import Foundation

/// Hat göstergesi: 10 segment = 10'ar puan. Her segment için 0–100 doluluk (core `hat.ts`).
public struct HatSegment: Hashable, Sendable, Codable {
    public var owner: Double
    public var siege: Double
    public var ghost: Double
}

public enum Hat {
    public static let segmentCount = 10

    static func fill(_ x: Double, _ i: Int) -> Double {
        max(0, min(10, x - Double(i) * 10)) * 10
    }

    static func clamp(_ x: Double?) -> Double {
        let v = x ?? 0
        return v.isFinite ? max(0, min(100, v)) : 0
    }

    /// - Parameters:
    ///   - power: sahibin gücü (düz dolgu)
    ///   - progress: en önde giden saldırganın ilerlemesi (taralı)
    ///   - ghostTo: son 7 günde eriyen gücün önceki seviyesi (soluk)
    public static func segments(power: Double, progress: Double? = 0, ghostTo: Double? = 0) -> [HatSegment] {
        let p = clamp(power)
        let s = clamp(progress)
        let g = clamp(ghostTo)
        return (0..<segmentCount).map { HatSegment(owner: fill(p, $0), siege: fill(s, $0), ghost: fill(g, $0)) }
    }

    /// Düello canı = güç − ilerleme.
    public static func duelHp(power: Double, progress: Double?) -> Int {
        max(0, Int(jsRound(power - (progress ?? 0))))
    }

    public enum SiegeLevel: Sendable { case none, warn, alarm }

    /// Kuşatma seviyesi: %70 uyarı, %90 alarm.
    public static func siegeLevel(power: Double, progress: Double?) -> SiegeLevel {
        guard let pr = progress, pr > 0, power > 0 else { return .none }
        let r = pr / power
        if r >= Rules.siegeAlarm { return .alarm }
        if r >= Rules.siegeWarn { return .warn }
        return .none
    }

    /// Barın yanında yazan sayı: "60/85", "72 (−9)", "85".
    public static func label(power: Double, progress: Double?, ghost: Double?) -> String {
        let p = Int(jsRound(power))
        if let pr = progress, pr > 0 { return "\(Int(jsRound(pr)))/\(p)" }
        if let g = ghost, g > 0 { return "\(p) (−\(Int(jsRound(g))))" }
        return "\(p)"
    }

    /// Ekran okuyucu metni.
    public static func accessibilityText(power: Double, progress: Double?, ghost: Double?) -> String {
        var parts = ["Güç \(Int(jsRound(power)))"]
        if let pr = progress, pr > 0 {
            parts.append("saldırı ilerlemesi \(Int(jsRound(pr))), düello canı \(duelHp(power: power, progress: pr))")
        }
        if let g = ghost, g > 0 { parts.append("son 7 günde \(Int(jsRound(g))) eridi") }
        return parts.joined(separator: ", ")
    }
}

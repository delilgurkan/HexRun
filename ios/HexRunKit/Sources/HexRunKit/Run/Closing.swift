import Foundation

public enum TickStrength: String, Codable, Sendable { case single, double }

/// "Halkayı kapat" modunda haptik tıklar: her 10 m'de hafif tık; yakalama alanına son 20 m'de
/// iki kat sık (5 m'de bir) ve çift tık. Yalnız yaklaşırken üretilir; en çok 3 tık.
public func closingTicks(prev prevDistM: Double, next nextDistM: Double, closeRadiusM: Double = Rules.loopCloseM) -> [TickStrength] {
    guard nextDistM < prevDistM, nextDistM <= Rules.closingModeM else { return [] }
    let finalZone = closeRadiusM + 20
    let from = min(prevDistM, Rules.closingModeM)
    var marks = Set<Double>()
    var m = (from / 5).rounded(.down) * 5
    while m > nextDistM {
        if m < from, m <= finalZone || m.truncatingRemainder(dividingBy: 10) == 0 { marks.insert(m) }
        m -= 5
    }
    let out = marks.sorted(by: >).map { $0 <= finalZone ? TickStrength.double : .single }
    return Array(out.suffix(3))
}

/// HUD'da gösterilen kalan mesafe: 5 m'ye yuvarlanmış başlangıca uzaklık.
public func closingRemainingM(_ distToStartM: Double) -> Int {
    max(0, Int(jsRound(distToStartM / 5) * 5))
}

public enum GpsQuality: String, Codable, Sendable { case searching, weak, strong }

public func gpsQuality(_ acc: Double?) -> GpsQuality {
    guard let a = acc else { return .strong }
    if a <= 20 { return .strong }
    if a <= 50 { return .weak }
    return .searching
}

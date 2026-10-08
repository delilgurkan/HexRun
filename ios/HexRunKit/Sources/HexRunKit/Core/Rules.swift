import Foundation

/// Kesinleşen kural setinin sabitleri (`packages/core/src/constants.ts` ile birebir).
public enum Rules {
    public static let h3Res: Int32 = 12
    public static let loopCloseM: Double = 50
    public static let loopCloseMMaster: Double = 60
    public static let loopArmExtraM: Double = 50
    public static let minLoopLengthM: Double = 400
    public static let minLoopLengthMNewbie: Double = 200
    public static let closingModeM: Double = 300
    public static let newCellPower: Double = 10
    public static let ownerGain: Double = 10
    public static let pushback: Double = 10
    public static let attack: Double = 10
    public static let duelMinCells = 7
    public static let duelMaxCells = 60
    public static let maxActiveDuels = 3
    public static let attackDailyLimit = 2
    public static let defenseDailyLimit = 2
    public static let capturePower: Double = 50
    public static let maxPower: Double = 100
    public static let privacyRadiusMinM: Double = 200
    public static let privacyRadiusMaxM: Double = 800
    public static let siegeWarn: Double = 0.7
    public static let siegeAlarm: Double = 0.9
    public static let pushDailyCap = 3
    public static let insigniaSlots = 3
    public static let newbieDays = 14
    /// Yaklaşık petek alanı (res 12).
    public static let approxCellAreaM2: Double = 307
    public static let timezone = "Europe/Istanbul"
}

/// Gizlilik yarıçapı 200–800 m arasına sıkıştırılır (core `clampRadius`).
public func clampPrivacyRadius(_ r: Double) -> Double {
    guard r.isFinite else { return Rules.privacyRadiusMinM }
    return min(Rules.privacyRadiusMaxM, max(Rules.privacyRadiusMinM, jsRound(r)))
}

/// JavaScript `Math.round`: yarımlar +∞ yönüne yuvarlanır.
@inlinable public func jsRound(_ x: Double) -> Double {
    (x + 0.5).rounded(.down)
}

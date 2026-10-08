import Foundation

/// Oyun saat dilimindeki (Europe/Istanbul) yerel zaman bileşenleri.
public struct LocalTime: Hashable, Sendable {
    /// YYYY-MM-DD
    public var day: String
    public var year: Int
    /// 1...12
    public var month: Int
    public var dayOfMonth: Int
    public var hour: Int
    public var minute: Int
    /// 0 = Pazar … 6 = Cumartesi.
    public var weekday: Int
}

public enum GameTime {
    /// Europe/Istanbul; sistemde yoksa sabit UTC+3 (2016'dan beri yaz saati yok).
    public static let zone: TimeZone = TimeZone(identifier: Rules.timezone) ?? TimeZone(secondsFromGMT: 3 * 3600)!

    public static func localTime(ms: Int64, zone: TimeZone = GameTime.zone) -> LocalTime {
        let date = Date(timeIntervalSince1970: Double(ms) / 1000)
        let offset = Int64(zone.secondsFromGMT(for: date))
        let localSec = floorDiv(ms, 1000) + offset
        let days = floorDiv(localSec, 86_400)
        let secOfDay = localSec - days * 86_400
        let (y, m, d) = civil(fromDays: days)
        // 1970-01-01 Perşembe (4).
        let wd = Int(((days % 7) + 7 + 4) % 7)
        return LocalTime(
            day: String(format: "%04d-%02d-%02d", y, m, d),
            year: y, month: m, dayOfMonth: d,
            hour: Int(secOfDay / 3600), minute: Int((secOfDay % 3600) / 60),
            weekday: wd
        )
    }

    public static func localTime(_ date: Date) -> LocalTime {
        localTime(ms: Int64((date.timeIntervalSince1970 * 1000).rounded(.down)))
    }

    /// Yerel gün sırası (gün farkları için).
    public static func dayIndex(ms: Int64) -> Int64 {
        let date = Date(timeIntervalSince1970: Double(ms) / 1000)
        let offset = Int64(zone.secondsFromGMT(for: date))
        return floorDiv(floorDiv(ms, 1000) + offset, 86_400)
    }

    static func floorDiv(_ a: Int64, _ b: Int64) -> Int64 {
        let q = a / b
        return (a % b != 0 && (a < 0) != (b < 0)) ? q - 1 : q
    }

    /// Howard Hinnant'ın civil_from_days algoritması.
    static func civil(fromDays z0: Int64) -> (Int, Int, Int) {
        let z = z0 + 719_468
        let era = (z >= 0 ? z : z - 146_096) / 146_097
        let doe = z - era * 146_097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
        let y = yoe + era * 400
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let d = doy - (153 * mp + 2) / 5 + 1
        let m = mp < 10 ? mp + 3 : mp - 9
        return (Int(m <= 2 ? y + 1 : y), Int(m), Int(d))
    }
}

public extension Date {
    var epochMs: Int64 { Int64((timeIntervalSince1970 * 1000).rounded(.down)) }
    init(epochMs: Int64) { self.init(timeIntervalSince1970: Double(epochMs) / 1000) }
}

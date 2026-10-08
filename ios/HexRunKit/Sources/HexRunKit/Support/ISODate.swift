import Foundation

/// ISO-8601 (UTC) ayrıştırma/yazma. `ISO8601DateFormatter` iş parçacığı güvenli olmadığından
/// ve kesirli saniye desteği platforma göre değiştiğinden elle yapılır.
public enum ISODate {
    /// "2026-10-05T04:00:00Z", "2026-10-05T04:00:00.123Z", "2026-10-05T07:00:00+03:00".
    public static func parse(_ s: String) -> Date? {
        let u = Array(s.utf8)
        func num(_ from: Int, _ len: Int) -> Int? {
            guard from + len <= u.count else { return nil }
            var v = 0
            for i in from..<(from + len) {
                let c = u[i]
                guard c >= 48 && c <= 57 else { return nil }
                v = v * 10 + Int(c - 48)
            }
            return v
        }
        guard let y = num(0, 4), u.count >= 10, u[4] == 45, let mo = num(5, 2), u[7] == 45, let d = num(8, 2) else { return nil }
        var h = 0, mi = 0, sec = 0
        var frac = 0.0
        var i = 10
        var offset = 0
        if u.count > 10 {
            guard u[10] == 84 || u[10] == 116 || u[10] == 32 else { return nil }
            guard let hh = num(11, 2), u.count > 13, u[13] == 58, let mm = num(14, 2) else { return nil }
            h = hh; mi = mm
            i = 16
            if i < u.count, u[i] == 58 {
                guard let ss = num(17, 2) else { return nil }
                sec = ss
                i = 19
            }
            if i < u.count, u[i] == 46 || u[i] == 44 {
                i += 1
                var scale = 0.1
                while i < u.count, u[i] >= 48 && u[i] <= 57 {
                    frac += Double(u[i] - 48) * scale
                    scale /= 10
                    i += 1
                }
            }
            if i < u.count {
                if u[i] == 90 || u[i] == 122 {
                    i += 1
                } else if u[i] == 43 || u[i] == 45 {
                    let sign = u[i] == 45 ? -1 : 1
                    guard let oh = num(i + 1, 2) else { return nil }
                    var om = 0
                    if i + 3 < u.count, u[i + 3] == 58 { om = num(i + 4, 2) ?? 0; i += 6 } else { om = num(i + 3, 2) ?? 0; i += 5 }
                    offset = sign * (oh * 3600 + om * 60)
                }
            }
        }
        guard (1...12).contains(mo), (1...31).contains(d), h < 24, mi < 60, sec < 61 else { return nil }
        let days = daysFromCivil(y, mo, d)
        let t = Double(days * 86_400 + h * 3600 + mi * 60 + sec - offset) + frac
        return Date(timeIntervalSince1970: t)
    }

    /// "2026-10-05T04:00:00.000Z" (JS `toISOString` biçimi).
    public static func string(_ date: Date) -> String {
        let ms = date.epochMs
        let sec = GameTime.floorDiv(ms, 1000)
        let msPart = ms - sec * 1000
        let days = GameTime.floorDiv(sec, 86_400)
        let sod = sec - days * 86_400
        let (y, m, d) = GameTime.civil(fromDays: days)
        return String(format: "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ", y, m, d, Int(sod / 3600), Int((sod % 3600) / 60), Int(sod % 60), Int(msPart))
    }

    static func daysFromCivil(_ y0: Int, _ m: Int, _ d: Int) -> Int {
        let y = m <= 2 ? y0 - 1 : y0
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let mp = m > 2 ? m - 3 : m + 9
        let doy = (153 * mp + 2) / 5 + d - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }
}

public enum HexJSON {
    public static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { dec in
            let c = try dec.singleValueContainer()
            if let n = try? c.decode(Double.self) { return Date(timeIntervalSince1970: n / 1000) }
            let s = try c.decode(String.self)
            guard let date = ISODate.parse(s) else {
                throw DecodingError.dataCorruptedError(in: c, debugDescription: "Geçersiz tarih: \(s)")
            }
            return date
        }
        return d
    }

    public static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, enc in
            var c = enc.singleValueContainer()
            try c.encode(ISODate.string(date))
        }
        return e
    }
}

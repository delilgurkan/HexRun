import Foundation

/// Türkçe biçimlendirme: `6,12` km · `5'23"` · `19.220 m²` · `32:57` (core `format.ts`).
public enum Fmt {
    /// Tamsayı, binlik ayırıcı nokta: 19220 → "19.220".
    public static func int(_ n: Double) -> String {
        let r = jsRound(n)
        guard r.isFinite else { return "0" }
        let neg = r < 0
        var digits = String(Int64(abs(r)))
        var groups: [Substring] = []
        while digits.count > 3 {
            let idx = digits.index(digits.endIndex, offsetBy: -3)
            groups.insert(digits[idx...], at: 0)
            digits = String(digits[..<idx])
        }
        groups.insert(Substring(digits), at: 0)
        return (neg ? "-" : "") + groups.joined(separator: ".")
    }

    public static func int(_ n: Int) -> String { int(Double(n)) }

    /// Kilometre: 6120 → "6,12" (JS `toFixed` + virgül).
    public static func km(_ m: Double, digits: Int = 2) -> String {
        String(format: "%.\(digits)f", m / 1000).replacingOccurrences(of: ".", with: ",")
    }

    /// Tempo: 323 → `5'23"`; geçersizse `–'––"`.
    public static func pace(_ secPerKm: Double?) -> String {
        guard let v = secPerKm, v.isFinite, v > 0 else { return "–'––\"" }
        let s = Int64(jsRound(v))
        return "\(s / 60)'\(pad2(s % 60))\""
    }

    /// Süre: 1977000 → "32:57", 3723000 → "1:02:03".
    public static func duration(_ ms: Double) -> String {
        let s = max(0, Int64((ms / 1000).rounded(.down)))
        let h = s / 3600
        let m = (s % 3600) / 60
        let sec = s % 60
        if h > 0 { return "\(h):\(pad2(m)):\(pad2(sec))" }
        return "\(m):\(pad2(sec))"
    }

    public static func duration(_ ms: Int64) -> String { duration(Double(ms)) }

    public static func area(_ m2: Double) -> String { "\(int(m2)) m²" }

    /// Çarpan: 1.5 → "1,5x".
    public static func multiplier(_ m: Double) -> String {
        let s = m == m.rounded() ? String(Int64(m)) : String(m)
        return s.replacingOccurrences(of: ".", with: ",") + "x"
    }

    /// Kalan/geçen mesafe etiketi: 1000 m altı 10 m'ye yuvarlanır.
    public static func distanceLabel(_ m: Double) -> String {
        m < 1000 ? "\(Int64(jsRound(m / 10) * 10)) m" : "\(km(m, digits: 1)) km"
    }

    static func pad2(_ n: Int64) -> String { n < 10 ? "0\(n)" : "\(n)" }

    /// Baş harfler: "Deniz Arslan" → "DA", "Zeynep" → "ZE" (Türkçe büyük harf).
    public static func initials(_ name: String) -> String {
        let parts = name.split(whereSeparator: { $0.isWhitespace }).map(String.init).filter { !$0.isEmpty }
        guard let first = parts.first else { return "?" }
        let a = first.first.map(String.init) ?? ""
        let b: String
        if parts.count > 1 {
            b = parts[parts.count - 1].first.map(String.init) ?? ""
        } else {
            b = first.count > 1 ? String(first[first.index(after: first.startIndex)]) : ""
        }
        return turkishUpper(a + b)
    }

    /// Türkçe büyük harf: i → İ, ı → I.
    public static func turkishUpper(_ s: String) -> String {
        var out = ""
        for ch in s {
            switch ch {
            case "i": out += "İ"
            case "ı": out += "I"
            default: out += String(ch).uppercased()
            }
        }
        return out
    }

    /// Ad ilk kelime: "Zeynep Kaya" → "Zeynep".
    public static func firstName(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }
}

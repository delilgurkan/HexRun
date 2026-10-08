import Foundation

/// Platformdan bağımsız SVG yol ayrıştırıcı: ikonlar (Tokens · İkonlar) SwiftUI `Path`'e
/// bu komutlarla çizilir. Yaylar kübik Bézier'e çevrilir.
public enum PathOp: Equatable, Sendable {
    case move(Double, Double)
    case line(Double, Double)
    case cubic(Double, Double, Double, Double, Double, Double)
    case quad(Double, Double, Double, Double)
    case close
}

public enum SVGPath {
    public static func parse(_ d: String) -> [PathOp] {
        var ops: [PathOp] = []
        var tokens = Tokenizer(Array(d.utf8))
        var cx = 0.0, cy = 0.0, sx = 0.0, sy = 0.0
        var lastCtrl: (Double, Double)?
        var lastQuad: (Double, Double)?
        var cmd: UInt8 = 0
        while let c = tokens.nextCommandOrRepeat(cmd) {
            cmd = c
            let rel = c >= 97
            let ox = rel ? cx : 0, oy = rel ? cy : 0
            switch c | 0x20 {
            case 109: // m
                guard let x = tokens.number(), let y = tokens.number() else { return ops }
                cx = ox + x; cy = oy + y; sx = cx; sy = cy
                ops.append(.move(cx, cy))
                cmd = rel ? 108 : 76 // sonraki çiftler çizgi
                lastCtrl = nil; lastQuad = nil
            case 108: // l
                guard let x = tokens.number(), let y = tokens.number() else { return ops }
                cx = ox + x; cy = oy + y
                ops.append(.line(cx, cy)); lastCtrl = nil; lastQuad = nil
            case 104: // h
                guard let x = tokens.number() else { return ops }
                cx = ox + x
                ops.append(.line(cx, cy)); lastCtrl = nil; lastQuad = nil
            case 118: // v
                guard let y = tokens.number() else { return ops }
                cy = oy + y
                ops.append(.line(cx, cy)); lastCtrl = nil; lastQuad = nil
            case 99: // c
                guard let x1 = tokens.number(), let y1 = tokens.number(), let x2 = tokens.number(), let y2 = tokens.number(),
                      let x = tokens.number(), let y = tokens.number() else { return ops }
                ops.append(.cubic(ox + x1, oy + y1, ox + x2, oy + y2, ox + x, oy + y))
                lastCtrl = (ox + x2, oy + y2); lastQuad = nil
                cx = ox + x; cy = oy + y
            case 115: // s
                guard let x2 = tokens.number(), let y2 = tokens.number(), let x = tokens.number(), let y = tokens.number() else { return ops }
                let (x1, y1) = lastCtrl.map { (2 * cx - $0.0, 2 * cy - $0.1) } ?? (cx, cy)
                ops.append(.cubic(x1, y1, ox + x2, oy + y2, ox + x, oy + y))
                lastCtrl = (ox + x2, oy + y2); lastQuad = nil
                cx = ox + x; cy = oy + y
            case 113: // q
                guard let x1 = tokens.number(), let y1 = tokens.number(), let x = tokens.number(), let y = tokens.number() else { return ops }
                ops.append(.quad(ox + x1, oy + y1, ox + x, oy + y))
                lastQuad = (ox + x1, oy + y1); lastCtrl = nil
                cx = ox + x; cy = oy + y
            case 116: // t
                guard let x = tokens.number(), let y = tokens.number() else { return ops }
                let q = lastQuad.map { (2 * cx - $0.0, 2 * cy - $0.1) } ?? (cx, cy)
                ops.append(.quad(q.0, q.1, ox + x, oy + y))
                lastQuad = q; lastCtrl = nil
                cx = ox + x; cy = oy + y
            case 97: // a
                guard let rx = tokens.number(), let ry = tokens.number(), let rot = tokens.number(),
                      let large = tokens.flag(), let sweep = tokens.flag(), let x = tokens.number(), let y = tokens.number() else { return ops }
                ops += arc(from: (cx, cy), rx: rx, ry: ry, rotation: rot, large: large, sweep: sweep, to: (ox + x, oy + y))
                cx = ox + x; cy = oy + y
                lastCtrl = nil; lastQuad = nil
            case 122: // z
                ops.append(.close)
                cx = sx; cy = sy
                lastCtrl = nil; lastQuad = nil
                cmd = 0
            default:
                return ops
            }
        }
        return ops
    }

    /// SVG uç nokta yayını merkez biçimine çevirip ≤90°'lik kübik parçalara böler.
    static func arc(from p0: (Double, Double), rx rx0: Double, ry ry0: Double, rotation: Double, large: Bool, sweep: Bool, to p1: (Double, Double)) -> [PathOp] {
        if p0 == p1 { return [] }
        var rx = abs(rx0), ry = abs(ry0)
        if rx == 0 || ry == 0 { return [.line(p1.0, p1.1)] }
        let phi = rotation * .pi / 180
        let cosP = cos(phi), sinP = sin(phi)
        let dx = (p0.0 - p1.0) / 2, dy = (p0.1 - p1.1) / 2
        let x1p = cosP * dx + sinP * dy
        let y1p = -sinP * dx + cosP * dy
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 { rx *= lambda.squareRoot(); ry *= lambda.squareRoot() }
        let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        var coef = den == 0 ? 0 : max(0, num / den).squareRoot()
        if large == sweep { coef = -coef }
        let cxp = coef * (rx * y1p / ry)
        let cyp = coef * -(ry * x1p / rx)
        let cx = cosP * cxp - sinP * cyp + (p0.0 + p1.0) / 2
        let cy = sinP * cxp + cosP * cyp + (p0.1 + p1.1) / 2
        func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
            let a = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
            return a
        }
        let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweep && dTheta > 0 { dTheta -= 2 * .pi }
        if sweep && dTheta < 0 { dTheta += 2 * .pi }
        let segments = max(1, Int((abs(dTheta) / (.pi / 2)).rounded(.up)))
        let delta = dTheta / Double(segments)
        let t = 4.0 / 3.0 * tan(delta / 4)
        var ops: [PathOp] = []
        var th = theta1
        for _ in 0..<segments {
            let c1 = cos(th), s1 = sin(th)
            let th2 = th + delta
            let c2 = cos(th2), s2 = sin(th2)
            let e1 = (c1 - t * s1, s1 + t * c1)
            let e2 = (c2 + t * s2, s2 - t * c2)
            func map(_ p: (Double, Double)) -> (Double, Double) {
                let x = p.0 * rx, y = p.1 * ry
                return (cosP * x - sinP * y + cx, sinP * x + cosP * y + cy)
            }
            let a = map(e1), b = map(e2), e = map((c2, s2))
            ops.append(.cubic(a.0, a.1, b.0, b.1, e.0, e.1))
            th = th2
        }
        // Son noktayı tam hedefe sabitle.
        if case let .cubic(a, b, c, d, _, _) = ops.removeLast() { ops.append(.cubic(a, b, c, d, p1.0, p1.1)) }
        return ops
    }

    struct Tokenizer {
        let s: [UInt8]
        var i = 0
        init(_ s: [UInt8]) { self.s = s }

        mutating func skip() {
            while i < s.count, s[i] == 32 || s[i] == 44 || s[i] == 9 || s[i] == 10 || s[i] == 13 { i += 1 }
        }

        static func isCommand(_ c: UInt8) -> Bool {
            let l = c | 0x20
            return (l >= 97 && l <= 122) && l != 101 // 'e' üs işareti
        }

        /// Yeni komut harfi ya da örtük tekrar (bir sayı geliyorsa önceki komut).
        mutating func nextCommandOrRepeat(_ prev: UInt8) -> UInt8? {
            skip()
            guard i < s.count else { return nil }
            if Self.isCommand(s[i]) { defer { i += 1 }; return s[i] }
            return prev == 0 ? nil : prev
        }

        mutating func flag() -> Bool? {
            skip()
            guard i < s.count else { return nil }
            if s[i] == 48 || s[i] == 49 { defer { i += 1 }; return s[i] == 49 }
            return nil
        }

        mutating func number() -> Double? {
            skip()
            let start = i
            if i < s.count, s[i] == 45 || s[i] == 43 { i += 1 }
            var dot = false, digits = false
            while i < s.count {
                let c = s[i]
                if c >= 48 && c <= 57 { digits = true; i += 1 } else if c == 46 && !dot { dot = true; i += 1 } else { break }
            }
            if digits, i < s.count, s[i] == 101 || s[i] == 69 {
                var j = i + 1
                if j < s.count, s[j] == 45 || s[j] == 43 { j += 1 }
                if j < s.count, s[j] >= 48 && s[j] <= 57 {
                    i = j
                    while i < s.count, s[i] >= 48 && s[i] <= 57 { i += 1 }
                }
            }
            guard digits else { i = start; return nil }
            return Double(String(decoding: s[start..<i], as: UTF8.self))
        }
    }
}

/// 24 pt ızgara, 2 pt çizgi, yuvarlak uç ve birleşim (Tokens · İkonlar).
public enum IconPaths {
    public static let all: [String: String] = [
        "map": "M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z M12 8.5l3.5 6h-7z",
        "league": "M4 20v-7h5v7 M9 20V7h6v13 M15 20v-9h5v9 M3 20h18",
        "team": "M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5 M16 5.2a3 3 0 0 1 0 5.6 M17.5 14.2c1.9.6 3.1 2.2 3.5 5.3",
        "events": "M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5z M3.5 10h17 M8 3v4 M16 3v4 M12.8 12l-2 3h3l-2 3",
        "bell": "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0",
        "streak": "M12 21c3.6 0 6-2.4 6-5.6 0-3.6-2.8-5.4-3.6-9.4-1.9 1.3-3 3.2-3 5.2-1-.6-1.7-1.6-1.9-2.8C7.7 10.1 6 12.4 6 15.4 6 18.6 8.4 21 12 21z",
        "locate": "M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M12 2v3 M12 19v3 M2 12h3 M19 12h3",
        "layers": "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5",
        "start": "M12 4l8.5 15h-17z",
        "loop": "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z",
        "pause": "M8.5 5v14 M15.5 5v14",
        "stop": "M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
        "siege": "M20 12a8 8 0 1 1-2.3-5.7 M20 3.5V7.5h-4 M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
        "defend": "M12 3l7 3v5.5c0 4.4-3 7.7-7 9.5-4-1.8-7-5.1-7-9.5V6z M9 12l2 2 4-4",
        "heading": "M12 3l6.5 17L12 16l-6.5 4z",
        "area": "M4 7l5-3 6 3 5-3v13l-5 3-6-3-5 3z M9 4v13 M15 7v13",
        "time": "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 9v4l2.5 2 M10 2h4",
        "pace": "M4 17a8 8 0 1 1 16 0 M12 17l4-5 M7 17h.01 M17 17h.01",
        "share": "M12 3v12 M8 7l4-4 4 4 M6 11v9h12v-9",
        "back": "M15 4.5L7.5 12l7.5 7.5",
        "close": "M6 6l12 12 M18 6L6 18",
        "lock": "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
        "play": "M8 5l11 7-11 7z",
        "check": "M5 12.5l4.5 4.5L19 7.5",
        "plus": "M12 5v14 M5 12h14",
        "chevron": "M9 5l7 7-7 7",
        "gear": "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
        "clap": "M8 13l-2.5-2.5a1.5 1.5 0 0 1 2.1-2.1L11 11.8 M9.3 9.6L7.4 7.7a1.5 1.5 0 0 1 2.1-2.1l4.6 4.6 M12.6 8.7l-.9-.9a1.5 1.5 0 0 1 2.1-2.1l3.6 3.6c2.5 2.5 2.5 6.1 0 8.6s-6.1 2.5-8.6 0L5 14.6 M17 3.5l.8-1.5 M19.5 5.5l1.5-.8 M14.5 3l-.2-1.6",
        "watch": "M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M9 6l.7-3h4.6l.7 3 M9 18l.7 3h4.6l.7-3 M12 10v2.5l1.5 1",
        "ghost": "M5 12h3 M10 12h3 M15 12h4",
        "swap": "M5 9h12l-3-3 M19 15H7l3 3",
        "eye": "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    ]
}

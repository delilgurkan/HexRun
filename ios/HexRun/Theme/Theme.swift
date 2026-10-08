import SwiftUI
import UIKit
import HexRunKit

extension Color {
    /// "#RRGGBB" ya da "rgba(r,g,b,a)".
    init(hex: String) {
        self.init(uiColor: UIColor(hex: hex))
    }
}

extension UIColor {
    convenience init(hex: String) {
        let s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("rgba(") {
            let nums = s.dropFirst(5).dropLast().split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            if nums.count == 4 {
                self.init(red: nums[0] / 255, green: nums[1] / 255, blue: nums[2] / 255, alpha: nums[3])
                return
            }
        }
        var v: UInt64 = 0
        Scanner(string: s.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255, alpha: 1)
    }
}

/// Renk token'ları (Tokens · koyu/açık). Kabuk renksizdir: yalnız mürekkep ve kâğıt; renk oyunculara aittir.
struct ThemeColors {
    let bg, surf, surf2, glass, ink, ink2, ink3, line, line2, track, inv, invInk: Color
    let land, water, park, road, casing, tex, dim, frame, trace, shadow: Color
    /// Ham değerler (UIKit/MapLibre için).
    let raw: [String: String]

    static func make(_ r: [String: String]) -> ThemeColors {
        func c(_ k: String) -> Color { Color(hex: r[k] ?? "#000000") }
        return ThemeColors(
            bg: c("bg"), surf: c("surf"), surf2: c("surf2"), glass: c("glass"), ink: c("ink"), ink2: c("ink2"), ink3: c("ink3"),
            line: c("line"), line2: c("line2"), track: c("track"), inv: c("inv"), invInk: c("invInk"),
            land: c("land"), water: c("water"), park: c("park"), road: c("road"), casing: c("casing"), tex: c("tex"),
            dim: c("dim"), frame: c("frame"), trace: c("trace"), shadow: c("shadow"), raw: r
        )
    }

    static let darkRaw: [String: String] = [
        "bg": "#0F1312", "surf": "#1A1F1D", "surf2": "#232927", "glass": "rgba(26,31,29,0.92)", "ink": "#F2F1EA", "ink2": "#B4BBB7",
        "ink3": "#8F9893", "line": "rgba(242,241,234,0.14)", "line2": "rgba(242,241,234,0.30)", "track": "rgba(242,241,234,0.16)",
        "inv": "#F2F1EA", "invInk": "#0F1312", "land": "#141917", "water": "#0D1F26", "park": "#17251D", "road": "#2B3431",
        "casing": "#0F1312", "tex": "rgba(242,241,234,0.09)", "dim": "rgba(15,19,18,0.55)", "frame": "#2E3431", "trace": "#0F1312", "shadow": "#000000",
    ]

    static let lightRaw: [String: String] = [
        "bg": "#F7F6F1", "surf": "#FFFFFF", "surf2": "#EDEBE4", "glass": "rgba(255,255,255,0.94)", "ink": "#141716", "ink2": "#454B48",
        "ink3": "#636A66", "line": "rgba(20,23,22,0.12)", "line2": "rgba(20,23,22,0.26)", "track": "rgba(20,23,22,0.12)",
        "inv": "#141716", "invInk": "#F7F6F1", "land": "#EFEDE6", "water": "#C9DDE3", "park": "#D9E4CF", "road": "#FFFFFF",
        "casing": "#141716", "tex": "rgba(20,23,22,0.08)", "dim": "rgba(247,246,241,0.55)", "frame": "#C9C6BC", "trace": "#FFFFFF", "shadow": "#141716",
    ]

    static let dark = make(darkRaw)
    static let light = make(lightRaw)
}

struct Theme {
    let isDark: Bool
    var c: ThemeColors { isDark ? .dark : .light }

    /// Oyuncu rengi (koyu temada Lacivert kenarı açık).
    func player(_ s: Slot) -> Color { Color(hex: Palette.hex(s, dark: isDark)) }
    func playerUI(_ s: Slot) -> UIColor { UIColor(hex: Palette.hex(s, dark: isDark)) }
    func raw(_ k: String) -> UIColor { UIColor(hex: c.raw[k] ?? "#000000") }

    /// Baş harf metni oyuncu renginin üstünde.
    static func onPlayer(_ s: Slot) -> Color { Palette.inkOnSlotIsLight(s) ? .white : Color(hex: "#141716") }

    /// Harita petek dolgusu opaklığı.
    var cellFillOpacity: Double { isDark ? 0.5 : 0.55 }

    static let gold = Color(hex: "#C9A227")
}

private struct ThemeKey: EnvironmentKey {
    static let defaultValue = Theme(isDark: true)
}

extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

/// Aralıklar, yarıçaplar, hareket (Tokens).
enum Space {
    static let s1: CGFloat = 4, s2: CGFloat = 8, s3: CGFloat = 12, s4: CGFloat = 16, s5: CGFloat = 24, s6: CGFloat = 32, s7: CGFloat = 48, s8: CGFloat = 64
    /// Yan boşluk 16; koşu ekranında 20.
    static let gutter: CGFloat = 16
    static let gutterRun: CGFloat = 20
}

enum Radii {
    static let xs: CGFloat = 6, s: CGFloat = 12, m: CGFloat = 20, l: CGFloat = 28, pill: CGFloat = 999
    /// CTA (iOS 30), sheet (iOS 38).
    static let cta: CGFloat = 30
    static let sheet: CGFloat = 38
}

enum Motion {
    static let tap = 0.12
    static let sheet = 0.28
    static let breathe = 2.0
    static let conquestTotal = 2.4
    static let conquestBeat1 = 0.3
    static let conquestBeat2 = 1.8
    static let conquestAutoDismiss = 5
    static let finishHold = 1.5
}

/// Dokunma hedefleri.
enum Target {
    static let min: CGFloat = 44
    static let run: CGFloat = 64
    static let runBar: CGFloat = 72
}

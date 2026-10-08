import SwiftUI
import UIKit

/// Saat token'ları (Tokens · koyu). Saat her zaman koyu: siyah zemin, kâğıt mürekkep; renk yalnız oyunculara.
enum WT {
    static let bg = Color.black
    static let surf = Color(hex: 0x1A1F1D)
    static let surf2 = Color(hex: 0x232927)
    static let ink = Color(hex: 0xF2F1EA)
    static let ink2 = Color(hex: 0xB4BBB7)
    static let ink3 = Color(hex: 0x8F9893)
    static let line = Color(hex: 0xF2F1EA, opacity: 0.14)
    static let line2 = Color(hex: 0xF2F1EA, opacity: 0.30)
    /// Halka izi.
    static let track = Color(hex: 0x2A2F2D)
    /// Oyuncu (sen): Kehribar.
    static let amber = Color(hex: 0xE69F00)
    /// Rakip: Gök.
    static let sky = Color(hex: 0x56B4E9)
    /// Uyarı: Kiremit.
    static let brick = Color(hex: 0xD55E00)

    static func tone(_ t: WatchFace.Tone) -> Color {
        switch t {
        case .accent: return amber
        case .duel: return sky
        case .muted: return ink2
        case .warning: return brick
        }
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

/// Archivo + IBM Plex Mono (telefonla aynı TTF'ler, `UIAppFonts`). Yüklenmemişse sistem fontu.
enum WFont {
    enum Family { case archivo, mono }

    static func postScriptName(_ family: Family, _ weight: Font.Weight) -> String {
        switch family {
        case .mono:
            switch weight {
            case .semibold, .bold, .heavy, .black: return "IBMPlexMono-SemiBold"
            case .medium: return "IBMPlexMono-Medium"
            default: return "IBMPlexMono-Regular"
            }
        case .archivo:
            switch weight {
            case .black: return "Archivo-Black"
            case .heavy: return "Archivo-ExtraBold"
            case .bold: return "Archivo-Bold"
            case .semibold: return "Archivo-SemiBold"
            case .medium: return "Archivo-Medium"
            default: return "Archivo-Regular"
            }
        }
    }

    /// `size` zaten `@ScaledMetric` ile ölçeklenmiş olmalı (Dynamic Type).
    static func fixed(_ family: Family, _ weight: Font.Weight, _ size: CGFloat) -> Font {
        let name = postScriptName(family, weight)
        if UIFont(name: name, size: size) != nil { return .custom(name, fixedSize: size) }
        switch family {
        case .mono: return .system(size: size, weight: weight, design: .monospaced)
        case .archivo: return .system(size: size, weight: weight).width(.condensed)
        }
    }
}

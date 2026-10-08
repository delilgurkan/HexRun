import SwiftUI
import UIKit

/// Archivo + IBM Plex Mono (Google Fonts, OFL; `Resources/Fonts`). Yüklenemezse sistem fontu.
enum HXFont {
    enum Family { case archivo, mono }

    static func name(_ family: Family, _ weight: Font.Weight) -> String {
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

    static func available(_ name: String) -> Bool { UIFont(name: name, size: 12) != nil }

    /// Dynamic Type ile ölçeklenen font.
    static func font(_ family: Family, _ weight: Font.Weight, _ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        let n = name(family, weight)
        if available(n) { return .custom(n, size: size, relativeTo: style) }
        return .system(size: size, weight: weight, design: family == .mono ? .monospaced : .default)
    }

    static func uiFont(_ family: Family, _ weight: UIFont.Weight, _ size: CGFloat) -> UIFont {
        let w: Font.Weight = weight == .black ? .black : weight == .heavy ? .heavy : weight == .bold ? .bold : weight == .semibold ? .semibold : weight == .medium ? .medium : .regular
        return UIFont(name: name(family, w), size: size) ?? .systemFont(ofSize: size, weight: weight)
    }
}

/// Tipografi ölçeği (Tokens · Tip). HUD rakamları erişilebilirlik boyutlarında büyümeyi bırakır.
enum TypeStyle {
    case hudXl, display, hudM, title1, title2, body, callout, label, data

    var font: Font {
        switch self {
        case .hudXl: return HXFont.font(.archivo, .heavy, 112, relativeTo: .largeTitle)
        case .display: return HXFont.font(.archivo, .black, 52, relativeTo: .largeTitle)
        case .hudM: return HXFont.font(.archivo, .bold, 48, relativeTo: .largeTitle)
        case .title1: return HXFont.font(.archivo, .heavy, 30, relativeTo: .title)
        case .title2: return HXFont.font(.archivo, .bold, 22, relativeTo: .title2)
        case .body: return HXFont.font(.archivo, .regular, 17, relativeTo: .body)
        case .callout: return HXFont.font(.archivo, .medium, 15, relativeTo: .callout)
        case .label: return HXFont.font(.archivo, .semibold, 12, relativeTo: .caption)
        case .data: return HXFont.font(.mono, .medium, 13, relativeTo: .footnote)
        }
    }

    var tracking: CGFloat {
        switch self {
        case .hudXl: return -4
        case .display: return 0.5
        case .hudM: return -1.5
        case .title1: return 0.2
        case .label: return 0.6
        default: return 0
        }
    }
}

struct HXTextStyle: ViewModifier {
    @Environment(\.theme) private var t
    let style: TypeStyle
    let tone: Int
    let color: Color?

    func body(content: Content) -> some View {
        content
            .font(style.font)
            .tracking(style.tracking)
            .textCase(style == .label ? .uppercase : nil)
            .foregroundStyle(color ?? (tone == 3 ? t.c.ink3 : tone == 2 ? t.c.ink2 : t.c.ink))
            .monospacedDigit()
    }
}

extension View {
    /// Tasarım tipografisi: `.hx(.title1)`, `.hx(.callout, tone: 2)`.
    func hx(_ style: TypeStyle, tone: Int = 1, color: Color? = nil) -> some View {
        modifier(HXTextStyle(style: style, tone: tone, color: color))
    }
}

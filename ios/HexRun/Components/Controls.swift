import SwiftUI
import HexRunKit

enum ButtonKind { case primary, secondary, ghost, danger }

/// Birincil buton = ters zemin (mürekkep üstüne kâğıt). Hedef ≥ 44 pt; `big` 56 pt CTA.
struct HXButton: View {
    let label: String
    var kind: ButtonKind = .primary
    var icon: IconName?
    var big = false
    var loading = false
    var disabled = false
    var minHeight: CGFloat?
    var accessibilityHint: String?
    let action: () -> Void
    @Environment(\.theme) private var t

    init(_ label: String, kind: ButtonKind = .primary, icon: IconName? = nil, big: Bool = false, loading: Bool = false, disabled: Bool = false,
         minHeight: CGFloat? = nil, accessibilityHint: String? = nil, action: @escaping () -> Void) {
        self.label = label; self.kind = kind; self.icon = icon; self.big = big; self.loading = loading; self.disabled = disabled
        self.minHeight = minHeight; self.accessibilityHint = accessibilityHint; self.action = action
    }

    var body: some View {
        let bg: Color = kind == .primary ? t.c.inv : kind == .secondary ? t.c.surf2 : .clear
        let fg: Color = kind == .primary ? t.c.invInk : t.c.ink
        let inactive = disabled || loading
        Button(action: action) {
            HStack(spacing: 8) {
                if loading { ProgressView().tint(fg) } else if let icon { Icon(icon, size: 20, color: fg) }
                Text(label)
                    .font(big ? HXFont.font(.archivo, .black, 17) : HXFont.font(.archivo, .semibold, 15, relativeTo: .callout))
                    .tracking(big ? 1 : 0)
                    .foregroundStyle(fg)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            .padding(.horizontal, big ? 24 : 16)
            .frame(maxWidth: big ? .infinity : nil, minHeight: minHeight ?? (big ? 56 : Target.min))
            .background(RoundedRectangle(cornerRadius: big ? Radii.cta : Radii.m, style: .continuous).fill(bg))
            .overlay {
                if kind == .ghost || kind == .danger {
                    RoundedRectangle(cornerRadius: big ? Radii.cta : Radii.m, style: .continuous)
                        .stroke(kind == .danger ? t.c.ink : t.c.line2, lineWidth: 1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .disabled(inactive)
        .opacity(inactive ? 0.45 : 1)
        .accessibilityLabel(label)
        .accessibilityHint(accessibilityHint ?? "")
    }
}

struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// Yuvarlak ikon düğmesi (cam zemin seçeneği, okunmamış rozeti). VoiceOver etiketi zorunlu.
struct IconButton<Content: View>: View {
    let label: String
    var size: CGFloat = Target.min
    var glass = false
    var badge = 0
    let action: () -> Void
    @ViewBuilder var content: () -> Content
    @Environment(\.theme) private var t

    var body: some View {
        Button(action: action) {
            content()
                .frame(width: size, height: size)
                .background(Circle().fill(glass ? t.c.glass : Color.clear))
                .overlay { if glass { Circle().stroke(t.c.line, lineWidth: 1) } }
                .overlay(alignment: .topTrailing) {
                    if badge > 0 {
                        Text(badge > 9 ? "9+" : "\(badge)")
                            .font(HXFont.font(.archivo, .semibold, 11))
                            .foregroundStyle(t.c.invInk)
                            .padding(.horizontal, 4)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Capsule().fill(t.c.inv))
                            .offset(x: -2, y: 2)
                    }
                }
                .frame(minWidth: Target.min, minHeight: Target.min)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel(label)
    }
}

extension IconButton where Content == Icon {
    init(_ icon: IconName, label: String, size: CGFloat = Target.min, glass: Bool = false, badge: Int = 0, action: @escaping () -> Void) {
        self.label = label
        self.size = size
        self.glass = glass
        self.badge = badge
        self.action = action
        content = { Icon(icon, size: 22) }
    }
}

struct Chip: View {
    let label: String
    var icon: IconName?
    var selected = false
    var glass = false
    var action: (() -> Void)?
    @Environment(\.theme) private var t

    var body: some View {
        let bg = selected ? t.c.inv : glass ? t.c.glass : t.c.surf2
        let fg = selected ? t.c.invInk : t.c.ink
        let content = HStack(spacing: 6) {
            if let icon { Icon(icon, size: 16, color: fg) }
            Text(label).font(HXFont.font(.archivo, .medium, 14, relativeTo: .subheadline)).foregroundStyle(fg).lineLimit(1)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: action == nil ? 32 : Target.min - 8)
        .background(RoundedRectangle(cornerRadius: Radii.s, style: .continuous).fill(bg))
        .overlay { if glass { RoundedRectangle(cornerRadius: Radii.s, style: .continuous).stroke(t.c.line, lineWidth: 1) } }

        if let action {
            Button(action: action) { content }
                .buttonStyle(PressStyle())
                .accessibilityLabel(label)
                .accessibilityAddTraits(selected ? .isSelected : [])
        } else {
            content.accessibilityElement(children: .ignore).accessibilityLabel(label)
        }
    }
}

/// İki ayrı kontrol (kategori, dönem) için bölümlü seçici.
struct Segmented<K: Hashable>: View {
    let options: [(K, String)]
    @Binding var value: K
    var onChange: ((K) -> Void)?
    @Environment(\.theme) private var t

    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                let key = option.0
                let label = option.1
                let on = key == value
                Button {
                    value = key
                    onChange?(key)
                } label: {
                    Text(label)
                        .font(HXFont.font(.archivo, .medium, 14, relativeTo: .subheadline))
                        .foregroundStyle(on ? t.c.ink : t.c.ink2)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, minHeight: Target.min - 6)
                        .background(RoundedRectangle(cornerRadius: Radii.s - 3, style: .continuous).fill(on ? t.c.surf : Color.clear))
                        .overlay { if on { RoundedRectangle(cornerRadius: Radii.s - 3, style: .continuous).stroke(t.c.line, lineWidth: 1) } }
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel(label)
                .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: Radii.s, style: .continuous).fill(t.c.surf2))
    }
}

struct Card<Content: View>: View {
    var spacing: CGFloat = 10
    @ViewBuilder var content: () -> Content
    @Environment(\.theme) private var t

    var body: some View {
        VStack(alignment: .leading, spacing: spacing, content: content)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: Radii.m, style: .continuous).fill(t.c.surf))
            .overlay(RoundedRectangle(cornerRadius: Radii.m, style: .continuous).stroke(t.c.line, lineWidth: 1))
    }
}

/// Harita üstü cam panel.
struct Panel<Content: View>: View {
    @ViewBuilder var content: () -> Content
    @Environment(\.theme) private var t

    var body: some View {
        VStack(alignment: .leading, spacing: 10, content: content)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: Radii.l - 6, style: .continuous).fill(t.c.glass))
            .overlay(RoundedRectangle(cornerRadius: Radii.l - 6, style: .continuous).stroke(t.c.line, lineWidth: 1))
            .shadow(color: t.c.shadow.opacity(t.isDark ? 0.5 : 0.16), radius: 20, y: 6)
    }
}

struct Divider2: View {
    @Environment(\.theme) private var t
    var body: some View { Rectangle().fill(t.c.line).frame(height: 1) }
}

struct SectionTitle<Right: View>: View {
    let title: String
    @ViewBuilder var right: () -> Right

    var body: some View {
        HStack {
            Text(title).hx(.label, tone: 2).accessibilityAddTraits(.isHeader)
            Spacer()
            right()
        }
        .padding(.top, 4)
    }
}

extension SectionTitle where Right == EmptyView {
    init(_ title: String) {
        self.title = title
        right = { EmptyView() }
    }
}

struct Stat: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).hx(.label, tone: 3)
            Text(value).hx(.title2).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct Tag: View {
    let label: String
    var inverted = false
    @Environment(\.theme) private var t
    var body: some View {
        Text(label).hx(.label, color: inverted ? t.c.invInk : t.c.ink)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: Radii.s).fill(inverted ? t.c.inv : t.c.surf2))
    }
}

/// Boş / hata durumu: tek başlık, tek açıklama, tek eylem.
struct StateBlock: View {
    var icon: IconName?
    let title: String
    var bodyText: String?
    var action: String?
    var onAction: (() -> Void)?
    var footnote: String?
    @Environment(\.theme) private var t

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let icon {
                Icon(icon).frame(width: 48, height: 48).background(Circle().fill(t.c.surf2))
            }
            Text(title).hx(.title2).accessibilityAddTraits(.isHeader)
            if let bodyText { Text(bodyText).hx(.body, tone: 2) }
            if let action, let onAction { HXButton(action, kind: .secondary, action: onAction) }
            if let footnote { Text(footnote).hx(.data, tone: 3) }
        }
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct HXTextField: View {
    let placeholder: String
    @Binding var text: String
    var mono = false
    @Environment(\.theme) private var t

    var body: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(t.c.ink3))
            .font(mono ? HXFont.font(.mono, .medium, 16) : HXFont.font(.archivo, .medium, 17))
            .foregroundStyle(t.c.ink)
            .padding(.horizontal, 14)
            .frame(minHeight: Target.min + 8)
            .background(RoundedRectangle(cornerRadius: Radii.s).fill(t.c.surf))
            .overlay(RoundedRectangle(cornerRadius: Radii.s).stroke(t.c.line2, lineWidth: 1))
            .accessibilityLabel(placeholder)
    }
}

/// Ekran iskeleti: başlık + geri, kaydırılabilir içerik, altta sabit eylemler.
struct HXScreen<Content: View, Footer: View, Right: View>: View {
    let title: String
    var large = false
    var showBack = true
    var onBack: (() -> Void)?
    @ViewBuilder var right: () -> Right
    @ViewBuilder var footer: () -> Footer
    @ViewBuilder var content: () -> Content
    @Environment(\.theme) private var t
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                if showBack {
                    IconButton(.back, label: S.common.back) { if let onBack { onBack() } else { dismiss() } }
                }
                if !large { Text(title).hx(.title2).lineLimit(1).accessibilityAddTraits(.isHeader) }
                Spacer()
                right()
            }
            .padding(.horizontal, showBack ? 4 : Space.gutter)
            .frame(minHeight: 48)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if large { Text(title).hx(.title1).accessibilityAddTraits(.isHeader) }
                    content()
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 10) { footer() }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 8)
                .background(t.c.bg.opacity(0.001))
        }
        .background(t.c.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }
}

extension HXScreen where Footer == EmptyView, Right == EmptyView {
    init(title: String, large: Bool = false, showBack: Bool = true, onBack: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title; self.large = large; self.showBack = showBack; self.onBack = onBack
        right = { EmptyView() }; footer = { EmptyView() }; self.content = content
    }
}

extension HXScreen where Right == EmptyView {
    init(title: String, large: Bool = false, showBack: Bool = true, onBack: (() -> Void)? = nil,
         @ViewBuilder footer: @escaping () -> Footer, @ViewBuilder content: @escaping () -> Content) {
        self.title = title; self.large = large; self.showBack = showBack; self.onBack = onBack
        right = { EmptyView() }; self.footer = footer; self.content = content
    }
}

extension HXScreen where Footer == EmptyView {
    init(title: String, large: Bool = false, showBack: Bool = true, onBack: (() -> Void)? = nil,
         @ViewBuilder right: @escaping () -> Right, @ViewBuilder content: @escaping () -> Content) {
        self.title = title; self.large = large; self.showBack = showBack; self.onBack = onBack
        self.right = right; footer = { EmptyView() }; self.content = content
    }
}

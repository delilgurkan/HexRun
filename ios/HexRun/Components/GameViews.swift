import SwiftUI
import HexRunKit

/// Oyuncu işareti: renkli daire + baş harf (renk tek taşıyıcı değildir). Kendi işaretçinde
/// son 48 saatte saldıranların sayısı.
struct PlayerBadge: View {
    let slot: Slot
    let initials: String
    var size: CGFloat = 36
    var goldFrame = false
    var attackers: Int?
    var hidden = false
    var ring = false
    @Environment(\.theme) private var t

    var body: some View {
        ZStack {
            Circle().fill(t.player(slot))
            Circle().stroke(goldFrame ? Theme.gold : ring ? t.c.ink : t.c.casing, lineWidth: goldFrame ? 3 : ring ? 2.5 : 2)
            if !hidden {
                Text(initials)
                    .font(HXFont.font(.archivo, .heavy, max(12, size * 0.36)))
                    .tracking(0.3)
                    .foregroundStyle(Theme.onPlayer(slot))
                    .dynamicTypeSize(.large)
            }
        }
        .frame(width: size, height: size)
        .overlay(alignment: .topTrailing) {
            if let a = attackers, a > 0 {
                Text("\(a)")
                    .font(HXFont.font(.archivo, .semibold, 11))
                    .foregroundStyle(t.c.invInk)
                    .padding(.horizontal, 4)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(Capsule().fill(t.c.inv))
                    .overlay(Capsule().stroke(t.c.casing, lineWidth: 1.5))
                    .offset(x: 6, y: -6)
                    .accessibilityLabel(S.map.attackersA11y(a))
            }
        }
    }
}

enum HatSize {
    case sm, md, lg
    var height: CGFloat { self == .sm ? 4 : self == .md ? 8 : 16 }
    var gap: CGFloat { self == .sm ? 1.5 : self == .md ? 2 : 3 }
}

/// "Hat" göstergesi: 10 segment; sahip düz dolgu, saldırgan taralı, eriyen güç soluk hayalet.
/// 4 pt harita etiketi, 8 pt sayfa/liste, 16 pt kuşatma ekranı.
struct HatView: View {
    let power: Double
    var progress: Double?
    /// Son 7 günde eriyen güç (puan).
    var ghost: Double?
    let ownerColor: Color
    var attackerColor: Color?
    var size: HatSize = .md
    var showLabel = true
    @Environment(\.theme) private var t

    var body: some View {
        let segs = Hat.segments(power: power, progress: progress, ghostTo: power + max(0, ghost ?? 0))
        let hatch = attackerColor ?? t.c.ink
        let track = t.c.track
        let owner = ownerColor
        let h = size.height, gap = size.gap
        HStack(spacing: 8) {
            Canvas { ctx, sz in
                let w = (sz.width - gap * 9) / 10
                for (i, s) in segs.enumerated() {
                    let x = CGFloat(i) * (w + gap)
                    let rect = CGRect(x: x, y: 0, width: w, height: h)
                    ctx.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(track))
                    if s.ghost > 0 {
                        ctx.fill(Path(roundedRect: CGRect(x: x, y: 0, width: w * s.ghost / 100, height: h), cornerRadius: 1), with: .color(owner.opacity(0.32)))
                    }
                    if s.owner > 0 {
                        ctx.fill(Path(roundedRect: CGRect(x: x, y: 0, width: w * s.owner / 100, height: h), cornerRadius: 1), with: .color(owner))
                    }
                    if s.siege > 0 {
                        let r = CGRect(x: x, y: 0, width: w * s.siege / 100, height: h)
                        var c = ctx
                        c.clip(to: Path(roundedRect: r, cornerRadius: 1))
                        var lines = Path()
                        var lx = r.minX - h
                        while lx < r.maxX + h {
                            lines.move(to: CGPoint(x: lx, y: h))
                            lines.addLine(to: CGPoint(x: lx + h, y: 0))
                            lx += 4
                        }
                        c.stroke(lines, with: .color(hatch), lineWidth: 1.8)
                    }
                }
            }
            .frame(height: h)
            if showLabel {
                Text(Hat.label(power: power, progress: progress, ghost: ghost))
                    .font(HXFont.font(.mono, .medium, size == .lg ? 15 : 13))
                    .foregroundStyle(t.c.ink)
                    .monospacedDigit()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Hat.accessibilityText(power: power, progress: progress, ghost: ghost))
        .accessibilityValue("\(Int(power.rounded()))")
    }
}

/// Bölge silüeti (harita yok, yalnız biçim).
struct SilhouetteView: View {
    let rings: [[LatLng]]
    let color: Color
    var stroke: Color?

    var body: some View {
        Canvas { ctx, sz in
            let proj = Silhouette.project(rings, width: sz.width, height: sz.height)
            var p = Path()
            for r in proj {
                guard let f = r.first else { continue }
                p.move(to: CGPoint(x: f.x, y: f.y))
                for q in r.dropFirst() { p.addLine(to: CGPoint(x: q.x, y: q.y)) }
                p.closeSubpath()
            }
            ctx.fill(p, with: .color(color), style: FillStyle(eoFill: true))
            if let stroke { ctx.stroke(p, with: .color(stroke), style: StrokeStyle(lineWidth: 1.5, lineJoin: .round)) }
        }
        .accessibilityHidden(true)
    }
}

/// Petek dokusu (yükleme durumları).
struct HexTexture: View {
    var opacity: Double = 1
    @Environment(\.theme) private var t
    var body: some View {
        Canvas { ctx, sz in
            let r: CGFloat = 14
            let dx = r * 3.0.squareRoot(), dy = r * 1.5
            var p = Path()
            var row = 0
            var y: CGFloat = 0
            while y < sz.height + r {
                var x: CGFloat = row % 2 == 1 ? dx / 2 : 0
                while x < sz.width + dx {
                    let a = r * 3.0.squareRoot() / 2, b = r / 2
                    p.move(to: CGPoint(x: x, y: y - r))
                    p.addLine(to: CGPoint(x: x + a, y: y - b))
                    p.addLine(to: CGPoint(x: x + a, y: y + b))
                    p.addLine(to: CGPoint(x: x, y: y + r))
                    p.addLine(to: CGPoint(x: x - a, y: y + b))
                    p.addLine(to: CGPoint(x: x - a, y: y - b))
                    p.closeSubpath()
                    x += dx
                }
                y += dy
                row += 1
            }
            ctx.stroke(p, with: .color(t.c.tex), lineWidth: 1)
        }
        .opacity(opacity)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// İskelet blok: nabız gibi yanıp söner ("Hareketi azalt" açıkken sabit).
struct Skeleton: View {
    var width: CGFloat?
    var height: CGFloat = 16
    var radius: CGFloat = Radii.s
    @Environment(\.theme) private var t
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State var on = false

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(t.c.track)
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
            .opacity(on ? 0.5 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { on = true }
            }
            .accessibilityHidden(true)
    }
}

/// Bitir 1,5 sn basılı tut: geri alınmaz eylem. VoiceOver'da onay penceresi açılır.
struct HoldButton: View {
    let label: String
    let hint: String
    let icon: IconName
    var duration = Motion.finishHold
    let onComplete: () -> Void
    @State var progress: CGFloat = 0
    @State var holding = false
    @State var confirm = false
    @Environment(\.theme) private var t

    var body: some View {
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: Radii.cta, style: .continuous).fill(t.c.inv)
            GeometryReader { g in
                Rectangle().fill(t.c.ink2.opacity(0.45)).frame(width: g.size.width * progress)
            }
            .clipShape(RoundedRectangle(cornerRadius: Radii.cta, style: .continuous))
            HStack(spacing: 10) {
                Icon(icon, color: t.c.invInk)
                VStack(alignment: .leading, spacing: 0) {
                    Text(label).font(HXFont.font(.archivo, .black, 18)).tracking(1).foregroundStyle(t.c.invInk)
                    Text(hint).font(HXFont.font(.archivo, .semibold, 12)).foregroundStyle(t.c.invInk.opacity(holding ? 1 : 0.7))
                }
            }
            .frame(maxWidth: .infinity)
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        }
        .frame(minHeight: Target.runBar)
        .contentShape(Rectangle())
        .onLongPressGesture(minimumDuration: duration, maximumDistance: 40) {
            holding = false
            progress = 0
            onComplete()
        } onPressingChanged: { pressing in
            holding = pressing
            if pressing {
                withAnimation(.linear(duration: duration)) { progress = 1 }
            } else {
                withAnimation(.easeOut(duration: Motion.tap)) { progress = 0 }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityHint(hint)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { confirm = true }
        .confirmationDialog(label, isPresented: $confirm, titleVisibility: .visible) {
            Button(label, role: .destructive, action: onComplete)
            Button(S.common.cancel, role: .cancel) {}
        }
    }
}

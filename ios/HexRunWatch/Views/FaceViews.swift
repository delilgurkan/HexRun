import SwiftUI
import HexRunKit

// MARK: - Parçalar

/// Üst satır: IBM Plex Mono, büyük harf (Türkçe), aralıklı.
struct Kicker: View {
    let text: String
    let color: Color
    @ScaledMetric(relativeTo: .caption) private var size: CGFloat = 12

    var body: some View {
        Text(Fmt.turkishUpper(text))
            .font(WFont.fixed(.mono, .semibold, size))
            .tracking(0.7)
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

/// Tek büyük rakam: Archivo ExtraBold, eş genişlikli rakamlar.
struct BigNumber: View {
    let text: String
    var base: CGFloat = 64
    var color: Color = WT.ink
    @ScaledMetric(relativeTo: .largeTitle) private var scale: CGFloat = 1

    var body: some View {
        Text(text)
            .font(WFont.fixed(.archivo, .heavy, base * scale))
            .monospacedDigit()
            .tracking(-0.5)
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.4)
    }
}

struct UnitLabel: View {
    let text: String
    @ScaledMetric(relativeTo: .headline) private var size: CGFloat = 15

    var body: some View {
        Text(text)
            .font(WFont.fixed(.archivo, .heavy, size))
            .foregroundStyle(WT.ink)
            .lineLimit(2)
            .minimumScaleFactor(0.8)
    }
}

struct FootLabel: View {
    let parts: [String]
    @ScaledMetric(relativeTo: .footnote) private var size: CGFloat = 13

    var body: some View {
        Text(parts.joined(separator: " · "))
            .font(WFont.fixed(.mono, .semibold, size))
            .monospacedDigit()
            .foregroundStyle(WT.ink2)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

/// Etkinlik çipleri ("Sabah 2x").
struct ChipsRow: View {
    let chips: [String]
    @ScaledMetric(relativeTo: .caption2) private var size: CGFloat = 11

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(chips.enumerated()), id: \.offset) { _, chip in
                Text(chip)
                    .font(WFont.fixed(.mono, .semibold, size))
                    .foregroundStyle(WT.ink2)
                    .lineLimit(1)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .overlay { Capsule().stroke(WT.line2, lineWidth: 1) }
            }
        }
        .minimumScaleFactor(0.7)
    }
}

/// "Halkayı kapat" ilerlemesi.
struct ApproachBar: View {
    let progress: Double

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(WT.track)
                Capsule().fill(WT.amber).frame(width: max(6, g.size.width * progress))
            }
        }
        .frame(height: 6)
        .animation(.easeOut(duration: 0.3), value: progress)
    }
}

/// Halka göstergesi (düello kapsama, fetih).
struct RingGauge: View {
    let progress: Double
    var color: Color = WT.amber
    var lineWidth: CGFloat = 7

    var body: some View {
        ZStack {
            Circle().stroke(WT.track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: min(1, max(0, progress)))
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.4), value: progress)
        }
        .padding(lineWidth / 2)
    }
}

struct BannerView: View {
    let text: String
    @ScaledMetric(relativeTo: .caption) private var size: CGFloat = 12

    var body: some View {
        Text(text)
            .font(WFont.fixed(.mono, .semibold, size))
            .foregroundStyle(WT.ink)
            .lineLimit(2)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background { Capsule().fill(WT.surf2) }
            .overlay { Capsule().stroke(WT.amber, lineWidth: 1) }
            .padding(.top, 2)
            .accessibilityAddTraits(.isStaticText)
    }
}

// MARK: - Ekranlar

/// Koşu / yaklaşma / duraklatıldı / bağlantı yok / bitti: sola yaslı tek büyük rakam (s17-saat · Apple Watch).
struct FaceView: View {
    let face: WatchFace

    private var dimmed: Bool { face.kind == .paused || face.kind == .stale }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Kicker(text: face.kicker, color: WT.tone(face.tone))
            BigNumber(text: face.value, base: face.kind == .approach ? 70 : 64, color: dimmed ? WT.ink2 : WT.ink)
                .padding(.top, 2)
            UnitLabel(text: face.unit)
            if face.kind == .approach, let p = face.progress {
                ApproachBar(progress: p)
                    .padding(.top, 6)
            }
            if !face.chips.isEmpty {
                ChipsRow(chips: face.chips)
                    .padding(.top, 4)
            }
            Spacer(minLength: 4)
            FootLabel(parts: face.foot)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
        .background(WT.bg)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(face.accessibility)
    }
}

/// Düello kapsama halkası: dolaşılan / toplam petek.
struct DuelRingView: View {
    let face: WatchFace

    var body: some View {
        ZStack {
            RingGauge(progress: face.progress ?? 0)
            VStack(spacing: 0) {
                Kicker(text: face.kicker, color: WT.tone(face.tone))
                BigNumber(text: face.value, base: 46)
                UnitLabel(text: face.unit)
                    .multilineTextAlignment(.center)
                FootLabel(parts: face.foot)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 22)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(WT.bg)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(face.accessibility)
    }
}

/// Fetih kartı: dolu halka, petek sayısı, alan. 5 sn sonra kendiliğinden kapanır; dokununca kapanır.
struct ConquestCardView: View {
    let face: WatchFace
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            WT.bg.ignoresSafeArea()
            RingGauge(progress: 1)
            VStack(spacing: 0) {
                Kicker(text: face.kicker, color: WT.tone(face.tone))
                BigNumber(text: face.value, base: 56)
                UnitLabel(text: face.unit)
                FootLabel(parts: face.foot)
                    .padding(.top, 4)
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 22)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onDismiss)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(face.accessibility)
        .accessibilityAddTraits([.isModal, .isButton])
        .accessibilityAction(named: Text(WS.dismiss), onDismiss)
    }
}

/// Koşu yokken.
struct IdleView: View {
    let face: WatchFace
    let reachable: Bool
    @ScaledMetric(relativeTo: .title3) private var titleSize: CGFloat = 20
    @ScaledMetric(relativeTo: .body) private var bodySize: CGFloat = 16
    @ScaledMetric(relativeTo: .caption2) private var noteSize: CGFloat = 11
    @ScaledMetric(relativeTo: .title) private var iconSize: CGFloat = 34

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Image(systemName: "hexagon.fill")
                    .font(.system(size: iconSize, weight: .bold))
                    .foregroundStyle(WT.amber)
                    .accessibilityHidden(true)
                Text(face.kicker)
                    .font(WFont.fixed(.archivo, .heavy, titleSize))
                    .foregroundStyle(WT.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(face.unit)
                    .font(WFont.fixed(.archivo, .semibold, bodySize))
                    .foregroundStyle(WT.ink)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if !reachable {
                    Label(WS.notConnected, systemImage: "iphone.slash")
                        .font(WFont.fixed(.mono, .semibold, noteSize))
                        .foregroundStyle(WT.ink3)
                        .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
        }
        .background(WT.bg)
    }
}

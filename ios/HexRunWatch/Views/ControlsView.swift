import SwiftUI
import WatchKit

/// Kontroller: duraklat / devam (dokun), bitir (1,5 sn basılı tut — telefondaki gibi).
struct ControlsView: View {
    let paused: Bool
    let finishing: Bool
    let onToggle: () -> Void
    let onFinish: () -> Void

    @ScaledMetric(relativeTo: .headline) private var labelSize: CGFloat = 17

    var body: some View {
        VStack(spacing: 10) {
            Button(action: onToggle) {
                Label(paused ? WS.resume : WS.pause, systemImage: paused ? "play.fill" : "pause.fill")
                    .font(WFont.fixed(.archivo, .heavy, labelSize))
                    .foregroundStyle(paused ? Color.black : WT.ink)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(paused ? WT.amber : WT.surf2)
            .disabled(finishing)
            .accessibilityLabel(paused ? WS.resume : WS.pause)

            HoldToFinishButton(finishing: finishing, action: onFinish)
        }
        .frame(maxHeight: .infinity)
        .padding(.horizontal, 4)
        .background(WT.bg)
    }
}

/// 1,5 sn basılı tutunca bitirir; dolan şerit ilerlemeyi gösterir. VoiceOver'da tek eylem.
struct HoldToFinishButton: View {
    static let holdDuration: Double = 1.5

    let finishing: Bool
    let action: () -> Void

    @GestureState private var pressing = false
    @State private var progress: CGFloat = 0
    @State private var fired = false

    @ScaledMetric(relativeTo: .headline) private var labelSize: CGFloat = 17
    @ScaledMetric(relativeTo: .caption2) private var hintSize: CGFloat = 10
    @ScaledMetric(relativeTo: .headline) private var height: CGFloat = 56

    private let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)

    var body: some View {
        ZStack(alignment: .leading) {
            shape.fill(WT.surf)
            GeometryReader { g in
                shape.fill(WT.brick).frame(width: g.size.width * (finishing ? 1 : progress))
            }
            VStack(spacing: 2) {
                Label(finishing ? WS.finishing : WS.finish, systemImage: "stop.fill")
                    .font(WFont.fixed(.archivo, .heavy, labelSize))
                    .foregroundStyle(WT.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if !finishing {
                    Text(WS.holdToFinish)
                        .font(WFont.fixed(.mono, .semibold, hintSize))
                        .foregroundStyle(WT.ink2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 6)
        }
        .frame(minHeight: height)
        .fixedSize(horizontal: false, vertical: true)
        .clipShape(shape)
        .contentShape(shape)
        .gesture(
            LongPressGesture(minimumDuration: Self.holdDuration)
                .updating($pressing) { value, state, _ in state = value }
                .onEnded { _ in fire() }
        )
        .allowsHitTesting(!finishing)
        .onChange(of: pressing) { _, isPressing in
            if isPressing {
                WKInterfaceDevice.current().play(.click)
                withAnimation(.linear(duration: Self.holdDuration)) { progress = 1 }
            } else if !fired {
                withAnimation(.easeOut(duration: 0.2)) { progress = 0 }
            }
        }
        .onChange(of: finishing) { _, now in
            if !now {
                fired = false
                withAnimation(.easeOut(duration: 0.2)) { progress = 0 }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(finishing ? WS.finishing : WS.finishA11y)
        .accessibilityHint(WS.finishA11yHint)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { fire() }
    }

    private func fire() {
        guard !finishing, !fired else { return }
        fired = true
        progress = 1
        action()
        // Telefon ulaşmazsa (şerit gösterilir) düğme yeniden kullanılabilir olsun.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            fired = false
            withAnimation(.easeOut(duration: 0.2)) { progress = 0 }
        }
    }
}

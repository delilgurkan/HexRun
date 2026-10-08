import SwiftUI
import HexRunKit

/// Ekran seçimi `WatchFace.make` ile yapılır (saf, test edilir); burada yalnız yerleşim.
struct RootView: View {
    @Environment(WatchSession.self) private var session
    @Environment(\.isLuminanceReduced) private var luminanceReduced

    var body: some View {
        // Bağlantı yok uyarısı ve ileri sarılan süre için saniyelik yeniden çizim (bilek inikken dakikalık).
        TimelineView(.periodic(from: .now, by: luminanceReduced ? 60 : 1)) { context in
            let face = WatchFace.make(session.state, now: context.date)
            content(face)
        }
        .overlay(alignment: .top) {
            if let banner = session.state.banner {
                BannerView(text: banner.kind.text)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .overlay {
            if let card = session.state.conquest {
                ConquestCardView(face: WatchFace.conquest(card.conquest)) {
                    session.dismissConquest()
                }
                .transition(.opacity.combined(with: .scale(scale: 0.92)))
            }
        }
        .animation(.easeOut(duration: 0.25), value: session.state.conquest)
        .animation(.easeOut(duration: 0.25), value: session.state.banner)
    }

    @ViewBuilder
    private func content(_ face: WatchFace) -> some View {
        switch face.kind {
        case .idle:
            IdleView(face: face, reachable: session.reachable)
        case .finished:
            FaceView(face: face)
        case .run, .approach, .duel, .paused, .stale, .conquest:
            ActiveRunView(face: face)
        }
    }
}

/// Koşu sırasında iki dikey sayfa: 1) tek büyük rakam, 2) kontroller.
struct ActiveRunView: View {
    @Environment(WatchSession.self) private var session
    let face: WatchFace

    enum Page: Hashable { case hud, controls }
    @State private var page: Page = .hud

    var body: some View {
        TabView(selection: $page) {
            Group {
                if face.kind == .duel {
                    DuelRingView(face: face)
                } else {
                    FaceView(face: face)
                }
            }
            .containerBackground(WT.bg, for: .tabView)
            .tag(Page.hud)

            ControlsView(
                paused: session.state.displayState == .paused,
                finishing: session.state.isFinishing,
                onToggle: {
                    session.send(session.state.displayState == .paused ? .resume : .pause)
                    page = .hud
                },
                onFinish: { session.send(.finish) }
            )
            .containerBackground(WT.bg, for: .tabView)
            .tag(Page.controls)
        }
        .tabViewStyle(.verticalPage)
    }
}

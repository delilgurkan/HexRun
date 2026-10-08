import SwiftUI

@main
struct HexRunWatchApp: App {
    @State private var session: WatchSession

    init() {
        let session = WatchSession.shared
        session.activate()
        _session = State(initialValue: session)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .preferredColorScheme(.dark)
                .tint(WT.amber)
        }
    }
}

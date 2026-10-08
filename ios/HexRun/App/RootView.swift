import SwiftUI
import HexRunKit

struct IdentifiedString: Identifiable, Hashable {
    let id: String
}

/// Giriş kapısı: onboarding → izinler → kayıt → profil → harita; yarım koşu varsa koşu modu.
struct RootView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppModel.self) private var app
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let theme = Theme(isDark: scheme == .dark)
        Group {
            if !env.booted || app.auth == .loading {
                theme.c.bg.ignoresSafeArea()
            } else if !app.prefs.onboardingDone {
                OnboardingScreen()
            } else if !app.prefs.permissionsDone {
                PermissionsScreen()
            } else if app.auth == .signedOut {
                AuthFlow()
            } else if app.prefs.needsProfile {
                NavigationStack { ProfileSetupScreen(app: app) }
            } else {
                MainTabs()
            }
        }
        .environment(\.theme, theme)
        .tint(theme.c.ink)
        .onChange(of: app.auth) { _, status in
            if status == .signedIn, let link = app.pendingLink {
                app.pendingLink = nil
                env.router.handle(link)
            }
            if status == .signedIn { Task { await env.push.registerIfAuthorized() } }
            if status == .signedOut { env.router.cover = nil; env.router.mapPath = [] }
        }
    }
}

/// Dört sekme: Harita · Lig · Takım · Etkinlik. Profil avatardan, bildirimler zilden.
/// Koşu tam ekran moddur; sekme çubuğunu gizler.
struct MainTabs: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.theme) private var t

    var body: some View {
        @Bindable var router = router
        @Bindable var env = env
        TabView(selection: $router.tab) {
            NavigationStack(path: $router.mapPath) {
                MapScreen(app: app).navigationDestination(for: Route.self) { RouteView(route: $0) }
            }
            .tabItem { tabLabel(S.tabs.map, .map) }
            .tag(MainTab.map)

            NavigationStack(path: $router.leaguePath) {
                LeagueScreen(app: app).navigationDestination(for: Route.self) { RouteView(route: $0) }
            }
            .tabItem { tabLabel(S.tabs.league, .league) }
            .tag(MainTab.league)

            NavigationStack(path: $router.teamPath) {
                TeamScreen(app: app).navigationDestination(for: Route.self) { RouteView(route: $0) }
            }
            .tabItem { tabLabel(S.tabs.team, .team) }
            .tag(MainTab.team)

            NavigationStack(path: $router.eventsPath) {
                EventsScreen(app: app).navigationDestination(for: Route.self) { RouteView(route: $0) }
            }
            .tabItem { tabLabel(S.tabs.events, .events) }
            .tag(MainTab.events)
        }
        .toolbarBackground(t.c.surf, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .sheet(item: Binding(get: { router.regionCell.map(IdentifiedString.init) }, set: { router.regionCell = $0?.id })) { cell in
            RegionSheet(app: app, cell: cell.id)
                .presentationDetents([.fraction(0.6), .large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(Radii.sheet)
                .presentationBackground(t.c.surf)
                .environment(\.theme, t)
        }
        .sheet(item: Binding(get: { router.shareRunId.map(IdentifiedString.init) }, set: { router.shareRunId = $0?.id })) { run in
            NavigationStack { ShareScreen(app: app, runId: run.id) }.environment(\.theme, t)
        }
        .fullScreenCover(item: $router.cover) { cover in
            CoverView(cover: cover).environment(\.theme, t)
        }
        .task(id: router.runRequest) {
            guard let ctx = router.runRequest else { return }
            router.runRequest = nil
            await env.startRun(ctx)
        }
        .task(id: router.revengeDuelId) {
            await router.resolveRevenge(api: app.api)
        }
        .alert(S.run.noPermission, isPresented: $env.showRunLockedAlert) {
            Button(S.common.cancel, role: .cancel) {}
            Button(S.permissions.openSettings) { env.openSettings() }
        } message: {
            Text(S.map.runLockedBody)
        }
    }

    private func tabLabel(_ title: String, _ icon: IconName) -> some View {
        Label { Text(title) } icon: { Image(uiImage: IconCache.image(icon, size: 24)) }
            .accessibilityLabel(title)
    }
}

struct CoverView: View {
    let cover: Cover
    @Environment(AppModel.self) private var app

    var body: some View {
        switch cover {
        case .run: RunScreen()
        case let .summary(req): NavigationStack { SummaryScreen(app: app, request: req) }
        case let .duelSelect(req): DuelSelectScreen(app: app, request: req)
        }
    }
}

/// Harita yığınındaki ekranlar.
struct RouteView: View {
    let route: Route
    @Environment(AppModel.self) private var app

    var body: some View {
        switch route {
        case let .profile(tab): ProfileScreen(app: app, tab: tab)
        case .settings: SettingsScreen(app: app)
        case .privacy: PrivacyScreen(app: app)
        case .integrations: IntegrationsScreen(app: app)
        case let .badge(id): BadgeDetailScreen(app: app, id: id)
        case .notifications: NotificationsScreen(app: app)
        case let .duel(id): DuelScreen(app: app, id: id)
        }
    }
}

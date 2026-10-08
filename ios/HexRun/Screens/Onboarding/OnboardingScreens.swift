import SwiftUI
import HexRunKit

/// 01 · Üç kelime, üç ekran: Koş. Halkayı kapat. Fethet.
struct OnboardingScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.theme) private var t
    @State private var page = 0

    var body: some View {
        let p = S.onboarding.pages[page]
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(p.kicker).hx(.label, tone: 2)
                Spacer()
                if page < 2 { HXButton(S.common.skip, kind: .ghost) { finish() } }
            }
            .padding(.horizontal, Space.gutter)
            .frame(minHeight: 48)
            OnboardingArt(step: page)
                .frame(maxWidth: .infinity, maxHeight: 400)
                .padding(.horizontal, Space.gutter)
            Spacer(minLength: 12)
            VStack(alignment: .leading, spacing: 12) {
                Text(p.title).hx(.display).accessibilityAddTraits(.isHeader)
                Text(p.body).hx(.body, tone: 2).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { k in
                        RoundedRectangle(cornerRadius: 2).fill(k <= page ? t.c.ink : t.c.track)
                            .frame(maxWidth: k == page ? .infinity : 40, maxHeight: 4)
                    }
                }
                .frame(height: 4)
                .padding(.vertical, 12)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(p.kicker)
                if page < 2 {
                    HXButton(S.common.continue, big: true) { withAnimation { page += 1 } }
                        .accessibilityIdentifier("onboarding-continue")
                } else {
                    HXButton(S.onboarding.start, big: true) { finish() }
                        .accessibilityIdentifier("onboarding-start")
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 16)
        }
        .background(t.c.bg.ignoresSafeArea())
        .accessibilityIdentifier("onboarding")
    }

    private func finish() { app.prefs.onboardingDone = true }
}

/// Onboarding çizimleri: her ekran bir öncekinin devamı (iz → halka → fetih).
struct OnboardingArt: View {
    let step: Int
    @Environment(\.theme) private var t

    static let loop: [CGPoint] = [
        CGPoint(x: 96, y: 250), CGPoint(x: 84, y: 190), CGPoint(x: 104, y: 132), CGPoint(x: 170, y: 104), CGPoint(x: 246, y: 120),
        CGPoint(x: 276, y: 190), CGPoint(x: 254, y: 262), CGPoint(x: 186, y: 300), CGPoint(x: 128, y: 286),
    ]

    static func inPoly(_ p: CGPoint, _ poly: [CGPoint]) -> Bool {
        var c = false
        var j = poly.count - 1
        for i in 0..<poly.count {
            let a = poly[i], b = poly[j]
            if (a.y > p.y) != (b.y > p.y), p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x { c.toggle() }
            j = i
        }
        return c
    }

    var body: some View {
        let own = t.player(.keh)
        Canvas { ctx, size in
            let s = min(size.width, size.height) / 360
            ctx.translateBy(x: (size.width - 360 * s) / 2, y: (size.height - 360 * s) / 2)
            ctx.scaleBy(x: s, y: s)
            let R: CGFloat = 11
            let dx = R * 3.0.squareRoot(), dy = R * 1.5
            var grid = Path(), cells = Path()
            for r in 0..<24 {
                for q in 0..<14 {
                    let x = CGFloat(q) * dx + (r % 2 == 1 ? dx / 2 : 0)
                    let y = CGFloat(r) * dy
                    let a = R * 3.0.squareRoot() / 2, b = R / 2
                    var h = Path()
                    h.move(to: CGPoint(x: x, y: y - R))
                    h.addLine(to: CGPoint(x: x + a, y: y - b))
                    h.addLine(to: CGPoint(x: x + a, y: y + b))
                    h.addLine(to: CGPoint(x: x, y: y + R))
                    h.addLine(to: CGPoint(x: x - a, y: y + b))
                    h.addLine(to: CGPoint(x: x - a, y: y - b))
                    h.closeSubpath()
                    grid.addPath(h)
                    if step == 2, Self.inPoly(CGPoint(x: x, y: y), Self.loop) { cells.addPath(h) }
                }
            }
            ctx.stroke(grid, with: .color(t.c.tex), lineWidth: 1)
            if step == 2 {
                ctx.fill(cells, with: .color(own.opacity(t.cellFillOpacity)))
                ctx.stroke(cells, with: .color(t.c.casing.opacity(0.6)), lineWidth: 1)
            }
            var loopPath = Path()
            loopPath.addLines(Self.loop)
            loopPath.closeSubpath()
            if step == 1 { ctx.fill(loopPath, with: .color(t.c.ink.opacity(0.08))) }
            var trace = Path()
            if step == 0 { trace.addLines(Array(Self.loop.prefix(6))) } else { trace = loopPath }
            ctx.stroke(trace, with: .color(t.c.ink), style: StrokeStyle(lineWidth: 8, lineCap: .round, lineJoin: .round))
            ctx.stroke(trace, with: .color(t.c.trace), style: StrokeStyle(lineWidth: 3.5, lineCap: .round, lineJoin: .round))
            if step >= 1 {
                ctx.stroke(Path(ellipseIn: CGRect(x: 70, y: 224, width: 52, height: 52)), with: .color(t.c.ink), lineWidth: 1.5)
                ctx.stroke(Path(ellipseIn: CGRect(x: 76, y: 230, width: 40, height: 40)), with: .color(t.c.ink), lineWidth: 1.5)
            }
            var tri = Path()
            tri.addLines([CGPoint(x: 96, y: 238), CGPoint(x: 107, y: 257), CGPoint(x: 85, y: 257)])
            tri.closeSubpath()
            ctx.fill(tri, with: .color(t.c.ink))
        }
        .accessibilityHidden(true)
    }
}

/// İzinler: sistem penceresinden önce gerekçe. Konum reddedilirse uygulama yine açılır ama koşu kilitli kalır.
struct PermissionsScreen: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppModel.self) private var app
    @Environment(\.theme) private var t

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(S.permissions.title).hx(.title1).accessibilityAddTraits(.isHeader)
            Text(S.permissions.body).hx(.body, tone: 2)
            permCard(.locate, S.permissions.location, S.permissions.locationWhy, status: locationStatus) {
                if app.location == .unknown {
                    HXButton(S.permissions.locationAsk) {
                        Task {
                            if env.mock { app.location = .whenInUse } else { app.location = await env.location.requestPermission() }
                        }
                    }
                    .accessibilityIdentifier("perm-location")
                } else if app.location == .denied {
                    HXButton(S.permissions.openSettings, kind: .secondary) { env.openSettings() }
                }
            }
            permCard(.bell, S.permissions.notifications, S.permissions.notificationsWhy, status: app.notifications == .granted ? S.permissions.notificationsGranted : nil) { EmptyView() }
            Spacer()
            if app.notifications != .granted {
                HXButton(S.permissions.notificationsAsk, big: true) {
                    Task {
                        if !env.mock {
                            let ok = await env.push.requestAuthorization()
                            app.notifications = ok ? .granted : .denied
                        }
                        done()
                    }
                }
                HXButton(S.permissions.later, kind: .ghost) { done() }
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("perm-later")
            } else {
                HXButton(S.common.continue, big: true) { done() }
            }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.top, 24)
        .padding(.bottom, 16)
        .background(t.c.bg.ignoresSafeArea())
        .accessibilityIdentifier("permissions")
    }

    private var locationStatus: String? {
        switch app.location {
        case .always: return S.permissions.locationGrantedAlways
        case .whenInUse: return S.permissions.locationGrantedWhenInUse
        case .denied: return S.permissions.locationDenied
        case .unknown: return nil
        }
    }

    private func done() { app.prefs.permissionsDone = true }

    private func permCard<A: View>(_ icon: IconName, _ title: String, _ why: String, status: String?, @ViewBuilder action: () -> A) -> some View {
        let actionView = action()
        return Card {
            HStack(spacing: 12) {
                Icon(icon).frame(width: 40, height: 40).background(Circle().fill(t.c.surf2))
                Text(title).hx(.title2)
            }
            Text(why).hx(.body, tone: 2)
            if let status { Text(status).hx(.data, tone: 2) }
            actionView
        }
    }
}

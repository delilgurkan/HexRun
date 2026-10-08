import AuthenticationServices
import SwiftUI
import UIKit
import HexRunKit

/// Ayarlar: gizlilik, saatler, veri dışa aktarma, hesap silme, yasal bağlantılar.
struct SettingsScreen: View {
    @State private var model: SettingsModel
    @State private var exportURL: URL?
    @State private var confirmDelete = false
    @Environment(AppEnvironment.self) private var env
    @Environment(Router.self) private var router
    @Environment(\.openURL) private var openURL
    @Environment(\.theme) private var t

    init(app: AppModel) { _model = State(initialValue: SettingsModel(app: app)) }

    var body: some View {
        HXScreen(title: S.settings.title) {
            SectionTitle(S.settings.account)
            Card(spacing: 0) {
                item(.eye, S.settings.privacy) { router.push(.privacy) }
                Divider2()
                item(.watch, S.settings.integrations) { router.push(.integrations) }
                Divider2()
                item(.bell, S.settings.notifications) { env.openSettings() }
                Divider2()
                if let url = exportURL {
                    ShareLink(item: url) { row(.share, S.settings.exportDone) }
                } else {
                    item(.share, S.settings.export, busy: model.exporting) { Task { exportURL = await model.export() } }
                        .accessibilityIdentifier("export")
                }
                Divider2()
                item(.back, S.settings.logout) { Task { await model.signOut() } }
                Divider2()
                item(.close, S.settings.delete, danger: true) { confirmDelete = true }
                    .accessibilityIdentifier("delete-account")
            }
            if let e = model.error { Text(e).hx(.callout) }
            SectionTitle(S.settings.legal)
            Card(spacing: 0) {
                item(.chevron, S.settings.terms) { openURL(AppConfig.termsURL) }
                Divider2()
                item(.chevron, S.settings.privacyPolicy) { openURL(AppConfig.privacyURL) }
                Divider2()
                item(.chevron, S.settings.licenses) { openURL(AppConfig.licensesURL) }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(S.settings.mapAttribution).hx(.data, tone: 3)
                Text(S.settings.version(AppConfig.version)).hx(.data, tone: 3)
            }
        }
        .alert(S.settings.deleteConfirmTitle, isPresented: $confirmDelete) {
            Button(S.common.cancel, role: .cancel) {}
            Button(S.settings.deleteConfirm, role: .destructive) { Task { _ = await model.deleteAccount() } }
        } message: { Text(S.settings.deleteConfirmBody) }
        .accessibilityIdentifier("settings")
    }

    private func row(_ icon: IconName, _ label: String, danger: Bool = false) -> some View {
        HStack(spacing: 12) {
            Icon(icon, size: 20, color: danger ? t.c.ink : t.c.ink2)
            Text(label).hx(.callout).underline(danger)
            Spacer()
            Icon(.chevron, size: 18, color: t.c.ink3)
        }
        .frame(minHeight: Target.min + 4)
        .contentShape(Rectangle())
    }

    private func item(_ icon: IconName, _ label: String, danger: Bool = false, busy: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) { row(icon, label, danger: danger) }
            .buttonStyle(PressStyle())
            .disabled(busy)
            .opacity(busy ? 0.6 : 1)
            .accessibilityLabel(label)
    }
}

/// 15A · Gizlilik bölgesi (200–800 m) ve "kim ne görür". Ev konumu sunucuda saklanmaz.
struct PrivacyScreen: View {
    @State private var model: PrivacyModel
    @Environment(AppEnvironment.self) private var env
    @Environment(\.theme) private var t

    init(app: AppModel) { _model = State(initialValue: PrivacyModel(app: app)) }

    var body: some View {
        @Bindable var m = model
        HXScreen(title: S.privacy.title) {
            Card {
                Toggle(isOn: Binding(get: { m.enabled }, set: { v in
                    m.enabled = v
                    Task { await m.save(on: v) }
                })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(S.privacy.zone).hx(.title2)
                        Text(S.privacy.zoneSub).hx(.callout, tone: 2)
                    }
                }
                .tint(t.c.ink)
                .accessibilityLabel(S.privacy.zone)
                if m.enabled {
                    HStack {
                        Text(S.privacy.inside).hx(.data, tone: 2)
                        Spacer()
                        Text(S.privacy.radius(Int(m.radius))).hx(.data)
                    }
                    Slider(value: $m.radius, in: Rules.privacyRadiusMinM...Rules.privacyRadiusMaxM, step: 50) { editing in
                        if !editing { Task { await m.save(on: true) } }
                    }
                    .tint(t.c.ink)
                    .frame(minHeight: Target.min)
                    .accessibilityLabel("\(S.privacy.zone) \(S.privacy.radius(Int(m.radius)))")
                    HXButton(S.privacy.setHome, kind: .secondary, icon: .locate, loading: m.saving) { Task { await m.save(on: true) } }
                }
                if let msg = m.message { Text(msg).hx(.callout) }
            }
            SectionTitle(S.privacy.whoSees)
            Card(spacing: 0) {
                ForEach(Array(S.privacy.rows.enumerated()), id: \.offset) { i, r in
                    if i > 0 { Divider2() }
                    HStack(spacing: 8) {
                        Text(r.k).hx(.callout)
                        Spacer()
                        Text(r.v).font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.ink)
                        if i != 1 { Icon(.lock, size: 16, color: t.c.ink2) }
                    }
                    .frame(minHeight: Target.min)
                }
            }
            Text(S.privacy.footnote).hx(.callout, tone: 3)
        }
        .onAppear { m.currentLocation = { await env.currentLocation() } }
        .accessibilityIdentifier("privacy")
    }
}

/// ASWebAuthenticationSession sunum bağlamı (Strava OAuth).
final class WebAuthContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first?.keyWindow ?? ASPresentationAnchor()
        }
    }
}

@MainActor
enum WebAuth {
    private static let context = WebAuthContext()
    private static var current: ASWebAuthenticationSession?

    /// OAuth sayfasını açar; `hexrun://integrations?...` dönüşünde biter.
    static func open(_ url: URL) async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            let s = ASWebAuthenticationSession(url: url, callbackURLScheme: "hexrun") { _, _ in c.resume() }
            s.presentationContextProvider = context
            s.prefersEphemeralWebBrowserSession = false
            current = s
            if !s.start() { c.resume() }
        }
        current = nil
    }
}

/// 17A · Saat ve uygulamalar: aynı kurallar, 24 saat penceresi, aynı koşu bir kez.
struct IntegrationsScreen: View {
    @State private var model: IntegrationsModel
    @State private var confirm: IntegrationProvider?
    @Environment(\.theme) private var t

    init(app: AppModel) { _model = State(initialValue: IntegrationsModel(app: app)) }

    var body: some View {
        let m = model
        HXScreen(title: S.integrations.title) {
            if m.list.value == nil && !m.list.isFailed {
                Skeleton(height: 240)
            } else if m.list.isFailed {
                StateBlock(title: S.common.genericError, action: S.common.retry) { Task { await m.load() } }
            } else {
                section(S.integrations.watches, IntegrationsModel.watches)
                section(S.integrations.apps, IntegrationsModel.apps)
                Text(S.integrations.rule).hx(.callout, tone: 3)
                if let e = m.error { Text(e).hx(.callout) }
            }
        }
        .task {
            m.openAuth = { url in await WebAuth.open(url) }
            m.deviceName = UIDevice.current.model
            await m.load()
        }
        .confirmationDialog(S.integrations.disconnect, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            Button(S.integrations.disconnect, role: .destructive) { if let p = confirm { Task { await m.disconnect(p) } } }
            Button(S.common.cancel, role: .cancel) {}
        } message: { Text(confirm.flatMap { S.integrations.names[$0] } ?? "") }
        .accessibilityIdentifier("integrations")
    }

    private func section(_ title: String, _ list: [IntegrationProvider]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionTitle(title)
            Card(spacing: 0) {
                ForEach(Array(list.enumerated()), id: \.offset) { i, p in
                    if i > 0 { Divider2() }
                    row(p)
                }
            }
        }
    }

    private func row(_ p: IntegrationProvider) -> some View {
        let m = model
        let connected = m.dto(p)?.connected == true
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Icon(p == .strava || p == .apple_health || p == .health_connect ? .pace : .watch, size: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(S.integrations.names[p] ?? p.rawValue).font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.ink)
                    let sub = m.subtitle(p)
                    if !sub.isEmpty { Text(sub).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2) }
                }
                Spacer()
                if connected {
                    HXButton(S.integrations.connected, kind: .ghost, icon: .check, accessibilityHint: S.integrations.disconnect) { confirm = p }
                } else if m.soon.contains(p) {
                    Text(S.integrations.soon).hx(.label, tone: 3)
                } else {
                    HXButton(S.integrations.connect, kind: .secondary, loading: m.busy == p) { Task { await m.connect(p) } }
                }
            }
            .frame(minHeight: 48)
            if p == .strava, connected, let d = m.dto(p) {
                Toggle(S.integrations.stravaImport, isOn: Binding(get: { d.importEnabled }, set: { v in Task { await m.set(p, importEnabled: v) } }))
                    .font(HXFont.font(.archivo, .medium, 15)).tint(t.c.ink).padding(.leading, 34).frame(minHeight: Target.min)
                Toggle(S.integrations.stravaExport, isOn: Binding(get: { d.exportEnabled }, set: { v in Task { await m.set(p, exportEnabled: v) } }))
                    .font(HXFont.font(.archivo, .medium, 15)).tint(t.c.ink).padding(.leading, 34).frame(minHeight: Target.min)
            }
        }
        .padding(.vertical, 4)
        .accessibilityIdentifier("integration-\(p.rawValue)")
    }
}

/// 18A · Fethi paylaş: 9:16 kart (`ImageRenderer`) ve sistem paylaşım sayfası (`ShareLink`).
struct ShareScreen: View {
    @State private var model: ShareModel
    @State private var dark = true
    @Environment(\.theme) private var t
    @Environment(\.dismiss) private var dismiss

    init(app: AppModel, runId: String) { _model = State(initialValue: ShareModel(app: app, runId: runId)) }

    var body: some View {
        HXScreen(title: S.share.title, onBack: { dismiss() }) {
            if let card = model.card.value, let image = render(card) {
                ShareLink(item: image, preview: SharePreview(S.share.title, image: image)) {
                    HStack(spacing: 8) {
                        Icon(.share, size: 20, color: t.c.invInk)
                        Text(S.share.share).font(HXFont.font(.archivo, .black, 17)).tracking(1).foregroundStyle(t.c.invInk)
                    }
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(RoundedRectangle(cornerRadius: Radii.cta, style: .continuous).fill(t.c.inv))
                }
                .accessibilityIdentifier("share-btn")
            }
        } content: {
            Segmented(options: [(true, S.share.dark), (false, S.share.light)], value: $dark)
            if let card = model.card.value {
                StoryCard(card: card, dark: dark, width: 270).frame(maxWidth: .infinity)
            } else if model.card.isFailed {
                StateBlock(title: S.common.genericError, action: S.common.retry) { Task { await model.load() } }
            } else {
                Skeleton(width: 270, height: 480).frame(maxWidth: .infinity)
            }
            Text(S.share.privacyNote).hx(.callout, tone: 3)
        }
        .task { await model.load() }
    }

    @MainActor private func render(_ card: ShareCard) -> Image? {
        let r = ImageRenderer(content: StoryCard(card: card, dark: dark, width: 360))
        r.scale = 3 // 1080 × 1920
        guard let ui = r.uiImage else { return nil }
        return Image(uiImage: ui)
    }
}

/// 9:16 hikâye kartı: yalnız petek silüeti ve m²; harita, rota, rakip adı yok.
struct StoryCard: View {
    let card: ShareCard
    let dark: Bool
    let width: CGFloat

    var body: some View {
        let theme = Theme(isDark: dark)
        let c = theme.c
        let h = (width * 16 / 9).rounded()
        VStack(alignment: .leading) {
            HStack {
                Text("hexrun").font(HXFont.font(.archivo, .black, 22)).foregroundStyle(c.ink)
                Spacer()
                Text(card.dateLabel).font(HXFont.font(.mono, .medium, 13)).foregroundStyle(c.ink2)
            }
            Spacer()
            SilhouetteView(rings: card.silhouette, color: theme.player(card.slot), stroke: c.casing)
                .frame(width: width - 64, height: h * 0.38)
                .frame(maxWidth: .infinity)
            Spacer()
            VStack(alignment: .leading, spacing: 6) {
                Text(card.kicker).font(HXFont.font(.archivo, .semibold, 12)).tracking(0.6).textCase(.uppercase).foregroundStyle(c.ink2)
                Text("+\(Fmt.area(card.gainedAreaM2))").font(HXFont.font(.archivo, .black, 44)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(c.ink)
                Text(card.line).font(HXFont.font(.archivo, .medium, 15)).foregroundStyle(c.ink)
                Text(ShareModel.metricsLine(card)).font(HXFont.font(.mono, .medium, 13)).foregroundStyle(c.ink2)
                Text(ShareModel.userLine(card)).font(HXFont.font(.mono, .medium, 13)).foregroundStyle(c.ink2)
            }
        }
        .padding(24)
        .frame(width: width, height: h)
        .background(RoundedRectangle(cornerRadius: Radii.l, style: .continuous).fill(c.bg))
        .environment(\.theme, theme)
        .dynamicTypeSize(.large)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("story-card")
    }
}

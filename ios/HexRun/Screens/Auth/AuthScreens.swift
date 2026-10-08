import AuthenticationServices
import GoogleSignIn
import SwiftUI
import UIKit
import HexRunKit

struct AuthFlow: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        NavigationStack { AuthScreen(app: app) }
    }
}

/// 02 · Kayıt / giriş: iOS'ta Apple en üstte, sonra Google; e-posta kodu her yerde.
struct AuthScreen: View {
    @State private var model: SocialAuthModel
    @State private var showEmail = false
    @State private var alert: String?
    @Environment(\.theme) private var t
    @Environment(\.openURL) private var openURL
    @Environment(AppModel.self) private var app

    init(app: AppModel) { _model = State(initialValue: SocialAuthModel(app: app)) }

    var body: some View {
        ZStack {
            t.c.bg.ignoresSafeArea()
            HexTexture()
            VStack(alignment: .leading) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("hexrun").font(HXFont.font(.archivo, .black, 64)).tracking(1).foregroundStyle(t.c.ink).accessibilityAddTraits(.isHeader)
                    Text(S.auth.tagline).hx(.title2)
                }
                .padding(.top, 48)
                Spacer()
                VStack(spacing: 12) {
                    SignInWithAppleButton(.continue) { req in
                        req.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        handleApple(result)
                    }
                    .signInWithAppleButtonStyle(t.isDark ? .white : .black)
                    .frame(height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: Radii.cta, style: .continuous))
                    .accessibilityIdentifier("auth-apple")

                    HXButton(S.auth.google, kind: .secondary, big: true, loading: model.busy == .google) { signInGoogle() }
                        .accessibilityIdentifier("auth-google")
                    HXButton(S.auth.email, kind: .secondary, big: true) { showEmail = true }
                        .accessibilityIdentifier("auth-email")
                    HStack(spacing: 4) {
                        Text(S.auth.haveAccount).hx(.callout, tone: 2)
                        Button(S.auth.login) { showEmail = true }
                            .font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.ink)
                            .frame(minHeight: Target.min)
                    }
                    legal
                }
                .padding(.bottom, 16)
            }
            .padding(.horizontal, Space.gutter)
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(isPresented: $showEmail) { EmailScreen(app: app) }
        .alert(S.common.genericError, isPresented: Binding(get: { alert != nil || model.error != nil }, set: { if !$0 { alert = nil; model.error = nil } })) {
            Button(S.common.done, role: .cancel) {}
        } message: {
            Text(alert ?? model.error ?? "")
        }
        .accessibilityIdentifier("auth")
    }

    private var legal: some View {
        var s = AttributedString(S.auth.legalPre)
        var terms = AttributedString(S.auth.terms)
        terms.link = AppConfig.termsURL
        terms.underlineStyle = .single
        var privacy = AttributedString(S.auth.privacy)
        privacy.link = AppConfig.privacyURL
        privacy.underlineStyle = .single
        s += terms
        s += AttributedString(S.auth.legalMid)
        s += privacy
        s += AttributedString(S.auth.legalPost)
        return Text(s).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2).multilineTextAlignment(.center).tint(t.c.ink)
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case let .success(auth):
            guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                  let data = cred.identityToken, let token = String(data: data, encoding: .utf8) else {
                alert = S.common.genericError
                return
            }
            var name: String?
            if let n = cred.fullName {
                let f = PersonNameComponentsFormatter().string(from: n)
                name = f.isEmpty ? nil : f
            }
            Task { await model.apple(identityToken: token, fullName: name) }
        case let .failure(e):
            if (e as? ASAuthorizationError)?.code != .canceled { alert = S.common.genericError }
        }
    }

    private func signInGoogle() {
        guard AppConfig.googleClientId != nil else { alert = S.auth.googleMissing; return }
        guard let root = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first?.keyWindow?.rootViewController else { return }
        var top = root
        while let p = top.presentedViewController { top = p }
        GIDSignIn.sharedInstance.signIn(withPresenting: top) { result, error in
            guard error == nil, let token = result?.user.idToken?.tokenString else { return }
            Task { @MainActor in await model.google(idToken: token) }
        }
    }
}

/// E-posta ile tek kullanımlık kod (şifresiz) giriş.
struct EmailScreen: View {
    @State private var model: EmailAuthModel
    @FocusState private var codeFocused: Bool
    @Environment(\.theme) private var t

    init(app: AppModel) { _model = State(initialValue: EmailAuthModel(app: app)) }

    var body: some View {
        @Bindable var m = model
        HXScreen(title: m.step == .email ? S.auth.emailTitle : S.auth.codeTitle, large: true,
                 onBack: m.step == .code ? { m.step = .email } : nil, footer: {
            if m.step == .email {
                HXButton(S.auth.sendCode, big: true, loading: m.busy, disabled: m.email.isEmpty) { Task { await m.send() } }
                    .accessibilityIdentifier("email-send")
            } else {
                HXButton(S.auth.verify, big: true, loading: m.busy, disabled: !m.canVerify) { Task { await m.verify() } }
                    .accessibilityIdentifier("email-verify")
                HXButton(S.auth.resend, kind: .ghost) { Task { await m.send() } }
            }
        }) {
            if m.step == .email {
                Text(S.auth.emailBody).hx(.body, tone: 2)
                HXTextField(placeholder: S.auth.emailPlaceholder, text: $m.email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.send)
                    .onSubmit { Task { await m.send() } }
                    .accessibilityIdentifier("email-input")
            } else {
                Text(S.auth.codeBody(m.email.trimmingCharacters(in: .whitespaces))).hx(.body, tone: 2)
                TextField("", text: $m.code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(HXFont.font(.mono, .medium, 28))
                    .tracking(10)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(t.c.ink)
                    .frame(minHeight: 60)
                    .background(RoundedRectangle(cornerRadius: Radii.s).fill(t.c.surf))
                    .overlay(RoundedRectangle(cornerRadius: Radii.s).stroke(t.c.line2, lineWidth: 1))
                    .focused($codeFocused)
                    .accessibilityLabel(S.auth.codeTitle)
                    .accessibilityIdentifier("code-input")
                    .onAppear { codeFocused = true }
                if let d = m.devCode { Text(S.auth.devCode(d)).hx(.data, tone: 3) }
            }
            if let e = m.error {
                Text(e).hx(.callout).accessibilityIdentifier("auth-error")
            }
        }
    }
}

/// Profil kurulumu: kullanıcı adı + imza rengi (paletten) + komşu kuralı.
struct ProfileSetupScreen: View {
    @State private var model: ProfileSetupModel
    @Environment(\.theme) private var t

    init(app: AppModel) { _model = State(initialValue: ProfileSetupModel(app: app)) }

    var body: some View {
        @Bindable var m = model
        HXScreen(title: S.profileSetup.title, large: true, showBack: false, footer: {
            HXButton(S.profileSetup.submit, big: true, loading: m.busy, disabled: !m.ok) { Task { await m.submit() } }
                .accessibilityIdentifier("profile-submit")
        }) {
            SectionTitle(S.profileSetup.username)
            HStack {
                Text("@").hx(.title2, tone: 3)
                TextField("", text: $m.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(HXFont.font(.archivo, .medium, 17))
                    .foregroundStyle(t.c.ink)
                    .accessibilityLabel(S.profileSetup.username)
                    .accessibilityIdentifier("username-input")
            }
            .padding(.horizontal, 14)
            .frame(minHeight: Target.min + 8)
            .background(RoundedRectangle(cornerRadius: Radii.s).fill(t.c.surf))
            .overlay(RoundedRectangle(cornerRadius: Radii.s).stroke(t.c.line2, lineWidth: 1))
            if let h = m.hint {
                Text(h).hx(.callout, tone: m.ok ? 1 : 2).accessibilityIdentifier("username-hint")
            }
            SectionTitle(S.profileSetup.displayName)
            HXTextField(placeholder: S.profileSetup.displayName, text: $m.displayName)
            SectionTitle(S.profileSetup.color)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 12)], spacing: 12) {
                ForEach(Slot.allCases, id: \.self) { s in
                    let sel = s == m.slot
                    Button { m.slot = s } label: {
                        VStack(spacing: 4) {
                            Circle().fill(t.player(s)).frame(width: 52, height: 52)
                                .overlay(Circle().stroke(sel ? t.c.ink : t.c.line, lineWidth: sel ? 3 : 1))
                            Text(Palette.info(s).name).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(sel ? t.c.ink : t.c.ink2)
                        }
                        .frame(minWidth: 72, minHeight: Target.min)
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityLabel(Palette.info(s).name)
                    .accessibilityAddTraits(sel ? [.isSelected, .isButton] : .isButton)
                    .accessibilityIdentifier("swatch-\(s.rawValue)")
                }
            }
            HStack(spacing: 12) {
                PlayerBadge(slot: m.slot, initials: m.previewInitials, size: 44, ring: true)
                Text(m.neighborRule).hx(.body, tone: 2).fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("neighbor-rule")
            }
            .padding(.top, 8)
            if let e = m.error { Text(e).hx(.callout) }
        }
    }
}

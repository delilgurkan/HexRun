import Foundation
import Observation

/// E-posta ile tek kullanımlık kod (şifresiz) giriş.
@MainActor
@Observable
public final class EmailAuthModel {
    public enum Step: Sendable { case email, code }
    public var email = ""
    public var code = "" {
        didSet {
            let digits = String(code.filter(\.isNumber).prefix(6))
            if digits != code { code = digits }
        }
    }
    public var step: Step = .email
    public var busy = false
    public var error: String?
    public var devCode: String?
    @ObservationIgnored private let app: AppModel

    public init(app: AppModel) { self.app = app }

    static let emailRegex = try! NSRegularExpression(pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$")

    public static func isValidEmail(_ e: String) -> Bool {
        emailRegex.firstMatch(in: e, range: NSRange(e.startIndex..., in: e)) != nil
    }

    var normalized: String { email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
    public var canSend: Bool { !email.isEmpty && !busy }
    public var canVerify: Bool { code.count >= 4 && !busy }

    public func send() async {
        let e = normalized
        guard Self.isValidEmail(e) else { error = S.auth.invalidEmail; return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let r = try await app.api.emailStart(e)
            devCode = r.devCode
            if let c = r.devCode { code = c }
            step = .code
        } catch {
            self.error = errorText(error)
        }
    }

    /// Başarılıysa true (gezinme oturum durumundan gelir).
    @discardableResult
    public func verify() async -> Bool {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let res = try await app.api.emailVerify(normalized, code: code.trimmingCharacters(in: .whitespaces))
            await app.completeSignIn(res)
            return true
        } catch {
            self.error = errorText(error)
            return false
        }
    }
}

/// Sosyal giriş (Apple, Google) sonuçlarını sunucuya iletir.
@MainActor
@Observable
public final class SocialAuthModel {
    public enum Provider: Sendable { case apple, google }
    public var busy: Provider?
    public var error: String?
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel) { self.app = app }

    public func apple(identityToken: String, fullName: String?) async {
        busy = .apple
        defer { busy = nil }
        do { await app.completeSignIn(try await app.api.apple(identityToken: identityToken, fullName: fullName)) } catch { self.error = errorText(error) }
    }

    public func google(idToken: String) async {
        busy = .google
        defer { busy = nil }
        do { await app.completeSignIn(try await app.api.google(idToken: idToken)) } catch { self.error = errorText(error) }
    }
}

/// Profil kurulumu: kullanıcı adı (uygunluk), görünen ad, imza rengi + komşu kuralı.
@MainActor
@Observable
public final class ProfileSetupModel {
    public var username = "" {
        didSet {
            let low = username.lowercased()
            if low != username { username = low; return }
            scheduleCheck()
        }
    }
    public var displayName = ""
    public var slot: Slot = .keh
    public private(set) var availability: UsernameAvailability?
    public private(set) var checking = false
    public var busy = false
    public var error: String?
    @ObservationIgnored private let app: AppModel
    @ObservationIgnored private let debouncer: Debouncer
    @ObservationIgnored private var checked = ""

    static let usernameRegex = try! NSRegularExpression(pattern: "^[a-z0-9_]{3,20}$")

    public static func isValidUsername(_ s: String) -> Bool {
        usernameRegex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    public init(app: AppModel, debounceMs: UInt64 = 350) {
        self.app = app
        debouncer = Debouncer(ms: debounceMs)
        if let me = app.me {
            username = me.username
            displayName = me.displayName
            slot = me.slot
        }
    }

    var name: String { username.trimmingCharacters(in: .whitespaces).lowercased() }
    var mine: Bool { app.me?.username == name }

    private func scheduleCheck() {
        let n = name
        availability = nil
        guard Self.isValidUsername(n), !mine else { checking = false; return }
        checking = true
        debouncer.run { [weak self] in await self?.check(n) }
    }

    func check(_ n: String) async {
        let r = try? await app.api.username(n)
        guard n == name else { return }
        availability = r
        checked = n
        checking = false
    }

    public var ok: Bool {
        Self.isValidUsername(name) && (mine || (availability?.available == true && checked == name))
    }

    public var hint: String? {
        if !username.isEmpty, !Self.isValidUsername(name) { return S.profileSetup.invalid }
        if checking { return S.profileSetup.checking }
        if ok { return S.profileSetup.available }
        if let a = availability, !a.available {
            switch a.reason {
            case .reserved: return S.profileSetup.reserved
            case .invalid: return S.profileSetup.invalid
            default: return S.profileSetup.taken
            }
        }
        return nil
    }

    public var colorName: String { Palette.info(slot).name }
    public var neighborRule: String { S.profileSetup.neighborRule(colorName) }
    public var previewInitials: String { Fmt.initials(displayName.isEmpty ? (username.isEmpty ? "H R" : username) : displayName) }

    @discardableResult
    public func submit() async -> Bool {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let dn = displayName.trimmingCharacters(in: .whitespaces)
            let updated = try await app.api.updateMe(UpdateMeRequest(username: name, displayName: dn.isEmpty ? nil : dn, slot: slot))
            app.me = updated
            app.prefs.needsProfile = false
            return true
        } catch {
            self.error = errorText(error)
            return false
        }
    }
}

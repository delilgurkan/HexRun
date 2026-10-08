import Foundation

/// Derleme yapılandırması (`Config/*.xcconfig` → Info.plist).
enum AppConfig {
    static func string(_ key: String) -> String? {
        guard let v = Bundle.main.object(forInfoDictionaryKey: key) as? String, !v.isEmpty, !v.hasPrefix("$(") else { return nil }
        return v
    }

    static var apiBaseURL: URL { URL(string: string("API_BASE_URL") ?? "https://api.hexrun.co")! }

    /// Ücretsiz, OSM tabanlı vektör stil (OpenFreeMap) varsayılan.
    static func mapStyleURL(dark: Bool) -> URL {
        let light = string("MAP_STYLE_URL") ?? "https://tiles.openfreemap.org/styles/positron"
        let d = string("MAP_STYLE_URL_DARK") ?? "https://tiles.openfreemap.org/styles/dark"
        return URL(string: dark ? d : light)!
    }

    static var googleClientId: String? { string("GIDClientID") }
    static let termsURL = URL(string: "https://hexrun.co/kosullar")!
    static let privacyURL = URL(string: "https://hexrun.co/gizlilik")!
    static let licensesURL = URL(string: "https://hexrun.co/lisanslar")!

    static var version: String { (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0.0" }

    /// UI testleri: sahte sunucu, bellek içi depolar, simüle konum.
    static var uiTestMockAPI: Bool { ProcessInfo.processInfo.arguments.contains("-uiTestMockAPI") }
}

import Foundation

/// Uygulama içi API hatası. `status` 0 → ağ hatası / zaman aşımı.
public struct ApiError: Error, LocalizedError, Sendable, Equatable {
    public var status: Int
    public var code: String
    /// Sunucunun Türkçe, gösterilebilir mesajı.
    public var message: String
    public var details: JSONValue?

    public init(status: Int, code: String, message: String, details: JSONValue? = nil) {
        self.status = status
        self.code = code
        self.message = message
        self.details = details
    }

    public var errorDescription: String? { message }

    /// Bağlantı yok ya da zaman aşımı: tekrar denenebilir.
    public var isNetwork: Bool { status == 0 }

    /// Geçici hata: ağ, 408, 429, 5xx.
    public var isRetryable: Bool { status == 0 || status == 408 || status == 429 || status >= 500 }

    public static func from(status: Int, body: Data?) -> ApiError {
        if let body, let b = try? JSONDecoder().decode(ApiErrorBody.self, from: body) {
            return ApiError(status: status, code: b.error.code, message: b.error.message ?? b.error.code, details: b.error.details)
        }
        return ApiError(status: status, code: "http_\(status)", message: "HTTP \(status)")
    }

    public static let network = ApiError(status: 0, code: "network", message: "Bağlantı kurulamadı.")
    public static let timeout = ApiError(status: 0, code: "timeout", message: "İstek zaman aşımına uğradı.")
    public static let cancelled = ApiError(status: 0, code: "aborted", message: "İstek iptal edildi.")
    public static let badJSON = ApiError(status: -1, code: "bad_json", message: "Sunucu yanıtı okunamadı.")
}

/// Kullanıcıya gösterilecek metin: sunucunun Türkçe mesajı, yoksa yerel karşılık.
public func errorText(_ error: Error?) -> String {
    guard let e = error as? ApiError else { return S.common.genericError }
    if e.code == "not_configured" { return "Yakında" }
    if !e.message.isEmpty, !e.message.hasPrefix("HTTP ") { return e.message }
    return errorFallback[e.code] ?? S.common.genericError
}

let errorFallback: [String: String] = [
    "duel_limit": "Aynı anda en çok 3 düellon olabilir.",
    "duel_overlap": "Bu peteklerin bir kısmı zaten düellonda.",
    "duel_size": "Düello alanı 7–60 petek olmalı.",
    "duel_not_connected": "Seçtiğin petekler tek parça olmalı.",
    "duel_mixed_owner": "Yalnız tek bir sahibin petekleri seçilebilir.",
    "duel_not_owned": "Bu petekler artık o oyuncunun değil.",
    "duel_self": "Kendi alanına düello açamazsın.",
    "insignia_daily_limit": "Bugünkü değişiklik hakkını kullandın.",
    "insignia_running": "Koşu sırasında nişan değiştirilemez.",
    "not_earned": "Bu rozeti henüz kazanmadın.",
    "not_insignia": "Bu rozet nişan olarak takılmaz.",
    "shield_weekly_limit": "Kalkanı bu hafta kullandın.",
    "username_taken": "Bu ad alınmış",
    "username_invalid": "3–20 karakter: küçük harf, rakam, alt çizgi",
    "username_reserved": "Bu ad kullanılamaz",
    "rate_limited": "Çok hızlı gittin; biraz sonra tekrar dene.",
    "network": "Bağlantı kurulamadı.",
    "timeout": "Bağlantı kurulamadı.",
]

package co.hexrun.core.api

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Uygulama içi API hatası. `status` 0 → ağ hatası / zaman aşımı.
 * `message` sunucunun Türkçe, gösterilebilir mesajıdır.
 */
class ApiError(
    val status: Int,
    val code: String,
    override val message: String,
    cause: Throwable? = null,
) : Exception(message, cause) {
    /** Bağlantı yok ya da zaman aşımı: tekrar denenebilir. */
    val isNetwork: Boolean get() = status == 0

    /** Geçici hata: ağ, 408, 429, 5xx. */
    val isRetryable: Boolean get() = status == 0 || status == 408 || status == 429 || status >= 500

    override fun toString(): String = "ApiError($status, $code, $message)"

    companion object {
        fun network(cause: Throwable? = null) = ApiError(0, "network", "Bağlantı kurulamadı.", cause)
        fun timeout(cause: Throwable? = null) = ApiError(0, "timeout", "İstek zaman aşımına uğradı.", cause)

        fun fromBody(status: Int, body: String?, json: Json = HexJson): ApiError {
            val obj = runCatching { body?.let { json.parseToJsonElement(it).jsonObject } }.getOrNull()
            val err = (obj?.get("error") as? JsonObject)
            val code = err?.get("code")?.jsonPrimitive?.contentOrNull
            if (code != null) {
                val msg = err["message"]?.jsonPrimitive?.contentOrNull ?: code
                return ApiError(status, code, msg)
            }
            return ApiError(status, "http_$status", "HTTP $status")
        }
    }
}

/**
 * Kullanıcıya gösterilecek metin. Sunucu mesajı her zaman Türkçe ve gösterilebilir;
 * yalnız mesajsız ya da istemcinin özel davrandığı kodlar eşlenir (mobile/src/api/errorText.ts).
 */
object ErrorText {
    const val GENERIC = "Bir şeyler ters gitti. Tekrar dene."

    private val FALLBACK = mapOf(
        "duel_limit" to "Aynı anda en çok 3 düellon olabilir.",
        "duel_overlap" to "Bu peteklerin bir kısmı zaten düellonda.",
        "duel_size" to "Düello alanı 7–60 petek olmalı.",
        "duel_not_connected" to "Seçtiğin petekler tek parça olmalı.",
        "duel_mixed_owner" to "Yalnız tek bir sahibin petekleri seçilebilir.",
        "duel_not_owned" to "Bu petekler artık o oyuncunun değil.",
        "duel_self" to "Kendi alanına düello açamazsın.",
        "insignia_daily_limit" to "Bugünkü değişiklik hakkını kullandın.",
        "insignia_running" to "Koşu sırasında nişan değiştirilemez.",
        "not_earned" to "Bu rozeti henüz kazanmadın.",
        "not_insignia" to "Bu rozet nişan olarak takılmaz.",
        "shield_weekly_limit" to "Kalkanı bu hafta kullandın.",
        "username_taken" to "Bu ad alınmış",
        "username_invalid" to "3–20 karakter: küçük harf, rakam, alt çizgi",
        "username_reserved" to "Bu ad kullanılamaz",
        "rate_limited" to "Çok hızlı gittin; biraz sonra tekrar dene.",
        "not_configured" to "Yakında",
        "network" to "Bağlantı kurulamadı.",
        "timeout" to "Bağlantı kurulamadı.",
    )

    private val HTTP = Regex("^HTTP \\d+$")

    fun of(e: Throwable?): String {
        if (e is ApiError) {
            if (e.code == "not_configured") return FALLBACK.getValue("not_configured")
            if (e.message.isNotEmpty() && !HTTP.matches(e.message)) return e.message
            return FALLBACK[e.code] ?: GENERIC
        }
        return GENERIC
    }
}

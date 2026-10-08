package co.hexrun.core.wear

import co.hexrun.core.api.HexJson
import kotlinx.serialization.Serializable

/**
 * Telefon → saat canlı HUD sözleşmesi (Wearable Data Layer API).
 * Telefon her saniye (ve olaylarda) [WearRunState]'i `DataItem` olarak `/hexrun/run` yoluna
 * yazar; fetih ve kapanış olayları ayrıca `MessageClient` ile `/hexrun/event` yoluna gider
 * (bilekte haptik için). Saat bağımsız kayıt yapmaz.
 */
object WearProtocol {
    const val PATH_RUN = "/hexrun/run"
    const val PATH_EVENT = "/hexrun/event"
    const val KEY_STATE = "state"
    const val CAPABILITY = "hexrun_wear"

    fun encode(s: WearRunState): String = HexJson.encodeToString(WearRunState.serializer(), s)
    fun decode(s: String): WearRunState? = runCatching { HexJson.decodeFromString(WearRunState.serializer(), s) }.getOrNull()
    fun encodeEvent(e: WearEvent): ByteArray = HexJson.encodeToString(WearEvent.serializer(), e).toByteArray(Charsets.UTF_8)
    fun decodeEvent(b: ByteArray): WearEvent? = runCatching { HexJson.decodeFromString(WearEvent.serializer(), String(b, Charsets.UTF_8)) }.getOrNull()
}

@Serializable
data class WearRunState(
    /** idle | running | paused */
    val status: String = "idle",
    val distanceM: Double = 0.0,
    val elapsedMs: Long = 0,
    val paceSecPerKm: Double? = null,
    val distToStartM: Double = 0.0,
    val closingMode: Boolean = false,
    /** Düello alanı kapsaması (saldırı koşusunda). */
    val duelName: String? = null,
    val duelInside: Int = 0,
    val duelTotal: Int = 0,
    /** Rakip alanın rotası (km) — "2,9 / 4,6 km". */
    val routeLengthM: Double? = null,
    /** Kullanıcının oyuncu rengi (ARGB). */
    val color: Long = 0xFFE69F00,
    /** Son fetih (gösterim için). */
    val conquestCells: Int? = null,
    val conquestAreaM2: Double? = null,
    val updatedAt: Long = 0,
)

@Serializable
data class WearEvent(
    /** loop | closing | tick | tick2 */
    val type: String,
    val cells: Int = 0,
    val areaM2: Double = 0.0,
)

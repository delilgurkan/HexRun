package co.hexrun.core

import co.hexrun.core.api.HexJson
import kotlinx.serialization.Serializable

/**
 * Telefon ↔ saat protokolü (docs/NATIVE.md "Telefon ↔ saat protokolü").
 * Telefon koşuyu kaydeder (yetkili kaynak); saat canlı gösterir ve bilekte titreşir.
 * Wear OS: Wearable Data Layer — durum `DataClient` `/hexrun/hud` (anahtar `json`), olaylar
 * `MessageClient` `/hexrun/event`, saatten komutlar `MessageClient` `/hexrun/command`.
 * Yükler UTF-8 JSON; sürüm alanı yok, bilinmeyen alanlar yok sayılır, eksikler varsayılan alır.
 */
object WatchPayload {
    const val PATH_HUD = "/hexrun/hud"
    const val KEY_JSON = "json"
    const val PATH_EVENT = "/hexrun/event"
    const val PATH_COMMAND = "/hexrun/command"

    fun encodeHud(h: WatchHud): String = HexJson.encodeToString(WatchHud.serializer(), h)
    fun decodeHud(s: String): WatchHud? = runCatching { HexJson.decodeFromString(WatchHud.serializer(), s) }.getOrNull()

    fun encodeEvent(e: WatchEvent): ByteArray = HexJson.encodeToString(WatchEvent.serializer(), e).toByteArray(Charsets.UTF_8)
    fun decodeEvent(b: ByteArray): WatchEvent? = runCatching { HexJson.decodeFromString(WatchEvent.serializer(), String(b, Charsets.UTF_8)) }.getOrNull()

    fun encodeCommand(c: WatchCommand): ByteArray = HexJson.encodeToString(WatchCommand.serializer(), c).toByteArray(Charsets.UTF_8)
    fun decodeCommand(b: ByteArray): WatchCommand? = runCatching { HexJson.decodeFromString(WatchCommand.serializer(), String(b, Charsets.UTF_8)) }.getOrNull()
        ?.takeIf { it.type == "command" && it.action in WatchCommand.ACTIONS }
}

/** Saatte gösterilen düello kapsaması ("22/34 petek dolaşıldı"). */
@Serializable
data class WatchDuel(val opponent: String = "", val coveredCells: Int = 0, val totalCells: Int = 0)

/** Telefon → saat sürekli durum (en son durum kazanır). */
@Serializable
data class WatchHud(
    val type: String = "hud",
    /** idle | running | paused | finished */
    val state: String = "idle",
    val distanceM: Double = 0.0,
    val durationMs: Long = 0,
    val paceSecPerKm: Double? = null,
    val distToStartM: Double = 0.0,
    val armed: Boolean = false,
    val closingMode: Boolean = false,
    /** Aktif etkinlik kimlikleri: morning | blitz | evening */
    val events: List<String> = emptyList(),
    val duel: WatchDuel? = null,
    val ts: Long = 0,
)

/** Telefon → saat anlık olay: `tick` (yaklaşma tık), `conquest`, `loop_open`. */
@Serializable
data class WatchEvent(
    val type: String,
    val cells: Int = 0,
    val areaM2: Double = 0.0,
    val captured: Int = 0,
) {
    companion object {
        val TICK = WatchEvent("tick")
        val LOOP_OPEN = WatchEvent("loop_open")
        fun conquest(cells: Int, areaM2: Double, captured: Int) = WatchEvent("conquest", cells, areaM2, captured)
    }
}

/** Saat → telefon komut. `finish` yalnız saatte 1,5 sn basılı tutunca gönderilir. */
@Serializable
data class WatchCommand(val type: String = "command", val action: String) {
    companion object {
        val ACTIONS = setOf("pause", "resume", "finish")
    }
}

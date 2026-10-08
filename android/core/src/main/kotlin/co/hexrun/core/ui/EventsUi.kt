package co.hexrun.core.ui

import co.hexrun.core.api.ActiveEvent
import co.hexrun.core.events.EventId
import co.hexrun.core.events.Events
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S

/** Etkinlik listesi ve etiketleri (mobile/src/lib/events.ts). */
object EventsUi {
    /** "güç 2x · saldırı 2x" */
    fun shortLabel(events: List<ActiveEvent>): String =
        events.joinToString(" · ") { "${S.events.moves[it.move] ?: it.move} ${Format.multiplier(it.multiplier)}" }

    fun names(events: List<ActiveEvent>): String? = if (events.isEmpty()) null else events.joinToString(" + ") { it.name }

    /**
     * Sunucu verisi varsa onu (katılımcı sayısı, metin), yoksa çekirdek kurallardan yerel hesap.
     * Sayaçlar her zaman yerel saatle (Europe/Istanbul) hesaplanır.
     */
    fun resolve(server: List<ActiveEvent>?, now: Long = System.currentTimeMillis()): List<ActiveEvent> =
        EventId.entries.map { id ->
            val w = Events.window(id, now)
            val s = server?.firstOrNull { it.id == id.wire }
            val e = Events.ALL.getValue(id)
            ActiveEvent(
                id = id.wire,
                name = s?.name?.takeIf { it.isNotEmpty() } ?: e.name,
                move = e.move.wire,
                multiplier = s?.multiplier ?: e.multiplier,
                window = s?.window?.takeIf { it.isNotEmpty() } ?: e.window,
                description = s?.description?.takeIf { it.isNotEmpty() } ?: e.description,
                active = w.active,
                endsInMin = w.endsInMin,
                startsInMin = w.startsInMin,
                participantsToday = s?.participantsToday ?: 0,
            )
        }

    fun activeNow(now: Long = System.currentTimeMillis()): List<ActiveEvent> = resolve(null, now).filter { it.active }

    /** Bitiş saati "20:59" gibi (bitişten bir dakika önce: pencerenin son dakikası). */
    fun endsAtLabel(endsInMin: Int?, now: Long = System.currentTimeMillis()): String? {
        if (endsInMin == null) return null
        return Dates.hhmm(now + endsInMin * 60_000L - 60_000L)
    }

    data class Hm(val h: Int, val m: Int)

    fun hm(min: Int) = Hm(min / 60, min % 60)
}

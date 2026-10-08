package co.hexrun.core.events

import co.hexrun.core.Rules
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId

/** Zaman çarpanları (packages/core/src/events.ts). Her çarpan farklı hamleye; üst üste binmez. */
enum class EventId(val wire: String) {
    MORNING("morning"), BLITZ("blitz"), EVENING("evening");

    companion object {
        fun of(s: String): EventId? = entries.firstOrNull { it.wire == s }
    }
}

enum class MoveKind(val wire: String) { GAIN("gain"), ATTACK("attack"), PUSHBACK("pushback") }

data class GameEvent(
    val id: EventId,
    val name: String,
    val move: MoveKind,
    val multiplier: Double,
    val window: String,
    val description: String,
)

data class EventWindow(val active: Boolean, val endsInMin: Int?, val startsInMin: Int)

object Events {
    val ZONE: ZoneId = ZoneId.of(Rules.TIMEZONE)

    val ALL: Map<EventId, GameEvent> = linkedMapOf(
        EventId.MORNING to GameEvent(EventId.MORNING, "Sabah Avantajı", MoveKind.GAIN, 2.0, "06:00–09:00", "Nerede koşarsan koş, halkadan kendi peteklerine 2x güç."),
        EventId.BLITZ to GameEvent(EventId.BLITZ, "Hafta Sonu Blitz", MoveKind.ATTACK, 2.0, "Cmt–Paz", "Hafta sonu düello saldırıları 2x."),
        EventId.EVENING to GameEvent(EventId.EVENING, "Akşam Savunması", MoveKind.PUSHBACK, 1.5, "18:00–21:00", "Sahibin halkası saldırganları 1,5x geri iter."),
    )

    private fun isOn(id: EventId, ms: Long, zone: ZoneId): Boolean {
        val lt = Instant.ofEpochMilli(ms).atZone(zone)
        val h = lt.hour
        return when (id) {
            EventId.MORNING -> h in 6..8
            EventId.BLITZ -> lt.dayOfWeek == DayOfWeek.SATURDAY || lt.dayOfWeek == DayOfWeek.SUNDAY
            EventId.EVENING -> h in 18..20
        }
    }

    fun active(ms: Long, zone: ZoneId = ZONE): List<GameEvent> =
        EventId.entries.filter { isOn(it, ms, zone) }.map { ALL.getValue(it) }

    fun multiplier(move: MoveKind, ms: Long, zone: ZoneId = ZONE): Double =
        active(ms, zone).firstOrNull { it.move == move }?.multiplier ?: 1.0

    /** Bir sonraki başlangıç ve aktifse bitiş (dakika adımlı tarama, en çok 8 gün). */
    fun window(id: EventId, ms: Long, zone: ZoneId = ZONE): EventWindow {
        val step = 60_000L
        val limit = 8 * 24 * 60
        val active = isOn(id, ms, zone)
        var t = ms
        var n = 0
        return if (active) {
            while (isOn(id, t, zone) && n < limit) { t += step; n++ }
            EventWindow(true, n, 0)
        } else {
            while (!isOn(id, t, zone) && n < limit) { t += step; n++ }
            EventWindow(false, null, n)
        }
    }
}

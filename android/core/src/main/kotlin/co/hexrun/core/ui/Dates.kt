package co.hexrun.core.ui

import co.hexrun.core.events.Events
import java.time.Instant
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/** Türkçe tarih/saat biçimleri (Europe/Istanbul): "4 Ekim Pazar · 06:29–07:14", "Dün 21:30". */
object Dates {
    val MONTHS = listOf("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")
    val MONTHS_SHORT = listOf("Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara")
    /** 0 = Pazar. */
    val DAYS = listOf("Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi")

    enum class DayGroup { TODAY, YESTERDAY, WEEK, EARLIER }

    /** ISO-8601 dizgesini epoch ms'ye çevirir; çözülemezse null. */
    fun parse(iso: String?): Long? = iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

    private fun z(ms: Long): ZonedDateTime = Instant.ofEpochMilli(ms).atZone(Events.ZONE)

    private fun p2(n: Int) = n.toString().padStart(2, '0')

    fun hhmm(ms: Long): String = z(ms).let { "${p2(it.hour)}:${p2(it.minute)}" }
    fun hhmm(iso: String): String = parse(iso)?.let { hhmm(it) } ?: "—"

    /** "4 Ekim Pazar" */
    fun dayLabel(ms: Long): String = z(ms).let { "${it.dayOfMonth} ${MONTHS[it.monthValue - 1]} ${DAYS[it.dayOfWeek.value % 7]}" }

    /** "4 Ekim Pazar · 06:29–07:14" */
    fun runRangeLabel(start: String, end: String): String {
        val s = parse(start) ?: return ""
        val e = parse(end) ?: s
        return "${dayLabel(s)} · ${hhmm(s)}–${hhmm(e)}"
    }

    /** "4 EKİM 2026" */
    fun shareDateLabel(ms: Long): String = z(ms).let { "${it.dayOfMonth} ${MONTHS[it.monthValue - 1].uppercase(java.util.Locale.forLanguageTag("tr-TR"))} ${it.year}" }

    fun monthName(ms: Long): String = MONTHS[z(ms).monthValue - 1]
    fun monthName(iso: String): String = parse(iso)?.let { monthName(it) } ?: ""

    /** "11 Eyl" */
    fun shortDate(ms: Long): String = z(ms).let { "${it.dayOfMonth} ${MONTHS_SHORT[it.monthValue - 1]}" }
    fun shortDate(iso: String): String = parse(iso)?.let { shortDate(it) } ?: ""

    private fun localDay(ms: Long): LocalDate = z(ms).toLocalDate()

    fun dayGroup(ms: Long, now: Long = System.currentTimeMillis()): DayGroup {
        val diff = ChronoUnit.DAYS.between(localDay(ms), localDay(now))
        return when {
            diff <= 0 -> DayGroup.TODAY
            diff == 1L -> DayGroup.YESTERDAY
            diff < 7 -> DayGroup.WEEK
            else -> DayGroup.EARLIER
        }
    }

    fun dayGroup(iso: String, now: Long = System.currentTimeMillis()): DayGroup = parse(iso)?.let { dayGroup(it, now) } ?: DayGroup.EARLIER

    /** "Bugün 06:52", "Dün 21:30", "11 Eyl" */
    fun relativeLabel(ms: Long, now: Long = System.currentTimeMillis()): String = when (dayGroup(ms, now)) {
        DayGroup.TODAY -> "Bugün ${hhmm(ms)}"
        DayGroup.YESTERDAY -> "Dün ${hhmm(ms)}"
        else -> shortDate(ms)
    }

    fun relativeLabel(iso: String, now: Long = System.currentTimeMillis()): String = parse(iso)?.let { relativeLabel(it, now) } ?: ""

    fun minutesAgo(at: Long, now: Long = System.currentTimeMillis()): Int = maxOf(0L, co.hexrun.core.jsRound((now - at) / 60_000.0).toLong()).toInt()
}

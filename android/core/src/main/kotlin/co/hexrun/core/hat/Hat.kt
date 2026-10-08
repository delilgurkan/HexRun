package co.hexrun.core.hat

import kotlin.math.max
import kotlin.math.min

/** Bir Hat segmentinin doluluk yüzdeleri (0–100). */
data class HatSegment(val owner: Double, val siege: Double, val ghost: Double)

/**
 * Hat göstergesi: 10 segment = 10'ar puan (packages/core/src/hat.ts). Sahibin gücü düz dolgu,
 * en önde giden saldırganın ilerlemesi taralı, son 7 günde eriyen güç soluk "hayalet".
 * `ghostTo` hayaletin uzandığı mutlak güç düzeyidir (güç + eriyen).
 */
object Hat {
    const val SEGMENTS = 10

    private fun clamp(x: Double) = max(0.0, min(100.0, if (x.isNaN()) 0.0 else x))
    private fun fill(x: Double, i: Int) = max(0.0, min(10.0, x - i * 10)) * 10

    fun segments(power: Double, progress: Double = 0.0, ghostTo: Double = 0.0): List<HatSegment> {
        val p = clamp(power)
        val s = clamp(progress)
        val g = clamp(ghostTo)
        return List(SEGMENTS) { i -> HatSegment(fill(p, i), fill(s, i), fill(g, i)) }
    }

    /** Düello canı = güç − ilerleme. */
    fun duelHp(power: Double, progress: Double?): Int = max(0.0, co.hexrun.core.jsRound(power - (progress ?: 0.0))).toInt()

    enum class SiegeLevel { NONE, WARN, ALARM }

    fun siegeLevel(power: Double, progress: Double?): SiegeLevel {
        if (progress == null || progress == 0.0 || power <= 0) return SiegeLevel.NONE
        val r = progress / power
        return when {
            r >= co.hexrun.core.Rules.SIEGE_ALARM -> SiegeLevel.ALARM
            r >= co.hexrun.core.Rules.SIEGE_WARN -> SiegeLevel.WARN
            else -> SiegeLevel.NONE
        }
    }

    /** Barın yanındaki sayı: "60/85", "72 (−9)", "85". */
    fun label(power: Double, progress: Double?, ghost: Double?): String {
        val p = co.hexrun.core.jsRound(power).toLong()
        if (progress != null && progress > 0) return "${co.hexrun.core.jsRound(progress).toLong()}/$p"
        if (ghost != null && ghost > 0) return "$p (−${co.hexrun.core.jsRound(ghost).toLong()})"
        return "$p"
    }

    /** Ekran okuyucu metni. */
    fun a11y(power: Double, progress: Double?, ghost: Double?): String {
        val parts = mutableListOf("Güç ${co.hexrun.core.jsRound(power).toLong()}")
        if (progress != null && progress > 0) parts.add("saldırı ilerlemesi ${co.hexrun.core.jsRound(progress).toLong()}, düello canı ${duelHp(power, progress)}")
        if (ghost != null && ghost > 0) parts.add("son 7 günde ${co.hexrun.core.jsRound(ghost).toLong()} eridi")
        return parts.joinToString(", ")
    }
}

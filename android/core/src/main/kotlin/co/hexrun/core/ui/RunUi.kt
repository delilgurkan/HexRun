package co.hexrun.core.ui

import co.hexrun.core.Rules
import co.hexrun.core.api.DuelHitDto
import co.hexrun.core.api.Me
import co.hexrun.core.api.RunSummary
import co.hexrun.core.geo.LatLng
import kotlin.math.cos
import kotlin.math.min

/** Koşu özeti varyantı: önce toprak, sonra fitness (mobile/src/screens/run/SummaryView.tsx). */
enum class SummaryVariant { CLOSED, OPEN, SUGGESTION, REVIEW }

object RunUi {
    fun summaryVariant(s: RunSummary): SummaryVariant {
        if (s.status == "review") return SummaryVariant.REVIEW
        val gained = s.loops.any { it.status == "applied" && (it.newCells > 0 || it.capturedCells > 0 || it.reinforced > 0) }
        if (s.suggestions.isNotEmpty() && s.loops.none { it.capturedCells > 0 }) return SummaryVariant.SUGGESTION
        if (s.status == "open" || (!gained && s.loops.isEmpty())) return SummaryVariant.OPEN
        return SummaryVariant.CLOSED
    }

    fun wonHits(s: RunSummary): List<DuelHitDto> = s.loops.flatMap { it.hits }.filter { it.role == "attack" && it.captured }

    /** Nişan ve çaylak kurallarına göre halka seçenekleri. */
    fun loopOptionsFor(me: Me?): Pair<Double, Double> {
        val master = me?.insignia?.contains("halka-ustasi") == true
        val newbie = (me?.newbieDaysLeft ?: 0) > 0
        return (if (master) Rules.LOOP_CLOSE_M_MASTER else Rules.LOOP_CLOSE_M) to
            (if (newbie) Rules.MIN_LOOP_LENGTH_M_NEWBIE else Rules.MIN_LOOP_LENGTH_M)
    }

    enum class GpsQuality { SEARCHING, WEAK, STRONG }

    fun gpsQuality(acc: Double?): GpsQuality = when {
        acc == null -> GpsQuality.STRONG
        acc <= 20 -> GpsQuality.STRONG
        acc <= 50 -> GpsQuality.WEAK
        else -> GpsQuality.SEARCHING
    }
}

/**
 * Bölge silüetleri: yerel düzleme izdüşüm (harita yok, yalnız biçim). Çıktı: her halka için
 * (x, y) piksel noktaları; ölçek kutuya sığar ve ortalanır.
 */
object Silhouette {
    fun project(rings: List<List<LatLng>>, w: Float, h: Float, pad: Float = 8f): List<List<Pair<Float, Float>>> {
        val pts = rings.flatten()
        if (pts.isEmpty()) return emptyList()
        val lat0 = pts.sumOf { it.lat } / pts.size
        val k = cos(lat0 * Math.PI / 180)
        val xs = pts.map { it.lng * k }
        val ys = pts.map { -it.lat }
        val minX = xs.min(); val maxX = xs.max(); val minY = ys.min(); val maxY = ys.max()
        val sw = (maxX - minX).takeIf { it != 0.0 } ?: 1e-9
        val sh = (maxY - minY).takeIf { it != 0.0 } ?: 1e-9
        val s = min((w - pad * 2) / sw, (h - pad * 2) / sh)
        val ox = (w - sw * s) / 2
        val oy = (h - sh * s) / 2
        return rings.filter { it.size >= 3 }.map { r ->
            r.map { p -> (ox + (p.lng * k - minX) * s).toFloat() to (oy + (-p.lat - minY) * s).toFloat() }
        }
    }
}

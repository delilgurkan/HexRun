package co.hexrun.core.geo

import kotlinx.serialization.Serializable
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

/** Enlem/boylam (derece). */
@Serializable
data class LatLng(val lat: Double, val lng: Double)

/** GPS noktası: `t` epoch ms, `acc` yatay doğruluk (m) — bilinmiyorsa null. */
@Serializable
data class TrackPoint(val lat: Double, val lng: Double, val t: Long, val acc: Double? = null) {
    val latLng: LatLng get() = LatLng(lat, lng)
}

/**
 * Küresel geometri yardımcıları (WGS84 küre yaklaşımı). packages/core/src/geo.ts ile aynı
 * formüller ve aynı işlem sırası: sonuçlar test vektörleriyle bit düzeyine yakın eşleşir.
 */
object Geo {
    const val R = 6_371_008.8

    private fun toRad(d: Double) = d * PI / 180.0

    fun haversineM(aLat: Double, aLng: Double, bLat: Double, bLng: Double): Double {
        val dLat = toRad(bLat - aLat)
        val dLng = toRad(bLng - aLng)
        val s1 = sin(dLat / 2)
        val s2 = sin(dLng / 2)
        val s = s1 * s1 + cos(toRad(aLat)) * cos(toRad(bLat)) * (s2 * s2)
        return 2 * R * asin(min(1.0, sqrt(s)))
    }

    fun haversineM(a: LatLng, b: LatLng): Double = haversineM(a.lat, a.lng, b.lat, b.lng)
    fun haversineM(a: TrackPoint, b: TrackPoint): Double = haversineM(a.lat, a.lng, b.lat, b.lng)

    fun pathLengthM(points: List<LatLng>): Double {
        var d = 0.0
        for (i in 1 until points.size) d += haversineM(points[i - 1], points[i])
        return d
    }

    /** Noktayı yön (derece, kuzeyden saat yönünde) ve mesafe ile taşır. */
    fun destination(p: LatLng, bearingDeg: Double, distM: Double): LatLng {
        val delta = distM / R
        val theta = toRad(bearingDeg)
        val phi1 = toRad(p.lat)
        val lambda1 = toRad(p.lng)
        val phi2 = asin(sin(phi1) * cos(delta) + cos(phi1) * sin(delta) * cos(theta))
        val lambda2 = lambda1 + atan2(sin(theta) * sin(delta) * cos(phi1), cos(delta) - sin(phi1) * sin(phi2))
        // JS: ((x + 540) % 360) - 180 — `%` işaret korur, Kotlin `rem` ile aynı.
        return LatLng(phi2 * 180 / PI, ((lambda2 * 180 / PI + 540) % 360) - 180)
    }

    /** Küçük poligonlar için yerel düzlem yaklaşımıyla alan (m²). */
    fun polygonAreaM2(ring: List<LatLng>): Double {
        if (ring.size < 3) return 0.0
        val lat0 = toRad(ring[0].lat)
        val kx = cos(lat0) * R
        var s = 0.0
        var j = ring.size - 1
        for (i in ring.indices) {
            val xi = toRad(ring[i].lng) * kx
            val yi = toRad(ring[i].lat) * R
            val xj = toRad(ring[j].lng) * kx
            val yj = toRad(ring[j].lat) * R
            s += xj * yi - xi * yj
            j = i
        }
        return kotlin.math.abs(s / 2)
    }

    /** Dairesel halka (testler ve öneri rotaları için): merkezin güneyinden saat yönünde tam tur. */
    fun circleTrack(center: LatLng, radiusM: Double, n: Int, t0: Long, speedMps: Double): List<TrackPoint> {
        val step = (2 * PI * radiusM) / n
        return (0..n).map { i ->
            val p = destination(center, 180.0 + (360.0 * i) / n, radiusM)
            TrackPoint(p.lat, p.lng, t0 + co.hexrun.core.jsRound(((i * step) / speedMps) * 1000).roundToLong(), 5.0)
        }
    }

    /** Başlangıçtaki yakalama halkası (daire çokgeni). */
    fun circle(center: LatLng, radiusM: Double, steps: Int = 48): List<LatLng> =
        (0..steps).map { i -> destination(center, (360.0 * i) / steps, radiusM) }

    /** Başlangıç üçgeni (oryantiring işareti). */
    fun triangle(center: LatLng, sizeM: Double = 14.0): List<LatLng> =
        listOf(0.0, 120.0, 240.0, 0.0).map { b -> destination(center, b, sizeM) }
}

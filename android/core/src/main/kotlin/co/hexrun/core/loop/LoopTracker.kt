package co.hexrun.core.loop

import co.hexrun.core.Rules
import co.hexrun.core.geo.Geo
import co.hexrun.core.geo.LatLng
import co.hexrun.core.geo.TrackPoint

data class LoopOptions(
    /** Yakalama yarıçapı (m): 50, Halka Ustası ile 60. */
    val closeRadiusM: Double = Rules.LOOP_CLOSE_M,
    /** Asgari halka çevresi (m). */
    val minLoopLengthM: Double = Rules.MIN_LOOP_LENGTH_M,
    /** Doğruluğu bundan kötü noktalar yok sayılır (m). */
    val maxAccuracyM: Double = 50.0,
    /** Bundan hızlı ani sıçramalar (m/s) yok sayılır. */
    val maxJumpSpeedMps: Double = 12.0,
)

data class ClosedLoop(
    /** 1'den başlayan sıra. */
    val index: Int,
    /** Halkayı oluşturan noktalar (başlangıca kapatılmış). */
    val ring: List<TrackPoint>,
    val lengthM: Double,
    val areaM2: Double,
    val closedAt: Long,
    val startedAt: Long,
)

data class TrackerState(
    val distanceM: Double,
    val durationMs: Long,
    /** Başlangıç noktasına kuş uçuşu mesafe. */
    val distToStartM: Double,
    /** Halka kuruldu mu (yeterince uzaklaşıldı ve asgari çevre aşıldı). */
    val armed: Boolean,
    /** HUD "halkayı kapat" modu (≤300 m). */
    val closingMode: Boolean,
    /** Ortalama tempo sn/km (yeterli veri yoksa null). */
    val paceSecPerKm: Double?,
    val loops: List<ClosedLoop>,
    val start: TrackPoint?,
)

/**
 * Artımlı halka dedektörü — packages/core/src/loops.ts `LoopTracker` ile birebir aynı algoritma.
 * Sunucu yetkili hesabı aynı kurallarla yapar; HUD bu sınıftan beslenir.
 */
class LoopTracker(opts: LoopOptions = LoopOptions()) {
    private val closeR = opts.closeRadiusM
    private val minLen = opts.minLoopLengthM
    private val maxAcc = opts.maxAccuracyM
    private val maxJump = opts.maxJumpSpeedMps
    private val pts = ArrayList<TrackPoint>()
    private var segStart = 0
    private var segLen = 0.0
    private var maxSegDist = 0.0
    private var dist = 0.0
    private var movingMs = 0L
    private var start: TrackPoint? = null
    private val loops = ArrayList<ClosedLoop>()
    private var lastDistToStart = 0.0
    private var paused = false
    private var resumeGap = false

    /** Duraklatma: duraklatılmış süre/mesafe sayılmaz; devamda sıçrama yok sayılır. */
    fun pause() {
        paused = true
    }

    fun resume() {
        paused = false
        resumeGap = true
    }

    val isPaused: Boolean get() = paused

    /** Yeni GPS noktası. Halka kapandıysa onu döndürür. */
    fun push(p: TrackPoint): ClosedLoop? {
        if (paused) return null
        if (!p.lat.isFinite() || !p.lng.isFinite()) return null
        if (p.acc != null && p.acc > maxAcc) return null
        val prev = pts.lastOrNull()
        if (prev != null) {
            if (p.t <= prev.t) return null
            val d = Geo.haversineM(prev, p)
            val dt = (p.t - prev.t) / 1000.0
            if (d / dt > maxJump) {
                if (!resumeGap) return null
            }
            if (resumeGap) {
                // Duraklatmadan dönüş: arada geçen mesafe/süre koşuya eklenmez.
                resumeGap = false
            } else {
                dist += d
                segLen += d
                movingMs += p.t - prev.t
            }
        } else {
            start = p
        }
        pts.add(p)
        val st = start!!
        val ds = Geo.haversineM(st, p)
        lastDistToStart = ds
        if (ds > maxSegDist) maxSegDist = ds

        if (isArmed() && ds <= closeR) {
            val ring = ArrayList<TrackPoint>(pts.size - segStart + 2)
            ring.addAll(pts.subList(segStart, pts.size))
            val first = ring[0]
            if (first.lat != st.lat || first.lng != st.lng) ring.add(0, st.copy(t = first.t))
            ring.add(st.copy(t = p.t))
            val loop = ClosedLoop(
                index = loops.size + 1,
                ring = ring,
                lengthM = segLen + ds,
                areaM2 = Geo.polygonAreaM2(ring.map { it.latLng }),
                closedAt = p.t,
                startedAt = first.t,
            )
            loops.add(loop)
            segStart = pts.size - 1
            segLen = 0.0
            maxSegDist = ds
            return loop
        }
        return null
    }

    private fun isArmed(): Boolean = maxSegDist > closeR + Rules.LOOP_ARM_EXTRA_M && segLen >= minLen

    fun state(): TrackerState {
        val armed = isArmed()
        return TrackerState(
            distanceM = dist,
            durationMs = movingMs,
            distToStartM = lastDistToStart,
            armed = armed,
            closingMode = armed && lastDistToStart <= Rules.CLOSING_MODE_M,
            paceSecPerKm = if (dist >= 50) movingMs / 1000.0 / (dist / 1000.0) else null,
            loops = loops.toList(),
            start = start,
        )
    }

    /** Halka şu an kapanırsa alınacak önizleme poligonu (başlangıca düz kapatılmış). */
    fun previewRing(): List<LatLng> {
        val st = start ?: return emptyList()
        val out = ArrayList<LatLng>(pts.size - segStart + 2)
        out.add(st.latLng)
        for (i in segStart until pts.size) out.add(pts[i].latLng)
        out.add(st.latLng)
        return out
    }

    fun points(): List<TrackPoint> = pts

    companion object {
        fun detectLoops(points: List<TrackPoint>, opts: LoopOptions = LoopOptions()): List<ClosedLoop> {
            val tr = LoopTracker(opts)
            for (p in points) tr.push(p)
            return tr.state().loops
        }
    }
}

package co.hexrun.core.run

import co.hexrun.core.Rules
import co.hexrun.core.api.HexJson
import co.hexrun.core.api.SubmitRunRequest
import co.hexrun.core.api.TrackPointDto
import co.hexrun.core.geo.LatLng
import co.hexrun.core.geo.TrackPoint
import co.hexrun.core.loop.ClosedLoop
import co.hexrun.core.loop.LoopOptions
import co.hexrun.core.loop.LoopTracker
import co.hexrun.core.loop.TrackerState
import co.hexrun.core.store.AppendLog
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlin.math.max

@Serializable
data class RunContext(
    /** hexrun://run?defend=<duelId> ile açıldıysa. */
    val defendDuelId: String? = null,
    /** Hedeflenen düello (saldırı). */
    val attackDuelId: String? = null,
    /** İlk halka önerisiyle başladıysa. */
    val firstLoop: Boolean = false,
)

@Serializable
data class RunHeader(
    val v: Int = 1,
    val clientRunId: String,
    val startedAt: Long,
    val closeRadiusM: Double,
    val minLoopLengthM: Double,
    val context: RunContext = RunContext(),
)

/**
 * Günlük satırı. `k`: "h" başlık, "p" GPS noktası, "pause", "resume", "shown" (fetih anı
 * gösterilen halka sayısı).
 */
@Serializable
data class JournalLine(
    val k: String,
    val h: RunHeader? = null,
    val p: TrackPoint? = null,
    val t: Long? = null,
    val n: Int? = null,
)

enum class SessionStatus { IDLE, RUNNING, PAUSED, FINISHED }

sealed interface SessionEvent {
    data class Loop(val loop: ClosedLoop) : SessionEvent
    data object ClosingEnter : SessionEvent
    data object ClosingExit : SessionEvent
    data class Tick(val strength: TickStrength) : SessionEvent
}

data class SessionSnapshot(
    val status: SessionStatus,
    val clientRunId: String,
    val startedAt: Long,
    /** Duraklatmalar hariç geçen süre. */
    val elapsedMs: Long,
    val tracker: TrackerState,
    val pointCount: Int,
    val lastPoint: TrackPoint?,
    val closeRadiusM: Double,
    val context: RunContext,
    val loopsShown: Int,
)

class SessionDeps(
    val log: AppendLog,
    val uuid: () -> String,
    val now: () -> Long = System::currentTimeMillis,
    /** Nokta yazma aralığı (ms). 0 → her noktada yaz. Duraklat/devam/halka her zaman hemen yazılır. */
    val persistEveryMs: Long = 5_000,
)

/**
 * Koşu oturumu durum makinesi: idle → running ⇄ paused → finished.
 *
 * Her GPS noktası ve duraklat/devam yalnız sona eklenen bir günlüğe yazılır. Uygulama
 * öldürülürse [restore] günlüğü `LoopTracker`'a yeniden oynatır ve koşu aynen geri gelir
 * (mobile/src/run/session.ts ile aynı davranış). Sınıf tek iş parçacığına bağlı kullanılmalıdır
 * (uygulamada ana iş parçacığı); kalıcı yazmalar bir kilitle sıralanır.
 */
class RunSession private constructor(
    private var header: RunHeader,
    private val deps: SessionDeps,
    initialStatus: SessionStatus,
    replay: List<JournalLine>,
) {
    private val tracker = LoopTracker(LoopOptions(closeRadiusM = header.closeRadiusM, minLoopLengthM = header.minLoopLengthM))
    private var status = initialStatus
    private var pausedMs = 0L
    private var pausedAt: Long? = null
    private var loopsShown = 0
    private var wasClosing = false
    private var lastPersist = 0L
    private val pending = ArrayList<String>()
    private val io = Mutex()
    private val json = HexJson

    init {
        for (e in replay) {
            when (e.k) {
                "p" -> e.p?.let { tracker.push(it) }
                "pause" -> {
                    tracker.pause()
                    pausedAt = e.t
                }
                "resume" -> {
                    tracker.resume()
                    val pa = pausedAt
                    if (pa != null && e.t != null) pausedMs += max(0L, e.t - pa)
                    pausedAt = null
                }
                "shown" -> loopsShown = max(loopsShown, e.n ?: 0)
            }
        }
        wasClosing = tracker.state().closingMode
    }

    val id: String get() = header.clientRunId
    val context: RunContext get() = header.context
    fun status(): SessionStatus = status

    /** Koşuyu başlatır ve başlığı günlüğe yazar. */
    suspend fun start() {
        check(status == SessionStatus.IDLE) { "start: geçersiz durum $status" }
        status = SessionStatus.RUNNING
        header = header.copy(startedAt = deps.now())
        io.withLock {
            deps.log.clear()
            deps.log.append(listOf(json.encodeToString(JournalLine.serializer(), JournalLine("h", h = header))))
        }
        lastPersist = deps.now()
    }

    suspend fun pause() {
        if (status != SessionStatus.RUNNING) return
        val t = deps.now()
        status = SessionStatus.PAUSED
        pausedAt = t
        tracker.pause()
        enqueue(JournalLine("pause", t = t))
        persist(true)
    }

    suspend fun resume() {
        if (status != SessionStatus.PAUSED) return
        val t = deps.now()
        status = SessionStatus.RUNNING
        pausedAt?.let { pausedMs += max(0L, t - it) }
        pausedAt = null
        tracker.resume()
        enqueue(JournalLine("resume", t = t))
        persist(true)
    }

    /** GPS noktalarını işler; halka kapanışı, kapanış modu ve haptik tık olaylarını döner. */
    suspend fun addPoints(points: List<TrackPoint>): List<SessionEvent> {
        if (status != SessionStatus.RUNNING) return emptyList()
        val events = ArrayList<SessionEvent>()
        for (p in points.sortedBy { it.t }) {
            val before = tracker.state()
            val prevLen = tracker.points().size
            val loop = tracker.push(p)
            if (tracker.points().size == prevLen) continue // reddedilen nokta
            enqueue(JournalLine("p", p = p))
            val after = tracker.state()
            if (loop != null) {
                events.add(SessionEvent.Loop(loop))
                wasClosing = false
                continue
            }
            if (after.closingMode && !wasClosing) events.add(SessionEvent.ClosingEnter)
            if (!after.closingMode && wasClosing) events.add(SessionEvent.ClosingExit)
            if (after.closingMode && before.closingMode) {
                for (s in Closing.ticks(before.distToStartM, after.distToStartM, header.closeRadiusM)) events.add(SessionEvent.Tick(s))
            }
            wasClosing = after.closingMode
        }
        persist(events.any { it is SessionEvent.Loop })
        return events
    }

    /** Fetih anı gösterildi (geri yüklemede tekrar gösterilmesin). */
    suspend fun markLoopsShown(n: Int) {
        if (n <= loopsShown) return
        loopsShown = n
        enqueue(JournalLine("shown", n = n))
        persist(true)
    }

    fun snapshot(): SessionSnapshot {
        val now = deps.now()
        val pausedNow = pausedAt?.let { max(0L, now - it) } ?: 0L
        val pts = tracker.points()
        return SessionSnapshot(
            status = status,
            clientRunId = header.clientRunId,
            startedAt = header.startedAt,
            elapsedMs = if (status == SessionStatus.IDLE) 0 else max(0L, now - header.startedAt - pausedMs - pausedNow),
            tracker = tracker.state(),
            pointCount = pts.size,
            lastPoint = pts.lastOrNull(),
            closeRadiusM = header.closeRadiusM,
            context = header.context,
            loopsShown = loopsShown,
        )
    }

    fun previewRing(): List<LatLng> = tracker.previewRing()

    fun points(): List<TrackPoint> = tracker.points()

    /** Koşuyu bitirir: gönderim isteğini döner ve yarım koşu kaydını siler. */
    suspend fun finish(source: String = "phone", device: String? = null): SubmitRunRequest {
        check(status == SessionStatus.RUNNING || status == SessionStatus.PAUSED) { "finish: geçersiz durum $status" }
        if (status == SessionStatus.PAUSED) {
            pausedAt?.let { pausedMs += max(0L, deps.now() - it) }
            pausedAt = null
        }
        status = SessionStatus.FINISHED
        val req = SubmitRunRequest(
            clientRunId = header.clientRunId,
            source = source,
            points = tracker.points().map { TrackPointDto(it.lat, it.lng, it.t, it.acc) },
            device = device,
        )
        io.withLock {
            pending.clear()
            deps.log.clear()
        }
        return req
    }

    /** Koşuyu kaydetmeden atar. */
    suspend fun discard() {
        status = SessionStatus.FINISHED
        io.withLock {
            pending.clear()
            deps.log.clear()
        }
    }

    /** Bekleyen satırları hemen yaz (uygulama arka plana geçerken). */
    suspend fun flush() = persist(true)

    private fun enqueue(line: JournalLine) {
        pending.add(json.encodeToString(JournalLine.serializer(), line))
    }

    private suspend fun persist(force: Boolean) {
        if (status == SessionStatus.IDLE || status == SessionStatus.FINISHED) return
        val now = deps.now()
        if (!force && deps.persistEveryMs > 0 && now - lastPersist < deps.persistEveryMs) return
        lastPersist = now
        if (pending.isEmpty()) return
        val batch = ArrayList(pending)
        pending.clear()
        io.withLock {
            runCatching { deps.log.append(batch) }
        }
    }

    companion object {
        /** Yeni oturum (henüz başlamadı). */
        fun create(
            deps: SessionDeps,
            closeRadiusM: Double = Rules.LOOP_CLOSE_M,
            minLoopLengthM: Double = Rules.MIN_LOOP_LENGTH_M,
            context: RunContext = RunContext(),
        ): RunSession {
            val h = RunHeader(clientRunId = deps.uuid(), startedAt = deps.now(), closeRadiusM = closeRadiusM, minLoopLengthM = minLoopLengthM, context = context)
            return RunSession(h, deps, SessionStatus.IDLE, emptyList())
        }

        /** Kalıcı günlükten yarım kalan koşuyu geri yükler; yoksa null. */
        suspend fun restore(deps: SessionDeps): RunSession? {
            val lines = runCatching { deps.log.readAll() }.getOrDefault(emptyList())
            if (lines.isEmpty()) return null
            val parsed = lines.mapNotNull { runCatching { HexJson.decodeFromString(JournalLine.serializer(), it) }.getOrNull() }
            val header = parsed.firstOrNull { it.k == "h" }?.h ?: return null
            if (header.v != 1 || header.clientRunId.isEmpty()) return null
            val body = parsed.filter { it.k != "h" }
            val lastToggle = body.lastOrNull { it.k == "pause" || it.k == "resume" }
            val status = if (lastToggle?.k == "pause") SessionStatus.PAUSED else SessionStatus.RUNNING
            val s = RunSession(header, deps, status, body)
            s.lastPersist = deps.now()
            return s
        }
    }
}

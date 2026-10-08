package co.hexrun.app.run

import co.hexrun.app.data.MapCache
import co.hexrun.core.WatchCommand
import co.hexrun.core.WatchDuel
import co.hexrun.core.WatchEvent
import co.hexrun.core.WatchHud
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.geo.LatLng
import co.hexrun.core.geo.TrackPoint
import co.hexrun.core.loop.ClosedLoop
import co.hexrun.core.run.RunContext
import co.hexrun.core.run.RunQueue
import co.hexrun.core.run.RunSession
import co.hexrun.core.run.SessionDeps
import co.hexrun.core.run.SessionEvent
import co.hexrun.core.run.SessionSnapshot
import co.hexrun.core.run.SessionStatus
import co.hexrun.core.store.AppendLog
import co.hexrun.core.ui.Conquest
import co.hexrun.core.ui.ConquestPreview
import co.hexrun.core.ui.EventsUi
import co.hexrun.core.ui.RunUi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class ConquestState(val loop: ClosedLoop, val preview: ConquestPreview, val shownAt: Long)

data class RunUiState(
    val active: Boolean = false,
    val snap: SessionSnapshot? = null,
    /** İz (haritada çizgi). */
    val trace: List<TrackPoint> = emptyList(),
    /** Kapanış modunda düz kapatılmış açık halka önizlemesi. */
    val previewRing: List<LatLng>? = null,
    val closingPreview: ConquestPreview? = null,
    val conquest: ConquestState? = null,
    val gps: RunUi.GpsQuality = RunUi.GpsQuality.SEARCHING,
    val locked: Boolean = false,
    val recovered: Boolean = false,
    /** Son bitirilen koşu (özet ekranına geçiş için); okununca temizlenir. */
    val finishedRunId: String? = null,
)

/** Konum servisini açıp kapatır (Android'de ön plan servisi). */
interface LocationControl {
    fun start()
    fun stop()
}

/** Saat köprüsü (Wear OS Data Layer); yoksa no-op. */
interface WatchSink {
    fun publish(hud: WatchHud)
    fun event(e: WatchEvent)
}

/**
 * Koşu modu denetleyicisi: oturum + konum + haptik + saat + gönderim kuyruğu
 * (mobile/src/run/controller.ts). Tüm durum değişiklikleri tek kilitle sıralanır; UI yalnız
 * [state]'i okur.
 */
class RunController(
    private val scope: CoroutineScope,
    private val log: AppendLog,
    private val queue: RunQueue,
    private val api: HexRunApi,
    private val mapCache: MapCache,
    private val haptics: Haptics,
    private val location: LocationControl,
    private val watch: WatchSink,
    private val uuid: () -> String,
    private val now: () -> Long = System::currentTimeMillis,
    private val scheduleUpload: () -> Unit = {},
    private val deviceName: String? = null,
    private val persistEveryMs: Long = 2_000,
) {
    private val _state = MutableStateFlow(RunUiState())
    val state: StateFlow<RunUiState> = _state.asStateFlow()
    private var session: RunSession? = null
    private val lock = Mutex()
    private var ticker: Job? = null
    private var lastWatchPublish = 0L

    val current: RunSession? get() = session

    private fun deps() = SessionDeps(log, uuid, now, persistEveryMs)

    private fun publish(forceWatch: Boolean = false) {
        val s = session
        if (s == null) {
            _state.update { it.copy(active = false, snap = null, trace = emptyList(), previewRing = null, closingPreview = null) }
            watch.publish(WatchHud(state = "idle", ts = now()))
            return
        }
        val snap = s.snapshot()
        val closing = snap.tracker.closingMode && _state.value.conquest == null
        val ring = if (closing) s.previewRing() else null
        val preview = ring?.let {
            // Önizleme her 3 noktada bir yeniden hesaplanır (H3 poligon doldurma).
            val prev = _state.value.closingPreview
            if (prev != null && snap.pointCount % 3 != 0) prev else Conquest.previewOpenRing(it, mapCache.conquestContext())
        }
        _state.update {
            it.copy(
                active = snap.status == SessionStatus.RUNNING || snap.status == SessionStatus.PAUSED,
                snap = snap,
                trace = s.points().toList(),
                previewRing = ring,
                closingPreview = preview,
            )
        }
        val t = now()
        if (forceWatch || t - lastWatchPublish >= 1000) {
            lastWatchPublish = t
            watch.publish(hudOf(snap, preview))
        }
    }

    private fun hudOf(snap: SessionSnapshot, preview: ConquestPreview?): WatchHud {
        val duelId = snap.context.attackDuelId
        val duel = duelId?.let { id -> mapCache.attacking.firstOrNull { it.id == id } }
        val cov = preview?.duels?.firstOrNull { it.duel.id == duelId } ?: preview?.duels?.firstOrNull()
        return WatchHud(
            state = when (snap.status) {
                SessionStatus.RUNNING -> "running"
                SessionStatus.PAUSED -> "paused"
                SessionStatus.FINISHED -> "finished"
                SessionStatus.IDLE -> "idle"
            },
            distanceM = snap.tracker.distanceM,
            durationMs = snap.elapsedMs,
            paceSecPerKm = snap.tracker.paceSecPerKm,
            distToStartM = snap.tracker.distToStartM,
            armed = snap.tracker.armed,
            closingMode = snap.tracker.closingMode,
            events = EventsUi.activeNow(now()).map { it.id },
            duel = when {
                cov != null -> WatchDuel(cov.duel.defender.firstName, cov.inside, cov.total)
                duel != null -> WatchDuel(duel.defender.firstName, 0, duel.cells.size)
                else -> null
            },
            ts = now(),
        )
    }

    private fun attach(s: RunSession) {
        session = s
        publish()
        ticker?.cancel()
        ticker = scope.launch {
            // Saniyelik süre güncellemesi (HUD ve saat).
            while (isActive) {
                delay(1000)
                if (session != null) publish()
            }
        }
    }

    /** Uygulama açılışında (ya da servis yeniden başlatılınca) yarım kalan koşuyu geri yükler. */
    suspend fun recover(): Boolean = lock.withLock {
        if (session != null) return@withLock true
        val s = RunSession.restore(deps()) ?: return@withLock false
        attach(s)
        _state.update { it.copy(recovered = true) }
        scope.launch { runCatching { api.activity(true) } }
        location.start()
        true
    }

    /** Koşuyu başlatır (izin önceden denetlenmiş olmalı). */
    suspend fun start(context: RunContext = RunContext(), closeRadiusM: Double, minLoopLengthM: Double): RunSession = lock.withLock {
        session?.let { if (it.status() != SessionStatus.FINISHED) return@withLock it }
        val s = RunSession.create(deps(), closeRadiusM, minLoopLengthM, context)
        s.start()
        _state.update { RunUiState() }
        attach(s)
        scope.launch { runCatching { api.activity(true) } }
        location.start()
        s
    }

    /** GPS noktaları (konum servisi). */
    fun ingest(points: List<TrackPoint>) {
        if (points.isEmpty()) return
        scope.launch {
            lock.withLock {
                _state.update { it.copy(gps = RunUi.gpsQuality(points.last().acc)) }
                val s = session ?: return@withLock
                val events = s.addPoints(points)
                for (e in events) handle(s, e)
                publish()
            }
        }
    }

    private suspend fun handle(s: RunSession, e: SessionEvent) {
        when (e) {
            is SessionEvent.Tick -> {
                haptics.tick(e.strength)
                watch.event(WatchEvent.TICK)
            }
            is SessionEvent.Loop -> {
                haptics.closeImpact()
                val preview = Conquest.preview(e.loop.ring.map { it.latLng }, mapCache.conquestContext())
                _state.update { it.copy(conquest = ConquestState(e.loop, preview, now())) }
                val captured = preview.duels.sumOf { it.inside }
                watch.event(WatchEvent.conquest(preview.cells.size, preview.areaM2, captured))
                s.markLoopsShown(e.loop.index)
            }
            SessionEvent.ClosingExit -> watch.event(WatchEvent.LOOP_OPEN)
            SessionEvent.ClosingEnter -> Unit
        }
    }

    fun dismissConquest() {
        _state.update { it.copy(conquest = null) }
        scope.launch { lock.withLock { publish() } }
    }

    fun pause() = scope.launch { lock.withLock { session?.pause(); publish(forceWatch = true) } }
    fun resume() = scope.launch { lock.withLock { session?.resume(); publish(forceWatch = true) } }
    fun setLocked(locked: Boolean) = _state.update { it.copy(locked = locked) }
    fun clearRecovered() = _state.update { it.copy(recovered = false) }
    fun consumeFinished() = _state.update { it.copy(finishedRunId = null) }

    /**
     * Saatten gelen komut. Süreç yeni başladıysa önce koşu günlükten geri yüklenir; komuttan
     * hemen sonra güncel HUD yayımlanır.
     */
    fun onWatchCommand(c: WatchCommand) {
        scope.launch {
            if (session == null) recover()
            if (session == null) {
                watch.publish(WatchHud(state = "idle", ts = now()))
                return@launch
            }
            when (c.action) {
                "pause" -> lock.withLock { session?.pause(); publish(forceWatch = true) }
                "resume" -> lock.withLock { session?.resume(); publish(forceWatch = true) }
                "finish" -> finish()
            }
        }
    }

    /** Bitir: kuyruğa koy, göndermeyi dene, oturumu kapat. Gönderilecek koşu yoksa null. */
    suspend fun finish(): String? = lock.withLock {
        val s = session ?: return@withLock null
        location.stop()
        val req = s.finish(device = deviceName)
        session = null
        ticker?.cancel()
        scope.launch { runCatching { api.activity(false) } }
        val id = if (req.points.size >= 2) {
            queue.enqueue(req)
            scope.launch { runCatching { queue.flush() }; scheduleUpload() }
            req.clientRunId
        } else null
        _state.update { RunUiState(finishedRunId = id) }
        watch.publish(WatchHud(state = "finished", ts = now()))
        id
    }

    suspend fun discard() = lock.withLock {
        location.stop()
        session?.discard()
        session = null
        ticker?.cancel()
        scope.launch { runCatching { api.activity(false) } }
        _state.update { RunUiState() }
        watch.publish(WatchHud(state = "idle", ts = now()))
    }

    /** Uygulama arka plana geçerken bekleyen günlük satırlarını yaz. */
    fun flush() {
        scope.launch { session?.flush() }
    }
}

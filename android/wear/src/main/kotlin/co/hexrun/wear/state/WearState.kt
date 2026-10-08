package co.hexrun.wear.state

import co.hexrun.core.Rules
import co.hexrun.core.WatchEvent
import co.hexrun.core.WatchHud
import co.hexrun.core.format.Format
import co.hexrun.core.run.Closing
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.max

/*
 * Saat durum makinesi (saf Kotlin: Android içe aktarımı yok, JVM'de test edilir).
 *
 * Telefon yetkili kaynaktır (docs/NATIVE.md "Telefon ↔ saat protokolü"): saat yalnız son HUD'u,
 * anlık olayları (tık, fetih, halka açık) ve kendi gönderdiği komutun iyimser durumunu tutar.
 * Ekran [WearScreens.of] ile durumdan ve saatten türetilir.
 */

object WearTiming {
    /** Koşu sürerken bu kadar süre telefondan haber gelmezse "Telefonla bağlantı yok". */
    const val STALE_MS = 30_000L
    /** Fetih kartı bu süre sonra kendiliğinden kapanır. */
    const val CONQUEST_MS = 5_000L
    /** Koşuyu bitirmek için basılı tutma süresi. */
    const val FINISH_HOLD_MS = 1_500L
    /** Bundan kısa basış dokunma sayılır (duraklat / devam). */
    const val TAP_MAX_MS = 500L
    /** Telefon komutu bu sürede onaylamazsa iyimser durum geri alınır. */
    const val PENDING_TIMEOUT_MS = 5_000L
}

/** Haptik türleri; desenler Android tarafında titreşime çevrilir. */
enum class Haptic(
    /** VibrationEffect.createWaveform zamanlamaları (ms): bekle, titre, bekle, titre… */
    val pattern: LongArray,
) {
    /** Yaklaşma tıkı (telefondan `tick`). */
    TICK(longArrayOf(0, 25)),
    /** Halka kapanmadan koşu bitti (`loop_open`). */
    LOOP_OPEN(longArrayOf(0, 220, 140, 220)),
    /** Fetih: kısa-kısa-uzun. */
    CONQUEST(longArrayOf(0, 70, 70, 70, 70, 360)),
    /** Duraklat / devam dokunuşu alındı. */
    CONFIRM(longArrayOf(0, 40)),
    /** Basılı tutma tamamlandı: bitir. */
    FINISH(longArrayOf(0, 420)),
    /** Komut telefona ulaşmadı / onaylanmadı. */
    ERROR(longArrayOf(0, 60, 90, 60)),
    ;

    /** Olay kaynaklı mı (arka planda da çalmalı), yoksa dokunuş geri bildirimi mi. */
    val isEvent: Boolean get() = this == TICK || this == LOOP_OPEN || this == CONQUEST
}

/** Saat → telefon komutları (`/hexrun/command`). */
enum class CommandAction(val wire: String) { PAUSE("pause"), RESUME("resume"), FINISH("finish") }

object HudStates {
    const val IDLE = "idle"
    const val RUNNING = "running"
    const val PAUSED = "paused"
    const val FINISHED = "finished"
}

sealed interface WearAction {
    /** Yeni HUD. [live] = dinleyiciden geldi; false = açılışta DataClient'tan okundu (eski olabilir). */
    data class Hud(val hud: WatchHud, val nowMs: Long, val live: Boolean = true) : WearAction
    data class Event(val event: WatchEvent, val nowMs: Long) : WearAction
    /** Saniyelik saat: fetih kartı ve bekleyen komut zaman aşımı. */
    data class Clock(val nowMs: Long) : WearAction
    /** Kısa dokunuş: koşuda duraklat, duraklatılmışta devam, fetih kartında kapat. */
    data class Tap(val nowMs: Long) : WearAction
    /** 1,5 sn basılı tutma tamamlandı (ya da TalkBack "Koşuyu bitir" eylemi). */
    data class FinishHold(val nowMs: Long) : WearAction
    /** Komut hiçbir düğüme gönderilemedi. */
    data class CommandFailed(val action: CommandAction) : WearAction
    data object DismissConquest : WearAction
}

sealed interface WearEffect {
    data class Vibrate(val haptic: Haptic) : WearEffect
    data class Send(val action: CommandAction) : WearEffect
}

data class ConquestShown(val cells: Int, val areaM2: Double, val captured: Int, val shownAtMs: Long)

data class PendingCommand(val action: CommandAction, val sinceMs: Long)

data class WearState(
    val hud: WatchHud? = null,
    /** Son HUD'un alındığı yerel saat (süreyi saniye saniye ilerletmek için). */
    val hudAtMs: Long = 0,
    /** Telefondan son haber (HUD ya da olay) — bağlantı kopukluğu bundan ölçülür. */
    val contactAtMs: Long = 0,
    val conquest: ConquestShown? = null,
    val pending: PendingCommand? = null,
) {
    /** İyimser durum: gönderilen duraklat/devam komutu onaylanana dek hedef durum gösterilir. */
    val effectiveState: String
        get() = when (pending?.action) {
            CommandAction.PAUSE -> HudStates.PAUSED
            CommandAction.RESUME -> HudStates.RUNNING
            else -> hud?.state ?: HudStates.IDLE
        }

    val isActiveRun: Boolean
        get() = hud?.state == HudStates.RUNNING || hud?.state == HudStates.PAUSED
}

data class Reduction(val state: WearState, val effects: List<WearEffect> = emptyList())

object WearReducer {
    fun reduce(s: WearState, a: WearAction): Reduction = when (a) {
        is WearAction.Hud -> onHud(s, a)
        is WearAction.Event -> onEvent(s, a)
        is WearAction.Clock -> onClock(s, a.nowMs)
        is WearAction.Tap -> onTap(s, a.nowMs)
        is WearAction.FinishHold -> onFinish(s, a.nowMs)
        is WearAction.CommandFailed ->
            if (s.pending?.action == a.action) Reduction(s.copy(pending = null), listOf(WearEffect.Vibrate(Haptic.ERROR)))
            else Reduction(s)
        WearAction.DismissConquest -> Reduction(s.copy(conquest = null))
    }

    private fun onHud(s: WearState, a: WearAction.Hud): Reduction {
        val h = a.hud
        if (h.type != "hud") return Reduction(s)
        val cur = s.hud
        // Sıra dışı / yinelenen yük: daha eski zaman damgalı HUD yok sayılır.
        if (cur != null && cur.ts > 0 && h.ts > 0 && h.ts < cur.ts) return Reduction(s)
        if (!a.live && cur != null && h.ts == cur.ts) return Reduction(s)
        // Açılışta okunan öğe eski olabilir: yaşı telefonun zaman damgasından alınır.
        val anchor = if (!a.live && h.ts > 0) minOf(a.nowMs, h.ts) else a.nowMs
        val pending = s.pending?.takeUnless { confirms(it.action, h.state) }
        return Reduction(
            s.copy(
                hud = h,
                hudAtMs = anchor,
                contactAtMs = max(s.contactAtMs, anchor),
                pending = pending,
            ),
        )
    }

    private fun confirms(action: CommandAction, state: String): Boolean = when (action) {
        CommandAction.PAUSE -> state == HudStates.PAUSED || state == HudStates.FINISHED || state == HudStates.IDLE
        CommandAction.RESUME -> state == HudStates.RUNNING || state == HudStates.FINISHED || state == HudStates.IDLE
        CommandAction.FINISH -> state == HudStates.FINISHED || state == HudStates.IDLE
    }

    private fun onEvent(s: WearState, a: WearAction.Event): Reduction {
        val contact = s.copy(contactAtMs = max(s.contactAtMs, a.nowMs))
        val e = a.event
        return when (e.type) {
            "tick" -> Reduction(contact, listOf(WearEffect.Vibrate(Haptic.TICK)))
            "loop_open" -> Reduction(contact, listOf(WearEffect.Vibrate(Haptic.LOOP_OPEN)))
            "conquest" -> Reduction(
                contact.copy(conquest = ConquestShown(max(0, e.cells), max(0.0, e.areaM2), max(0, e.captured), a.nowMs)),
                listOf(WearEffect.Vibrate(Haptic.CONQUEST)),
            )
            else -> Reduction(contact)
        }
    }

    private fun onClock(s: WearState, now: Long): Reduction {
        var next = s
        val fx = mutableListOf<WearEffect>()
        val c = s.conquest
        if (c != null && now - c.shownAtMs >= WearTiming.CONQUEST_MS) next = next.copy(conquest = null)
        val p = s.pending
        if (p != null && now - p.sinceMs >= WearTiming.PENDING_TIMEOUT_MS) {
            next = next.copy(pending = null)
            fx += WearEffect.Vibrate(Haptic.ERROR)
        }
        return Reduction(next, fx)
    }

    private fun onTap(s: WearState, now: Long): Reduction {
        if (s.conquest != null && now - s.conquest.shownAtMs < WearTiming.CONQUEST_MS) {
            return Reduction(s.copy(conquest = null))
        }
        if (s.pending != null) return Reduction(s)
        val action = when (s.hud?.state) {
            HudStates.RUNNING -> CommandAction.PAUSE
            HudStates.PAUSED -> CommandAction.RESUME
            else -> return Reduction(s)
        }
        return Reduction(
            s.copy(pending = PendingCommand(action, now)),
            listOf(WearEffect.Send(action), WearEffect.Vibrate(Haptic.CONFIRM)),
        )
    }

    private fun onFinish(s: WearState, now: Long): Reduction {
        if (!s.isActiveRun || s.pending?.action == CommandAction.FINISH) return Reduction(s)
        return Reduction(
            s.copy(pending = PendingCommand(CommandAction.FINISH, now), conquest = null),
            listOf(WearEffect.Send(CommandAction.FINISH), WearEffect.Vibrate(Haptic.FINISH)),
        )
    }
}

/** Ekran modeli: metinler Android kaynaklarından gelir; burada yalnız biçimlenmiş sayılar var. */
sealed interface WearScreen {
    data object Idle : WearScreen

    data class Run(
        /** "6,12" (km). */
        val distance: String,
        val pace: String,
        val time: String,
        /** Halka kurulduysa başlangıca uzaklık: "1,2 km"; değilse null. */
        val loopOpenAway: String?,
        val a11y: RunA11y,
    ) : WearScreen

    data class Approach(
        /** 5 m'ye yuvarlı kalan mesafe: 85. */
        val remainingM: Int,
        /** 0 → yaklaşma modunun başı (300 m), 1 → yakalama alanı (50 m). */
        val progress: Float,
        val distance: String,
        val time: String,
    ) : WearScreen

    data class Duel(
        val opponent: String,
        val covered: Int,
        val total: Int,
        val progress: Float,
        val distance: String,
        val time: String,
    ) : WearScreen

    data class Paused(val distance: String, val time: String, val pace: String) : WearScreen

    data class Conquest(
        /** "62" */
        val cells: String,
        val cellCount: Int,
        /** "+19.220 m²" */
        val area: String,
        /** Rakipten alınan petek sayısı (0 → boş arazi). */
        val captured: Int,
    ) : WearScreen

    /** Koşu sürüyor ama telefondan haber yok; son bilinen değerler. */
    data class Stale(val distance: String, val time: String) : WearScreen

    data object Finishing : WearScreen

    data class Finished(val distance: String, val time: String) : WearScreen
}

/** TalkBack için sayıların sözel parçaları. */
data class RunA11y(val paceMin: Int?, val paceSec: Int?)

object WearScreens {
    fun of(s: WearState, now: Long): WearScreen {
        s.conquest?.let { c ->
            if (now - c.shownAtMs < WearTiming.CONQUEST_MS) {
                return WearScreen.Conquest(
                    cells = Format.int(c.cells),
                    cellCount = c.cells,
                    area = "+" + Format.area(c.areaM2),
                    captured = c.captured,
                )
            }
        }
        val h = s.hud ?: return WearScreen.Idle
        if (s.pending?.action == CommandAction.FINISH) return WearScreen.Finishing
        val eff = s.effectiveState
        val active = eff == HudStates.RUNNING || eff == HudStates.PAUSED
        val distance = Format.km(h.distanceM)
        if (active && isStale(s, now)) return WearScreen.Stale(distance, Format.duration(h.durationMs))
        val time = Format.duration(displayDurationMs(s, now))
        val duel = h.duel
        return when (eff) {
            HudStates.RUNNING -> when {
                h.closingMode -> {
                    val rem = Closing.remainingM(h.distToStartM)
                    WearScreen.Approach(rem, approachProgress(h.distToStartM), distance, time)
                }
                duel != null && duel.totalCells > 0 -> {
                    val covered = duel.coveredCells.coerceIn(0, duel.totalCells)
                    WearScreen.Duel(duel.opponent, covered, duel.totalCells, covered.toFloat() / duel.totalCells, distance, time)
                }
                else -> WearScreen.Run(
                    distance = distance,
                    pace = Format.pace(h.paceSecPerKm),
                    time = time,
                    loopOpenAway = if (h.armed) Format.shortDistance(max(0.0, h.distToStartM)) else null,
                    a11y = paceA11y(h.paceSecPerKm),
                )
            }
            HudStates.PAUSED -> WearScreen.Paused(distance, time, Format.pace(h.paceSecPerKm))
            HudStates.FINISHED -> WearScreen.Finished(distance, time)
            else -> WearScreen.Idle
        }
    }

    fun isStale(s: WearState, now: Long): Boolean = now - s.contactAtMs > WearTiming.STALE_MS

    /**
     * Koşarken süre, iki HUD arasında yerel saatle ilerletilir (en çok bağlantı eşiği kadar);
     * duraklatılmışken telefonun değeri olduğu gibi gösterilir.
     */
    fun displayDurationMs(s: WearState, now: Long): Long {
        val h = s.hud ?: return 0
        if (h.state != HudStates.RUNNING || s.effectiveState != HudStates.RUNNING) return h.durationMs
        val extra = (now - s.hudAtMs).coerceIn(0, WearTiming.STALE_MS)
        return h.durationMs + extra
    }

    fun approachProgress(distToStartM: Double): Float {
        val rem = Closing.remainingM(distToStartM).toDouble()
        val span = Rules.CLOSING_MODE_M - Rules.LOOP_CLOSE_M
        return ((Rules.CLOSING_MODE_M - rem) / span).coerceIn(0.0, 1.0).toFloat()
    }

    fun paceA11y(secPerKm: Double?): RunA11y {
        if (secPerKm == null || !secPerKm.isFinite() || secPerKm <= 0) return RunA11y(null, null)
        val s = co.hexrun.core.jsRound(secPerKm).toLong()
        return RunA11y((s / 60).toInt(), (s % 60).toInt())
    }

    /** Ekran açık kalsın mı: yaklaşma (halkayı kapat) sırasında bilek her an bakılır. */
    fun keepScreenOn(screen: WearScreen): Boolean = screen is WearScreen.Approach

    /** Dokunuş / basılı tutma hangi ekranlarda anlamlı. */
    fun canTap(screen: WearScreen): Boolean = when (screen) {
        is WearScreen.Run, is WearScreen.Approach, is WearScreen.Duel, is WearScreen.Paused,
        is WearScreen.Conquest, is WearScreen.Stale -> true
        else -> false
    }

    fun canFinish(s: WearState): Boolean = s.isActiveRun && s.pending?.action != CommandAction.FINISH
}

/** Durum tutucu: tek iş parçacıklı olmayan çağrılara (dinleyici servisi + arayüz) karşı kilitli. */
class WearStore(initial: WearState = WearState()) {
    private val lock = Any()
    private val _state = MutableStateFlow(initial)
    val state: StateFlow<WearState> = _state.asStateFlow()

    /** Yan etkiler (titreşim, komut gönderme) burada çalıştırılır; Android tarafı atar. */
    @Volatile
    var effectHandler: (WearEffect) -> Unit = {}

    fun dispatch(action: WearAction): List<WearEffect> {
        val fx = synchronized(lock) {
            val r = WearReducer.reduce(_state.value, action)
            _state.value = r.state
            r.effects
        }
        fx.forEach { effectHandler(it) }
        return fx
    }
}

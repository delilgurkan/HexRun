package co.hexrun.wear.state

import co.hexrun.core.WatchDuel
import co.hexrun.core.WatchEvent
import co.hexrun.core.WatchHud
import co.hexrun.core.WatchPayload
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WearReducerTest {
    private val t0 = 1_791_300_000_000L

    private fun running(
        ts: Long = t0,
        distanceM: Double = 6120.0,
        durationMs: Long = 1_977_000,
        pace: Double? = 323.0,
        distToStartM: Double = 1200.0,
        armed: Boolean = true,
        closingMode: Boolean = false,
        duel: WatchDuel? = null,
        state: String = HudStates.RUNNING,
    ) = WatchHud(
        state = state, distanceM = distanceM, durationMs = durationMs, paceSecPerKm = pace,
        distToStartM = distToStartM, armed = armed, closingMode = closingMode, duel = duel, ts = ts,
    )

    private fun store(vararg actions: WearAction): WearStore = WearStore().also { st -> actions.forEach { st.dispatch(it) } }

    @Test
    fun idleWithoutHud() {
        assertEquals(WearScreen.Idle, WearScreens.of(WearState(), t0))
        val s = store(WearAction.Hud(WatchHud(state = "idle", ts = t0), t0))
        assertEquals(WearScreen.Idle, WearScreens.of(s.state.value, t0 + 60_000))
    }

    @Test
    fun runningHudFormatsDesignValues() {
        val s = store(WearAction.Hud(running(), t0))
        val screen = WearScreens.of(s.state.value, t0) as WearScreen.Run
        assertEquals("6,12", screen.distance)
        assertEquals("5'23\"", screen.pace)
        assertEquals("32:57", screen.time)
        assertEquals("1,2 km", screen.loopOpenAway)
        assertEquals(RunA11y(5, 23), screen.a11y)

        val notArmed = store(WearAction.Hud(running(armed = false), t0))
        assertNull((WearScreens.of(notArmed.state.value, t0) as WearScreen.Run).loopOpenAway)
    }

    @Test
    fun specExampleDecodesToApproach() {
        val json = """{"type":"hud","state":"running","distanceM":6120,"durationMs":1977000,"paceSecPerKm":323,"distToStartM":85,"armed":true,"closingMode":true,"events":["morning","blitz"],"duel":{"opponent":"Zeynep","coveredCells":40,"totalCells":48},"ts":1791300000000}"""
        val hud = WatchPayload.decodeHud(json)!!
        val s = store(WearAction.Hud(hud, t0))
        val a = WearScreens.of(s.state.value, t0) as WearScreen.Approach
        assertEquals(85, a.remainingM)
        // 300 m → 0, 50 m → 1: 85 m = (300 − 85) / 250
        assertEquals(0.86f, a.progress, 0.001f)
        assertEquals("6,12", a.distance)
        assertTrue(WearScreens.keepScreenOn(a))
    }

    @Test
    fun approachProgressClamps() {
        assertEquals(0f, WearScreens.approachProgress(400.0), 0f)
        assertEquals(0f, WearScreens.approachProgress(300.0), 0f)
        assertEquals(1f, WearScreens.approachProgress(50.0), 0f)
        assertEquals(1f, WearScreens.approachProgress(10.0), 0f)
        assertEquals(0.5f, WearScreens.approachProgress(175.0), 0f)
    }

    @Test
    fun duelRing() {
        val s = store(WearAction.Hud(running(duel = WatchDuel("Zeynep", 22, 34)), t0))
        val d = WearScreens.of(s.state.value, t0) as WearScreen.Duel
        assertEquals("Zeynep", d.opponent)
        assertEquals(22, d.covered)
        assertEquals(34, d.total)
        assertEquals(22f / 34f, d.progress, 0.0001f)
        // Kapsama toplamı aşamaz; toplam 0 ise düz koşu ekranı.
        val over = store(WearAction.Hud(running(duel = WatchDuel("Z", 50, 34)), t0))
        assertEquals(1f, (WearScreens.of(over.state.value, t0) as WearScreen.Duel).progress, 0f)
        val empty = store(WearAction.Hud(running(duel = WatchDuel("Z", 0, 0)), t0))
        assertTrue(WearScreens.of(empty.state.value, t0) is WearScreen.Run)
        // Yaklaşma düellodan önce gelir.
        val closing = store(WearAction.Hud(running(duel = WatchDuel("Z", 1, 2), closingMode = true, distToStartM = 85.0), t0))
        assertTrue(WearScreens.of(closing.state.value, t0) is WearScreen.Approach)
    }

    @Test
    fun conquestCardAutoDismissesAfterFiveSeconds() {
        val s = store(WearAction.Hud(running(), t0))
        val fx = s.dispatch(WearAction.Event(WatchEvent.conquest(62, 19220.0, 48), t0 + 1000))
        assertEquals(listOf(WearEffect.Vibrate(Haptic.CONQUEST)), fx)
        val c = WearScreens.of(s.state.value, t0 + 1000) as WearScreen.Conquest
        assertEquals("62", c.cells)
        assertEquals("+19.220 m²", c.area)
        assertEquals(48, c.captured)
        assertTrue(WearScreens.of(s.state.value, t0 + 5999) is WearScreen.Conquest)
        // Saat ilerlemese de türetilmiş ekran kartı gizler; Clock durumu temizler.
        assertTrue(WearScreens.of(s.state.value, t0 + 6000) is WearScreen.Run)
        s.dispatch(WearAction.Clock(t0 + 4000))
        assertTrue(s.state.value.conquest != null)
        s.dispatch(WearAction.Clock(t0 + 6000))
        assertNull(s.state.value.conquest)
    }

    @Test
    fun tapDismissesConquestInsteadOfPausing() {
        val s = store(WearAction.Hud(running(), t0), WearAction.Event(WatchEvent.conquest(3, 900.0, 0), t0))
        val fx = s.dispatch(WearAction.Tap(t0 + 500))
        assertTrue(fx.isEmpty())
        assertNull(s.state.value.conquest)
        assertNull(s.state.value.pending)
    }

    @Test
    fun eventHaptics() {
        val s = store()
        assertEquals(listOf(WearEffect.Vibrate(Haptic.TICK)), s.dispatch(WearAction.Event(WatchEvent.TICK, t0)))
        assertEquals(listOf(WearEffect.Vibrate(Haptic.LOOP_OPEN)), s.dispatch(WearAction.Event(WatchEvent.LOOP_OPEN, t0)))
        assertTrue(s.dispatch(WearAction.Event(WatchEvent("bilinmeyen"), t0)).isEmpty())
        assertTrue(Haptic.TICK.isEvent && !Haptic.CONFIRM.isEvent)
    }

    @Test
    fun tapPausesOptimisticallyUntilPhoneConfirms() {
        val s = store(WearAction.Hud(running(), t0))
        val fx = s.dispatch(WearAction.Tap(t0 + 100))
        assertEquals(listOf(WearEffect.Send(CommandAction.PAUSE), WearEffect.Vibrate(Haptic.CONFIRM)), fx)
        assertEquals(HudStates.PAUSED, s.state.value.effectiveState)
        assertTrue(WearScreens.of(s.state.value, t0 + 100) is WearScreen.Paused)
        // Bekleyen komut varken yeni dokunuş yok sayılır.
        assertTrue(s.dispatch(WearAction.Tap(t0 + 200)).isEmpty())
        // Telefon hâlâ "running" gönderiyor: iyimser durum korunur.
        s.dispatch(WearAction.Hud(running(ts = t0 + 1000), t0 + 1000))
        assertTrue(s.state.value.pending != null)
        s.dispatch(WearAction.Hud(running(ts = t0 + 2000, state = HudStates.PAUSED), t0 + 2000))
        assertNull(s.state.value.pending)
        assertTrue(WearScreens.of(s.state.value, t0 + 2000) is WearScreen.Paused)
        // Duraklatılmışta dokunuş: devam.
        assertEquals(WearEffect.Send(CommandAction.RESUME), s.dispatch(WearAction.Tap(t0 + 3000)).first())
        assertEquals(HudStates.RUNNING, s.state.value.effectiveState)
    }

    @Test
    fun pendingTimesOutAndReverts() {
        val s = store(WearAction.Hud(running(), t0), WearAction.Tap(t0))
        assertTrue(s.dispatch(WearAction.Clock(t0 + 4999)).isEmpty())
        assertEquals(listOf(WearEffect.Vibrate(Haptic.ERROR)), s.dispatch(WearAction.Clock(t0 + 5000)))
        assertNull(s.state.value.pending)
        assertEquals(HudStates.RUNNING, s.state.value.effectiveState)
    }

    @Test
    fun commandFailedReverts() {
        val s = store(WearAction.Hud(running(), t0), WearAction.Tap(t0))
        assertTrue(s.dispatch(WearAction.CommandFailed(CommandAction.RESUME)).isEmpty())
        assertEquals(listOf(WearEffect.Vibrate(Haptic.ERROR)), s.dispatch(WearAction.CommandFailed(CommandAction.PAUSE)))
        assertNull(s.state.value.pending)
    }

    @Test
    fun finishHoldOnlyDuringActiveRun() {
        val idle = store(WearAction.Hud(WatchHud(state = "idle", ts = t0), t0))
        assertTrue(idle.dispatch(WearAction.FinishHold(t0)).isEmpty())
        assertFalse(WearScreens.canFinish(idle.state.value))

        val s = store(WearAction.Hud(running(state = HudStates.PAUSED), t0))
        assertTrue(WearScreens.canFinish(s.state.value))
        assertEquals(
            listOf(WearEffect.Send(CommandAction.FINISH), WearEffect.Vibrate(Haptic.FINISH)),
            s.dispatch(WearAction.FinishHold(t0 + 10)),
        )
        assertEquals(WearScreen.Finishing, WearScreens.of(s.state.value, t0 + 10))
        assertTrue(s.dispatch(WearAction.FinishHold(t0 + 20)).isEmpty())
        s.dispatch(WearAction.Hud(running(ts = t0 + 900, state = HudStates.FINISHED), t0 + 900))
        assertNull(s.state.value.pending)
        val f = WearScreens.of(s.state.value, t0 + 900) as WearScreen.Finished
        assertEquals("6,12", f.distance)
        assertEquals("32:57", f.time)
    }

    @Test
    fun staleAfterThirtySecondsWithoutContact() {
        val s = store(WearAction.Hud(running(), t0))
        assertTrue(WearScreens.of(s.state.value, t0 + 30_000) is WearScreen.Run)
        val stale = WearScreens.of(s.state.value, t0 + 30_001) as WearScreen.Stale
        assertEquals("6,12", stale.distance)
        // Son bilinen süre ilerletilmez.
        assertEquals("32:57", stale.time)
        // Bir olay da bağlantı sayılır.
        s.dispatch(WearAction.Event(WatchEvent.TICK, t0 + 31_000))
        assertTrue(WearScreens.of(s.state.value, t0 + 31_000) is WearScreen.Run)
        // Boşta / bitmişken eskime gösterilmez.
        val done = store(WearAction.Hud(running(state = HudStates.FINISHED), t0))
        assertTrue(WearScreens.of(done.state.value, t0 + 600_000) is WearScreen.Finished)
    }

    @Test
    fun fetchedOldItemIsStaleImmediately() {
        val s = store(WearAction.Hud(running(ts = t0), t0 + 120_000, live = false))
        assertTrue(WearScreens.of(s.state.value, t0 + 120_000) is WearScreen.Stale)
        // Canlı gelen aynı yük ise taze sayılır.
        val live = store(WearAction.Hud(running(ts = t0), t0 + 120_000, live = true))
        assertTrue(WearScreens.of(live.state.value, t0 + 120_000) is WearScreen.Run)
    }

    @Test
    fun outOfOrderHudIgnored() {
        val s = store(WearAction.Hud(running(ts = t0 + 2000, distanceM = 2000.0), t0 + 2000))
        s.dispatch(WearAction.Hud(running(ts = t0 + 1000, distanceM = 1000.0), t0 + 2100))
        assertEquals(2000.0, s.state.value.hud!!.distanceM, 0.0)
        s.dispatch(WearAction.Hud(WatchHud(type = "other", state = "idle", ts = t0 + 3000), t0 + 3000))
        assertEquals(HudStates.RUNNING, s.state.value.hud!!.state)
    }

    @Test
    fun durationTicksLocallyWhileRunning() {
        val s = store(WearAction.Hud(running(durationMs = 60_000), t0))
        assertEquals(63_500, WearScreens.displayDurationMs(s.state.value, t0 + 3500))
        assertEquals("1:03", (WearScreens.of(s.state.value, t0 + 3500) as WearScreen.Run).time)
        val paused = store(WearAction.Hud(running(durationMs = 60_000, state = HudStates.PAUSED), t0))
        assertEquals(60_000, WearScreens.displayDurationMs(paused.state.value, t0 + 3500))
        // İyimser duraklatmada saat durur.
        s.dispatch(WearAction.Tap(t0 + 4000))
        assertEquals(60_000, WearScreens.displayDurationMs(s.state.value, t0 + 4500))
    }

    @Test
    fun missingPaceShowsPlaceholder() {
        val s = store(WearAction.Hud(running(pace = null), t0))
        val r = WearScreens.of(s.state.value, t0) as WearScreen.Run
        assertEquals("–'––\"", r.pace)
        assertEquals(RunA11y(null, null), r.a11y)
    }

    @Test
    fun effectHandlerReceivesEffects() {
        val got = mutableListOf<WearEffect>()
        val s = WearStore().apply { effectHandler = { got += it } }
        s.dispatch(WearAction.Event(WatchEvent.TICK, t0))
        assertEquals(listOf<WearEffect>(WearEffect.Vibrate(Haptic.TICK)), got)
    }
}

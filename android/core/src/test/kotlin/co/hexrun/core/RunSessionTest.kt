package co.hexrun.core

import co.hexrun.core.geo.Geo
import co.hexrun.core.geo.LatLng
import co.hexrun.core.geo.TrackPoint
import co.hexrun.core.run.Closing
import co.hexrun.core.run.RunContext
import co.hexrun.core.run.RunSession
import co.hexrun.core.run.SessionDeps
import co.hexrun.core.run.SessionEvent
import co.hexrun.core.run.SessionStatus
import co.hexrun.core.run.TickStrength
import co.hexrun.core.store.MemoryAppendLog
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RunSessionTest {
    private val moda = LatLng(40.9819, 29.0254)
    private var clock = 1_791_172_800_000L
    private val log = MemoryAppendLog()
    private fun deps(persistEvery: Long = 0) = SessionDeps(log, uuid = { "run-0001-uuid" }, now = { clock }, persistEveryMs = persistEvery)
    private val circle = Geo.circleTrack(moda, 200.0, 180, clock, 3.2)

    @Test
    fun `durum gecisleri`() = runBlocking<Unit> {
        val s = RunSession.create(deps())
        assertEquals(SessionStatus.IDLE, s.status())
        assertFailsWith<IllegalStateException> { s.finish() }
        s.start()
        assertEquals(SessionStatus.RUNNING, s.status())
        assertFailsWith<IllegalStateException> { s.start() }
        clock += 10_000
        s.pause()
        assertEquals(SessionStatus.PAUSED, s.status())
        assertTrue(s.addPoints(listOf(TrackPoint(1.0, 1.0, clock))).isEmpty(), "duraklatılmışken nokta alınmaz")
        clock += 60_000
        s.resume()
        clock += 5_000
        assertEquals(15_000, s.snapshot().elapsedMs, "duraklatma süresi sayılmaz")
        val req = s.finish(device = "Pixel 9")
        assertEquals(SessionStatus.FINISHED, s.status())
        assertEquals("run-0001-uuid", req.clientRunId)
        assertEquals("Pixel 9", req.device)
        assertTrue(log.lines.isEmpty(), "bitince yarım kayıt silinir")
    }

    @Test
    fun `halka kapaninca loop olayi ve kapanis modu olaylari`() = runBlocking<Unit> {
        val s = RunSession.create(deps())
        s.start()
        val events = ArrayList<SessionEvent>()
        for (p in circle) events += s.addPoints(listOf(p))
        val loops = events.filterIsInstance<SessionEvent.Loop>()
        assertEquals(1, loops.size)
        assertEquals(1, loops[0].loop.index)
        assertClose(1256.454263, loops[0].loop.lengthM, "loop length")
        assertTrue(events.contains(SessionEvent.ClosingEnter))
        assertTrue(events.any { it is SessionEvent.Tick }, "kapanış modunda tık")
        assertEquals(1, s.snapshot().tracker.loops.size)
    }

    @Test
    fun `gunlukten kurtarma ayni durumu verir`() = runBlocking<Unit> {
        val s = RunSession.create(deps(), context = RunContext(defendDuelId = "d1"))
        s.start()
        for (p in circle.take(60)) s.addPoints(listOf(p))
        clock = circle[59].t + 1000
        s.pause()
        clock += 30_000
        s.resume()
        for (p in circle.drop(60).take(40).map { it.copy(t = it.t + 31_000) }) s.addPoints(listOf(p))
        s.markLoopsShown(0)
        s.flush()
        val before = s.snapshot()

        // Süreç öldü: yalnız günlük kaldı. Sonuna yarım bir satır da yazılmış olabilir.
        log.lines.add("{\"k\":\"p\",\"p\":{\"lat\":40.98")
        val r = assertNotNull(RunSession.restore(deps()))
        val after = r.snapshot()
        assertEquals(before.clientRunId, after.clientRunId)
        assertEquals(before.pointCount, after.pointCount)
        assertEquals(before.tracker.distanceM, after.tracker.distanceM)
        assertEquals(before.tracker.durationMs, after.tracker.durationMs)
        assertEquals(before.elapsedMs, after.elapsedMs)
        assertEquals("d1", after.context.defendDuelId)
        assertEquals(SessionStatus.RUNNING, r.status())
    }

    @Test
    fun `duraklatilmis kosu duraklatilmis geri gelir ve ara yazma araligina uyulur`() = runBlocking<Unit> {
        val s = RunSession.create(deps(persistEvery = 5_000))
        s.start()
        s.addPoints(listOf(circle[0]))
        assertEquals(1, log.lines.size, "aralık dolmadan nokta yazılmaz")
        s.pause()
        assertEquals(3, log.lines.size, "duraklatma hemen yazılır (bekleyen nokta ile)")
        val r = assertNotNull(RunSession.restore(deps()))
        assertEquals(SessionStatus.PAUSED, r.status())
        assertEquals(1, r.snapshot().pointCount)
    }

    @Test
    fun `fetih ani gosterildi bilgisi kalici`() = runBlocking<Unit> {
        val s = RunSession.create(deps())
        s.start()
        for (p in circle) s.addPoints(listOf(p))
        s.markLoopsShown(1)
        assertEquals(1, assertNotNull(RunSession.restore(deps())).snapshot().loopsShown)
    }

    @Test
    fun `gunluk yoksa kurtarma null`() = runBlocking<Unit> {
        assertNull(RunSession.restore(deps()))
        val s = RunSession.create(deps())
        s.start()
        s.discard()
        assertNull(RunSession.restore(deps()))
    }

    @Test
    fun `kapanis tiklari`() {
        assertEquals(emptyList(), Closing.ticks(100.0, 120.0), "uzaklaşırken tık yok")
        assertEquals(listOf(TickStrength.SINGLE), Closing.ticks(205.0, 195.0))
        assertEquals(listOf(TickStrength.DOUBLE, TickStrength.DOUBLE), Closing.ticks(72.0, 62.0))
        assertEquals(3, Closing.ticks(300.0, 100.0).size, "en çok 3 tık")
        assertEquals(85, Closing.remainingM(83.0))
    }
}

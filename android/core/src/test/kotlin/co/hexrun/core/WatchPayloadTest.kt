package co.hexrun.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class WatchPayloadTest {
    @Test
    fun hudRoundTripAndSpecExample() {
        val spec = """{"type":"hud","state":"running","distanceM":6120,"durationMs":1977000,"paceSecPerKm":323,"distToStartM":85,"armed":true,"closingMode":true,"events":["morning","blitz"],"duel":{"opponent":"Zeynep","coveredCells":40,"totalCells":48},"ts":1791300000000,"extra":1}"""
        val h = WatchPayload.decodeHud(spec)!!
        assertEquals("running", h.state)
        assertEquals(1977000, h.durationMs)
        assertEquals(323.0, h.paceSecPerKm)
        assertEquals(WatchDuel("Zeynep", 40, 48), h.duel)
        assertEquals(listOf("morning", "blitz"), h.events)
        assertEquals(h, WatchPayload.decodeHud(WatchPayload.encodeHud(h)))
        val idle = WatchPayload.decodeHud("""{"type":"hud"}""")!!
        assertEquals("idle", idle.state)
        assertNull(idle.duel)
        assert(WatchPayload.encodeHud(WatchHud()).contains("\"type\":\"hud\""))
    }

    @Test
    fun eventsAndCommands() {
        val c = WatchPayload.decodeEvent("""{"type":"conquest","cells":62,"areaM2":19220,"captured":48}""".toByteArray())!!
        assertEquals(WatchEvent.conquest(62, 19220.0, 48), c)
        assertEquals("tick", WatchPayload.decodeEvent(WatchPayload.encodeEvent(WatchEvent.TICK))!!.type)
        assertEquals("pause", WatchPayload.decodeCommand("""{"type":"command","action":"pause"}""".toByteArray())!!.action)
        assertEquals(WatchCommand(action = "finish"), WatchPayload.decodeCommand(WatchPayload.encodeCommand(WatchCommand(action = "finish"))))
        assertNull(WatchPayload.decodeCommand("""{"type":"command","action":"explode"}""".toByteArray()))
        assertNull(WatchPayload.decodeCommand("bozuk".toByteArray()))
    }
}

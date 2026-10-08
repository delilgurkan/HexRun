package co.hexrun.core

import co.hexrun.core.events.EventId
import co.hexrun.core.events.Events
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals

class EventsVectorsTest {
    private val v = Vectors.load("events.json").obj
    private fun ms(s: String) = Instant.parse(s).toEpochMilli()

    @Test
    fun active() {
        for (c in v["active"]!!.jsonArray) {
            val t = c.obj["t"]!!.s
            assertEquals(c.obj["active"]!!.jsonArray.map { it.s }, Events.active(ms(t)).map { it.id.wire }, "active $t")
        }
    }

    @Test
    fun windows() {
        for (c in v["windows"]!!.jsonArray) {
            val o = c.obj
            val t = o["t"]!!.s
            val id = EventId.of(o["id"]!!.s)!!
            val w = Events.window(id, ms(t))
            assertEquals(o["active"]!!.bool(), w.active, "$t $id active")
            assertEquals(o["endsInMin"]!!.let { if (it.isNull) null else it.jsonPrimitive.int }, w.endsInMin, "$t $id endsInMin")
            assertEquals(o["startsInMin"]!!.jsonPrimitive.int, w.startsInMin, "$t $id startsInMin")
        }
    }
}

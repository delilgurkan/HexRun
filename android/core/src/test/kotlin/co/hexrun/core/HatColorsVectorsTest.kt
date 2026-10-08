package co.hexrun.core

import co.hexrun.core.colors.ColorNode
import co.hexrun.core.colors.Palette
import co.hexrun.core.colors.Slot
import co.hexrun.core.hat.Hat
import kotlinx.serialization.json.jsonArray
import kotlin.test.Test
import kotlin.test.assertEquals

class HatColorsVectorsTest {
    @Test
    fun hat() {
        for (c in Vectors.load("hat.json").jsonArray) {
            val o = c.obj
            val segs = Hat.segments(o["power"]!!.d, o["progress"]!!.d, o["ghost"]!!.d)
            val exp = o["segments"]!!.jsonArray
            assertEquals(exp.size, segs.size)
            exp.forEachIndexed { i, e ->
                assertClose(e.obj["owner"]!!.d, segs[i].owner, "owner[$i]", 1e-9)
                assertClose(e.obj["siege"]!!.d, segs[i].siege, "siege[$i]", 1e-9)
                assertClose(e.obj["ghost"]!!.d, segs[i].ghost, "ghost[$i]", 1e-9)
            }
        }
    }

    @Test
    fun colors() {
        for (c in Vectors.load("colors.json").jsonArray) {
            val o = c.obj
            val viewer = o["viewer"]!!.let { if (it.isNull) null else it.s }
            val nodes = o["nodes"]!!.jsonArray.map { ColorNode(it.obj["id"]!!.s, Slot.of(it.obj["slot"]!!.s)!!) }
            val edges = o["edges"]!!.jsonArray.map { it.jsonArray[0].s to it.jsonArray[1].s }
            val exp = o["result"]!!.obj.mapValues { Slot.of(it.value.s)!! }
            val got = Palette.assignDisplayColors(viewer, nodes, edges)
            assertEquals(exp, got.toMap(), "viewer=$viewer")
        }
    }
}

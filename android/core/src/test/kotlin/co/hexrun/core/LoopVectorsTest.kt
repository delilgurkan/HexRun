package co.hexrun.core

import co.hexrun.core.geo.TrackPoint
import co.hexrun.core.loop.LoopOptions
import co.hexrun.core.loop.LoopTracker
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import kotlin.test.assertEquals

/** loops.json: her durum, her örnek (mesafe, süre, başlangıca uzaklık, armed, closingMode, tempo, halka sayısı). */
class LoopVectorsTest {
    private val cases = Vectors.load("loops.json").jsonArray

    @TestFactory
    fun loops(): List<DynamicTest> = cases.map { c -> DynamicTest.dynamicTest(c.obj["name"]!!.s) { check(c) } }

    private fun check(c: JsonElement) {
        val name = c.obj["name"]!!.s
        val o = c.obj["options"]!!.obj
        val opts = LoopOptions(
            closeRadiusM = o["closeRadiusM"]?.d ?: Rules.LOOP_CLOSE_M,
            minLoopLengthM = o["minLoopLengthM"]?.d ?: Rules.MIN_LOOP_LENGTH_M,
        )
        val pauseAt = c.obj["pauseAt"]!!.let { if (it.isNull) null else it.jsonPrimitive.int }
        val resumeAt = c.obj["resumeAt"]!!.let { if (it.isNull) null else it.jsonPrimitive.int }
        val points = c.obj["points"]!!.jsonArray.map {
            val p = it.obj
            TrackPoint(p["lat"]!!.d, p["lng"]!!.d, p["t"]!!.l, p["acc"]?.d)
        }
        val exp = c.obj["expected"]!!.obj
        val samples = exp["samples"]!!.jsonArray.associateBy { it.obj["i"]!!.jsonPrimitive.int }
        val tr = LoopTracker(opts)
        val closedAt = ArrayList<Int>()
        var checked = 0
        points.forEachIndexed { i, p ->
            if (pauseAt == i) tr.pause()
            if (resumeAt == i) tr.resume()
            val l = tr.push(p)
            if (l != null) closedAt.add(i)
            val sample = samples[i]
            if (sample != null) {
                val s = sample.obj
                val st = tr.state()
                val at = "$name[$i]"
                assertClose(s["distanceM"]!!.d, st.distanceM, "$at distanceM")
                assertEquals(s["durationMs"]!!.l, st.durationMs, "$at durationMs")
                assertClose(s["distToStartM"]!!.d, st.distToStartM, "$at distToStartM")
                assertEquals(s["armed"]!!.bool(), st.armed, "$at armed")
                assertEquals(s["closingMode"]!!.bool(), st.closingMode, "$at closingMode")
                val pace = s["paceSecPerKm"]!!.dOrNull()
                if (pace == null) assertEquals(null, st.paceSecPerKm, "$at pace") else assertClose(pace, st.paceSecPerKm!!, "$at pace")
                assertEquals(s["loops"]!!.jsonPrimitive.int, st.loops.size, "$at loops")
                checked++
            }
        }
        assertEquals(samples.size, checked, "$name: tüm örnekler kontrol edildi")
        assertEquals(exp["closedAtIndex"]!!.jsonArray.map { it.jsonPrimitive.int }, closedAt, "$name closedAtIndex")
        val loops = tr.state().loops
        val expLoops = exp["loops"]!!.jsonArray
        assertEquals(expLoops.size, loops.size, "$name loops")
        expLoops.forEachIndexed { k, e ->
            val el = e.obj
            val l = loops[k]
            assertEquals(el["index"]!!.jsonPrimitive.int, l.index, "$name loop index")
            assertClose(el["lengthM"]!!.d, l.lengthM, "$name loop lengthM")
            assertClose(el["areaM2"]!!.d, l.areaM2, "$name loop areaM2")
            assertEquals(el["closedAt"]!!.l, l.closedAt, "$name loop closedAt")
            assertEquals(el["startedAt"]!!.l, l.startedAt, "$name loop startedAt")
            assertEquals(el["ringSize"]!!.jsonPrimitive.int, l.ring.size, "$name loop ringSize")
        }
    }
}

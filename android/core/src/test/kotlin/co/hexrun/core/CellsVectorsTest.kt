package co.hexrun.core

import co.hexrun.core.cells.Cells
import co.hexrun.core.geo.LatLng
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

class CellsVectorsTest {
    private val v = Vectors.load("cells.json").obj
    private fun ll(e: kotlinx.serialization.json.JsonElement) = LatLng(e.obj["lat"]!!.d, e.obj["lng"]!!.d)

    @Test
    fun cellOf() {
        for (c in v["cellOf"]!!.jsonArray) {
            assertEquals(c.obj["cell"]!!.s, Cells.cellOf(ll(c.obj["p"]!!), c.obj["res"]!!.jsonPrimitive.int))
        }
    }

    @Test
    fun boundary() {
        for (c in v["boundary"]!!.jsonArray) {
            val exp = c.obj["boundary"]!!.jsonArray.map { ll(it) }
            val got = Cells.cellBoundary(c.obj["cell"]!!.s)
            assertEquals(exp.size, got.size, "köşe sayısı")
            exp.zip(got).forEach { (e, g) ->
                assertCloseAbs(e.lat, g.lat, "boundary lat", 1e-9)
                assertCloseAbs(e.lng, g.lng, "boundary lng", 1e-9)
            }
        }
    }

    @Test
    fun polygonCells() {
        val p = v["polygon"]!!.obj
        val ring = p["ring"]!!.jsonArray.map { ll(it) }
        val exp = p["cells"]!!.jsonArray.map { it.s }.toSortedSet()
        val got = Cells.cellsInPolygon(ring, p["res"]!!.jsonPrimitive.int).toSortedSet()
        assertEquals(exp, got)
    }
}

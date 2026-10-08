package co.hexrun.core

import co.hexrun.core.geo.Geo
import co.hexrun.core.geo.LatLng
import kotlinx.serialization.json.jsonArray
import kotlin.test.Test

class GeoVectorsTest {
    private val v = Vectors.load("geo.json").obj
    private fun ll(e: kotlinx.serialization.json.JsonElement) = LatLng(e.obj["lat"]!!.d, e.obj["lng"]!!.d)

    @Test
    fun haversine() {
        for (c in v["haversine"]!!.jsonArray) {
            assertClose(c.obj["m"]!!.d, Geo.haversineM(ll(c.obj["a"]!!), ll(c.obj["b"]!!)), "haversine")
        }
    }

    @Test
    fun destination() {
        for (c in v["destination"]!!.jsonArray) {
            val to = Geo.destination(ll(c.obj["from"]!!), c.obj["bearing"]!!.d, c.obj["distM"]!!.d)
            val exp = ll(c.obj["to"]!!)
            assertClose(exp.lat, to.lat, "destination lat")
            assertClose(exp.lng, to.lng, "destination lng")
        }
    }

    @Test
    fun polygonArea() {
        for (c in v["polygonArea"]!!.jsonArray) {
            val ring = c.obj["ring"]!!.jsonArray.map { ll(it) }
            assertClose(c.obj["m2"]!!.d, Geo.polygonAreaM2(ring), "polygonArea")
        }
    }
}

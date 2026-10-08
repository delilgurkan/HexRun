package co.hexrun.core

import co.hexrun.core.format.Format
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

class FormatVectorsTest {
    private val v = Vectors.load("format.json").obj

    @Test fun km() = v["km"]!!.jsonArray.forEach { val a = it.jsonArray; assertEquals(a[2].s, Format.km(a[0].d, a[1].jsonPrimitive.int), "km ${a[0]}") }
    @Test fun pace() = v["pace"]!!.jsonArray.forEach { val a = it.jsonArray; assertEquals(a[1].s, Format.pace(a[0].dOrNull()), "pace ${a[0]}") }
    @Test fun duration() = v["duration"]!!.jsonArray.forEach { val a = it.jsonArray; assertEquals(a[1].s, Format.duration(a[0].l), "duration ${a[0]}") }
    @Test fun int() = v["int"]!!.jsonArray.forEach { val a = it.jsonArray; assertEquals(a[1].s, Format.int(a[0].d), "int ${a[0]}") }
    @Test fun area() = v["area"]!!.jsonArray.forEach { val a = it.jsonArray; assertEquals(a[1].s, Format.area(a[0].d), "area ${a[0]}") }
    @Test fun initials() = v["initials"]!!.jsonArray.forEach { val a = it.jsonArray; assertEquals(a[1].s, Format.initials(a[0].s), "initials ${a[0]}") }
}

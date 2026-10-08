package co.hexrun.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.test.assertTrue
import kotlin.test.fail

/** shared/test-vectors içindeki JSON dosyaları — Gradle `hexrun.vectors` sistem özelliğiyle verilir. */
object Vectors {
    val dir: File by lazy {
        val p = System.getProperty("hexrun.vectors") ?: "../../shared/test-vectors"
        File(p).also { require(it.isDirectory) { "test vektör dizini yok: ${it.absolutePath}" } }
    }

    fun load(name: String): JsonElement = Json.parseToJsonElement(File(dir, name).readText())
}

val JsonElement.obj: JsonObject get() = jsonObject
val JsonElement.d: Double get() = jsonPrimitive.double
val JsonElement.l: Long get() = jsonPrimitive.long
val JsonElement.s: String get() = jsonPrimitive.contentOrNull ?: error("dizgi bekleniyordu: $this")
val JsonElement.isNull: Boolean get() = this is JsonNull
fun JsonElement.dOrNull(): Double? = if (this is JsonNull) null else jsonPrimitive.double
fun JsonElement.bool(): Boolean = (this as JsonPrimitive).booleanOrNull ?: error("bool bekleniyordu: $this")

/** Göreli 1e-6 (ve sıfıra yakın değerlerde mutlak 1e-6) tolerans. */
fun assertClose(expected: Double, actual: Double, msg: String, rel: Double = 1e-6) {
    val tol = max(rel * abs(expected), 1e-6)
    if (abs(expected - actual) > tol) fail("$msg: beklenen $expected, gelen $actual (fark ${abs(expected - actual)})")
}

fun assertCloseAbs(expected: Double, actual: Double, msg: String, tol: Double) {
    assertTrue(abs(expected - actual) <= tol, "$msg: beklenen $expected, gelen $actual")
}

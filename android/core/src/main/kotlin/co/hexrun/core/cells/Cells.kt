package co.hexrun.core.cells

import co.hexrun.core.Rules
import co.hexrun.core.geo.LatLng
import com.uber.h3core.AreaUnit
import com.uber.h3core.H3Core

/**
 * H3 petek yardımcıları (h3-java, Uber H3 C kütüphanesinin JNI sarmalayıcısı).
 * packages/core/src/cells.ts ile aynı çağrılar: `latLngToCell`, `cellToBoundary`,
 * `polygonToCells` (merkez içerme), res 12.
 */
object Cells {
    /**
     * Yerel kütüphane yükleyici. JVM'de JAR'dan çıkarılır; Android'de önce `jniLibs`
     * (System.loadLibrary), olmazsa JAR kaynağından denenir. Uygulama başlangıçta değiştirebilir.
     */
    @Volatile
    var loader: () -> H3Core = {
        runCatching { H3Core.newInstance() }.getOrElse { H3Core.newSystemInstance() }
    }

    private val h3: H3Core by lazy { loader() }

    /** H3 yüklenebildi mi (ör. x86 emülatörde yerel kütüphane yoksa false). */
    val available: Boolean by lazy { runCatching { h3 }.isSuccess }

    fun cellOf(p: LatLng, res: Int = Rules.H3_RES): String = h3.latLngToCellAddress(p.lat, p.lng, res)

    fun isGameCell(id: String): Boolean =
        runCatching { h3.isValidCell(id) && h3.getResolution(id) == Rules.H3_RES }.getOrDefault(false)

    /** Poligonun (kapalı halka) içindeki petekler: merkezi poligonun içinde olan hücreler. */
    fun cellsInPolygon(ring: List<LatLng>, res: Int = Rules.H3_RES): List<String> {
        if (ring.size < 3) return emptyList()
        val pts = ring.map { com.uber.h3core.util.LatLng(it.lat, it.lng) }
        return h3.polygonToCellAddresses(pts, emptyList(), res)
    }

    fun cellAreaM2(id: String): Double = h3.cellArea(id, AreaUnit.m2)

    fun cellsAreaM2(ids: Iterable<String>): Double = ids.sumOf { cellAreaM2(it) }

    fun cellCenter(id: String): LatLng = h3.cellToLatLng(id).let { LatLng(it.lat, it.lng) }

    fun cellBoundary(id: String): List<LatLng> = h3.cellToBoundary(id).map { LatLng(it.lat, it.lng) }

    fun neighbors(id: String): List<String> = h3.gridDisk(id, 1).filter { it != id }

    /** Bağlı bileşenler, büyükten küçüğe (cells.ts `components`). */
    fun components(ids: Collection<String>): List<List<String>> {
        val set = ids.toSet()
        val seen = HashSet<String>()
        val out = ArrayList<List<String>>()
        for (start in set.sorted()) {
            if (!seen.add(start)) continue
            val comp = ArrayList<String>()
            val stack = ArrayDeque(listOf(start))
            while (stack.isNotEmpty()) {
                val c = stack.removeLast()
                comp.add(c)
                for (n in neighbors(c)) if (n in set && seen.add(n)) stack.addLast(n)
            }
            out.add(comp.sorted())
        }
        return out.sortedWith(compareByDescending<List<String>> { it.size }.thenBy { it.first() })
    }

    fun isConnected(ids: Collection<String>): Boolean {
        if (ids.size <= 1) return true
        return components(ids).firstOrNull()?.size == ids.toSet().size
    }
}

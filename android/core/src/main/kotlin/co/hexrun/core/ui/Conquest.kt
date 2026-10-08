package co.hexrun.core.ui

import co.hexrun.core.api.DuelSummary
import co.hexrun.core.api.MapCell
import co.hexrun.core.cells.Cells
import co.hexrun.core.geo.LatLng
import kotlin.math.roundToLong

data class DuelCoverage(val duel: DuelSummary, val inside: Int, val total: Int)

data class ConquestPreview(
    val cells: List<String>,
    /** Sahipsiz (ya da önbellekte bilinmeyen) petekler: senin olur. */
    val empty: Int,
    /** Zaten senin: güçlenir. */
    val own: Int,
    /** Rakip petekleri (düello dışında değişmez). */
    val rival: Int,
    val areaM2: Double,
    /** Saldırdığın düello alanlarının halka içinde kalan kısmı. */
    val duels: List<DuelCoverage>,
) {
    val gained: Boolean get() = empty > 0 || own > 0 || duels.isNotEmpty()

    companion object {
        val EMPTY = ConquestPreview(emptyList(), 0, 0, 0, 0.0, emptyList())
    }
}

/** Fetih önizlemesi bağlamı: son bilinen harita petekleri ve saldırdığın düellolar. */
data class ConquestContext(
    val myId: String?,
    val cells: Map<String, MapCell>,
    val attacking: List<DuelSummary>,
)

/** İstemci tarafı fetih önizlemesi (kesin sonuç sunucuda; tolerans gösterilmez). mobile/src/run/conquest.ts */
object Conquest {
    fun classify(ids: List<String>, ctx: ConquestContext): ConquestPreview {
        var empty = 0
        var own = 0
        var rival = 0
        for (id in ids) {
            val c = ctx.cells[id]
            when {
                c == null || c.ownerId == null -> empty++
                ctx.myId != null && c.ownerId == ctx.myId -> own++
                else -> rival++
            }
        }
        val set = ids.toHashSet()
        val duels = ctx.attacking.filter { it.status == "active" }
            .map { d -> DuelCoverage(d, d.cells.count { it in set }, d.cells.size) }
            .filter { it.inside > 0 }
        val area = runCatching { Cells.cellsAreaM2(ids) }.getOrDefault(ids.size * 307.0)
        return ConquestPreview(ids, empty, own, rival, area, duels)
    }

    fun preview(ring: List<LatLng>, ctx: ConquestContext): ConquestPreview =
        classify(runCatching { Cells.cellsInPolygon(ring) }.getOrDefault(emptyList()), ctx)

    /** Kapanış modunda açık halkanın düz kapatılmış önizlemesi. */
    fun previewOpenRing(ring: List<LatLng>, ctx: ConquestContext): ConquestPreview =
        if (ring.size >= 4) preview(ring, ctx) else classify(emptyList(), ctx)

    /** Dolum dalgası: hücreler 14 ms arayla, toplam en çok 1,5 sn. */
    fun fillSchedule(n: Int, perCellMs: Long = 14, maxMs: Long = 1500): List<Long> {
        if (n <= 0) return emptyList()
        val step = if (n * perCellMs > maxMs) maxMs.toDouble() / n else perCellMs.toDouble()
        return List(n) { i -> co.hexrun.core.jsRound(i * step).roundToLong() }
    }
}

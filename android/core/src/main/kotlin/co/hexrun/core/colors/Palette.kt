package co.hexrun.core.colors

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Oyuncu renk slotları: renk körlüğüne güvenli Okabe–Ito ailesinden 8 slot. */
@Serializable
enum class Slot(val wire: String) {
    @SerialName("keh") KEH("keh"),
    @SerialName("kir") KIR("kir"),
    @SerialName("lim") LIM("lim"),
    @SerialName("zum") ZUM("zum"),
    @SerialName("gok") GOK("gok"),
    @SerialName("lac") LAC("lac"),
    @SerialName("gul") GUL("gul"),
    @SerialName("mer") MER("mer");

    companion object {
        fun of(s: String?): Slot? = entries.firstOrNull { it.wire == s }
    }
}

data class SlotColor(val name: String, val hex: Long, val darkEdge: Long, val fillDark: Long, val fillLight: Long)

data class ColorNode(val id: String, val slot: Slot)

/**
 * Palet ve komşu kuralı (packages/core/src/colors.ts). Görüntüleyen kendini hep kendi renginde
 * görür; çakışmada rakip deterministik olarak kayar.
 */
object Palette {
    val SLOTS: List<Slot> = Slot.entries

    val COLORS: Map<Slot, SlotColor> = mapOf(
        Slot.KEH to SlotColor("Kehribar", 0xFFE69F00, 0xFFE69F00, 0xFF7D5C0C, 0xFFEAC267),
        Slot.KIR to SlotColor("Kiremit", 0xFFD55E00, 0xFFD55E00, 0xFF753C0C, 0xFFE19E67),
        Slot.LIM to SlotColor("Limon", 0xFFF0E442, 0xFFF0E442, 0xFF827E2D, 0xFFF0E88C),
        Slot.ZUM to SlotColor("Zümrüt", 0xFF009E73, 0xFF009E73, 0xFF0A5C45, 0xFF6CC2A7),
        Slot.GOK to SlotColor("Gök", 0xFF56B4E9, 0xFF56B4E9, 0xFF356680, 0xFF9BCEE8),
        Slot.LAC to SlotColor("Lacivert", 0xFF0072B2, 0xFF1B7EBF, 0xFF184C6B, 0xFF6CA9C9),
        Slot.GUL to SlotColor("Gül", 0xFFCC79A7, 0xFFCC79A7, 0xFF70495F, 0xFFDCADC3),
        Slot.MER to SlotColor("Mercan", 0xFFF9AEA2, 0xFFF9AEA2, 0xFF86645C, 0xFFF4CAC1),
    )

    /** Simülasyonda birbirine en yakın düşen dört çift: komşu olamazlar. */
    val FORBIDDEN_PAIRS: List<Pair<Slot, Slot>> = listOf(
        Slot.ZUM to Slot.GUL,
        Slot.KEH to Slot.MER,
        Slot.ZUM to Slot.LAC,
        Slot.LAC to Slot.GUL,
    )

    fun name(s: Slot): String = COLORS.getValue(s).name

    /** Koyu temada Lacivert kenar rengi daha açık (#1B7EBF). ARGB. */
    fun color(s: Slot, dark: Boolean): Long = COLORS.getValue(s).let { if (dark) it.darkEdge else it.hex }

    /** Baş harf rengi oyuncu renginin üstünde: koyu zeminlerde beyaz. ARGB. */
    fun onColor(s: Slot): Long = if (s == Slot.KIR || s == Slot.ZUM || s == Slot.LAC) 0xFFFFFFFF else 0xFF141716

    fun clash(a: Slot, b: Slot): Boolean {
        if (a == b) return true
        return FORBIDDEN_PAIRS.any { (x, y) -> (x == a && y == b) || (x == b && y == a) }
    }

    /** FNV-1a 32 bit, UTF-16 kod birimleri üzerinde (JS `charCodeAt` + `Math.imul`). */
    fun hash32(s: String): Long {
        var h = 2166136261L.toInt()
        for (ch in s) {
            h = h xor ch.code
            h *= 16777619
        }
        return h.toLong() and 0xFFFFFFFFL
    }

    /**
     * Görüntüleyen için renk ataması (DSatur). Görüntüleyen sabit; çakışmada rakip kayar.
     * Sonuç düğüm atama sırasını korur.
     */
    fun assignDisplayColors(viewerId: String?, nodes: List<ColorNode>, edges: List<Pair<String, String>>): LinkedHashMap<String, Slot> {
        val adj = LinkedHashMap<String, LinkedHashSet<String>>()
        val pref = LinkedHashMap<String, Slot>()
        for (n in nodes) {
            pref[n.id] = n.slot
            adj[n.id] = LinkedHashSet()
        }
        for ((a, b) in edges) {
            if (a == b || !adj.containsKey(a) || !adj.containsKey(b)) continue
            adj.getValue(a).add(b)
            adj.getValue(b).add(a)
        }
        val out = LinkedHashMap<String, Slot>()
        if (viewerId != null && pref.containsKey(viewerId)) out[viewerId] = pref.getValue(viewerId)
        val remaining = LinkedHashSet(nodes.map { it.id }.filter { !out.containsKey(it) })
        while (remaining.isNotEmpty()) {
            var best: String? = null
            var bSat = -1
            var bDeg = -1
            var bId = ""
            for (id in remaining) {
                val nb = adj.getValue(id)
                val sat = nb.count { out.containsKey(it) }
                val deg = nb.size
                if (best == null || sat > bSat || (sat == bSat && deg > bDeg) || (sat == bSat && deg == bDeg && id < bId)) {
                    best = id; bSat = sat; bDeg = deg; bId = id
                }
            }
            val id = best!!
            remaining.remove(id)
            val used = adj.getValue(id).filter { out.containsKey(it) }.map { out.getValue(it) }
            val want = pref.getValue(id)
            val ok = { s: Slot -> used.all { u -> !clash(s, u) } }
            if (ok(want)) {
                out[id] = want
                continue
            }
            val startIdx = ((SLOTS.indexOf(want) + 1 + (hash32("${viewerId ?: ""}|$id") % 7).toInt()) % SLOTS.size)
            var chosen: Slot? = null
            for (k in SLOTS.indices) {
                val s = SLOTS[(startIdx + k) % SLOTS.size]
                if (ok(s)) { chosen = s; break }
            }
            if (chosen == null) {
                var bestS = want
                var bestCost = Int.MAX_VALUE
                for (s in SLOTS) {
                    var cost = 0
                    for (u in used) cost += if (u == s) 10 else if (clash(s, u)) 1 else 0
                    if (cost < bestCost) { bestCost = cost; bestS = s }
                }
                chosen = bestS
            }
            out[id] = chosen
        }
        return out
    }
}

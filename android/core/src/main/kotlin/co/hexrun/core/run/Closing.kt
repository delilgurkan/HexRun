package co.hexrun.core.run

import co.hexrun.core.Rules
import co.hexrun.core.jsRound
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

enum class TickStrength { SINGLE, DOUBLE }

/**
 * "Halkayı kapat" modunda haptik tıklar (mobile/src/run/closing.ts): her 10 m'de hafif tık;
 * yakalama alanına son 20 m'de iki kat sık (5 m'de bir) ve çift tık. Yalnız yaklaşırken; en çok 3.
 */
object Closing {
    fun ticks(prevDistM: Double, nextDistM: Double, closeRadiusM: Double = Rules.LOOP_CLOSE_M): List<TickStrength> {
        if (!(nextDistM < prevDistM)) return emptyList()
        if (nextDistM > Rules.CLOSING_MODE_M) return emptyList()
        val finalZone = closeRadiusM + 20
        val from = min(prevDistM, Rules.CLOSING_MODE_M)
        val marks = sortedSetOf<Double>(compareByDescending { it })
        var m = floor(from / 5) * 5
        while (m > nextDistM) {
            if (m < from && (m <= finalZone || m % 10 == 0.0)) marks.add(m)
            m -= 5
        }
        val out = marks.map { if (it <= finalZone) TickStrength.DOUBLE else TickStrength.SINGLE }
        return out.takeLast(3)
    }

    /** HUD'da gösterilen kalan mesafe: 5 m'ye yuvarlanmış başlangıca uzaklık. */
    fun remainingM(distToStartM: Double): Int = max(0.0, jsRound(distToStartM / 5) * 5).toInt()
}

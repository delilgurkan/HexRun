package co.hexrun.core.format

import co.hexrun.core.jsRound
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Locale
import kotlin.math.floor

/** Türkçe biçimlendirme: 6,12 km · 5'23" · 19.220 m² · 32:57 (packages/core/src/format.ts). */
object Format {
    private val TR: Locale = Locale.forLanguageTag("tr-TR")

    /** Tam sayı, binlik ayırıcı nokta: 19.220 (Intl tr-TR). */
    fun int(n: Double): String {
        val r = jsRound(n)
        if (!r.isFinite()) return r.toString()
        val neg = r < 0
        val digits = BigDecimal(kotlin.math.abs(r)).setScale(0, RoundingMode.UNNECESSARY).toPlainString()
        val sb = StringBuilder()
        val first = digits.length % 3
        for ((i, c) in digits.withIndex()) {
            if (i > 0 && (i - first) % 3 == 0) sb.append('.')
            sb.append(c)
        }
        // Intl "-0" yazmaz.
        return if (neg && r != 0.0) "-$sb" else sb.toString()
    }

    fun int(n: Int): String = int(n.toDouble())
    fun int(n: Long): String = int(n.toDouble())

    /** km, ondalık virgül; JS `toFixed` (tam ondalık açılımla en yakın, eşitlikte büyük). */
    fun km(m: Double, digits: Int = 2): String = toFixed(m / 1000.0, digits).replace('.', ',')

    fun toFixed(x: Double, digits: Int): String {
        if (!x.isFinite()) return if (x.isNaN()) "NaN" else if (x > 0) "Infinity" else "-Infinity"
        // ECMAScript: x < 0 ise "-" + (−x).toFixed (−0 için işaret yok).
        if (x < 0) return "-" + toFixed(-x, digits)
        return BigDecimal(x).setScale(digits, RoundingMode.HALF_UP).toPlainString()
    }

    fun pace(secPerKm: Double?): String {
        if (secPerKm == null || !secPerKm.isFinite() || secPerKm <= 0) return "–'––\""
        val s = jsRound(secPerKm).toLong()
        return "${s / 60}'${(s % 60).toString().padStart(2, '0')}\""
    }

    fun duration(ms: Long): String {
        val s = maxOf(0L, floor(ms / 1000.0).toLong())
        val h = s / 3600
        val m = (s % 3600) / 60
        val sec = s % 60
        val mm = m.toString().padStart(if (h > 0) 2 else 1, '0')
        val ss = sec.toString().padStart(2, '0')
        return if (h > 0) "$h:$mm:$ss" else "$mm:$ss"
    }

    fun area(m2: Double): String = "${int(m2)} m²"

    /** JS `\s`: Unicode boşlukları dahil. */
    private val WS = Regex("[\\s\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+")

    /** Baş harfler: "Deniz Arslan" → "DA"; Türkçe büyük harf (i → İ, ı → I). */
    fun initials(name: String): String {
        val parts = name.trim { it.isWhitespace() || it == '﻿' || it == ' ' }.split(WS).filter { it.isNotEmpty() }
        if (parts.isEmpty()) return "?"
        val a = parts[0].take(1)
        val b = if (parts.size > 1) parts.last().take(1) else parts[0].drop(1).take(1)
        return (a + b).uppercase(TR)
    }

    /** "2x", "1,5x" */
    fun multiplier(m: Double): String {
        val s = if (m == floor(m)) m.toLong().toString() else m.toString()
        return "${s.replace('.', ',')}x"
    }

    /** HUD'da kalan mesafe: < 1 km "430 m", üstü "1,2 km". */
    fun shortDistance(m: Double): String =
        if (m < 1000) "${jsRound(m / 10).toLong() * 10} m" else "${km(m, 1)} km"
}

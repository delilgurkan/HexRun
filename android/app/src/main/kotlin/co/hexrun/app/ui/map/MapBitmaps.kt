package co.hexrun.app.ui.map

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import androidx.core.content.res.ResourcesCompat
import co.hexrun.app.R
import co.hexrun.app.ui.components.GOLD
import androidx.compose.ui.graphics.toArgb
import co.hexrun.app.ui.theme.HexColors
import co.hexrun.core.colors.Palette
import co.hexrun.core.colors.Slot

/** Harita için bit eşlemler: kuşatma taraması (saldırgan renginde) ve oyuncu işaretçileri. */
object MapBitmaps {
    /** 45° tarama deseni (kesintisiz döşenir). */
    fun hatch(color: Int, density: Float): Bitmap {
        val s = (6 * density).toInt().coerceAtLeast(6)
        val bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color; strokeWidth = 2.2f * density; strokeCap = Paint.Cap.SQUARE }
        val cv = Canvas(bmp)
        for (k in -1..1) {
            val c = k * s.toFloat()
            cv.drawLine(c, s.toFloat(), c + s, 0f, p)
        }
        return bmp
    }

    private var typeface: Typeface? = null

    private fun font(context: Context): Typeface {
        typeface?.let { return it }
        val tf = runCatching { ResourcesCompat.getFont(context, R.font.archivo_variable) }.getOrNull() ?: Typeface.DEFAULT_BOLD
        typeface = tf
        return tf
    }

    /** Oyuncu işaretçisi: renkli daire, baş harf, altın çerçeve, kendi işaretçinde saldıran sayısı. */
    fun marker(
        context: Context,
        colors: HexColors,
        slot: Slot,
        initials: String,
        me: Boolean,
        gold: Boolean,
        hidden: Boolean,
        attackers: Int,
        density: Float,
    ): Bitmap {
        val d = (if (me) 40 else 32) * density
        val pad = 8 * density
        val w = (d + pad * 2).toInt()
        val bmp = Bitmap.createBitmap(w, w, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        val cx = w / 2f
        val cy = w / 2f
        val r = d / 2
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Palette.color(slot, colors.isDark).toInt() }
        cv.drawCircle(cx, cy, r, fill)
        val bw = (if (gold) 3f else if (me) 2.5f else 2f) * density
        val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = bw
            color = when {
                gold -> GOLD.toArgb()
                me -> colors.ink.toArgb()
                else -> colors.casing.toArgb()
            }
        }
        cv.drawCircle(cx, cy, r - bw / 2, border)
        if (!hidden && initials.isNotEmpty()) {
            val t = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Palette.onColor(slot).toInt()
                textSize = maxOf(12f, (d / density) * 0.36f) * density
                textAlign = Paint.Align.CENTER
                typeface = font(context)
                setFontVariationSettings("'wght' 800")
            }
            val fm = t.fontMetrics
            cv.drawText(initials, cx, cy - (fm.ascent + fm.descent) / 2, t)
        }
        if (me && attackers > 0) {
            val br = 10 * density
            val bx = cx + r - 2 * density
            val by = cy - r + 2 * density
            cv.drawCircle(bx, by, br, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = colors.inv.toArgb() })
            cv.drawCircle(bx, by, br, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.5f * density; color = colors.casing.toArgb() })
            val t = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = colors.invInk.toArgb()
                textSize = 11 * density
                textAlign = Paint.Align.CENTER
                typeface = Typeface.DEFAULT_BOLD
            }
            val fm = t.fontMetrics
            cv.drawText("$attackers", bx, by - (fm.ascent + fm.descent) / 2, t)
        }
        return bmp
    }
}

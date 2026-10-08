package co.hexrun.wear.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import co.hexrun.app.R

/** s17-saat jetonları: saat her zaman koyu, siyah zemin, tek büyük rakam. */
object WearColors {
    val Black = Color(0xFF000000)
    val Ink = Color(0xFFF2F1EA)
    val Ink2 = Color(0xFFB4BBB7)
    val Ink3 = Color(0xFF8F9893)
    val Track = Color(0xFF2A2F2D)
    val Surface = Color(0xFF1A1F1D)

    /** Oyuncu rengi (Kehribar) — HUD vurgusu ve fetih halkası. */
    val Player = Color(0xFFE69F00)

    /** Düello rakibi (Gök) — tasarımdaki düello anahtarı. */
    val Opponent = Color(0xFF56B4E9)

    /** Bağlantı uyarısı (Kiremit). */
    val Warn = Color(0xFFD55E00)
}

@OptIn(ExperimentalTextApi::class)
private fun archivo(width: Float, weights: List<Int>): FontFamily = FontFamily(
    weights.map { w ->
        Font(
            R.font.archivo_variable,
            weight = FontWeight(w),
            variationSettings = FontVariation.Settings(FontVariation.weight(w), FontVariation.width(width)),
        )
    },
)

object WearFonts {
    /** Büyük HUD rakamları: Archivo %75 genişlik. */
    val condensed: FontFamily by lazy { archivo(75f, listOf(700, 850)) }
    val archivo: FontFamily by lazy { archivo(100f, listOf(500, 700, 800, 900)) }
    val mono: FontFamily by lazy { FontFamily(Font(R.font.ibm_plex_mono_semibold, FontWeight.SemiBold)) }
}

private val HexColors = Colors(
    primary = WearColors.Player,
    primaryVariant = WearColors.Player,
    secondary = WearColors.Opponent,
    secondaryVariant = WearColors.Opponent,
    background = WearColors.Black,
    surface = WearColors.Surface,
    error = WearColors.Warn,
    onPrimary = WearColors.Black,
    onSecondary = WearColors.Black,
    onBackground = WearColors.Ink,
    onSurface = WearColors.Ink,
    onSurfaceVariant = WearColors.Ink2,
    onError = WearColors.Black,
)

@Composable
fun HexWearTheme(content: @Composable () -> Unit) {
    MaterialTheme(colors = HexColors, content = content)
}

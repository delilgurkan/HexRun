package co.hexrun.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import co.hexrun.app.R

/**
 * Archivo (değişken: ağırlık + genişlik ekseni) ve IBM Plex Mono. Tasarımdaki
 * `font-stretch` değerleri genişlik ekseniyle uygulanır: HUD rakamları %75 (dar), başlıklar %115.
 */
@OptIn(ExperimentalTextApi::class)
private fun archivo(width: Float): FontFamily = FontFamily(
    listOf(400, 500, 600, 700, 800, 900).map { w ->
        Font(
            R.font.archivo_variable,
            weight = FontWeight(w),
            variationSettings = FontVariation.Settings(FontVariation.weight(w), FontVariation.width(width)),
        )
    },
)

object Fonts {
    val archivo: FontFamily by lazy { archivo(100f) }
    val archivoCondensed: FontFamily by lazy { archivo(75f) }
    val archivoExpanded: FontFamily by lazy { archivo(115f) }
    val plexMono: FontFamily by lazy {
        FontFamily(
            Font(R.font.ibm_plex_mono_regular, FontWeight.Normal),
            Font(R.font.ibm_plex_mono_medium, FontWeight.Medium),
            Font(R.font.ibm_plex_mono_semibold, FontWeight.SemiBold),
        )
    }
}

@Immutable
data class HexType(
    val hudXl: TextStyle,
    val display: TextStyle,
    val hudM: TextStyle,
    val title1: TextStyle,
    val title2: TextStyle,
    val body: TextStyle,
    val callout: TextStyle,
    val label: TextStyle,
    val data: TextStyle,
    /** Birincil CTA metni (büyük harf, geniş). */
    val cta: TextStyle,
)

private val tight = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None)

fun hexType(system: Boolean): HexType {
    val sans = if (system) FontFamily.SansSerif else Fonts.archivo
    val cond = if (system) FontFamily.SansSerif else Fonts.archivoCondensed
    val wide = if (system) FontFamily.SansSerif else Fonts.archivoExpanded
    val mono = if (system) FontFamily.Monospace else Fonts.plexMono
    return HexType(
        hudXl = TextStyle(fontFamily = cond, fontWeight = FontWeight.ExtraBold, fontSize = 112.sp, lineHeight = 104.sp, letterSpacing = (-0.02).em, lineHeightStyle = tight),
        display = TextStyle(fontFamily = wide, fontWeight = FontWeight.Black, fontSize = 52.sp, lineHeight = 52.sp, letterSpacing = 0.01.em),
        hudM = TextStyle(fontFamily = cond, fontWeight = FontWeight.Bold, fontSize = 48.sp, lineHeight = 52.sp, letterSpacing = (-0.02).em),
        title1 = TextStyle(fontFamily = wide, fontWeight = FontWeight.ExtraBold, fontSize = 30.sp, lineHeight = 36.sp),
        title2 = TextStyle(fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp),
        body = TextStyle(fontFamily = sans, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
        callout = TextStyle(fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp),
        label = TextStyle(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.05.em),
        data = TextStyle(fontFamily = mono, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 16.sp),
        cta = TextStyle(fontFamily = wide, fontWeight = FontWeight.Black, fontSize = 17.sp, lineHeight = 22.sp, letterSpacing = 0.05.em),
    )
}

val LocalHexType = staticCompositionLocalOf { hexType(system = true) }

/**
 * HUD metni yazı ölçeği 1,35'i geçince büyümeyi bırakır: sp değeri ölçekle bölünüp tavanla
 * çarpılır.
 */
@Composable
@ReadOnlyComposable
fun TextUnit.capped(max: Float = HUD_MAX_FONT_SCALE): TextUnit {
    val fs = LocalDensity.current.fontScale
    return if (fs <= max) this else (value * max / fs).sp
}

@Composable
@ReadOnlyComposable
fun TextStyle.capped(max: Float = HUD_MAX_FONT_SCALE): TextStyle =
    copy(fontSize = fontSize.capped(max), lineHeight = if (lineHeight.isSp) lineHeight.capped(max) else lineHeight)

package co.hexrun.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import co.hexrun.core.colors.Palette
import co.hexrun.core.colors.Slot

/**
 * HexRun tasarım token'ları (Tokens.dc.html). Kabuk renksizdir: yalnız mürekkep ve kâğıt;
 * renk oyunculara aittir.
 */
@Immutable
data class HexColors(
    val isDark: Boolean,
    /** zemin */
    val bg: Color,
    /** yüzey */
    val surf: Color,
    val surf2: Color,
    val glass: Color,
    /** mürekkep */
    val ink: Color,
    val ink2: Color,
    /** mürekkep-3: yalnız ≥13 pt metinde. */
    val ink3: Color,
    val line: Color,
    val line2: Color,
    val track: Color,
    /** ters zemin (birincil buton) */
    val inv: Color,
    val invInk: Color,
    val land: Color,
    val water: Color,
    val park: Color,
    /** bölge kenarı kılıfı */
    val casing: Color,
    val tex: Color,
    val dim: Color,
    val frame: Color,
    /** iz (koşu çizgisi) iç rengi */
    val trace: Color,
    val shadow: Color,
) {
    fun player(slot: Slot): Color = Color(Palette.color(slot, isDark))
    fun onPlayer(slot: Slot): Color = Color(Palette.onColor(slot))

    /** Harita petek dolgusu opaklığı. */
    val cellFillOpacity: Float get() = if (isDark) 0.5f else 0.55f
}

val DarkColors = HexColors(
    isDark = true,
    bg = Color(0xFF0F1312),
    surf = Color(0xFF1A1F1D),
    surf2 = Color(0xFF232927),
    glass = Color(0xEB1A1F1D),
    ink = Color(0xFFF2F1EA),
    ink2 = Color(0xFFB4BBB7),
    ink3 = Color(0xFF8F9893),
    line = Color(0x24F2F1EA),
    line2 = Color(0x4DF2F1EA),
    track = Color(0x29F2F1EA),
    inv = Color(0xFFF2F1EA),
    invInk = Color(0xFF0F1312),
    land = Color(0xFF141917),
    water = Color(0xFF0D1F26),
    park = Color(0xFF17251D),
    casing = Color(0xFF0F1312),
    tex = Color(0x17F2F1EA),
    dim = Color(0x8C0F1312),
    frame = Color(0xFF2E3431),
    trace = Color(0xFF0F1312),
    shadow = Color(0xFF000000),
)

val LightColors = HexColors(
    isDark = false,
    bg = Color(0xFFF7F6F1),
    surf = Color(0xFFFFFFFF),
    surf2 = Color(0xFFEDEBE4),
    glass = Color(0xF0FFFFFF),
    ink = Color(0xFF141716),
    ink2 = Color(0xFF454B48),
    ink3 = Color(0xFF636A66),
    line = Color(0x1F141716),
    line2 = Color(0x42141716),
    track = Color(0x1F141716),
    inv = Color(0xFF141716),
    invInk = Color(0xFFF7F6F1),
    land = Color(0xFFEFEDE6),
    water = Color(0xFFC9DDE3),
    park = Color(0xFFD9E4CF),
    casing = Color(0xFF141716),
    tex = Color(0x14141716),
    dim = Color(0x8CF7F6F1),
    frame = Color(0xFFC9C6BC),
    trace = Color(0xFFFFFFFF),
    shadow = Color(0xFF141716),
)

val LocalHexColors = staticCompositionLocalOf { DarkColors }

object Space {
    val s1 = 4.dp
    val s2 = 8.dp
    val s3 = 12.dp
    val s4 = 16.dp
    val s5 = 24.dp
    val s6 = 32.dp
    val s7 = 48.dp
    val s8 = 64.dp
    /** Yan boşluk 16; koşu ekranında 20. */
    val gutter = 16.dp
    val gutterRun = 20.dp
}

object Radii {
    val xs = 6.dp
    val s = 12.dp
    val m = 20.dp
    val l = 28.dp
    /** Android CTA (tasarım btnR). */
    val cta = 18.dp
    /** Modal sheet üst köşeleri (Android 28). */
    val sheet = 28.dp
    /** Extended FAB (tasarım s03 Android). */
    val fab = 20.dp
}

object Motion {
    const val tap = 120
    const val sheet = 280
    const val fillPerCell = 14L
    const val fillMax = 1500L
    const val breathe = 2000L
    const val conquestTotal = 2400L
    const val conquestBeat1 = 300L
    const val conquestBeat2 = 1800L
    const val conquestBeat3 = 2000L
    const val conquestAutoDismiss = 5000L
    const val finishHold = 1500L
}

/** Dokunma hedefleri. */
object Target {
    val min = 48.dp
    val run = 64.dp
    val runBar = 72.dp
    val gap = 12.dp
}

/** HUD rakamları bu ölçeğin üstünde büyümez; metrikler alt alta dizilir (≈ AX3). */
const val HUD_MAX_FONT_SCALE = 1.35f

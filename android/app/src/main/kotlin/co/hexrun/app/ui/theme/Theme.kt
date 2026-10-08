package co.hexrun.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember

/** HexRun teması: sistem koyu/açık ayarını izler. `systemFonts` testlerde kullanılır. */
@Composable
fun HexRunTheme(dark: Boolean = isSystemInDarkTheme(), systemFonts: Boolean = false, content: @Composable () -> Unit) {
    val c = if (dark) DarkColors else LightColors
    val type = remember(systemFonts) { hexType(systemFonts) }
    val scheme = if (dark) {
        darkColorScheme(
            primary = c.inv, onPrimary = c.invInk, secondary = c.ink2, onSecondary = c.bg,
            background = c.bg, onBackground = c.ink, surface = c.surf, onSurface = c.ink,
            surfaceVariant = c.surf2, onSurfaceVariant = c.ink2, surfaceContainer = c.surf, surfaceContainerHigh = c.surf2,
            surfaceContainerLow = c.surf, surfaceContainerHighest = c.surf2, surfaceContainerLowest = c.bg,
            outline = c.line2, outlineVariant = c.line, secondaryContainer = c.inv, onSecondaryContainer = c.invInk,
            error = c.ink, onError = c.bg, scrim = c.shadow,
        )
    } else {
        lightColorScheme(
            primary = c.inv, onPrimary = c.invInk, secondary = c.ink2, onSecondary = c.bg,
            background = c.bg, onBackground = c.ink, surface = c.surf, onSurface = c.ink,
            surfaceVariant = c.surf2, onSurfaceVariant = c.ink2, surfaceContainer = c.surf, surfaceContainerHigh = c.surf2,
            surfaceContainerLow = c.surf, surfaceContainerHighest = c.surf2, surfaceContainerLowest = c.bg,
            outline = c.line2, outlineVariant = c.line, secondaryContainer = c.inv, onSecondaryContainer = c.invInk,
            error = c.ink, onError = c.bg, scrim = c.shadow,
        )
    }
    val typography = Typography(
        displayLarge = type.display, headlineMedium = type.title1, titleLarge = type.title2,
        bodyLarge = type.body, bodyMedium = type.callout, labelLarge = type.callout, labelMedium = type.label,
        labelSmall = type.label, titleMedium = type.callout, bodySmall = type.callout.copy(fontSize = type.label.fontSize),
    )
    CompositionLocalProvider(LocalHexColors provides c, LocalHexType provides type) {
        MaterialTheme(colorScheme = scheme, typography = typography, content = content)
    }
}

object Hex {
    val colors: HexColors
        @Composable @ReadOnlyComposable get() = LocalHexColors.current
    val type: HexType
        @Composable @ReadOnlyComposable get() = LocalHexType.current
}

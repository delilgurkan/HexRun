package co.hexrun.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.ui.theme.Target
import co.hexrun.app.ui.theme.capped

enum class ButtonKind { Primary, Secondary, Ghost, Danger }

/** Birincil buton = ters zemin (mürekkep üstüne kâğıt). Hedef ≥ 48 dp; `big` CTA 56 dp, büyük harf. */
@Composable
fun HButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: ButtonKind = ButtonKind.Primary,
    icon: HexIcon? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    big: Boolean = false,
    minHeight: Dp = if (big) 56.dp else Target.min,
    contentDescription: String? = null,
) {
    val c = Hex.colors
    val bg = when (kind) {
        ButtonKind.Primary -> c.inv
        ButtonKind.Secondary -> c.surf2
        else -> Color.Transparent
    }
    val fg = if (kind == ButtonKind.Primary) c.invInk else c.ink
    val border = when (kind) {
        ButtonKind.Danger -> BorderStroke(1.dp, c.ink)
        ButtonKind.Ghost -> null
        else -> null
    }
    val active = enabled && !loading
    Button(
        onClick = onClick,
        enabled = active,
        modifier = modifier.defaultMinSize(minHeight = minHeight).let { m ->
            if (contentDescription != null) m.semantics { this.contentDescription = contentDescription } else m
        },
        shape = RoundedCornerShape(if (big) Radii.cta else Radii.m),
        colors = ButtonDefaults.buttonColors(containerColor = bg, contentColor = fg, disabledContainerColor = bg.copy(alpha = bg.alpha * 0.45f), disabledContentColor = fg.copy(alpha = 0.45f)),
        border = border,
        contentPadding = PaddingValues(horizontal = if (big) 24.dp else 16.dp, vertical = 8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (loading) CircularProgressIndicator(Modifier.size(18.dp), color = fg, strokeWidth = 2.dp)
            else if (icon != null) HIcon(icon, size = 20.dp, tint = fg)
            HText(
                label,
                style = if (big) Hex.type.cta else Hex.type.callout,
                color = fg,
                weight = if (big) null else FontWeight.SemiBold,
                align = TextAlign.Center,
                maxLines = 2,
                upper = big,
            )
        }
    }
}

/** Yuvarlak ikon düğmesi; cam zemin (harita üstü) isteğe bağlı; 48 dp hedef. */
@Composable
fun IconButtonH(
    icon: HexIcon?,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = Target.min,
    glass: Boolean = false,
    badge: Int? = null,
    content: (@Composable () -> Unit)? = null,
) {
    val c = Hex.colors
    Box(modifier.sizeIn(minWidth = Target.min, minHeight = Target.min), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .size(size)
                .clip(CircleShape)
                .let { if (glass) it.background(c.glass).border(1.dp, c.line, CircleShape) else it }
                .clickable(role = Role.Button, onClickLabel = contentDescription, onClick = onClick)
                .semantics { this.contentDescription = contentDescription },
            contentAlignment = Alignment.Center,
        ) {
            if (content != null) content() else if (icon != null) HIcon(icon, size = 22.dp)
        }
        if (badge != null && badge > 0) {
            Box(
                Modifier.align(Alignment.TopEnd).offset(x = (-2).dp, y = 2.dp).defaultMinSize(18.dp, 18.dp).clip(CircleShape).background(c.inv).padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                HText(if (badge > 9) "9+" else "$badge", style = Hex.type.label.copy(fontSize = Hex.type.label.fontSize * 0.92f).capped(1.2f), color = c.invInk)
            }
        }
    }
}

/** Metin düğmesi (Geç, Okundu, Kendi rotamla koşacağım). */
@Composable
fun TextButtonH(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, tone: Tone = Tone.Ink, enabled: Boolean = true) {
    androidx.compose.material3.TextButton(onClick = onClick, enabled = enabled, modifier = modifier.defaultMinSize(minHeight = Target.min)) {
        HText(label, style = Hex.type.callout, tone = tone, weight = FontWeight.SemiBold)
    }
}

/** Android Extended FAB (tasarım s03: 64 dp, köşe 20, "Koşuya başla"). */
@Composable
fun ExtendedFab(label: String, icon: HexIcon, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, contentDescription: String? = null) {
    val c = Hex.colors
    androidx.compose.material3.ExtendedFloatingActionButton(
        onClick = { if (enabled) onClick() },
        modifier = modifier.defaultMinSize(minHeight = Target.run).semantics { if (contentDescription != null) this.contentDescription = contentDescription },
        shape = RoundedCornerShape(Radii.fab),
        containerColor = if (enabled) c.inv else c.inv.copy(alpha = 0.55f),
        contentColor = c.invInk,
        icon = { HIcon(icon, size = 20.dp, tint = c.invInk) },
        text = { HText(label, style = Hex.type.title2.copy(fontSize = Hex.type.title2.fontSize * 0.82f), color = c.invInk) },
    )
}


package co.hexrun.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.ui.theme.Target

/** Bilgi çipi (cam zemin harita üstünde); tıklanabilirse 48 dp hedef. */
@Composable
fun HChip(
    label: String,
    modifier: Modifier = Modifier,
    icon: HexIcon? = null,
    glass: Boolean = false,
    selected: Boolean = false,
    onClick: (() -> Unit)? = null,
    contentDescription: String? = null,
    leading: (@Composable () -> Unit)? = null,
) {
    val c = Hex.colors
    val bg = if (selected) c.inv else if (glass) c.glass else c.surf2
    val fg = if (selected) c.invInk else c.ink
    val shape = RoundedCornerShape(Radii.s)
    var m = modifier.defaultMinSize(minHeight = if (onClick != null) Target.min - 8.dp else 32.dp).clip(shape).background(bg)
    if (glass) m = m.border(1.dp, c.line, shape)
    if (onClick != null) m = m.clickable(role = Role.Button, onClick = onClick)
    m = m.semantics(mergeDescendants = true) { if (contentDescription != null) this.contentDescription = contentDescription }
    Row(m.padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        leading?.invoke()
        if (icon != null) HIcon(icon, size = 16.dp, tint = fg)
        HText(label, style = Hex.type.callout.copy(fontSize = Hex.type.callout.fontSize * 0.94f), color = fg, maxLines = 1)
    }
}

/** M3 filtre çipi (tasarım Android: 36 dp hap, seçili mürekkep zemin, seçili değilse 1,5 dp çerçeve). */
@Composable
fun FilterPill(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = Hex.colors
    val shape = RoundedCornerShape(18.dp)
    Box(
        modifier
            .defaultMinSize(minHeight = Target.min)
            .selectable(selected = selected, role = Role.Tab, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.height(36.dp).clip(shape)
                .background(if (selected) c.ink else Color.Transparent)
                .let { if (!selected) it.border(1.5.dp, c.line2, shape) else it }
                .padding(horizontal = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            HText(label, style = Hex.type.callout.copy(fontSize = Hex.type.callout.fontSize * 0.94f), color = if (selected) c.bg else c.ink, weight = if (selected) FontWeight.Bold else FontWeight.SemiBold, maxLines = 1)
        }
    }
}

/** İki ya da üç seçenekli bölümlü seçici (kategori, dönem). */
@Composable
fun <K> Segmented(options: List<Pair<K, String>>, value: K, onChange: (K) -> Unit, modifier: Modifier = Modifier, glass: Boolean = false) {
    val c = Hex.colors
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(Radii.s)).background(if (glass) c.glass else c.surf2).padding(3.dp).selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        for ((k, label) in options) {
            val on = k == value
            Box(
                Modifier.weight(1f).defaultMinSize(minHeight = Target.min - 6.dp).clip(RoundedCornerShape(Radii.s - 3.dp))
                    .background(if (on) c.inv else Color.Transparent)
                    .selectable(selected = on, role = Role.Tab, onClick = { onChange(k) }),
                contentAlignment = Alignment.Center,
            ) {
                HText(label, style = Hex.type.callout.copy(fontSize = Hex.type.callout.fontSize * 0.94f), color = if (on) c.invInk else c.ink2, weight = if (on) FontWeight.Bold else FontWeight.Medium, maxLines = 1)
            }
        }
    }
}

package co.hexrun.app.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Motion
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.util.animationsEnabled
import co.hexrun.app.util.trUpper
import kotlin.math.sqrt

enum class Tone { Ink, Ink2, Ink3 }

@Composable
fun toneColor(t: Tone): Color = when (t) {
    Tone.Ink -> Hex.colors.ink
    Tone.Ink2 -> Hex.colors.ink2
    Tone.Ink3 -> Hex.colors.ink3
}

/** Tipografi ölçeğine bağlı metin. `label` stili Türkçe büyük harfle yazılır. */
@Composable
fun HText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = Hex.type.body,
    tone: Tone = Tone.Ink,
    color: Color? = null,
    weight: FontWeight? = null,
    align: TextAlign? = null,
    maxLines: Int = Int.MAX_VALUE,
    upper: Boolean = false,
    heading: Boolean = false,
) {
    Text(
        text = if (upper) text.trUpper() else text,
        modifier = if (heading) modifier.semantics { this.heading() } else modifier,
        style = style.let { s -> if (weight != null) s.copy(fontWeight = weight) else s },
        color = color ?: toneColor(tone),
        textAlign = align,
        maxLines = maxLines,
        overflow = if (maxLines == Int.MAX_VALUE) TextOverflow.Clip else TextOverflow.Ellipsis,
    )
}

@Composable
fun Label(text: String, modifier: Modifier = Modifier, tone: Tone = Tone.Ink2, color: Color? = null) =
    HText(text, modifier, Hex.type.label, tone, color, upper = true)

@Composable
fun DataText(text: String, modifier: Modifier = Modifier, tone: Tone = Tone.Ink, color: Color? = null) =
    HText(text, modifier, Hex.type.data, tone, color)

@Composable
fun HCard(modifier: Modifier = Modifier, padding: Dp = 16.dp, content: @Composable ColumnScope.() -> Unit) {
    val c = Hex.colors
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radii.l - 8.dp))
            .background(c.surf)
            .border(1.dp, c.line, RoundedCornerShape(Radii.l - 8.dp))
            .padding(padding),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, right: (@Composable RowScope.() -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        HText(text, Modifier.semantics { heading() }, Hex.type.label, Tone.Ink2, upper = true)
        if (right != null) Row(verticalAlignment = Alignment.CenterVertically, content = right)
    }
}

@Composable
fun Stat(label: String, value: String, modifier: Modifier = Modifier, sub: String? = null) {
    Column(
        modifier.widthIn(min = 96.dp).clearAndSetSemantics { contentDescription = "$label: $value${sub?.let { ", $it" } ?: ""}" },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Label(label, tone = Tone.Ink3)
        HText(value, style = Hex.type.title2, maxLines = 1)
        if (sub != null) HText(sub, style = Hex.type.callout.copy(fontSize = Hex.type.label.fontSize * 1.08f), tone = Tone.Ink2)
    }
}

@Composable
fun HDivider() = HorizontalDivider(thickness = 1.dp, color = Hex.colors.line)

/** Yer tutucu blok; animasyonlar kapalıyken sabit. */
@Composable
fun Skeleton(modifier: Modifier = Modifier, height: Dp = 16.dp, radius: Dp = Radii.xs) {
    val alpha = if (animationsEnabled()) {
        val tr = rememberInfiniteTransition(label = "skeleton")
        val a by tr.animateFloat(0.5f, 1f, infiniteRepeatable(tween((Motion.breathe / 2).toInt()), RepeatMode.Reverse), label = "a")
        a
    } else 0.75f
    Box(modifier.fillMaxWidth().height(height).alpha(alpha).clip(RoundedCornerShape(radius)).background(Hex.colors.surf2))
}

/** Petek dokusu (yükleme iskeleti ve boş durumlar). */
@Composable
fun HexTexture(modifier: Modifier = Modifier, color: Color = Hex.colors.tex) {
    Canvas(modifier) {
        val r = 12.dp.toPx()
        val dx = r * sqrt(3f)
        val dy = r * 1.5f
        val a = r * sqrt(3f) / 2
        val b = r / 2
        val path = Path()
        var row = 0
        var y = 0f
        while (y < size.height + r) {
            var x = if (row % 2 == 1) dx / 2 else 0f
            while (x < size.width + dx) {
                path.moveTo(x, y - r)
                path.relativeLineTo(a, b); path.relativeLineTo(0f, r); path.relativeLineTo(-a, b)
                path.relativeLineTo(-a, -b); path.relativeLineTo(0f, -r); path.close()
                x += dx
            }
            y += dy
            row++
        }
        drawPath(path, color, style = Stroke(width = 1.dp.toPx()))
    }
}

/** Küçük etiket ("İlk gün", "Öneri", "İnceleniyor"). */
@Composable
fun Tag(text: String, modifier: Modifier = Modifier, inverse: Boolean = false) {
    val c = Hex.colors
    Box(modifier.clip(RoundedCornerShape(Radii.s)).background(if (inverse) c.inv else c.surf2).padding(horizontal = 10.dp, vertical = 4.dp)) {
        Label(text, color = if (inverse) c.invInk else c.ink)
    }
}

/** İkonlu yuvarlak kutu (özet satırları, izin kartları). */
@Composable
fun IconBubble(icon: HexIcon, size: Dp = 36.dp, iconSize: Dp = 18.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(Hex.colors.surf2), contentAlignment = Alignment.Center) {
        HIcon(icon, size = iconSize)
    }
}

/** Satır: ikon + başlık + alt metin (özet kartları). */
@Composable
fun InfoRow(icon: HexIcon, title: String, sub: String? = null) {
    Row(
        Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = if (sub != null) "$title, $sub" else title },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconBubble(icon)
        Column(Modifier.weight(1f)) {
            HText(title, style = Hex.type.callout)
            if (sub != null) HText(sub, style = Hex.type.callout.copy(fontSize = Hex.type.label.fontSize * 1.08f), tone = Tone.Ink2)
        }
    }
}

/** İlerleme çubuğu (rozet ilerlemesi). */
@Composable
fun ProgressLine(value: Double, max: Double, modifier: Modifier = Modifier) {
    val c = Hex.colors
    val r = if (max > 0) (value / max).coerceIn(0.0, 1.0).toFloat() else 0f
    Canvas(modifier.fillMaxWidth().height(6.dp)) {
        val h = size.height
        drawRoundRect(c.track, cornerRadius = androidx.compose.ui.geometry.CornerRadius(h / 2))
        if (r > 0) drawRoundRect(c.ink, size = androidx.compose.ui.geometry.Size(size.width * r, h), cornerRadius = androidx.compose.ui.geometry.CornerRadius(h / 2))
    }
}

@Suppress("unused")
private fun Offset.noop() = this

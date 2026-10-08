package co.hexrun.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import co.hexrun.app.ui.theme.Hex
import co.hexrun.core.colors.Slot
import co.hexrun.core.geo.LatLng
import co.hexrun.core.hat.Hat
import co.hexrun.core.ui.Silhouette

val GOLD = Color(0xFFC9A227)

/**
 * Oyuncu işareti: renkli daire + baş harf. Renk tek taşıyıcı değildir (baş harf her zaman yazar).
 * Kendi işaretçinde son 48 saatte saldıranların sayısı.
 */
@Composable
fun PlayerBadge(
    slot: Slot,
    initials: String,
    size: Dp = 36.dp,
    goldFrame: Boolean = false,
    attackers: Int? = null,
    hidden: Boolean = false,
    ring: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val c = Hex.colors
    Box(modifier.size(size)) {
        Box(
            Modifier.size(size).clip(CircleShape).background(c.player(slot))
                .border(if (goldFrame) 3.dp else if (ring) 2.5.dp else 2.dp, if (goldFrame) GOLD else if (ring) c.ink else c.casing, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (!hidden) {
                val fs = maxOf(12f, size.value * 0.36f)
                // Baş harf yazı ölçeğiyle büyümez (daireye sığmalı).
                HText(initials, style = Hex.type.label.copy(fontSize = (fs / androidx.compose.ui.platform.LocalDensity.current.fontScale).sp, lineHeight = (fs * 1.15f / androidx.compose.ui.platform.LocalDensity.current.fontScale).sp, letterSpacing = 0.sp), color = c.onPlayer(slot), weight = FontWeight.ExtraBold)
            }
        }
        if (attackers != null && attackers > 0) {
            Box(
                Modifier.align(Alignment.TopEnd).offset(6.dp, (-6).dp).defaultMinSize(20.dp, 20.dp).clip(CircleShape).background(c.inv)
                    .border(1.5.dp, c.casing, CircleShape).padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) { HText("$attackers", style = Hex.type.label.copy(fontSize = (11f / androidx.compose.ui.platform.LocalDensity.current.fontScale).sp), color = c.invInk) }
        }
    }
}

enum class HatSize(val height: Dp, val gap: Dp) { Sm(4.dp, 1.5.dp), Md(8.dp, 2.dp), Lg(16.dp, 3.dp) }

/**
 * "Hat" göstergesi: 10 segment = 10'ar puan. Sahibin gücü düz dolgu, en önde giden saldırganın
 * ilerlemesi saldırgan renginde taralı, son 7 günde eriyen güç soluk hayalet.
 */
@Composable
fun HatBar(
    power: Double,
    progress: Double?,
    ghost: Double?,
    ownerColor: Color,
    modifier: Modifier = Modifier,
    attackerColor: Color = Hex.colors.ink,
    size: HatSize = HatSize.Md,
    showLabel: Boolean = true,
) {
    val c = Hex.colors
    val segs = Hat.segments(power, (progress ?: 0.0).coerceAtMost(power), power + (ghost ?: 0.0).coerceAtLeast(0.0))
    val a11y = Hat.a11y(power, progress, ghost)
    Row(
        modifier.fillMaxWidth().clearAndSetSemantics {
            contentDescription = a11y
            progressBarRangeInfo = ProgressBarRangeInfo(power.toFloat().coerceIn(0f, 100f), 0f..100f)
        },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Canvas(Modifier.weight(1f).height(size.height)) {
            val gap = size.gap.toPx()
            val segW = (this.size.width - gap * (Hat.SEGMENTS - 1)) / Hat.SEGMENTS
            val h = this.size.height
            val r = CornerRadius(1.dp.toPx())
            val hatchStep = 5.dp.toPx().coerceAtLeast(4f)
            segs.forEachIndexed { i, s ->
                val x = i * (segW + gap)
                drawRoundRect(c.track, Offset(x, 0f), Size(segW, h), r)
                if (s.ghost > 0) drawRoundRect(ownerColor.copy(alpha = 0.32f), Offset(x, 0f), Size(segW * (s.ghost / 100).toFloat(), h), r)
                if (s.owner > 0) drawRoundRect(ownerColor, Offset(x, 0f), Size(segW * (s.owner / 100).toFloat(), h), r)
                if (s.siege > 0) {
                    val w = segW * (s.siege / 100).toFloat()
                    clipRect(x, 0f, x + w, h, ClipOp.Intersect) {
                        var k = -h
                        while (k < w + h) {
                            drawLine(attackerColor, Offset(x + k, h), Offset(x + k + h, 0f), strokeWidth = 2.5.dp.toPx() * (h / 16.dp.toPx()).coerceIn(0.5f, 1f))
                            k += hatchStep
                        }
                    }
                }
            }
        }
        if (showLabel) {
            DataText(Hat.label(power, progress, ghost), Modifier.padding(start = 8.dp))
        }
    }
}

/** Bölge silüeti (harita yok, yalnız biçim). */
@Composable
fun SilhouetteShape(rings: List<List<LatLng>>, color: Color, modifier: Modifier = Modifier, stroke: Color? = null) {
    Canvas(modifier) {
        val pts = Silhouette.project(rings, size.width, size.height)
        if (pts.isEmpty()) return@Canvas
        val path = Path().apply {
            fillType = PathFillType.EvenOdd
            for (r in pts) {
                r.forEachIndexed { i, (x, y) -> if (i == 0) moveTo(x, y) else lineTo(x, y) }
                close()
            }
        }
        drawPath(path, color)
        if (stroke != null) drawPath(path, stroke, style = Stroke(width = 1.5.dp.toPx(), join = StrokeJoin.Round))
    }
}

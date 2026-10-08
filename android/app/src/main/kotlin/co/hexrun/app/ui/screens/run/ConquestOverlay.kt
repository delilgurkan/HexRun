package co.hexrun.app.ui.screens.run

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import co.hexrun.app.run.AndroidHaptics
import co.hexrun.app.run.ConquestState
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HChip
import co.hexrun.app.ui.components.HDivider
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Motion
import co.hexrun.app.ui.theme.Space
import co.hexrun.app.ui.theme.capped
import co.hexrun.app.util.animationsEnabled
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import co.hexrun.core.run.SessionSnapshot
import co.hexrun.core.ui.Conquest
import co.hexrun.core.ui.Dates
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 07 · Fetih anı: üç vuruş, toplam 2,4 sn; koşu durmaz.
 * 1) 0–0,3 sn kapanış (sert haptik denetleyicide) 2) 0,3–1,8 sn dolum dalgası (her 10 petekte tık,
 * m² sayacı) 3) 2,0 sn → sonuç (başarı haptiği); kart 5 sn sonra kendiliğinden kapanır.
 * Sistem animasyonları kapalıyken dolum tek karede olur, haptik korunur.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ConquestOverlay(conquest: ConquestState, snap: SessionSnapshot, eventNames: List<String>, onContinue: () -> Unit, onFinish: () -> Unit) {
    val c = Hex.colors
    val context = LocalContext.current
    val haptics = remember { AndroidHaptics(context) }
    val anim = animationsEnabled()
    val p = conquest.preview
    var beat by remember(conquest.loop.index) { mutableIntStateOf(1) }
    var counted by remember(conquest.loop.index) { mutableDoubleStateOf(0.0) }
    var left by remember(conquest.loop.index) { mutableIntStateOf(5) }
    val fade = remember(conquest.loop.index) { Animatable(0f) }
    val cont by rememberUpdatedState(onContinue)

    LaunchedEffect(conquest.loop.index) {
        coroutineScope {
            launch { fade.animateTo(1f, tween(if (anim) Motion.conquestBeat1.toInt() else 0)) }
            val n = p.cells.size
            launch {
                delay(Motion.conquestBeat1)
                beat = 2
                if (!anim) {
                    counted = p.areaM2
                    repeat(minOf(5, n / 10)) { haptics.cellTick(); delay(80) }
                } else {
                    var elapsed = 0L
                    Conquest.fillSchedule(n, Motion.fillPerCell, Motion.fillMax).forEachIndexed { i, ms ->
                        if (ms > elapsed) { delay(ms - elapsed); elapsed = ms }
                        if ((i + 1) % 10 == 0) haptics.cellTick()
                        counted = p.areaM2 * (i + 1) / n
                    }
                }
            }
            if (p.duels.isNotEmpty()) launch { delay(Motion.conquestBeat2 - 100); haptics.crack() }
            launch {
                delay(Motion.conquestBeat3)
                beat = 3
                counted = p.areaM2
                haptics.success()
                while (left > 0) {
                    delay(1000)
                    left -= 1
                }
                cont()
            }
        }
    }

    val eventsLabel = if (eventNames.isEmpty()) null else eventNames.joinToString(" + ")
    val duel = p.duels.firstOrNull()
    Column(
        Modifier.fillMaxSize().alpha(fade.value).background(c.bg)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { }
            .semantics { liveRegion = LiveRegionMode.Assertive }
            .padding(horizontal = Space.gutter).testTag("conquest"),
        verticalArrangement = Arrangement.Center,
    ) {
        when (beat) {
            1 -> HText(S.conquest.closed, style = Hex.type.display, align = TextAlign.Center, modifier = Modifier.fillMaxWidth().testTag("beat-1"), heading = true)
            2 -> Column(Modifier.fillMaxWidth().testTag("beat-2"), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HText("${Format.int(counted)} m²", style = Hex.type.hudXl.copy(fontSize = 72.sp, lineHeight = 76.sp).capped(), align = TextAlign.Center, maxLines = 1)
                if (duel != null) HText(S.conquest.duelLine(duel.duel.defender.firstName), tone = Tone.Ink2)
            }
            else -> Column(Modifier.fillMaxWidth().testTag("beat-3"), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Label(S.conquest.title(Dates.hhmm(conquest.loop.closedAt), eventsLabel))
                HText(if (p.gained) S.conquest.conquered else S.conquest.closed, style = Hex.type.display, heading = true)
                HText(S.conquest.headline(p.empty + p.own, p.empty, p.own), style = Hex.type.title2)
                val gainedArea = if (p.empty > 0 && p.cells.isNotEmpty()) p.areaM2 * p.empty / p.cells.size else 0.0
                HText("+${Format.area(gainedArea)}", style = Hex.type.title1)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    HChip(S.conquest.newCells(p.empty))
                    if (p.own > 0) HChip(S.conquest.reinforced(p.own))
                    if (duel != null) HChip(S.conquest.covered(duel.inside, duel.total))
                }
                HText(S.conquest.serverNote, style = Hex.type.callout, tone = Tone.Ink3)
                HDivider()
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    MetricSmall(S.common.distance, Format.km(snap.tracker.distanceM), Modifier.weight(1f))
                    MetricSmall(S.common.pace, Format.pace(snap.tracker.paceSecPerKm), Modifier.weight(1f))
                    MetricSmall(S.common.time, Format.duration(snap.elapsedMs), Modifier.weight(1f))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    HButton("${S.conquest.continue_} $left", onContinue, Modifier.weight(2f).testTag("conquest-continue"), big = true)
                    HButton(S.conquest.finish, onFinish, Modifier.weight(1f), big = true, kind = ButtonKind.Secondary)
                }
            }
        }
    }
}

@Composable
private fun MetricSmall(k: String, v: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Label(k, tone = Tone.Ink3)
        HText(v, style = Hex.type.title2, maxLines = 1)
    }
}

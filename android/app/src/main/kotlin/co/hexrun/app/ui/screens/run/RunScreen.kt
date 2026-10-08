package co.hexrun.app.ui.screens.run

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.nav.Routes
import co.hexrun.app.run.RunUiState
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HChip
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.HoldButton
import co.hexrun.app.ui.components.IconButtonH
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.map.HexMap
import co.hexrun.app.ui.map.MapLayers
import co.hexrun.app.ui.map.rememberHexMapState
import co.hexrun.app.ui.theme.HUD_MAX_FONT_SCALE
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.ui.theme.Space
import co.hexrun.app.ui.theme.Target
import co.hexrun.app.ui.theme.capped
import co.hexrun.app.util.animationsEnabled
import co.hexrun.app.util.hasLocationPermission
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import co.hexrun.core.run.Closing
import co.hexrun.core.run.RunContext
import co.hexrun.core.run.SessionStatus
import co.hexrun.core.ui.EventsUi
import co.hexrun.core.ui.RunUi
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

private fun gpsLabel(q: RunUi.GpsQuality) = when (q) {
    RunUi.GpsQuality.STRONG -> S.run.gpsStrong
    RunUi.GpsQuality.WEAK -> S.run.gpsWeak
    RunUi.GpsQuality.SEARCHING -> S.run.gpsSearching
}

/**
 * 05/06/07 · Koşu modu: tam ekran, sekme çubuğu yok, sistem geri hareketi koşudan çıkarmaz,
 * ekran açık kalır. ≤300 m'de "halkayı kapat" moduna geçer; halka kapanınca fetih anı.
 */
@Composable
fun RunScreen(defend: String?, attack: String?, firstLoop: Boolean) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val controller = graph.runController
    val state by controller.state.collectAsStateWithLifecycle()
    var finishing by remember { mutableStateOf(false) }

    // Derin bağlantıyla (hexrun://run?defend=…) açıldıysa koşuyu başlat.
    LaunchedEffect(Unit) {
        if (!controller.state.value.active && !finishing) {
            if (!context.hasLocationPermission()) {
                nav.toMain()
                return@LaunchedEffect
            }
            val (close, minLen) = RunUi.loopOptionsFor(graph.me.ensure())
            controller.start(RunContext(defendDuelId = defend, attackDuelId = attack, firstLoop = firstLoop), close, minLen)
        }
    }
    // Saatten "bitir" gelirse özete geç.
    LaunchedEffect(state.finishedRunId, state.active) {
        val id = state.finishedRunId
        if (!state.active && id != null && !finishing) {
            controller.consumeFinished()
            nav.reset(Routes.summary(clientRunId = id))
        }
    }
    BackHandler(enabled = true) { /* Koşu ekranından geri ile çıkılmaz. */ }
    val view = LocalView.current
    DisposableEffect(view) {
        view.keepScreenOn = true
        onDispose { view.keepScreenOn = false }
    }

    val finish: () -> Unit = {
        if (!finishing) {
            finishing = true
            scope.launch {
                val id = controller.finish()
                controller.consumeFinished()
                if (id != null) nav.reset(Routes.summary(clientRunId = id)) else nav.toMain()
            }
        }
    }
    RunContent(
        state = state,
        defendName = state.snap?.context?.defendDuelId?.let { id -> graph.mapCache.defending.firstOrNull { it.id == id }?.attacker?.displayName },
        cellsForMap = remember { graph.mapCache.cellsSnapshot().values.toList() },
        onPause = { controller.pause() },
        onResume = { controller.resume() },
        onFinish = finish,
        onLock = { controller.setLocked(it) },
        onDismissConquest = { controller.dismissConquest() },
    )
}

@Composable
fun RunContent(
    state: RunUiState,
    defendName: String?,
    cellsForMap: List<co.hexrun.core.api.MapCell>,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onFinish: () -> Unit,
    onLock: (Boolean) -> Unit,
    onDismissConquest: () -> Unit,
) {
    val c = Hex.colors
    val snap = state.snap
    val tracker = snap?.tracker
    val fontScale = LocalDensity.current.fontScale
    val stacked = fontScale > HUD_MAX_FONT_SCALE
    val mapState = rememberHexMapState()
    val anim = animationsEnabled()
    val last = snap?.lastPoint
    LaunchedEffect(last?.t) { last?.let { mapState.easeTo(it.latLng, if (anim) 500 else 0) } }

    if (snap == null || tracker == null) {
        Box(Modifier.fillMaxSize().background(c.bg).testTag("run-starting"))
        return
    }
    val closing = tracker.closingMode && state.conquest == null
    val paused = snap.status == SessionStatus.PAUSED
    val remaining = Closing.remainingM(tracker.distToStartM)
    val preview = state.closingPreview
    val events = remember(snap.elapsedMs / 60_000) { EventsUi.activeNow() }
    val trace = remember(state.trace.size) { state.trace.map { it.latLng } }
    val layers = MapLayers(
        cells = cellsForMap, faded = true, showPlayers = false, trace = trace, start = tracker.start?.latLng,
        captureRadiusM = snap.closeRadiusM, previewRing = if (closing) state.previewRing else null,
    )

    Box(Modifier.fillMaxSize().background(c.bg).testTag("run-screen")) {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxWidth().fillMaxHeight(if (closing) 0.58f else 0.42f).clip(RoundedCornerShape(bottomStart = Radii.l, bottomEnd = Radii.l))) {
                HexMap(layers, Modifier.fillMaxSize(), mapState, center = last?.latLng ?: tracker.start?.latLng, zoom = 16.0)
                Row(
                    Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Space.gutterRun).padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
                ) {
                    HChip(gpsLabel(state.gps), icon = HexIcon.Locate, glass = true, modifier = Modifier.testTag("gps-chip"))
                    if (events.isNotEmpty()) HChip(EventsUi.shortLabel(events), glass = true)
                    if (defendName != null) HChip(S.run.defending(defendName), icon = HexIcon.Defend, glass = true)
                    Spacer(Modifier.weight(1f))
                    IconButtonH(HexIcon.Lock, S.run.lockA11y, { onLock(true) }, glass = true)
                }
                if (closing && preview != null) {
                    HChip(S.run.closingCells(preview.cells.size), icon = HexIcon.Area, glass = true, modifier = Modifier.align(Alignment.BottomStart).padding(start = Space.gutterRun, bottom = 12.dp).testTag("preview-cells"))
                }
            }
            Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = Space.gutterRun).padding(top = 16.dp)) {
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (closing) {
                        Column(Modifier.testTag("closing-hud").semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                HText(S.run.closingLeft(remaining), style = Hex.type.hudXl.capped(), maxLines = 1, modifier = Modifier.clearAndSetSemantics { contentDescription = S.run.voiceClosing(remaining) })
                                HText(S.run.closingCta, style = Hex.type.title2, modifier = Modifier.padding(bottom = 14.dp))
                            }
                            if (preview != null) HText(S.run.closingPreview(preview.empty), tone = Tone.Ink2)
                            preview?.duels?.firstOrNull()?.let { d -> DataText(S.run.duelCoverage(d.duel.defender.firstName, d.inside, d.total), tone = Tone.Ink2) }
                            Metrics(stacked, listOf(S.common.distance to Format.km(tracker.distanceM), S.common.pace to Format.pace(tracker.paceSecPerKm), S.common.time to Format.duration(snap.elapsedMs)))
                        }
                    } else {
                        Column(Modifier.testTag("run-hud"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            HText(
                                when {
                                    paused -> S.run.paused
                                    tracker.start != null -> S.run.toStart(Format.shortDistance(tracker.distToStartM))
                                    else -> S.run.gpsSearching
                                },
                                style = Hex.type.callout, tone = Tone.Ink2,
                            )
                            Metric(S.run.distanceKm, Format.km(tracker.distanceM), true)
                            Metrics(stacked, listOf(S.run.pacePerKm to Format.pace(tracker.paceSecPerKm), S.run.time to Format.duration(snap.elapsedMs)))
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 12.dp, top = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    HButton(
                        if (paused) S.run.resume else S.run.pause, if (paused) onResume else onPause,
                        Modifier.weight(1f).testTag("pause"), kind = ButtonKind.Secondary, icon = if (paused) HexIcon.Play else HexIcon.Pause, big = true, minHeight = Target.runBar,
                    )
                    HoldButton(S.run.finish, S.run.holdHint, HexIcon.Stop, onFinish, S.run.finishConfirm, Modifier.weight(1f).testTag("finish"))
                }
            }
        }

        state.conquest?.let { cq ->
            ConquestOverlay(cq, snap, events.map { it.name }, onContinue = onDismissConquest, onFinish = onFinish)
        }

        if (state.locked) LockOverlay(onUnlock = { onLock(false) })
    }
}

@Composable
private fun Metrics(stacked: Boolean, items: List<Pair<String, String>>) {
    if (stacked) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { for ((l, v) in items) Metric(l, v, false) }
    } else {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            for ((l, v) in items) Box(Modifier.weight(1f)) { Metric(l, v, false) }
        }
    }
}

@Composable
private fun Metric(label: String, value: String, big: Boolean) {
    Column(Modifier.clearAndSetSemantics { contentDescription = "$label: $value" }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        HText(label, style = Hex.type.label.capped(), tone = Tone.Ink2, upper = true)
        HText(value, style = (if (big) Hex.type.hudXl else Hex.type.hudM).capped(), maxLines = 1)
    }
}

/** Kilit: dokunuşlar yutulur; 1,5 sn basılı tutunca açılır (TalkBack: çift dokunma). */
@Composable
private fun LockOverlay(onUnlock: () -> Unit) {
    val c = Hex.colors
    Box(
        Modifier.fillMaxSize()
            .semantics {
                role = Role.Button
                contentDescription = "${S.run.locked}. ${S.run.unlockHint}"
                onClick { onUnlock(); true }
            }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false).consume()
                    val up = withTimeoutOrNull(1500) { waitForUpOrCancellation() }
                    if (up == null) onUnlock()
                }
            }
            .testTag("lock-overlay"),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Row(
            Modifier.navigationBarsPadding().padding(bottom = 120.dp).clip(RoundedCornerShape(50)).background(c.inv).padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            HText(S.run.locked, style = Hex.type.callout, color = c.invInk, weight = FontWeight.Bold)
            HText("· ${S.run.unlockHint}", style = Hex.type.callout, color = c.invInk)
        }
    }
}

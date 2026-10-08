package co.hexrun.wear.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.wear.compose.foundation.CurvedDirection
import androidx.wear.compose.foundation.CurvedLayout
import androidx.wear.compose.foundation.CurvedTextStyle
import androidx.wear.compose.foundation.curvedText
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.Vignette
import androidx.wear.compose.material.VignettePosition
import co.hexrun.app.R
import co.hexrun.wear.state.HudStates
import co.hexrun.wear.state.WearAction
import co.hexrun.wear.state.WearScreen
import co.hexrun.wear.state.WearScreens
import co.hexrun.wear.state.WearState
import co.hexrun.wear.state.WearStore
import co.hexrun.wear.state.WearTiming
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Locale

/** Kök: durumu toplar, saniyelik saati sürer, ekranı seçer. */
@Composable
fun WearRoot(store: WearStore) {
    val state by store.state.collectAsStateWithLifecycle()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner, store) {
        lifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                now = System.currentTimeMillis()
                store.dispatch(WearAction.Clock(now))
                delay(1000 - now % 1000)
            }
        }
    }
    // Yeni yük, saniye saatinden önce gelmiş olabilir: ekran hiçbir zaman yükten eski saatle türetilmez.
    val t = maxOf(now, state.hudAtMs, state.conquest?.shownAtMs ?: 0L)
    val screen = WearScreens.of(state, t)

    val view = LocalView.current
    val keepOn = WearScreens.keepScreenOn(screen)
    DisposableEffect(view, keepOn) {
        view.keepScreenOn = keepOn
        onDispose { view.keepScreenOn = false }
    }

    HexWearTheme {
        Box(
            Modifier
                .fillMaxSize()
                .background(WearColors.Black),
        ) {
            when (screen) {
                WearScreen.Idle -> IdleScreen()
                else -> HudScreen(
                    screen = screen,
                    state = state,
                    onTap = { store.dispatch(WearAction.Tap(System.currentTimeMillis())) },
                    onFinish = { store.dispatch(WearAction.FinishHold(System.currentTimeMillis())) },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Boşta: kaydırılabilir bilgi (ScalingLazyColumn), saat üstte.

@Composable
private fun IdleScreen() {
    val listState = rememberScalingLazyListState()
    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
        positionIndicator = { PositionIndicator(scalingLazyListState = listState) },
    ) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = listState,
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item { HexMark(Modifier.size(36.dp)) }
            item {
                Text(
                    text = stringResource(R.string.idle_title),
                    color = WearColors.Ink,
                    style = TextStyle(fontFamily = WearFonts.archivo, fontWeight = FontWeight(900), fontSize = 20.sp),
                    modifier = Modifier.semantics { heading() },
                )
            }
            item {
                Text(
                    text = stringResource(R.string.idle_body),
                    color = WearColors.Ink,
                    textAlign = TextAlign.Center,
                    style = TextStyle(fontFamily = WearFonts.archivo, fontWeight = FontWeight(800), fontSize = 16.sp, lineHeight = 20.sp),
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
            item {
                Text(
                    text = stringResource(R.string.idle_hint),
                    color = WearColors.Ink2,
                    textAlign = TextAlign.Center,
                    style = TextStyle(fontFamily = WearFonts.archivo, fontWeight = FontWeight(500), fontSize = 13.sp, lineHeight = 17.sp),
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
        }
    }
}

/** Uygulama simgesindeki petek: çerçeve + oyuncu renginde üçgen. */
@Composable
private fun HexMark(modifier: Modifier = Modifier) {
    Canvas(modifier.clearAndSetSemantics { }) {
        val k = size.minDimension / 48f
        val hex = Path().apply {
            moveTo(24f * k, 2f * k)
            lineTo(43f * k, 13f * k)
            lineTo(43f * k, 35f * k)
            lineTo(24f * k, 46f * k)
            lineTo(5f * k, 35f * k)
            lineTo(5f * k, 13f * k)
            close()
        }
        drawPath(hex, WearColors.Ink, style = Stroke(width = 4f * k, join = StrokeJoin.Round))
        val tri = Path().apply {
            moveTo(24f * k, 15f * k)
            lineTo(32.7f * k, 30f * k)
            lineTo(15.3f * k, 30f * k)
            close()
        }
        drawPath(tri, WearColors.Player)
    }
}

// ---------------------------------------------------------------------------------------------
// HUD: tek bakış ekranları (s17-saat · C). Dokun: duraklat / devam; 1,5 sn basılı tut: bitir.

private data class Glance(
    val key: String,
    val keyColor: Color,
    val value: String,
    /** 220 dp referans ekranda rakam boyu (dp). */
    val valueSize: Float,
    val sub: String?,
    val foot: String?,
    val ring: Float? = null,
    val ringColor: Color = WearColors.Player,
    val curvedHint: String? = null,
    val spinner: Boolean = false,
    val description: String,
    val live: Boolean = false,
)

@Composable
private fun HudScreen(
    screen: WearScreen,
    state: WearState,
    onTap: () -> Unit,
    onFinish: () -> Unit,
) {
    val g = glanceFor(screen)
    val tapEnabled = WearScreens.canTap(screen)
    val finishEnabled = WearScreens.canFinish(state) && screen !is WearScreen.Conquest
    val tapLabel = when {
        !tapEnabled -> null
        screen is WearScreen.Conquest -> stringResource(R.string.action_dismiss)
        state.effectiveState == HudStates.PAUSED -> stringResource(R.string.action_resume)
        state.effectiveState == HudStates.RUNNING -> stringResource(R.string.action_pause)
        else -> null
    }
    val finishLabel = if (finishEnabled) stringResource(R.string.action_finish) else null
    val holdingLabel = stringResource(R.string.cd_holding)

    val hold = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val tap by rememberUpdatedState(onTap)
    val finish by rememberUpdatedState(onFinish)

    Box(
        Modifier
            .fillMaxSize()
            .pointerInput(tapEnabled, finishEnabled) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val anim = if (finishEnabled) {
                        scope.launch {
                            hold.snapTo(0f)
                            hold.animateTo(1f, tween(WearTiming.FINISH_HOLD_MS.toInt(), easing = LinearEasing))
                        }
                    } else {
                        null
                    }
                    var timedOut = true
                    val up = withTimeoutOrNull(WearTiming.FINISH_HOLD_MS) {
                        val r = waitForUpOrCancellation()
                        timedOut = false
                        r
                    }
                    anim?.cancel()
                    if (timedOut) {
                        if (finishEnabled) finish()
                        waitForUpOrCancellation()
                        scope.launch { hold.snapTo(0f) }
                    } else {
                        scope.launch { hold.animateTo(0f, tween(150)) }
                        if (up != null && tapEnabled && up.uptimeMillis - down.uptimeMillis < WearTiming.TAP_MAX_MS) {
                            up.consume()
                            tap()
                        }
                    }
                }
            }
            .clearAndSetSemantics {
                contentDescription = if (hold.value > 0f) holdingLabel else g.description
                if (g.live) liveRegion = LiveRegionMode.Polite
                if (tapLabel != null) {
                    onClick(label = tapLabel) {
                        tap()
                        true
                    }
                }
                if (finishLabel != null) {
                    onLongClick(label = finishLabel) {
                        finish()
                        true
                    }
                }
            },
    ) {
        GlanceLayout(g, holdProgress = hold.value)
    }
}

@Composable
private fun glanceFor(screen: WearScreen): Glance = when (screen) {
    is WearScreen.Run -> {
        val pace = screen.a11y.let { a ->
            if (a.paceMin != null && a.paceSec != null) stringResource(R.string.cd_pace, a.paceMin, a.paceSec)
            else stringResource(R.string.cd_pace_none)
        }
        Glance(
            key = screen.loopOpenAway?.let { stringResource(R.string.loop_open, it) } ?: stringResource(R.string.run_key),
            keyColor = if (screen.loopOpenAway != null) WearColors.Player else WearColors.Ink2,
            value = screen.distance,
            valueSize = 64f,
            sub = stringResource(R.string.unit_km),
            foot = "${screen.pace} · ${screen.time}",
            description = listOfNotNull(
                screen.loopOpenAway?.let { stringResource(R.string.loop_open, it) },
                stringResource(R.string.cd_run, screen.distance, pace, screen.time),
            ).joinToString(". "),
        )
    }
    is WearScreen.Approach -> Glance(
        key = stringResource(R.string.close_loop),
        keyColor = WearColors.Player,
        value = stringResource(R.string.approach_value, screen.remainingM),
        valueSize = 64f,
        sub = stringResource(R.string.approach_sub),
        foot = "${screen.distance} km · ${screen.time}",
        ring = screen.progress,
        ringColor = WearColors.Player,
        description = stringResource(R.string.cd_approach, screen.remainingM, screen.distance, screen.time),
    )
    is WearScreen.Duel -> Glance(
        key = stringResource(R.string.duel_key, screen.opponent),
        keyColor = WearColors.Opponent,
        value = "${screen.covered}/${screen.total}",
        valueSize = 52f,
        sub = stringResource(R.string.cells_covered),
        foot = "${screen.distance} km · ${screen.time}",
        ring = screen.progress,
        ringColor = WearColors.Player,
        description = stringResource(R.string.cd_duel, screen.opponent, screen.covered, screen.total, screen.distance, screen.time),
    )
    is WearScreen.Paused -> Glance(
        key = stringResource(R.string.paused),
        keyColor = WearColors.Ink2,
        value = screen.distance,
        valueSize = 64f,
        sub = stringResource(R.string.unit_km),
        foot = "${screen.pace} · ${screen.time}",
        curvedHint = "${stringResource(R.string.paused_hint)} · ${stringResource(R.string.hold_to_finish)}",
        description = stringResource(R.string.cd_paused, screen.distance, screen.time),
        live = true,
    )
    is WearScreen.Conquest -> Glance(
        key = stringResource(R.string.conquest_key),
        keyColor = WearColors.Player,
        value = screen.cells,
        valueSize = 64f,
        sub = stringResource(R.string.cells_yours),
        foot = screen.area,
        ring = 1f,
        ringColor = WearColors.Player,
        description = listOfNotNull(
            stringResource(R.string.cd_conquest, screen.cells, screen.area),
            if (screen.captured > 0) stringResource(R.string.conquest_captured, screen.captured) else null,
        ).joinToString(". "),
        live = true,
    )
    is WearScreen.Stale -> Glance(
        key = stringResource(R.string.stale_title),
        keyColor = WearColors.Warn,
        value = screen.distance,
        valueSize = 56f,
        sub = stringResource(R.string.stale_body),
        foot = screen.time,
        description = "${stringResource(R.string.stale_title)}. ${stringResource(R.string.stale_body)}. " +
            stringResource(R.string.last_known, screen.distance, screen.time),
        live = true,
    )
    WearScreen.Finishing -> Glance(
        key = stringResource(R.string.finishing),
        keyColor = WearColors.Ink2,
        value = "",
        valueSize = 0f,
        sub = null,
        foot = null,
        spinner = true,
        description = stringResource(R.string.finishing),
        live = true,
    )
    is WearScreen.Finished -> Glance(
        key = stringResource(R.string.finished_title),
        keyColor = WearColors.Player,
        value = screen.distance,
        valueSize = 64f,
        sub = stringResource(R.string.unit_km),
        foot = "${screen.time} · ${stringResource(R.string.finished_body)}",
        description = "${stringResource(R.string.finished_title)}. ${screen.distance} km, ${screen.time}. ${stringResource(R.string.finished_body)}",
        live = true,
    )
    // Boşta ekranı WearRoot'ta ayrı çizilir.
    WearScreen.Idle -> Glance("", WearColors.Ink2, "", 0f, null, null, description = stringResource(R.string.idle_body))
}

@Composable
private fun GlanceLayout(g: Glance, holdProgress: Float) {
    val round = LocalConfiguration.current.isScreenRound
    val locale = LocalConfiguration.current.locales.get(0) ?: Locale.getDefault()
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val side: Dp = if (maxWidth < maxHeight) maxWidth else maxHeight
        val s = (side.value / 220f).coerceIn(0.7f, 1.6f)
        val density = LocalDensity.current
        // Saat yerleşimi ekran boyuyla ölçeklenir; yazı tipi ölçeği daire dışına taşırmasın diye dp tabanlı.
        fun fixed(dpAt220: Float): TextUnit = with(density) { (dpAt220 * s).dp.toSp() }

        if (g.ring != null) {
            Canvas(Modifier.fillMaxSize()) { ring(g.ring, g.ringColor, insetFrac = 10f / 220f, strokeFrac = 7f / 220f) }
        }
        if (g.spinner) {
            CircularProgressIndicator(
                modifier = Modifier
                    .fillMaxSize()
                    .padding((8 * s).dp),
                indicatorColor = WearColors.Player,
                trackColor = WearColors.Track,
                strokeWidth = (6 * s).dp,
            )
        }
        if (holdProgress > 0f) {
            Canvas(Modifier.fillMaxSize()) {
                ring(holdProgress, WearColors.Ink, insetFrac = 2.5f / 220f, strokeFrac = 4f / 220f, track = null)
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = (24 * s).dp, vertical = (if (round) 40 else 20 * 1f).let { (it * s).dp }),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = g.key.uppercase(locale),
                color = g.keyColor,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(
                    fontFamily = WearFonts.mono,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = fixed(12f),
                    lineHeight = fixed(16f),
                    letterSpacing = 0.06.em,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            if (g.value.isNotEmpty()) {
                Spacer(Modifier.height((4 * s).dp))
                Text(
                    text = g.value,
                    color = WearColors.Ink,
                    maxLines = 1,
                    softWrap = false,
                    style = TextStyle(
                        fontFamily = WearFonts.condensed,
                        fontWeight = FontWeight(850),
                        fontSize = fixed(g.valueSize),
                        lineHeight = fixed(g.valueSize),
                        letterSpacing = (-0.02).em,
                        fontFeatureSettings = "tnum",
                    ),
                )
            }
            if (g.sub != null) {
                Text(
                    text = g.sub,
                    color = WearColors.Ink,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = TextStyle(
                        fontFamily = WearFonts.archivo,
                        fontWeight = FontWeight(800),
                        fontSize = fixed(15f),
                        lineHeight = fixed(19f),
                    ),
                )
            }
            Spacer(Modifier.weight(1f))
            if (g.foot != null) {
                Text(
                    text = g.foot,
                    color = WearColors.Ink2,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = TextStyle(
                        fontFamily = WearFonts.mono,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = fixed(13f),
                        lineHeight = fixed(15f),
                    ),
                )
            }
        }

        if (g.curvedHint != null && holdProgress == 0f) {
            if (round) {
                CurvedLayout(
                    modifier = Modifier.fillMaxSize(),
                    anchor = 90f,
                    angularDirection = CurvedDirection.Angular.Reversed,
                ) {
                    curvedText(
                        text = g.curvedHint,
                        style = CurvedTextStyle(color = WearColors.Ink3, fontSize = fixed(11f), fontWeight = FontWeight.SemiBold),
                    )
                }
            } else {
                Text(
                    text = g.curvedHint,
                    color = WearColors.Ink3,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = TextStyle(fontFamily = WearFonts.archivo, fontWeight = FontWeight.SemiBold, fontSize = fixed(11f)),
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = (4 * s).dp),
                )
            }
        }
    }
}

/** Ekran kenarına oturan ilerleme halkası; tepe noktasından saat yönünde. */
private fun DrawScope.ring(
    progress: Float,
    color: Color,
    insetFrac: Float,
    strokeFrac: Float,
    track: Color? = WearColors.Track,
) {
    val d = size.minDimension
    val stroke = d * strokeFrac
    val inset = d * insetFrac
    val diameter = d - 2 * inset
    val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
    val arcSize = Size(diameter, diameter)
    if (track != null) {
        drawArc(track, startAngle = -90f, sweepAngle = 360f, useCenter = false, topLeft = topLeft, size = arcSize, style = Stroke(stroke))
    }
    val p = progress.coerceIn(0f, 1f)
    if (p > 0f) {
        drawArc(
            color,
            startAngle = -90f,
            sweepAngle = 360f * p,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(stroke, cap = if (p < 1f) StrokeCap.Round else StrokeCap.Butt),
        )
    }
}

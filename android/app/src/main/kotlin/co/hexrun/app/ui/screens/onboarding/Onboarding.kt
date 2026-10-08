package co.hexrun.app.ui.screens.onboarding

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.hexrun.app.data.LocPerm
import co.hexrun.app.data.NotifPerm
import co.hexrun.app.data.PermissionsRepository
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.nav.Routes
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HCard
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.IconBubble
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.TextButtonH
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Space
import co.hexrun.app.util.openAppSettings
import co.hexrun.core.colors.Slot
import co.hexrun.core.i18n.S
import kotlinx.coroutines.launch
import kotlin.math.sqrt

/** 01 · Üç kelime, üç ekran: Koş. Halkayı kapat. Fethet. */
@Composable
fun OnboardingScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    OnboardingContent(onFinish = {
        scope.launch {
            graph.prefs.update { it.copy(onboardingDone = true) }
            nav.reset(Routes.PERMISSIONS)
        }
    })
}

@Composable
fun OnboardingContent(onFinish: () -> Unit) {
    val c = Hex.colors
    var i by rememberSaveable { mutableIntStateOf(0) }
    val page = S.onboarding.pages[i]
    Column(Modifier.fillMaxSize().background(c.bg).statusBarsPadding().navigationBarsPadding().padding(bottom = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = Space.gutter).defaultMinSize(minHeight = 48.dp), verticalAlignment = Alignment.CenterVertically) {
            Label(page.kicker)
            Spacer(Modifier.weight(1f))
            if (i < 2) TextButtonH(S.common.skip, onFinish)
        }
        Box(Modifier.weight(1f).fillMaxWidth().padding(horizontal = Space.gutter), contentAlignment = Alignment.Center) {
            OnboardingArt(step = i, modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp).aspectRatio(1f))
        }
        Column(Modifier.padding(horizontal = Space.gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            HText(page.title, style = Hex.type.display, heading = true)
            HText(page.body, tone = Tone.Ink2)
            Row(Modifier.padding(vertical = 12.dp).clearAndSetSemantics { contentDescription = page.kicker }, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (k in 0..2) {
                    Box(Modifier.weight(if (k == i) 2f else 1f).height(4.dp).clip(RoundedCornerShape(2.dp)).background(if (k <= i) c.ink else c.track))
                }
            }
            if (i < 2) HButton(S.common.continue_, { i++ }, Modifier.fillMaxWidth(), big = true)
            else HButton(S.onboarding.start, onFinish, Modifier.fillMaxWidth(), big = true)
        }
    }
}

private val LOOP = listOf(96f to 250f, 84f to 190f, 104f to 132f, 170f to 104f, 246f to 120f, 276f to 190f, 254f to 262f, 186f to 300f, 128f to 286f)

private fun inPoly(x: Float, y: Float, p: List<Pair<Float, Float>>): Boolean {
    var inside = false
    var j = p.size - 1
    for (i in p.indices) {
        val (xi, yi) = p[i]
        val (xj, yj) = p[j]
        if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
        j = i
    }
    return inside
}

/** Onboarding çizimleri: her ekran bir öncekinin devamı (iz → halka → fetih). */
@Composable
fun OnboardingArt(step: Int, modifier: Modifier = Modifier) {
    val c = Hex.colors
    val own = c.player(Slot.KEH)
    Canvas(modifier.clearAndSetSemantics { }) {
        val s = size.minDimension / 360f
        translate((size.width - 360f * s) / 2, (size.height - 360f * s) / 2) {
            scale(s, s, pivot = Offset.Zero) {
                val r = 11f
                val dx = r * sqrt(3f)
                val dy = r * 1.5f
                val a = r * sqrt(3f) / 2
                val b = r / 2
                val grid = Path()
                val cells = Path()
                fun hex(p: Path, x: Float, y: Float) {
                    p.moveTo(x, y - r); p.relativeLineTo(a, b); p.relativeLineTo(0f, r); p.relativeLineTo(-a, b)
                    p.relativeLineTo(-a, -b); p.relativeLineTo(0f, -r); p.close()
                }
                for (row in 0 until 24) for (q in 0 until 14) {
                    val x = q * dx + if (row % 2 == 1) dx / 2 else 0f
                    val y = row * dy
                    hex(grid, x, y)
                    if (step == 2 && inPoly(x, y, LOOP)) hex(cells, x, y)
                }
                drawPath(grid, c.tex, style = Stroke(1f))
                if (step == 2) {
                    drawPath(cells, own.copy(alpha = c.cellFillOpacity))
                    drawPath(cells, c.casing.copy(alpha = 0.6f), style = Stroke(1f))
                }
                val pts = if (step == 0) LOOP.take(6) else LOOP + LOOP.first()
                val trace = Path().apply { pts.forEachIndexed { i, (x, y) -> if (i == 0) moveTo(x, y) else lineTo(x, y) } }
                if (step == 1) drawPath(Path().apply { addPath(trace); close() }, c.ink.copy(alpha = 0.08f))
                drawPath(trace, c.ink, style = Stroke(8f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                drawPath(trace, c.trace, style = Stroke(3.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                if (step >= 1) {
                    drawCircle(c.ink, 26f, Offset(96f, 250f), style = Stroke(1.5f))
                    drawCircle(c.ink, 20f, Offset(96f, 250f), style = Stroke(1.5f))
                }
                drawPath(Path().apply { moveTo(96f, 238f); relativeLineTo(11f, 19f); relativeLineTo(-22f, 0f); close() }, c.ink)
            }
        }
    }
}

/**
 * İzinler: sistem penceresinden ÖNCE gerekçe. Konum reddedilirse uygulama yine açılır ama koşu
 * kilitli kalır. Arka plan konumu Android 10+ ayrı sorulur (isteğe bağlı: koşu ön plan servisiyle
 * kaydedilir).
 */
@Composable
fun PermissionsScreen(onDone: () -> Unit) {
    val graph = LocalGraph.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val perm by graph.permissions.state.collectAsStateWithLifecycle()
    val refresh = { graph.permissions.refresh(graph.prefs.prefs.value) }
    val bgLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { refresh() }
    val locLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        scope.launch { graph.prefs.update { it.copy(locationAsked = true) }; refresh() }
    }
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        scope.launch {
            graph.prefs.update { it.copy(notificationsAsked = true, permissionsDone = true) }
            refresh()
            onDone()
        }
    }
    val finish = {
        scope.launch {
            graph.prefs.update { it.copy(permissionsDone = true) }
            onDone()
        }
        Unit
    }
    PermissionsContent(
        location = perm.location,
        notifications = perm.notifications,
        onAskLocation = { locLauncher.launch(PermissionsRepository.LOCATION) },
        onAskBackground = {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) bgLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        },
        onOpenSettings = { context.openAppSettings() },
        onAskNotifications = {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) else finish()
        },
        onContinue = finish,
    )
}

@Composable
fun PermissionsContent(
    location: LocPerm,
    notifications: NotifPerm,
    onAskLocation: () -> Unit,
    onAskBackground: () -> Unit,
    onOpenSettings: () -> Unit,
    onAskNotifications: () -> Unit,
    onContinue: () -> Unit,
) {
    val c = Hex.colors
    val locStatus = when (location) {
        LocPerm.ALWAYS -> S.permissions.locationGrantedAlways
        LocPerm.WHEN_IN_USE -> S.permissions.locationGrantedWhenInUse
        LocPerm.DENIED -> S.permissions.locationDenied
        LocPerm.UNKNOWN -> null
    }
    Column(Modifier.fillMaxSize().background(c.bg).statusBarsPadding().navigationBarsPadding().padding(horizontal = Space.gutter).padding(top = 24.dp, bottom = 16.dp)) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            HText(S.permissions.title, style = Hex.type.title1, heading = true)
            HText(S.permissions.body, tone = Tone.Ink2)
            PermCard(HexIcon.Locate, S.permissions.location, S.permissions.locationWhy, locStatus) {
                when (location) {
                    LocPerm.UNKNOWN -> HButton(S.permissions.locationAsk, onAskLocation, Modifier.fillMaxWidth())
                    LocPerm.DENIED -> HButton(S.permissions.openSettings, onOpenSettings, Modifier.fillMaxWidth(), kind = ButtonKind.Secondary)
                    LocPerm.WHEN_IN_USE -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        HText(S.permissions.backgroundWhy, style = Hex.type.callout, tone = Tone.Ink2)
                        HButton(S.permissions.backgroundAsk, onAskBackground, Modifier.fillMaxWidth(), kind = ButtonKind.Secondary)
                    }
                    LocPerm.ALWAYS -> Unit
                }
            }
            PermCard(HexIcon.Bell, S.permissions.notifications, S.permissions.notificationsWhy, if (notifications == NotifPerm.GRANTED) S.permissions.notificationsGranted else null)
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (notifications != NotifPerm.GRANTED) {
                HButton(S.permissions.notificationsAsk, onAskNotifications, Modifier.fillMaxWidth(), big = true)
                TextButtonH(S.permissions.later, onContinue, Modifier.fillMaxWidth())
            } else {
                HButton(S.common.continue_, onContinue, Modifier.fillMaxWidth(), big = true)
            }
        }
    }
}

@Composable
private fun PermCard(icon: HexIcon, title: String, why: String, status: String?, actions: @Composable () -> Unit = {}) {
    HCard {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            IconBubble(icon, size = 40.dp, iconSize = 22.dp)
            HText(title, style = Hex.type.title2)
        }
        HText(why, tone = Tone.Ink2)
        if (status != null) DataText(status, tone = Tone.Ink2)
        actions()
    }
}

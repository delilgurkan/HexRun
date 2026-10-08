package co.hexrun.app.ui.screens.map

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import co.hexrun.app.data.LocPerm
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.nav.Routes
import co.hexrun.app.ui.components.ExtendedFab
import co.hexrun.app.ui.components.HChip
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.HexTexture
import co.hexrun.app.ui.components.IconButtonH
import co.hexrun.app.ui.components.PlayerBadge
import co.hexrun.app.ui.components.Skeleton
import co.hexrun.app.ui.map.DEFAULT_CENTER
import co.hexrun.app.ui.map.HexMap
import co.hexrun.app.ui.map.MapLayers
import co.hexrun.app.ui.map.rememberHexMapState
import co.hexrun.app.ui.screens.run.rememberRunStarter
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Space
import co.hexrun.app.util.animationsEnabled
import co.hexrun.app.util.openAppSettings
import co.hexrun.app.util.rememberCurrentLocation
import co.hexrun.core.cells.Cells
import co.hexrun.core.i18n.S
import co.hexrun.core.run.RunContext
import co.hexrun.core.ui.Dates
import co.hexrun.core.ui.EventsUi
import androidx.compose.ui.platform.LocalContext

/**
 * 03 · Ana harita. Arayüz yalnız dört köşede ve tek birincil eylemde (Android: Extended FAB).
 * Durumlar: dolu, boş (ilk halka önerisi), yükleniyor (petek iskeleti), çevrimdışı (soluk + tekrar dene).
 */
@Composable
fun MapScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val vm: MapViewModel = viewModel { MapViewModel(graph.api, graph.me, graph.prefs, graph.mapCache) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val perm by graph.permissions.state.collectAsStateWithLifecycle()
    val loc = rememberCurrentLocation(perm.location)
    val mapState = rememberHexMapState()
    val startRun = rememberRunStarter()
    val anim = animationsEnabled()
    var region by rememberSaveable { mutableStateOf<String?>(null) }
    val requested by nav.regionRequest.collectAsStateWithLifecycle()
    var centered by remember { mutableStateOf(false) }

    LaunchedEffect(requested) {
        requested?.let { region = it; nav.regionRequest.value = null }
    }
    LaunchedEffect(loc.pos) {
        val p = loc.pos ?: return@LaunchedEffect
        vm.onPosition(p, loc.fix)
        if (!centered) {
            centered = true
            mapState.flyTo(p, 15.0, 0)
        }
    }

    val c = Hex.colors
    val data = ui.shown
    val myId = ui.me?.id
    val runLocked = perm.location == LocPerm.DENIED
    val waitingGps = (perm.location == LocPerm.WHEN_IN_USE || perm.location == LocPerm.ALWAYS) && !loc.fix
    val suggestion = if (ui.isEmpty) ui.suggestion else null
    val active = ui.activeEvents
    val siege = if (!ui.offline) ui.siege else null
    val layers = remember(data, myId, ui.offline, suggestion) {
        MapLayers(
            cells = data?.cells ?: emptyList(),
            players = data?.players ?: emptyList(),
            myId = myId,
            attackers = data?.attackersLast48h ?: 0,
            faded = ui.offline,
            suggestion = suggestion?.ring,
        )
    }

    Box(Modifier.fillMaxSize().background(c.land)) {
        HexMap(
            layers = layers,
            modifier = Modifier.fillMaxSize(),
            state = mapState,
            center = loc.pos ?: DEFAULT_CENTER,
            zoom = 15.0,
            onBoundsChange = { b, _ -> vm.onBounds(b) },
            onCellPress = { id, _ -> region = id },
            onPlayerPress = { p -> p.marker?.let { m -> runCatching { Cells.cellOf(m) }.getOrNull()?.let { region = it } } },
        )
        if (data == null && !ui.offline) HexTexture(Modifier.fillMaxSize())

        // Üst köşeler: avatar + seri + çaylak, etkinlik çipi, zil.
        Column(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Space.gutter).padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButtonH(null, S.map.avatarA11y, { nav.go(Routes.profile()) }, size = 48.dp) {
                    val m = ui.me
                    if (m != null) PlayerBadge(m.slot, m.initials, size = 44.dp, goldFrame = m.goldFrame, ring = true)
                    else Skeleton(Modifier.padding(2.dp), height = 44.dp, radius = 22.dp)
                }
                ui.stats?.streakDays?.takeIf { it > 0 }?.let { HChip(S.map.streakChip(it), icon = HexIcon.Streak, glass = true) }
                ui.me?.newbieDaysLeft?.takeIf { it > 0 }?.let { HChip(S.rookie.chip(it), glass = true) }
                Spacer(Modifier.weight(1f))
                IconButtonH(HexIcon.Bell, S.map.bellA11y(ui.unread), { nav.go(Routes.NOTIFICATIONS) }, glass = true, badge = ui.unread)
            }
            if (active.isNotEmpty()) {
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    HChip("${S.map.eventsChip(active.size)} · ${EventsUi.shortLabel(active)}", icon = HexIcon.Events, glass = true, onClick = { nav.go(Routes.main("events")) })
                }
            }
            if (data == null && !ui.offline) HChip(S.map.loadingRegions, glass = true)
        }

        // Alt: kart + tek birincil eylem.
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = Space.gutter).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                IconButtonH(HexIcon.Locate, S.map.myLocation, { loc.pos?.let { mapState.flyTo(it, 15.5, if (anim) 600 else 0) } }, glass = true)
            }
            if (ui.offline) OfflineCard(ui.lastMap?.let { Dates.minutesAgo(it.at) }, vm::retry)
            val me = ui.me
            if (siege != null && me != null) SiegeBanner(siege, me.slot) { nav.go(Routes.duel(siege.id)) }
            if (suggestion != null) {
                FirstLoopCard(suggestion, onStart = { startRun(RunContext(firstLoop = true)) }, onDismiss = vm::dismissFirstLoop)
            } else {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    ExtendedFab(
                        label = when {
                            runLocked -> S.map.runLocked
                            waitingGps -> S.map.locating
                            else -> S.map.startFab
                        },
                        icon = if (runLocked) HexIcon.Lock else HexIcon.Start,
                        onClick = { if (runLocked) context.openAppSettings() else startRun(RunContext()) },
                        enabled = !waitingGps,
                        contentDescription = if (runLocked) "${S.map.runLocked}. ${S.map.runLockedBody}" else S.map.startA11y,
                    )
                }
            }
        }
    }

    region?.let { cell ->
        RegionSheet(
            cell = cell,
            api = graph.api,
            me = ui.me,
            actions = RegionActions(
                onRunHere = { r ->
                    region = null
                    startRun(if (r.myDuel != null) RunContext(attackDuelId = r.myDuel!!.id) else RunContext())
                },
                onStartDuel = { r ->
                    region = null
                    nav.go(Routes.duelSelect(cell = cell, defender = r.owner?.id))
                },
                onOpenDuel = { d ->
                    region = null
                    nav.go(Routes.duel(d.id))
                },
            ),
            onDismiss = { region = null },
        )
    }
}

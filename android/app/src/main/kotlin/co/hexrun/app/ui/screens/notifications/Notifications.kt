package co.hexrun.app.ui.screens.notifications

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.ui.attempt
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.FilterPill
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HIcon
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HTopBar
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.SkeletonList
import co.hexrun.app.ui.components.StateBlock
import co.hexrun.app.ui.components.TextButtonH
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Space
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.api.NotificationDto
import co.hexrun.core.api.NotificationFilter
import co.hexrun.core.colors.Slot
import co.hexrun.core.deeplink.DeepLinks
import co.hexrun.core.i18n.S
import co.hexrun.core.ui.Dates
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NotificationsUi(
    val filter: NotificationFilter = NotificationFilter.ALL,
    val items: List<NotificationDto> = emptyList(),
    val cursor: String? = null,
    val loading: Boolean = true,
    val loadingMore: Boolean = false,
    val error: Throwable? = null,
)

/** 13 · Bildirim merkezi: filtre, sayfalama, okundu işaretleme (iyimser). */
class NotificationsViewModel(private val api: HexRunApi, private val now: () -> Long = System::currentTimeMillis) : ViewModel() {
    private val _ui = MutableStateFlow(NotificationsUi())
    val ui: StateFlow<NotificationsUi> = _ui.asStateFlow()
    private var job: Job? = null

    init { load() }

    fun setFilter(f: NotificationFilter) {
        if (f == _ui.value.filter) return
        _ui.value = NotificationsUi(filter = f)
        load()
    }

    fun load() {
        job?.cancel()
        val f = _ui.value.filter
        _ui.update { it.copy(loading = true, error = null) }
        job = viewModelScope.launch {
            attempt { api.notifications(f) }
                .onSuccess { p -> _ui.update { it.copy(items = p.items, cursor = p.nextCursor, loading = false) } }
                .onFailure { e -> _ui.update { it.copy(loading = false, error = e) } }
        }
    }

    fun loadMore() {
        val s = _ui.value
        val cursor = s.cursor ?: return
        if (s.loadingMore) return
        _ui.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            attempt { api.notifications(s.filter, cursor) }
                .onSuccess { p -> _ui.update { it.copy(items = it.items + p.items.filter { n -> it.items.none { o -> o.id == n.id } }, cursor = p.nextCursor, loadingMore = false) } }
                .onFailure { _ui.update { it.copy(loadingMore = false) } }
        }
    }

    /** ids null → tümü okundu. */
    fun markRead(ids: List<String>? = null) {
        _ui.update { s -> s.copy(items = s.items.map { if (ids == null || it.id in ids) it.copy(read = true) else it }) }
        viewModelScope.launch { attempt { api.readNotifications(ids) } }
    }

    fun groups(): List<Pair<Dates.DayGroup, List<NotificationDto>>> {
        val t = now()
        return Dates.DayGroup.entries.map { g -> g to _ui.value.items.filter { Dates.dayGroup(it.createdAt, t) == g } }.filter { it.second.isNotEmpty() }
    }
}

private fun groupLabel(g: Dates.DayGroup) = when (g) {
    Dates.DayGroup.TODAY -> S.common.today
    Dates.DayGroup.YESTERDAY -> S.common.yesterday
    Dates.DayGroup.WEEK -> S.common.thisWeek
    Dates.DayGroup.EARLIER -> S.common.earlier
}

@Composable
fun NotificationsScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val vm: NotificationsViewModel = viewModel { NotificationsViewModel(graph.api) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val groups = remember(ui.items) { vm.groups() }
    NotificationsContent(
        ui = ui,
        groups = groups,
        onBack = nav::back,
        onFilter = vm::setFilter,
        onMarkAll = { vm.markRead(null) },
        onRetry = vm::load,
        onMore = vm::loadMore,
        onOpen = { n ->
            if (!n.read) vm.markRead(listOf(n.id))
            DeepLinks.parse(n.action?.deeplink)?.let(nav.open)
        },
        onAction = { n -> DeepLinks.parse(n.action?.deeplink)?.let(nav.open) },
    )
}

@Composable
fun NotificationsContent(
    ui: NotificationsUi,
    groups: List<Pair<Dates.DayGroup, List<NotificationDto>>>,
    onBack: () -> Unit,
    onFilter: (NotificationFilter) -> Unit,
    onMarkAll: () -> Unit,
    onRetry: () -> Unit,
    onMore: () -> Unit,
    onOpen: (NotificationDto) -> Unit,
    onAction: (NotificationDto) -> Unit,
) {
    val c = Hex.colors
    val list = rememberLazyListState()
    val nearEnd by remember { derivedStateOf { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= list.layoutInfo.totalItemsCount - 3 } == true } }
    LaunchedEffect(nearEnd) { if (nearEnd) onMore() }
    Column(Modifier.fillMaxSize().background(c.bg).statusBarsPadding()) {
        HTopBar(S.notifications.title, onBack, actions = { TextButtonH(S.notifications.markRead, onMarkAll, Modifier.testTag("mark-read")) })
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = Space.gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((f, label) in listOf(
                NotificationFilter.ALL to S.notifications.filterAll,
                NotificationFilter.SIEGE to S.notifications.filterSiege,
                NotificationFilter.REGION to S.notifications.filterRegion,
                NotificationFilter.TEAM to S.notifications.filterTeam,
            )) FilterPill(label, ui.filter == f, { onFilter(f) }, Modifier.testTag("filter-${f.wire}"))
        }
        when {
            ui.loading && ui.items.isEmpty() -> Box(Modifier.padding(Space.gutter).testTag("notifications-loading")) { SkeletonList(5) }
            ui.error != null && ui.items.isEmpty() -> Box(Modifier.padding(Space.gutter)) { StateBlock(S.notifications.error, action = S.common.retry, onAction = onRetry) }
            ui.items.isEmpty() -> Box(Modifier.padding(Space.gutter).testTag("notifications-empty")) { StateBlock(S.notifications.empty, icon = HexIcon.Bell) }
            else -> LazyColumn(Modifier.weight(1f).navigationBarsPadding(), state = list, contentPadding = PaddingValues(bottom = 24.dp)) {
                for ((g, items) in groups) {
                    item(key = "h-$g") { Label(groupLabel(g), Modifier.padding(horizontal = Space.gutter).padding(top = 12.dp, bottom = 4.dp)) }
                    items(items, key = { it.id }) { n -> NotificationRow(n, onOpen, onAction) }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(n: NotificationDto, onOpen: (NotificationDto) -> Unit, onAction: (NotificationDto) -> Unit) {
    val c = Hex.colors
    val g = Dates.dayGroup(n.createdAt)
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = { onOpen(n) })
            .semantics(mergeDescendants = true) { contentDescription = "${if (n.read) "" else S.notifications.unread}${n.title}. ${n.body}" }
            .padding(horizontal = Space.gutter, vertical = 12.dp).testTag("notif-${n.id}"),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        NotifIcon(n.kind)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HText(n.title, style = Hex.type.callout, weight = if (n.read) FontWeight.Medium else FontWeight.Bold, modifier = Modifier.weight(1f))
                DataText(if (g == Dates.DayGroup.TODAY || g == Dates.DayGroup.YESTERDAY) Dates.hhmm(n.createdAt) else Dates.shortDate(n.createdAt), tone = Tone.Ink3)
            }
            HText(n.body, style = Hex.type.callout.copy(fontSize = Hex.type.callout.fontSize * 0.94f), tone = Tone.Ink2)
            n.action?.let { a -> HButton(a.label, { onAction(n) }, Modifier.padding(top = 6.dp).testTag("notif-action-${n.id}")) }
        }
        if (!n.read) Box(Modifier.padding(top = 6.dp).size(8.dp).clip(CircleShape).background(c.ink).clearAndSetSemantics { })
    }
}

/** Oyun dilinden ikon: kuşatma = tarama, el değiştirme = iki renk üst üste, erime = hayalet segment. */
@Composable
private fun NotifIcon(kind: String) {
    val c = Hex.colors
    val box = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.surf2)
    when (kind) {
        "siege_warn", "siege_alarm", "duel_started" -> Canvas(box) {
            var k = -size.height
            while (k < size.width) {
                drawLine(c.ink, Offset(k, size.height), Offset(k + size.height, 0f), strokeWidth = 2.5.dp.toPx())
                k += 6.dp.toPx()
            }
        }
        "cells_lost", "duel_won" -> Box(box) {
            Box(Modifier.offset(8.dp, 8.dp).size(18.dp).clip(RoundedCornerShape(4.dp)).background(c.player(Slot.GUL)))
            Box(Modifier.offset(14.dp, 14.dp).size(18.dp).clip(RoundedCornerShape(4.dp)).background(c.player(Slot.KEH)).border(1.5.dp, c.casing, RoundedCornerShape(4.dp)))
        }
        "decay_warning", "decay_lost" -> Row(box.padding(horizontal = 6.dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
            for (o in listOf(1f, 1f, 0.32f, 0f)) {
                Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(1.dp)).background(if (o > 0) c.player(Slot.KEH).copy(alpha = o) else c.track))
            }
        }
        else -> Box(box, contentAlignment = Alignment.Center) {
            HIcon(
                when (kind) {
                    "event_started" -> HexIcon.Events
                    "team" -> HexIcon.Team
                    "review_result" -> HexIcon.Eye
                    "badge" -> HexIcon.Defend
                    else -> HexIcon.Bell
                },
                size = 20.dp,
            )
        }
    }
}

package co.hexrun.app.ui.screens.league

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import co.hexrun.app.data.MeRepository
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.ui.Load
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.FilterPill
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.PlayerBadge
import co.hexrun.app.ui.components.Segmented
import co.hexrun.app.ui.components.Skeleton
import co.hexrun.app.ui.components.StateBlock
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.screens.run.rememberRunStarter
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.ui.theme.Space
import co.hexrun.app.ui.attempt
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.api.LeaguePeriod
import co.hexrun.core.api.LeagueResponse
import co.hexrun.core.api.LeagueRow
import co.hexrun.core.api.LeagueScope
import co.hexrun.core.api.Me
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import co.hexrun.core.run.RunContext
import co.hexrun.core.ui.Dates
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LeagueUi(
    val scope: LeagueScope = LeagueScope.INDIVIDUAL,
    val period: LeaguePeriod = LeaguePeriod.WEEK,
    val data: Load<LeagueResponse> = Load(loading = true),
    val me: Me? = null,
) {
    val empty: Boolean get() = data.data?.rows?.isEmpty() == true
    /** Sabit "senin satırın": sunucu vermediyse sıra yok (—). */
    val meRow: LeagueRow?
        get() = data.data?.me ?: me?.let { LeagueRow(rank = 0, id = it.id, name = it.displayName, initials = it.initials, slot = it.slot, isMe = true) }
}

/** 11 · Lig: yerel bölge; kategori ve dönem ayrı kontroller; önceki tablo yenilenirken korunur. */
class LeagueViewModel(private val api: HexRunApi, private val meRepo: MeRepository) : ViewModel() {
    private val _ui = MutableStateFlow(LeagueUi())
    val ui: StateFlow<LeagueUi> = _ui.asStateFlow()
    private var job: Job? = null

    init {
        viewModelScope.launch { meRepo.me.collect { m -> _ui.update { it.copy(me = m) } } }
        load()
    }

    fun setScope(s: LeagueScope) { _ui.update { it.copy(scope = s) }; load() }
    fun setPeriod(p: LeaguePeriod) { _ui.update { it.copy(period = p) }; load() }

    fun load() {
        job?.cancel()
        val s = _ui.value
        _ui.update { it.copy(data = it.data.copy(loading = true, error = null)) }
        job = viewModelScope.launch {
            attempt { api.league(s.scope, s.period) }
                .onSuccess { r -> _ui.update { it.copy(data = Load(r)) } }
                .onFailure { e -> _ui.update { it.copy(data = it.data.copy(loading = false, error = e)) } }
        }
    }
}

private fun endsIn(endsAt: String?, now: Long = System.currentTimeMillis()): String? {
    val t = Dates.parse(endsAt) ?: return null
    val h = (maxOf(0L, t - now) / 3_600_000L).toInt()
    return S.league.endsIn(h / 24, h % 24)
}

@Composable
fun LeagueScreen() {
    val graph = LocalGraph.current
    val vm: LeagueViewModel = viewModel { LeagueViewModel(graph.api, graph.me) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val start = rememberRunStarter()
    LeagueContent(ui, vm::setScope, vm::setPeriod, vm::load, onStart = { start(RunContext()) })
}

@Composable
fun LeagueContent(ui: LeagueUi, onScope: (LeagueScope) -> Unit, onPeriod: (LeaguePeriod) -> Unit, onRetry: () -> Unit, onStart: () -> Unit) {
    val c = Hex.colors
    val data = ui.data.data
    val region = data?.regionName ?: ""
    val failed = ui.data.failed
    val metric = when (ui.period) {
        LeaguePeriod.WEEK -> S.league.metricWeek
        LeaguePeriod.MONTH -> S.league.metricMonth
        LeaguePeriod.ALL -> S.league.metricAll
    }
    Box(Modifier.fillMaxSize().background(c.bg).statusBarsPadding()) {
        Column(Modifier.fillMaxSize()) {
            Column(Modifier.padding(horizontal = Space.gutter).padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.defaultMinSize(minHeight = 64.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HText(S.league.title, style = Hex.type.title2, heading = true)
                    HText(region, style = Hex.type.title2, tone = Tone.Ink2, weight = FontWeight.SemiBold)
                }
                Segmented(listOf(LeagueScope.INDIVIDUAL to S.league.individual, LeagueScope.TEAM to S.league.team), ui.scope, onScope, Modifier.testTag("league-scope"))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((p, label) in listOf(LeaguePeriod.WEEK to S.league.week, LeaguePeriod.MONTH to S.league.month, LeaguePeriod.ALL to S.league.all)) {
                        FilterPill(label, ui.period == p, { onPeriod(p) })
                    }
                }
                if (data != null && !ui.empty) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Label("${S.league.metric} · $metric")
                        if (ui.period != LeaguePeriod.ALL) endsIn(data.endsAt)?.let { DataText(it, tone = Tone.Ink2) }
                    }
                }
            }
            when {
                ui.data.initialLoading -> Column(Modifier.padding(horizontal = Space.gutter).testTag("league-loading").clearAndSetSemantics { contentDescription = S.league.loading }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    HText(S.league.loading, style = Hex.type.callout, tone = Tone.Ink2)
                    repeat(8) { Skeleton(height = 52.dp) }
                }
                failed && data == null -> Box(Modifier.padding(horizontal = Space.gutter).testTag("league-error")) {
                    StateBlock(S.league.errorTitle, action = S.common.retry, onAction = onRetry)
                }
                ui.empty -> Column(Modifier.padding(horizontal = Space.gutter).testTag("league-empty")) {
                    StateBlock(S.league.emptyTitle, body = S.league.emptyBody(region))
                    HButton(S.map.start, onStart, Modifier.fillMaxWidth(), big = true)
                }
                else -> {
                    if (failed && data != null) {
                        Row(Modifier.padding(horizontal = Space.gutter).padding(bottom = 8.dp).testTag("league-stale"), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                HText(S.league.errorTitle, style = Hex.type.callout, weight = FontWeight.Bold)
                                val at = Dates.parse(data.updatedAt)
                                val time = if (at != null) "${if (Dates.dayGroup(at) == Dates.DayGroup.TODAY) "bugün " else ""}${Dates.hhmm(at)}" else ""
                                HText(S.league.errorBody(time), style = Hex.type.callout, tone = Tone.Ink2)
                            }
                            HButton(S.common.retry, onRetry, kind = ButtonKind.Secondary)
                        }
                    }
                    LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = 110.dp)) {
                        items(data?.rows ?: emptyList(), key = { it.id }) { r -> LeagueRowView(r, faded = failed) }
                    }
                }
            }
        }
        val meRow = ui.meRow
        if (meRow != null && !ui.data.initialLoading) {
            Column(
                Modifier.align(Alignment.BottomCenter).padding(8.dp).fillMaxWidth().clip(RoundedCornerShape(Radii.m)).background(c.surf).border(1.dp, c.line, RoundedCornerShape(Radii.m)),
            ) {
                LeagueRowView(meRow.copy(isMe = true), pinned = true)
                data?.meNote?.let { HText(it, style = Hex.type.callout, tone = Tone.Ink2, modifier = Modifier.padding(horizontal = Space.gutter).padding(bottom = 8.dp)) }
            }
        }
    }
}

@Composable
fun LeagueRowView(r: LeagueRow, faded: Boolean = false, pinned: Boolean = false) {
    val c = Hex.colors
    val delta = r.delta ?: 0
    val name = if (r.isMe) S.common.you else r.name
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 60.dp)
            .testTag(if (pinned) "league-me" else "league-row-${r.rank}")
            .clearAndSetSemantics { contentDescription = S.league.rankA11y(r.rank, name, "${Format.int(r.valueM2)} m²") }
            .alpha(if (faded) 0.5f else 1f)
            .background(if (r.isMe && !pinned) c.surf2 else Color.Transparent)
            .padding(horizontal = Space.gutter),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        DataText(if (r.rank > 0) "${r.rank}" else "—", Modifier.width(28.dp), tone = Tone.Ink2)
        PlayerBadge(r.slot, r.initials, size = 32.dp, ring = r.isMe)
        Column(Modifier.weight(1f)) {
            HText(name, style = Hex.type.callout, weight = if (r.isMe) FontWeight.Bold else FontWeight.Medium, maxLines = 1)
            r.subtitle?.let { HText(it, style = Hex.type.callout.copy(fontSize = Hex.type.label.fontSize * 1.08f), tone = Tone.Ink2, maxLines = 1) }
        }
        Column(horizontalAlignment = Alignment.End) {
            DataText(Format.int(r.valueM2))
            if (r.delta != null) DataText(if (delta > 0) "▲ $delta" else if (delta < 0) "▼ ${-delta}" else "·", tone = Tone.Ink2)
        }
    }
}

package co.hexrun.app.ui.screens.run

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.nav.Routes
import co.hexrun.app.ui.attempt
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HCard
import co.hexrun.app.ui.components.HDivider
import co.hexrun.app.ui.components.HIcon
import co.hexrun.app.ui.components.HScreen
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.InfoRow
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.PlayerBadge
import co.hexrun.app.ui.components.Skeleton
import co.hexrun.app.ui.components.Stat
import co.hexrun.app.ui.components.StateBlock
import co.hexrun.app.ui.components.Tag
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.screens.auth.hexFieldColors
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.core.api.DuelSuggestion
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.api.RunSummary
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import co.hexrun.core.run.QueueStatus
import co.hexrun.core.run.RunContext
import co.hexrun.core.run.RunQueue
import co.hexrun.core.ui.Dates
import co.hexrun.core.ui.RunUi
import co.hexrun.core.ui.SummaryVariant
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SummaryUi(val kind: Kind = Kind.SENDING, val summary: RunSummary? = null) {
    /** SENDING: ilk deneme sürüyor · PENDING: kuyrukta (bağlantı gelince) · FAILED: kalıcı ret · ERROR: uzak özet alınamadı. */
    enum class Kind { SENDING, PENDING, FAILED, DONE, ERROR }
}

/**
 * 08 · Koşu özeti: kuyruktaki koşunun durumunu izler (gönderildi mi, bekliyor mu) ya da
 * sunucudan geçmiş bir koşuyu yükler.
 */
class SummaryViewModel(
    private val queue: RunQueue,
    private val api: HexRunApi,
    private val clientRunId: String?,
    private val runId: String?,
    private val onDone: () -> Unit = {},
    sendingTimeoutMs: Long = 8_000,
) : ViewModel() {
    private val _ui = MutableStateFlow(SummaryUi())
    val ui: StateFlow<SummaryUi> = _ui.asStateFlow()

    init {
        if (clientRunId != null) {
            viewModelScope.launch { queue.changes.collect { check() } }
            viewModelScope.launch {
                delay(sendingTimeoutMs)
                _ui.update { if (it.kind == SummaryUi.Kind.SENDING) it.copy(kind = SummaryUi.Kind.PENDING) else it }
            }
        } else loadRemote()
    }

    private suspend fun check() {
        val id = clientRunId ?: return
        when (queue.status(id)) {
            QueueStatus.DONE -> queue.result(id)?.let { s ->
                if (_ui.value.kind != SummaryUi.Kind.DONE) onDone()
                _ui.value = SummaryUi(SummaryUi.Kind.DONE, s)
            }
            QueueStatus.FAILED -> _ui.update { it.copy(kind = SummaryUi.Kind.FAILED) }
            else -> Unit
        }
    }

    fun loadRemote() {
        val id = runId ?: run { _ui.value = SummaryUi(SummaryUi.Kind.ERROR); return }
        _ui.value = SummaryUi(SummaryUi.Kind.SENDING)
        viewModelScope.launch {
            attempt { api.run(id) }
                .onSuccess { _ui.value = SummaryUi(SummaryUi.Kind.DONE, it) }
                .onFailure { _ui.value = SummaryUi(SummaryUi.Kind.ERROR) }
        }
    }

    fun retry() {
        if (clientRunId == null) return loadRemote()
        _ui.update { it.copy(kind = SummaryUi.Kind.SENDING) }
        viewModelScope.launch {
            attempt { queue.flush(force = true) }
            check()
            if (_ui.value.kind == SummaryUi.Kind.SENDING) _ui.update { it.copy(kind = SummaryUi.Kind.PENDING) }
        }
    }

    fun note(text: String, onSent: () -> Unit) {
        val id = _ui.value.summary?.id ?: return
        viewModelScope.launch { attempt { api.runNote(id, text) }.onSuccess { onSent() } }
    }
}

@Composable
fun SummaryScreen(clientRunId: String?, runId: String?) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val vm: SummaryViewModel = viewModel {
        SummaryViewModel(graph.runQueue, graph.api, clientRunId, runId, onDone = { graph.appScope.launch { graph.me.refresh() } })
    }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val start = rememberRunStarter()
    val toMap = { nav.toMain() }
    val s = ui.summary
    if (s == null) {
        HScreen(title = S.summary.done, footer = { HButton(S.summary.toMap, toMap, Modifier.fillMaxWidth(), big = true) }, modifier = Modifier.testTag("summary-pending")) {
            when (ui.kind) {
                SummaryUi.Kind.SENDING -> {
                    StateBlock(S.summary.sending)
                    Skeleton(height = 44.dp)
                    Skeleton(height = 88.dp)
                }
                SummaryUi.Kind.PENDING, SummaryUi.Kind.FAILED -> StateBlock(S.summary.pendingTitle, icon = HexIcon.Check, body = S.summary.pendingBody, action = S.common.retry, onAction = vm::retry)
                else -> StateBlock(S.common.genericError, action = S.common.retry, onAction = vm::retry)
            }
        }
        return
    }
    val v = RunUi.summaryVariant(s)
    HScreen(
        title = S.summary.done,
        modifier = Modifier.testTag("summary"),
        footer = if (v != SummaryVariant.REVIEW) {
            {
                if (s.totalGainedAreaM2 > 0) HButton(S.summary.share, { nav.go(Routes.share(s.id)) }, Modifier.fillMaxWidth(), big = true, icon = HexIcon.Share)
                HButton(S.summary.toMap, toMap, Modifier.fillMaxWidth(), big = true, kind = if (s.totalGainedAreaM2 > 0) ButtonKind.Secondary else ButtonKind.Primary)
            }
        } else null,
    ) {
        SummaryView(
            s,
            onDone = toMap,
            onMakeLoop = { start(RunContext()) },
            onEditSuggestion = { sg -> nav.replace(Routes.duelSelect(cell = sg.cells.firstOrNull(), cells = sg.cells, defender = sg.defender.id)) },
            onNote = { text, sent -> vm.note(text, sent) },
        )
    }
}

@Composable
private fun Metrics(s: RunSummary) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Stat(S.common.distance, "${Format.km(s.distanceM, 2)} km", Modifier.weight(1f))
        Stat(S.common.pace, "${Format.pace(s.paceSecPerKm)}/km", Modifier.weight(1f))
        Stat(S.common.time, Format.duration(s.durationMs), Modifier.weight(1f))
    }
}

/** Önce toprak, sonra fitness: A kapandı · B açık kaldı · C düello önerisi · inceleniyor. */
@Composable
fun SummaryView(s: RunSummary, onDone: () -> Unit, onMakeLoop: () -> Unit, onEditSuggestion: (DuelSuggestion) -> Unit, onNote: (String, () -> Unit) -> Unit) {
    val c = Hex.colors
    val v = RunUi.summaryVariant(s)
    val range = Dates.runRangeLabel(s.startedAt, s.endedAt)
    if (v == SummaryVariant.REVIEW) return ReviewView(s, onDone, onNote)
    if (v == SummaryVariant.OPEN) {
        Column(Modifier.testTag("summary-open"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            s.openGapM?.let { Tag(S.summary.openTag(co.hexrun.core.jsRound(it).toInt())) }
            Label("${S.summary.done} · $range")
            HText(S.summary.openTitle, style = Hex.type.title1, heading = true)
            HText(S.summary.openBody, tone = Tone.Ink2)
            Metrics(s)
            HCard {
                InfoRow(HexIcon.Map, S.summary.openNoChange, S.summary.openNoChangeSub)
                HDivider()
                InfoRow(HexIcon.Pace, S.summary.monthDistance(Dates.monthName(s.endedAt)), "+${Format.km(s.distanceM)} km")
                HDivider()
                InfoRow(HexIcon.Streak, S.summary.streakLabel, S.common.streakDays(s.streakDays))
            }
            s.openGapM?.let { gap -> HButton(S.summary.makeLoop(co.hexrun.core.jsRound(gap).toInt()), onMakeLoop, Modifier.fillMaxWidth(), big = true) }
        }
        return
    }
    val totalCells = s.loops.sumOf { it.newCells + it.capturedCells }
    val duelCells = s.loops.sumOf { it.capturedCells }
    val firstHit = s.loops.flatMap { it.hits }.firstOrNull { it.counted }
    val sg = s.suggestions.firstOrNull()
    Column(Modifier.testTag(if (v == SummaryVariant.SUGGESTION) "summary-suggestion" else "summary-closed"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Label("${S.summary.done} · $range")
        HText(S.summary.closedHead(totalCells, duelCells), style = Hex.type.title1, heading = true)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Label(S.summary.gained, tone = Tone.Ink3)
            HText("+${Format.area(s.totalGainedAreaM2)}", style = Hex.type.display.copy(fontSize = 44.sp, lineHeight = 48.sp), modifier = Modifier.testTag("gained"), maxLines = 1)
            firstHit?.let { DataText(S.summary.hpChange(co.hexrun.core.jsRound(it.hpBefore).toInt(), co.hexrun.core.jsRound(it.hpAfter).toInt()), tone = Tone.Ink2) }
        }
        Metrics(s)
        for (b in s.newBadges) HCard { InfoRow(HexIcon.Defend, S.summary.newBadge(b.name), b.how) }
        for (h in RunUi.wonHits(s)) HCard {
            InfoRow(HexIcon.Siege, S.summary.duelWon(h.opponent?.firstName ?: ""), "${S.summary.duelWonBody(h.cells)} · ${S.summary.streak(s.streakDays)}")
        }
        if (v == SummaryVariant.SUGGESTION && sg != null) {
            val name = sg.defender.firstName
            HCard(Modifier.testTag("suggestion-card")) {
                Tag(S.summary.suggestionTag)
                HText(S.summary.suggestionTitle(name), style = Hex.type.title2)
                HText(S.summary.suggestionBody(name, sg.cells.size), tone = Tone.Ink2)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    PlayerBadge(sg.defender.slot, sg.defender.initials, size = 36.dp)
                    Column(Modifier.weight(1f)) {
                        HText(sg.defender.displayName, style = Hex.type.callout, weight = FontWeight.Bold)
                        HText(S.summary.suggestionMeta(sg.cells.size, co.hexrun.core.jsRound(sg.avgPower).toInt()), style = Hex.type.callout, tone = Tone.Ink2)
                    }
                    DataText("can ${co.hexrun.core.jsRound(sg.avgPower).toInt()}")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Stat(S.common.area, S.common.cells(sg.cells.size), Modifier.weight(1f))
                    Stat(S.summary.route, "~${Format.km(sg.routeLengthM, 1)} km", Modifier.weight(1f))
                }
                HText(S.summary.suggestionNote(name), style = Hex.type.callout, tone = Tone.Ink3)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    HButton(S.common.notNow, onDone, Modifier.weight(1f), kind = ButtonKind.Secondary)
                    HButton(S.summary.editArea, { onEditSuggestion(sg) }, Modifier.weight(1f).testTag("edit-suggestion"))
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            HIcon(HexIcon.Streak, size = 18.dp, tint = c.ink2)
            HText(S.summary.streak(s.streakDays), style = Hex.type.callout, tone = Tone.Ink2)
        }
    }
}

/** 15B · Şüpheli halka cezalandırılmaz, bekletilir. */
@Composable
private fun ReviewView(s: RunSummary, onDone: () -> Unit, onNote: (String, () -> Unit) -> Unit) {
    var note by remember { mutableStateOf("") }
    var open by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }
    val segKm = Format.km(s.review?.segmentM ?: s.distanceM, 1)
    val pending = s.loops.sumOf { it.cells }
    Column(Modifier.testTag("summary-review"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Tag(S.summary.reviewTag)
        Label("${S.summary.done} · ${s.review?.paceSecPerKm?.let { "${Format.pace(it)}/km · $segKm km · " } ?: ""}${Dates.runRangeLabel(s.startedAt, s.endedAt)}")
        HText(S.summary.reviewTitle, style = Hex.type.title1, heading = true)
        HText(S.summary.reviewBody(segKm), tone = Tone.Ink2)
        HCard {
            InfoRow(HexIcon.Check, S.summary.reviewSaved, "${Format.km(s.distanceM, 1)} km · ${S.summary.streak(s.streakDays)}")
            HDivider()
            InfoRow(HexIcon.Map, S.summary.reviewMapUnchanged, S.summary.reviewPendingCells(pending))
            HDivider()
            InfoRow(HexIcon.Time, S.summary.reviewEta, S.summary.reviewEtaSub)
        }
        if (open && !sent) {
            OutlinedTextField(
                note, { note = it.take(280) }, Modifier.fillMaxWidth().heightIn(min = 88.dp),
                placeholder = { Text(S.summary.notePlaceholder) }, label = { Text(S.summary.addNote) },
                shape = RoundedCornerShape(Radii.s), colors = hexFieldColors(),
            )
            HButton(S.common.save, { onNote(note.trim()) { sent = true } }, Modifier.fillMaxWidth(), enabled = note.isNotBlank())
        }
        if (sent) HText(S.summary.noteSent, style = Hex.type.callout)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!sent) HButton(S.summary.addNote, { open = true }, Modifier.weight(1f), kind = ButtonKind.Secondary)
            HButton(S.common.done, onDone, Modifier.weight(1f))
        }
    }
}


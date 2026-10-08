package co.hexrun.app.ui.screens.duel

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import co.hexrun.app.data.MapCache
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.ui.attempt
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.IconButtonH
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.PlayerBadge
import co.hexrun.app.ui.components.Segmented
import co.hexrun.app.ui.components.Stat
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.map.HexMap
import co.hexrun.app.ui.map.MapLayers
import co.hexrun.app.ui.map.rememberHexMapState
import co.hexrun.app.ui.screens.run.rememberRunStarter
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.ui.theme.Space
import co.hexrun.core.api.DuelPreview
import co.hexrun.core.api.DuelSummary
import co.hexrun.core.api.ErrorText
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.api.MapCell
import co.hexrun.core.api.RegionDetail
import co.hexrun.core.cells.Cells
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import co.hexrun.core.jsRound
import co.hexrun.core.run.RunContext
import co.hexrun.core.ui.DuelSelection
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DuelSelectUi(
    val region: RegionDetail? = null,
    val selected: Set<String> = emptySet(),
    val paint: Boolean = true,
    val preview: DuelPreview? = null,
    /** Önizlemenin ait olduğu seçim (eskiyse yok sayılır). */
    val previewFor: Set<String>? = null,
    val created: DuelSummary? = null,
    val busy: Boolean = false,
    val error: String? = null,
) {
    val allowed: Set<String> get() = region?.cells?.toSet() ?: emptySet()
    val currentPreview: DuelPreview? get() = if (previewFor == selected) preview else null
    val state: DuelSelection.State get() = DuelSelection.state(selected.size, currentPreview)
}

/**
 * 16 · Düello alanı seçimi: parmak kaydırdıkça petekler boyanır, aynı yerden tekrar kaydırınca
 * seçim kalkar (7–60). Seçim 400 ms durunca sunucu önizlemesi; Tamam → düello başlar, rota çizilir.
 * Tolerans (kapsama oranı) gösterilmez.
 */
class DuelSelectViewModel(
    private val api: HexRunApi,
    private val cache: MapCache,
    cell: String?,
    cells: List<String>,
    revengeDuelId: String?,
    private val previewDelayMs: Long = 400,
) : ViewModel() {
    private val _ui = MutableStateFlow(DuelSelectUi(selected = cells.toSet()))
    val ui: StateFlow<DuelSelectUi> = _ui.asStateFlow()
    private var previewJob: Job? = null
    private var stroke: DuelSelection.PaintMode? = null
    private var lastCell: String? = null

    init {
        viewModelScope.launch {
            var start = cell ?: cells.firstOrNull()
            if (revengeDuelId != null) {
                // "Geri al": kaybedilen alanın petekleri hazır seçili gelir.
                attempt { api.duel(revengeDuelId) }.onSuccess { d ->
                    _ui.update { it.copy(selected = d.cells.toSet()) }
                    if (start == null) start = d.cells.firstOrNull()
                }
            }
            val s = start ?: return@launch
            attempt { api.region(s) }
                .onSuccess { r ->
                    _ui.update { it.copy(region = r, selected = it.selected.filter { c -> c in r.cells }.toSet()) }
                    schedulePreview()
                }
                .onFailure { e -> _ui.update { it.copy(error = ErrorText.of(e)) } }
        }
    }

    fun setPaint(on: Boolean) = _ui.update { it.copy(paint = on) }

    fun strokeStart(cell: String?) {
        if (cell == null || _ui.value.created != null) return
        val mode = DuelSelection.paintModeFor(cell, _ui.value.selected)
        stroke = mode
        lastCell = cell
        apply(cell, mode)
    }

    fun strokeMove(cell: String?) {
        val mode = stroke ?: return
        if (cell == null || cell == lastCell) return
        lastCell = cell
        apply(cell, mode)
    }

    fun strokeEnd() {
        stroke = null
        lastCell = null
    }

    private fun apply(cell: String, mode: DuelSelection.PaintMode) {
        val u = _ui.value
        val next = DuelSelection.applyPaint(u.selected, cell, mode, u.allowed)
        if (next != u.selected) {
            _ui.update { it.copy(selected = next) }
            schedulePreview()
        }
    }

    private fun schedulePreview() {
        previewJob?.cancel()
        val sel = _ui.value.selected
        if (sel.size < co.hexrun.core.Rules.DUEL_MIN_CELLS || sel.size > co.hexrun.core.Rules.DUEL_MAX_CELLS) return
        previewJob = viewModelScope.launch {
            delay(previewDelayMs)
            attempt { api.duelPreview(sel.sorted()) }.onSuccess { p -> _ui.update { it.copy(preview = p, previewFor = sel) } }
        }
    }

    fun confirm() {
        val u = _ui.value
        _ui.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            attempt { api.createDuel(u.selected.sorted()) }
                .onSuccess { d ->
                    _ui.update { it.copy(busy = false, created = d) }
                    attempt { api.duels() }.onSuccess { cache.rememberDuels(it) }
                }
                .onFailure { e -> _ui.update { it.copy(busy = false, error = ErrorText.of(e)) } }
        }
    }

    /** Başlayan düelloyu geri alıp seçimi düzenlemeye dön. */
    fun edit() {
        val d = _ui.value.created ?: return
        viewModelScope.launch {
            attempt { api.cancelDuel(d.id) }
            _ui.update { it.copy(created = null, selected = d.cells.toSet()) }
            schedulePreview()
        }
    }

    /** Haritada gösterilecek sahip petekleri (önbellekte yoksa bölge verisinden). */
    fun ownerCells(): List<MapCell> {
        val r = _ui.value.region ?: return emptyList()
        return r.cells.map { id -> cache.cell(id) ?: MapCell(id, r.owner?.id, r.avgPower, r.owner?.slot) }
    }
}

@Composable
fun DuelSelectScreen(cell: String?, cells: List<String>, defender: String?, revenge: String?) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val vm: DuelSelectViewModel = viewModel { DuelSelectViewModel(graph.api, graph.mapCache, cell, cells, revenge) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val me by graph.me.me.collectAsStateWithLifecycle()
    val start = rememberRunStarter()
    val mapState = rememberHexMapState()
    val c = Hex.colors
    val owner = ui.region?.owner
    val name = owner?.firstName ?: ""
    val ownerCells = remember(ui.region) { vm.ownerCells() }
    val created = ui.created
    val selection = remember(ui.selected, created) { (created?.cells ?: ui.selected.sorted()) }
    val center = remember(ui.region) { (cell ?: ui.region?.cells?.firstOrNull())?.let { runCatching { Cells.cellCenter(it) }.getOrNull() } }
    BackHandler { nav.back() }

    Column(Modifier.fillMaxSize().background(c.bg).testTag("duel-select")) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
            HexMap(
                MapLayers(cells = ownerCells, showPlayers = false, highlight = ui.region?.cells ?: emptyList(), selection = selection, selectionSlot = me?.slot, route = created?.route),
                Modifier.fillMaxSize(), mapState, center = center, zoom = 16.0, panEnabled = !ui.paint || created != null,
            )
            if (ui.paint && created == null) {
                Box(
                    Modifier.fillMaxSize()
                        .semantics { contentDescription = S.duelSelect.cellA11y(ui.selected.size) }
                        .pointerInput(Unit) {
                            awaitEachGesture {
                                val down = awaitFirstDown()
                                vm.strokeStart(mapState.cellAt(down.position.x, down.position.y))
                                down.consume()
                                while (true) {
                                    val ev = awaitPointerEvent()
                                    val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                                    if (!ch.pressed) break
                                    if (ch.positionChange() != androidx.compose.ui.geometry.Offset.Zero) {
                                        vm.strokeMove(mapState.cellAt(ch.position.x, ch.position.y))
                                        ch.consume()
                                    }
                                }
                                vm.strokeEnd()
                            }
                        },
                )
            }
            Column(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Space.gutter).padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButtonH(HexIcon.Close, if (created != null) S.common.close else S.common.cancel, nav::back, glass = true)
                    Column(Modifier.weight(1f).clip(RoundedCornerShape(Radii.s)).background(c.glass).border(1.dp, c.line, RoundedCornerShape(Radii.s)).padding(8.dp)) {
                        val used = 3 - (ui.preview?.slotsLeft ?: ui.region?.duelSlotsLeft ?: 3)
                        HText("${S.duelSelect.title} · ${S.duelSelect.slot(maxOf(0, used) + if (created != null) 1 else 0)}", style = Hex.type.callout, weight = FontWeight.Bold)
                        if (owner != null) Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            PlayerBadge(owner.slot, owner.initials, size = 20.dp)
                            DataText(S.duelSelect.owner(owner.displayName, ui.region?.cells?.size ?: 0, jsRound(ui.region?.avgPower ?: 0.0).toInt()), tone = Tone.Ink2)
                        }
                    }
                }
                if (created == null) {
                    Segmented(listOf(true to S.duelSelect.paint, false to S.duelSelect.pan), ui.paint, vm::setPaint, glass = true)
                    if (ui.paint) HText(if (ui.state == DuelSelection.State.EMPTY) S.duelSelect.hintEmpty(name) else S.duelSelect.hint, style = Hex.type.callout, tone = Tone.Ink2, align = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
            }
        }
        DuelSelectSheet(ui, name, onCancel = nav::back, onConfirm = vm::confirm, onEdit = vm::edit, onRun = { d -> start(RunContext(attackDuelId = d.id)) })
    }
}

@Composable
fun DuelSelectSheet(ui: DuelSelectUi, name: String, onCancel: () -> Unit, onConfirm: () -> Unit, onEdit: () -> Unit, onRun: (DuelSummary) -> Unit) {
    val c = Hex.colors
    val shape = RoundedCornerShape(topStart = Radii.sheet, topEnd = Radii.sheet)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(c.surf).border(1.dp, c.line, shape).padding(Space.gutter).navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val created = ui.created
        if (created != null) {
            Label(S.duelSelect.started(name))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                HText(S.duelSelect.routeReady, style = Hex.type.title1)
                DataText(S.common.cells(created.cells.size))
            }
            HText(S.duelSelect.routeSub(name), tone = Tone.Ink2)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Stat(S.duelSelect.statDistance, "${Format.km(created.routeLengthM, 1)} km", Modifier.weight(1f))
                Stat(S.duelSelect.statTime, "~${jsRound(created.routeLengthM / 1000 * 5.5).toInt()} dk", Modifier.weight(1f))
                Stat(S.duelSelect.statHp, "${jsRound(created.hp).toInt()}", Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                HButton(S.duelSelect.edit, onEdit, Modifier.weight(1f), kind = ButtonKind.Secondary)
                HButton(S.duelSelect.run, { onRun(created) }, Modifier.weight(1f).testTag("duel-run"), icon = HexIcon.Play)
            }
            return@Column
        }
        val n = ui.selected.size
        val p = ui.currentPreview
        val area = p?.areaM2 ?: (n * 307.0)
        var kicker = S.duelSelect.kickerSel
        var head = S.duelSelect.headSel(n)
        var side = S.duelSelect.sideArea(Format.area(area))
        var sub = S.duelSelect.subSel
        when (ui.state) {
            DuelSelection.State.EMPTY -> { kicker = S.duelSelect.kickerEmpty; head = S.duelSelect.headEmpty; side = S.common.cells(0); sub = S.duelSelect.subEmpty(name) }
            DuelSelection.State.SMALL -> { kicker = S.duelSelect.kickerSmall; side = S.duelSelect.sideMin; sub = S.duelSelect.subSmall }
            DuelSelection.State.BIG -> { kicker = S.duelSelect.kickerBig; side = S.duelSelect.sideMax; sub = S.duelSelect.subBig }
            DuelSelection.State.LIMIT -> { kicker = S.duelSelect.kickerLimit; sub = S.duelSelect.subLimit }
            DuelSelection.State.INVALID -> { kicker = S.duelSelect.kickerError; sub = if (p?.error == "not_connected") S.duelSelect.subNotConnected else S.common.genericError }
            DuelSelection.State.OK -> Unit
        }
        Label(kicker, Modifier.testTag("selection-kicker"))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            HText(head, style = Hex.type.title1, modifier = Modifier.testTag("selection-head"))
            DataText(side, tone = Tone.Ink2)
        }
        HText(sub, tone = Tone.Ink2)
        if (p?.ok == true && ui.state == DuelSelection.State.OK) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Stat(S.duelSelect.statDistance, "${Format.km(p.routeLengthM, 1)} km", Modifier.weight(1f))
                Stat(S.duelSelect.statTime, "~${p.estMinutes} dk", Modifier.weight(1f))
                Stat(S.duelSelect.statHp, "${jsRound(p.avgPower).toInt()}", Modifier.weight(1f))
            }
        }
        ui.error?.let { HText(it, style = Hex.type.callout) }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HButton(S.common.cancel, onCancel, Modifier.weight(1f), kind = ButtonKind.Secondary)
            HButton(S.duelSelect.confirm, onConfirm, Modifier.weight(1f).testTag("duel-confirm"), enabled = ui.state == DuelSelection.State.OK && p?.ok == true, loading = ui.busy)
        }
    }
}


package co.hexrun.app.ui.screens.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.hexrun.app.ui.Load
import co.hexrun.app.ui.Query
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HChip
import co.hexrun.app.ui.components.HDivider
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HatBar
import co.hexrun.app.ui.components.HatSize
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.PlayerBadge
import co.hexrun.app.ui.components.SectionTitle
import co.hexrun.app.ui.components.Skeleton
import co.hexrun.app.ui.components.Stat
import co.hexrun.app.ui.components.StateBlock
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.ui.theme.Space
import co.hexrun.core.api.DuelSummary
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.api.Me
import co.hexrun.core.api.RegionDetail
import co.hexrun.core.format.Format
import co.hexrun.core.hat.Hat
import co.hexrun.core.i18n.S
import co.hexrun.core.ui.BadgeCatalog
import co.hexrun.core.ui.Dates
import co.hexrun.core.ui.EventsUi

class RegionActions(
    val onRunHere: (RegionDetail) -> Unit,
    val onStartDuel: (RegionDetail) -> Unit,
    val onOpenDuel: (DuelSummary) -> Unit,
)

/** 04 · Bölge detayı: M3 modal alt sayfa (Android). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegionSheet(cell: String, api: HexRunApi, me: Me?, actions: RegionActions, onDismiss: () -> Unit) {
    val c = Hex.colors
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val scope = rememberCoroutineScope()
    val query = remember(cell) { Query(scope) { api.region(cell) } }
    LaunchedEffect(cell) { query.load() }
    val state by query.state.collectAsStateWithLifecycle()
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheet,
        containerColor = c.surf,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = Radii.sheet, topEnd = Radii.sheet),
    ) {
        RegionSheetContent(state, me, actions, onRetry = { query.load() })
    }
}

@Composable
fun RegionSheetContent(state: Load<RegionDetail>, me: Me?, actions: RegionActions, onRetry: () -> Unit) {
    val r = state.data
    when {
        r != null -> RegionView(r, me, actions)
        state.failed -> Column(Modifier.padding(Space.gutter)) { StateBlock(S.common.genericError, action = S.common.retry, onAction = onRetry) }
        else -> Column(Modifier.padding(Space.gutter).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Skeleton(Modifier.fillMaxWidth(0.6f), height = 30.dp)
            Skeleton(Modifier.fillMaxWidth(0.4f), height = 16.dp)
            Skeleton(height = 8.dp)
            Skeleton(height = 60.dp)
        }
    }
}

@Composable
fun RegionView(r: RegionDetail, me: Me?, actions: RegionActions) {
    val c = Hex.colors
    val owner = r.owner
    val mine = owner != null && me != null && owner.id == me.id
    val ownerName = if (r.hidden) S.map.hiddenPlayer else owner?.firstName
    val title = when {
        owner == null && !r.hidden -> S.region.emptyTitle
        mine -> S.region.myTitle
        else -> S.region.title(ownerName ?: "")
    }
    val duel = r.myDuel
    val attackEvent = r.activeEvents.firstOrNull { it.active && it.move == "attack" }
    val gainEvent = r.activeEvents.firstOrNull { it.active && it.move == "gain" }
    val ownerColor = owner?.let { c.player(it.slot) } ?: c.ink3
    val (ctaLabel, ctaAction) = when {
        duel != null -> (attackEvent?.let { S.region.loopHereBoost(EventsUi.shortLabel(listOf(it))) } ?: S.region.loopHere) to { actions.onRunHere(r) }
        mine -> (gainEvent?.let { S.region.loopHereBoost(EventsUi.shortLabel(listOf(it))) } ?: S.region.loopHere) to { actions.onRunHere(r) }
        owner != null && !r.hidden && r.canStartDuel -> S.region.startDuel to { actions.onStartDuel(r) }
        else -> S.region.runHere to { actions.onRunHere(r) }
    }
    Column(Modifier.fillMaxWidth()) {
        Column(
            Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = Space.gutter).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (owner != null) PlayerBadge(owner.slot, owner.initials, size = 44.dp, hidden = r.hidden, goldFrame = owner.goldFrame)
                Column(Modifier.weight(1f)) {
                    HText(title, style = Hex.type.title1, maxLines = 2, heading = true)
                    DataText(S.region.meta(r.cells.size, Format.area(r.areaM2)), tone = Tone.Ink2)
                }
            }
            for (e in r.activeEvents.filter { it.active }) {
                val until = e.endsInMin?.let { " · " + S.region.eventUntil(EventsUi.endsAtLabel(it) ?: "") } ?: ""
                HChip("${e.name} · ${EventsUi.shortLabel(listOf(e))}$until", icon = HexIcon.Events)
            }
            if (r.hidden) HText(S.region.hidden, tone = Tone.Ink2)
            if (owner != null && !r.hidden) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.weight(1f)) {
                            HText(owner.displayName, style = Hex.type.callout, weight = FontWeight.Bold)
                            HText(S.region.ownerSince(r.ownedSinceDays ?: 0, owner.teamName), style = Hex.type.callout.copy(fontSize = Hex.type.label.fontSize * 1.08f), tone = Tone.Ink2)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            HText("${co.hexrun.core.jsRound(r.avgPower).toLong()}", style = Hex.type.title1)
                            co.hexrun.app.ui.components.Label(S.common.power, tone = Tone.Ink3)
                        }
                    }
                    HatBar(r.avgPower, duel?.progress, null, ownerColor, attackerColor = me?.let { c.player(it.slot) } ?: c.ink, size = HatSize.Md)
                    if (duel != null) {
                        val ev = attackEvent?.name?.split(' ')?.lastOrNull()
                        DataText("${S.region.duelHp(Hat.duelHp(duel.power, duel.progress), duel.cells.size)} · ${S.region.loopsToCapture(duel.loopsToCapture, ev)}", tone = Tone.Ink2)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Stat(S.region.area, Format.area(r.areaM2), Modifier.weight(1f))
                if (owner != null) {
                    Stat(S.region.ownership, r.ownedSinceDays?.let { S.region.ownershipDays(it) } ?: "—", Modifier.weight(1f))
                    Stat(S.region.lastDefense, r.lastDefenseAt?.let { Dates.relativeLabel(it) } ?: S.region.never, Modifier.weight(1f))
                }
            }
            if (duel != null && owner != null) HText(S.region.privateDuel(owner.firstName), style = Hex.type.callout, tone = Tone.Ink3)
            if (owner != null && !r.hidden && !mine && owner.insignia.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SectionTitle(S.region.insignia(owner.firstName))
                    for (id in owner.insignia) {
                        val b = BadgeCatalog.BY_ID[id]
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            HText(b?.name ?: id, style = Hex.type.callout, weight = FontWeight.SemiBold)
                            HText(b?.insignia?.effect ?: "", style = Hex.type.callout.copy(fontSize = Hex.type.label.fontSize * 1.08f), tone = Tone.Ink2, align = TextAlign.End, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
            if (mine && r.incomingDuels.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionTitle(S.region.incoming)
                    for (d in r.incomingDuels) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                PlayerBadge(d.attacker.slot, d.attacker.initials, size = 28.dp)
                                HText(d.attacker.displayName, style = Hex.type.callout, modifier = Modifier.weight(1f))
                                HButton(S.map.defend, { actions.onOpenDuel(d) }, kind = ButtonKind.Secondary, icon = HexIcon.Defend)
                            }
                            HatBar(d.power, d.progress, null, ownerColor, attackerColor = c.player(d.attacker.slot), size = HatSize.Sm)
                        }
                    }
                }
            }
            if (r.history.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SectionTitle(S.region.history)
                    for (h in r.history) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            DataText(Dates.shortDate(h.at), Modifier.width(56.dp), tone = Tone.Ink3)
                            HText(h.text, style = Hex.type.callout, tone = Tone.Ink2, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
            if (!r.canStartDuel && owner != null && !mine && duel == null && r.duelSlotsLeft == 0) HText(S.region.slotsFull, style = Hex.type.callout, tone = Tone.Ink3)
        }
        HDivider()
        Column(Modifier.padding(Space.gutter).navigationBarsPadding()) {
            HButton(ctaLabel, ctaAction, Modifier.fillMaxWidth(), big = true)
        }
    }
}

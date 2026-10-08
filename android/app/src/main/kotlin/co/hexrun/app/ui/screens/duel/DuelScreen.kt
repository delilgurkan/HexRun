package co.hexrun.app.ui.screens.duel

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.ui.Query
import co.hexrun.app.ui.attempt
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HCard
import co.hexrun.app.ui.components.HScreen
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HatBar
import co.hexrun.app.ui.components.HatSize
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.PlayerBadge
import co.hexrun.app.ui.components.SectionTitle
import co.hexrun.app.ui.components.Skeleton
import co.hexrun.app.ui.components.StateBlock
import co.hexrun.app.ui.components.TextButtonH
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.screens.run.rememberRunStarter
import co.hexrun.app.ui.theme.Hex
import co.hexrun.core.Rules
import co.hexrun.core.api.DuelSummary
import co.hexrun.core.api.Me
import co.hexrun.core.api.RegionDetail
import co.hexrun.core.format.Format
import co.hexrun.core.hat.Hat
import co.hexrun.core.i18n.S
import co.hexrun.core.jsRound
import co.hexrun.core.run.RunContext
import co.hexrun.core.ui.Dates
import co.hexrun.core.ui.EventsUi
import kotlinx.coroutines.launch

/** 09B · Kuşatma ekranı (sahibin bakışı) ya da saldırganın düello özeti. */
@Composable
fun DuelScreen(id: String) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val duelQ = remember(id) { Query(scope) { graph.api.duel(id) } }
    var region by remember { mutableStateOf<RegionDetail?>(null) }
    LaunchedEffect(id) { duelQ.load() }
    val duel by duelQ.state.collectAsStateWithLifecycle()
    val me by graph.me.me.collectAsStateWithLifecycle()
    LaunchedEffect(duel.data?.cells?.firstOrNull()) {
        duel.data?.cells?.firstOrNull()?.let { cell -> attempt { graph.api.region(cell) }.onSuccess { region = it } }
    }
    LaunchedEffect(Unit) { graph.me.ensure() }
    val start = rememberRunStarter()
    HScreen(title = S.siege.title, onBack = nav::back) {
        val d = duel.data
        val m = me
        when {
            d != null && m != null -> SiegeView(
                d, m, region,
                onRun = { start(if (d.defender.id == m.id) RunContext(defendDuelId = d.id) else RunContext(attackDuelId = d.id)) },
                onCancel = {
                    scope.launch {
                        attempt { graph.api.cancelDuel(d.id) }
                        attempt { graph.api.duels() }.onSuccess { graph.mapCache.rememberDuels(it) }
                        nav.back()
                    }
                },
            )
            duel.failed -> StateBlock(S.common.genericError, action = S.common.retry, onAction = { duelQ.load() })
            else -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Skeleton(Modifier.fillMaxWidth(0.7f), height = 28.dp); Skeleton(height = 16.dp); Skeleton(height = 120.dp)
            }
        }
    }
}

@Composable
fun SiegeView(d: DuelSummary, me: Me, region: RegionDetail?, onRun: () -> Unit, onCancel: () -> Unit, now: Long = System.currentTimeMillis()) {
    val c = Hex.colors
    val defending = d.defender.id == me.id
    val rival = if (defending) d.attacker else d.defender
    val hp = Hat.duelHp(d.power, d.progress)
    val events = EventsUi.activeNow(now)
    val attackEv = events.firstOrNull { it.move == "attack" }
    val gainEv = events.firstOrNull { it.move == "gain" }
    val pushEv = events.firstOrNull { it.move == "pushback" }
    val powerAfter = minOf(Rules.MAX_POWER, jsRound(d.power + Rules.OWNER_GAIN * (gainEv?.multiplier ?: 1.0)))
    val progressAfter = maxOf(0.0, jsRound(d.progress - Rules.PUSHBACK * (pushEv?.multiplier ?: 1.0)))
    val defensesLeft = maxOf(0, Rules.DEFENSE_DAILY_LIMIT - d.defensesToday)
    var confirm by remember { mutableStateOf(false) }
    Column(Modifier.testTag(if (defending) "siege" else "attack"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Label(if (defending) S.siege.head(rival.firstName, hp) else S.siege.attacking(rival.firstName))
        HText(S.siege.cells(d.cells.size), style = Hex.type.title1, heading = true)
        if (region != null && defending) DataText(S.siege.yourArea(region.cells.size, Format.area(region.areaM2), region.ownedSinceDays ?: 0), tone = Tone.Ink2)
        HCard {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                PlayerBadge(d.attacker.slot, d.attacker.initials, size = 32.dp)
                HText(" ${if (defending) d.attacker.firstName else S.common.you} ${jsRound(d.progress).toLong()}", style = Hex.type.callout, weight = FontWeight.Bold, modifier = Modifier.weight(1f))
                HText("${if (defending) S.common.you else d.defender.firstName} ${jsRound(d.power).toLong()} ", style = Hex.type.callout, weight = FontWeight.Bold)
                PlayerBadge(d.defender.slot, d.defender.initials, size = 32.dp)
            }
            HatBar(d.power, d.progress, null, c.player(d.defender.slot), attackerColor = c.player(d.attacker.slot), size = HatSize.Lg, modifier = Modifier.testTag("siege-hat"))
            HText(S.siege.hpLeft(hp), style = Hex.type.title2)
            HText(S.siege.estimate(d.loopsToCapture, attackEv?.name?.split(' ')?.lastOrNull()), tone = Tone.Ink2)
        }
        if (defending) {
            HText(
                S.siege.defenseOutcome(
                    d.cells.size, jsRound(d.power).toInt(), powerAfter.toInt(),
                    gainEv?.let { "${it.name} ${Format.multiplier(it.multiplier)}" },
                    d.attacker.firstName, jsRound(d.progress).toInt(), progressAfter.toInt(), hp, Hat.duelHp(powerAfter, progressAfter),
                ),
                tone = Tone.Ink2,
            )
            HText(S.siege.defensesLeft(defensesLeft), style = Hex.type.callout)
        } else {
            HText("${S.region.duelHp(hp, d.cells.size)} · ${d.attacksToday}/${d.attackLimitToday}", tone = Tone.Ink2)
            val exp = Dates.parse(d.expiresAt)
            if (exp != null && d.firstCountedAt == null) HText(S.siege.expires(maxOf(0, jsRound((exp - now) / 3_600_000.0).toInt())), style = Hex.type.callout, tone = Tone.Ink3)
        }
        d.lastAttackAt?.let {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SectionTitle(S.region.history)
                DataText("${Dates.relativeLabel(it)} · halka", tone = Tone.Ink2)
            }
        }
        HButton(if (defending) S.siege.cta else S.siege.attackCta, onRun, Modifier.fillMaxWidth().testTag("siege-cta"), big = true, icon = if (defending) HexIcon.Defend else HexIcon.Play)
        if (!defending) TextButtonH(S.siege.cancelDuel, { confirm = true }, Modifier.fillMaxWidth())
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { HText(S.siege.cancelDuel, style = Hex.type.title2) },
            confirmButton = { TextButtonH(S.siege.cancelDuel, { confirm = false; onCancel() }) },
            dismissButton = { TextButtonH(S.common.cancel, { confirm = false }) },
            containerColor = c.surf,
        )
    }
}

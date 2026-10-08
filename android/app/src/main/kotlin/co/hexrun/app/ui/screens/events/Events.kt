package co.hexrun.app.ui.screens.events

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.push.EventReminderReceiver
import co.hexrun.app.ui.attempt
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HCard
import co.hexrun.app.ui.components.HDivider
import co.hexrun.app.ui.components.HScreen
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.SectionTitle
import co.hexrun.app.ui.components.StateBlock
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.screens.run.rememberRunStarter
import co.hexrun.app.ui.theme.Hex
import co.hexrun.core.api.ActiveEvent
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import co.hexrun.core.run.RunContext
import co.hexrun.core.ui.EventsUi
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** 12 · Etkinlik: aktif pencere ve diğer çarpanlar; sayaçlar core `Events.window` ile, 30 sn'de bir. */
@Composable
fun EventsScreen() {
    val graph = LocalGraph.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs by graph.prefs.prefs.collectAsStateWithLifecycle()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var server by remember { mutableStateOf<List<ActiveEvent>?>(null) }
    LaunchedEffect(Unit) { attempt { graph.api.events() }.onSuccess { server = it } }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = System.currentTimeMillis()
        }
    }
    val start = rememberRunStarter()
    val events = remember(server, now) { EventsUi.resolve(server, now) }
    EventsContent(
        events = events,
        now = now,
        reminded = prefs.remind,
        onStart = { start(RunContext()) },
        onToggleRemind = { e ->
            val on = e.id in prefs.remind
            if (on) EventReminderReceiver.cancel(context, e.id) else EventReminderReceiver.schedule(context, e.id, e.name, e.description, e.startsInMin)
            scope.launch {
                attempt { graph.api.remindEvent(e.id, !on) }
                graph.prefs.update { it.copy(remind = if (on) it.remind - e.id else it.remind + e.id) }
            }
        },
    )
}

@Composable
fun EventsContent(events: List<ActiveEvent>, now: Long, reminded: Set<String>, onStart: () -> Unit, onToggleRemind: (ActiveEvent) -> Unit) {
    val hero = events.firstOrNull { it.active }
    val others = events.filter { it !== hero }
    HScreen(title = S.events.title, large = true) {
        if (hero != null) {
            HCard(Modifier.testTag("event-hero")) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Label(S.events.nowEverywhere(hero.window), Modifier.weight(1f))
                    hero.endsInMin?.let { val hm = EventsUi.hm(it); DataText(S.events.remaining(hm.h, hm.m), Modifier.testTag("event-countdown")) }
                }
                HText(hero.name, style = Hex.type.title1)
                HText(hero.description, tone = Tone.Ink2)
                if (hero.participantsToday > 0) HText(S.events.participants(Format.int(hero.participantsToday)), style = Hex.type.callout)
                HButton(S.map.start, onStart, Modifier.fillMaxWidth(), big = true)
            }
        } else {
            StateBlock(S.events.noneActive, icon = HexIcon.Events, body = S.events.noneActiveBody)
        }
        SectionTitle(S.events.others)
        HCard {
            others.forEachIndexed { i, e ->
                if (i > 0) HDivider()
                val label = "${S.events.moves[e.move] ?: e.move} ${Format.multiplier(e.multiplier)}"
                Row(
                    Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp).semantics(mergeDescendants = true) { contentDescription = "${e.name}, ${e.window}, $label" },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(1f)) {
                        HText(e.name + if (e.active) " · ${S.events.active}" else "", style = Hex.type.callout, weight = FontWeight.Bold)
                        HText("${e.window} · ${S.events.everywhere} · $label", style = Hex.type.callout, tone = Tone.Ink2)
                    }
                    if (e.active) {
                        DataText(EventsUi.endsAtLabel(e.endsInMin, now) ?: "")
                    } else {
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            val hm = EventsUi.hm(e.startsInMin)
                            DataText(S.events.startsIn(hm.h, hm.m), tone = Tone.Ink2)
                            val on = e.id in reminded
                            HButton(if (on) S.events.reminded else S.events.remind, { onToggleRemind(e) }, kind = if (on) ButtonKind.Secondary else ButtonKind.Ghost)
                        }
                    }
                }
            }
        }
        HText(S.events.rules, style = Hex.type.callout, tone = Tone.Ink3)
    }
}

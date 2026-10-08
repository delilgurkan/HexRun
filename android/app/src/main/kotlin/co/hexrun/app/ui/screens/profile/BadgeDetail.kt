package co.hexrun.app.ui.screens.profile

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.ui.Query
import co.hexrun.app.ui.attempt
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HCard
import co.hexrun.app.ui.components.HScreen
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.SectionTitle
import co.hexrun.app.ui.components.Skeleton
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.ui.theme.Target
import co.hexrun.core.api.BadgesResponse
import co.hexrun.core.api.ErrorText
import co.hexrun.core.i18n.S
import co.hexrun.core.ui.Dates
import kotlinx.coroutines.launch

/** 14B · Rozet detayı: hangi nişanın yerine takılacak (günde 1 değişiklik, koşuda kilitli). */
@Composable
fun BadgeDetailScreen(id: String) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val q = remember { Query(scope) { graph.api.badges() } }
    LaunchedEffect(Unit) { q.load() }
    val state by q.state.collectAsStateWithLifecycle()
    val run by graph.runController.state.collectAsStateWithLifecycle()
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val save: (List<String?>) -> Unit = { slots ->
        busy = true
        err = null
        scope.launch {
            attempt { graph.api.setInsignia(slots) }
                .onSuccess { r -> q.set(r); graph.me.refresh(); nav.back() }
                .onFailure { err = ErrorText.of(it) }
            busy = false
        }
    }
    val data = state.data
    val b = data?.badges?.firstOrNull { it.id == id }
    if (data == null || b == null) {
        HScreen(title = S.badges.title, onBack = nav::back) { Skeleton(height = 120.dp) }
        return
    }
    BadgeDetailContent(data, id, running = run.active, busy = busy, error = err, onBack = nav::back, onSave = save)
}

@Composable
fun BadgeDetailContent(data: BadgesResponse, id: String, running: Boolean, busy: Boolean, error: String?, onBack: () -> Unit, onSave: (List<String?>) -> Unit) {
    val c = Hex.colors
    val b = data.badges.first { it.id == id }
    val byId = data.badges.associateBy { it.id }
    val slots = List(3) { data.slots.getOrNull(it) }
    val equippedAt = slots.indexOf(b.id)
    val slottable = b.insignia?.slot == true
    val firstEmpty = slots.indexOfFirst { it == null }
    var chosen by remember { mutableStateOf<Int?>(null) }
    val target = chosen ?: firstEmpty.takeIf { it >= 0 }
    val targetBadge = target?.let { slots[it] }?.let { byId[it] }
    val locked = !data.canChangeInsignia || running
    HScreen(
        title = b.name,
        onBack = onBack,
        modifier = Modifier.testTag("badge-detail"),
        footer = if (b.earned && slottable) {
            {
                if (equippedAt >= 0) {
                    HButton(S.badges.unequip, { onSave(slots.map { if (it == b.id) null else it }) }, Modifier.fillMaxWidth(), big = true, kind = ButtonKind.Secondary, enabled = !locked, loading = busy)
                } else {
                    HButton(
                        targetBadge?.let { S.badges.equipInto(it.name) } ?: S.badges.equipEmpty,
                        { onSave(slots.mapIndexed { i, s -> if (i == target) b.id else if (s == b.id) null else s }) },
                        Modifier.fillMaxWidth().testTag("equip"), big = true, enabled = !locked && target != null, loading = busy,
                    )
                }
            }
        } else null,
    ) {
        val kind = b.insignia?.let { S.badges.kinds[it.kind] ?: it.kind } ?: b.category
        val progress = b.earnedAt?.takeIf { b.earned }?.let { S.badges.earnedOn(Dates.shortDate(it)) } ?: "${b.progressNow.toLong()}/${b.progressMax.toLong()}"
        Label("$kind · $progress")
        HText(b.name, style = Hex.type.title1, heading = true)
        val ins = b.insignia
        if (ins != null) HText(ins.effect, style = Hex.type.title2) else HText(S.badges.notInsignia, tone = Tone.Ink2)
        HCard {
            SectionTitle(S.badges.howTo)
            HText(b.how)
            b.insignia?.let {
                SectionTitle(S.badges.counter)
                HText(it.counter)
                if (!it.slot) DataText(S.badges.alwaysOn, tone = Tone.Ink2)
            }
        }
        if (b.earned && slottable && equippedAt < 0) {
            SectionTitle(S.badges.replaceWhich)
            Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (i in 0 until 3) {
                    val cur = slots[i]?.let { byId[it] }
                    val sel = target == i
                    val shape = RoundedCornerShape(Radii.m - 6.dp)
                    Column(
                        Modifier.fillMaxWidth().defaultMinSize(minHeight = Target.min + 8.dp).clip(shape)
                            .border(if (sel) 2.dp else 1.dp, if (sel) c.ink else c.line2, shape)
                            .selectable(sel, role = Role.RadioButton, onClick = { chosen = i })
                            .semantics(mergeDescendants = true) { contentDescription = cur?.let { "${it.name}: ${it.insignia?.effect ?: ""}" } ?: S.badges.emptySlot }
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        HText(cur?.name ?: S.badges.emptySlot, style = Hex.type.callout, weight = FontWeight.Bold)
                        cur?.insignia?.let { HText(it.effect, style = Hex.type.callout, tone = Tone.Ink2) }
                    }
                }
            }
            HText(if (locked) S.badges.changeUsed else S.badges.changeNote, style = Hex.type.callout, tone = Tone.Ink3)
        }
        error?.let { HText(it, style = Hex.type.callout) }
    }
}

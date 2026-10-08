package co.hexrun.app.ui.screens.map

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HIcon
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HatBar
import co.hexrun.app.ui.components.HatSize
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.PlayerBadge
import co.hexrun.app.ui.components.Tag
import co.hexrun.app.ui.components.TextButtonH
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.core.api.DuelSummary
import co.hexrun.core.api.FirstLoopSuggestion
import co.hexrun.core.colors.Slot
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import co.hexrun.core.ui.Dates

/** Harita üstü cam panel. */
@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val c = Hex.colors
    val shape = RoundedCornerShape(Radii.l - 6.dp)
    Column(
        modifier.fillMaxWidth().shadow(6.dp, shape, ambientColor = c.shadow, spotColor = c.shadow).clip(shape).background(c.glass).border(1.dp, c.line, shape).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

/** 03b · Boş: "İlk halkan" önerisi. */
@Composable
fun FirstLoopCard(s: FirstLoopSuggestion, onStart: () -> Unit, onDismiss: () -> Unit) {
    Panel {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Label("${S.map.firstLoopTag} · ${S.map.firstLoopMeta(Format.km(s.lengthM, 1), Format.area(s.areaM2))}", Modifier.weight(1f))
            Tag(S.map.firstDay)
        }
        HText(S.map.firstLoopTitle, style = Hex.type.title2)
        HText(S.map.firstLoopBody(Format.km(s.lengthM, 1)), tone = Tone.Ink2)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            S.map.firstLoopSteps.forEachIndexed { i, st ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    HIcon(if (i == 0) HexIcon.Start else if (i == 1) HexIcon.Loop else HexIcon.Map, size = 16.dp, tint = Hex.colors.ink2)
                    HText(st, style = Hex.type.callout.copy(fontSize = Hex.type.label.fontSize * 1.08f), tone = Tone.Ink2)
                }
            }
        }
        HButton(S.map.firstLoopCta, onStart, Modifier.fillMaxWidth(), big = true)
        TextButtonH(S.map.ownRoute, onDismiss, Modifier.fillMaxWidth())
    }
}

/** 03b · Hata: çevrimdışı, son bilinen harita soluk. */
@Composable
fun OfflineCard(minutes: Int?, onRetry: () -> Unit) {
    Panel {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            HIcon(HexIcon.Layers, size = 18.dp)
            HText(S.map.offlineTitle, style = Hex.type.title2)
        }
        HText(S.map.offlineBody(minutes ?: 0), tone = Tone.Ink2)
        HButton(S.common.retry, onRetry, kind = ButtonKind.Secondary)
    }
}

/** 09A · Haritada kuşatma uyarısı (%70 eşiği). Yalnız sen ve saldıran görür. */
@Composable
fun SiegeBanner(duel: DuelSummary, ownerSlot: Slot, onDefend: () -> Unit) {
    val c = Hex.colors
    val name = duel.attacker.firstName
    Panel {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            PlayerBadge(duel.attacker.slot, duel.attacker.initials, size = 36.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                HText(S.map.siegeBanner(name), style = Hex.type.callout, weight = FontWeight.Bold)
                HText(
                    S.map.siegeBannerBody(name, duel.lastAttackAt?.let { Dates.hhmm(it) } ?: "—", duel.loopsToCapture),
                    style = Hex.type.callout.copy(fontSize = Hex.type.label.fontSize * 1.08f), tone = Tone.Ink2,
                )
            }
            HButton(S.map.defend, onDefend, icon = HexIcon.Defend)
        }
        HatBar(duel.power, duel.progress, null, c.player(ownerSlot), attackerColor = c.player(duel.attacker.slot), size = HatSize.Sm)
    }
}

package co.hexrun.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Motion
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.ui.theme.Target
import co.hexrun.app.ui.theme.capped
import co.hexrun.core.i18n.S
import kotlinx.coroutines.launch

/**
 * Basılı tutma düğmesi (Bitir 1,5 sn): geri alınmaz eylem. TalkBack'te çift dokunma onay
 * penceresi açar (basılı tutma hareketi gerekmez).
 */
@Composable
fun HoldButton(
    label: String,
    hint: String,
    icon: HexIcon,
    onComplete: () -> Unit,
    confirmTitle: String,
    modifier: Modifier = Modifier,
    durationMs: Long = Motion.finishHold,
) {
    val c = Hex.colors
    val progress = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    var holding by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    val done by rememberUpdatedState(onComplete)
    Box(
        modifier
            .defaultMinSize(minHeight = Target.runBar)
            .clip(RoundedCornerShape(Radii.cta))
            .background(c.inv)
            .semantics(mergeDescendants = true) {
                role = Role.Button
                contentDescription = label
                stateDescription = hint
                onClick(label) { confirm = true; true }
            }
            .pointerInput(durationMs) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    holding = true
                    val job = scope.launch {
                        progress.snapTo(0f)
                        progress.animateTo(1f, tween(durationMs.toInt(), easing = LinearEasing))
                        holding = false
                        progress.snapTo(0f)
                        done()
                    }
                    waitForUpOrCancellation()
                    if (job.isActive) {
                        job.cancel()
                        holding = false
                        scope.launch { progress.animateTo(0f, tween(Motion.tap)) }
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.align(Alignment.CenterStart).fillMaxHeight().fillMaxWidth(progress.value).background(c.ink2.copy(alpha = 0.45f)))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            HIcon(icon, tint = c.invInk)
            Column {
                HText(label, style = Hex.type.cta.copy(fontSize = Hex.type.cta.fontSize * 1.06f).capped(1.4f), color = c.invInk)
                HText(hint, style = Hex.type.label.capped(1.4f), color = c.invInk, modifier = Modifier.alpha(if (holding) 1f else 0.7f))
            }
        }
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { HText(confirmTitle, style = Hex.type.title2) },
            confirmButton = { TextButtonH(label, { confirm = false; done() }) },
            dismissButton = { TextButtonH(S.common.cancel, { confirm = false }) },
            containerColor = c.surf,
        )
    }
}

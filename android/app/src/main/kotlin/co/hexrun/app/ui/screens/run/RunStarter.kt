package co.hexrun.app.ui.screens.run

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import co.hexrun.app.AppGraph
import co.hexrun.app.data.LocPerm
import co.hexrun.app.data.PermissionsRepository
import co.hexrun.app.nav.AppNav
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.nav.Routes
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.TextButtonH
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.util.hasLocationPermission
import co.hexrun.app.util.openAppSettings
import co.hexrun.core.i18n.S
import co.hexrun.core.run.RunContext
import co.hexrun.core.ui.RunUi
import kotlinx.coroutines.launch

/** Koşuyu başlatır: halka seçenekleri (Halka Ustası, çaylak) ve konum izni. */
suspend fun startRunNow(graph: AppGraph, nav: AppNav, ctx: RunContext) {
    val (close, minLen) = RunUi.loopOptionsFor(graph.me.me.value)
    graph.runController.start(ctx, close, minLen)
    nav.go(Routes.run())
}

/**
 * Koşu başlatıcı. Konum izni sorulmadıysa önce sorar (gerekçe onboarding'de verildi);
 * reddedildiyse "Ayarları aç" penceresi: uygulama açık kalır, koşu kilitli.
 */
@Composable
fun rememberRunStarter(): (RunContext) -> Unit {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pending by remember { mutableStateOf<RunContext?>(null) }
    var locked by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        scope.launch {
            graph.prefs.update { it.copy(locationAsked = true) }
            graph.permissions.refresh(graph.prefs.prefs.value)
            val ctx = pending
            pending = null
            if (ctx != null && context.hasLocationPermission()) startRunNow(graph, nav, ctx) else locked = true
        }
    }
    if (locked) {
        AlertDialog(
            onDismissRequest = { locked = false },
            title = { HText(S.run.noPermission, style = Hex.type.title2) },
            text = { HText(S.map.runLockedBody) },
            confirmButton = { TextButtonH(S.permissions.openSettings, { locked = false; context.openAppSettings() }) },
            dismissButton = { TextButtonH(S.common.cancel, { locked = false }) },
            containerColor = Hex.colors.surf,
        )
    }
    return remember(graph, nav) {
        { ctx: RunContext ->
            when {
                context.hasLocationPermission() -> scope.launch { startRunNow(graph, nav, ctx) }
                graph.permissions.state.value.location == LocPerm.DENIED -> locked = true
                else -> {
                    pending = ctx
                    launcher.launch(PermissionsRepository.LOCATION)
                }
            }
            Unit
        }
    }
}

package co.hexrun.app.ui.screens.settings

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.hexrun.app.BuildConfig
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.nav.Routes
import co.hexrun.app.ui.Query
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
import co.hexrun.app.ui.components.SectionTitle
import co.hexrun.app.ui.components.Skeleton
import co.hexrun.app.ui.components.StateBlock
import co.hexrun.app.ui.components.TextButtonH
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Target
import co.hexrun.app.util.currentLocation
import co.hexrun.app.util.openNotificationSettings
import co.hexrun.app.util.openUrl
import co.hexrun.core.Rules
import co.hexrun.core.api.ApiError
import co.hexrun.core.api.ErrorText
import co.hexrun.core.api.IntegrationDto
import co.hexrun.core.api.IntegrationPatch
import co.hexrun.core.api.Providers
import co.hexrun.core.i18n.S
import co.hexrun.core.ui.Dates
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@Composable
private fun Item(icon: HexIcon, label: String, onClick: () -> Unit, danger: Boolean = false, busy: Boolean = false, tag: String? = null) {
    val c = Hex.colors
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = Target.min + 4.dp)
            .clickable(enabled = !busy, role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = label }
            .let { if (tag != null) it.testTag(tag) else it },
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        HIcon(icon, size = 20.dp, tint = if (danger) c.ink else c.ink2)
        HText(label, style = Hex.type.callout.copy(textDecoration = if (danger) TextDecoration.Underline else null), modifier = Modifier.weight(1f))
        if (busy) CircularProgressIndicator(Modifier.padding(4.dp), color = c.ink, strokeWidth = 2.dp) else HIcon(HexIcon.Chevron, size = 18.dp, tint = c.ink3)
    }
}

/** Ayarlar: gizlilik, saatler, bildirim izinleri, veri dışa aktarma (KVKK/GDPR), hesap silme, yasal. */
@Composable
fun SettingsScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var exporting by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val doExport: () -> Unit = {
        exporting = true
        scope.launch {
            attempt { graph.api.exportMe() }
                .onSuccess { json ->
                    val uri = withContext(Dispatchers.IO) {
                        val dir = File(context.cacheDir, "share").apply { mkdirs() }
                        val f = File(dir, "hexrun-verilerim-${java.time.LocalDate.now()}.json")
                        f.writeText(json)
                        FileProvider.getUriForFile(context, "${context.packageName}.files", f)
                    }
                    val send = Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    runCatching { context.startActivity(Intent.createChooser(send, S.settings.export)) }.onFailure { message = S.settings.exportDone }
                }
                .onFailure { message = ErrorText.of(it) }
            exporting = false
        }
    }
    HScreen(title = S.settings.title, onBack = nav::back, modifier = Modifier.testTag("settings")) {
        SectionTitle(S.settings.account)
        HCard {
            Item(HexIcon.Eye, S.settings.privacy, { nav.go(Routes.PRIVACY) })
            HDivider()
            Item(HexIcon.Watch, S.settings.integrations, { nav.go(Routes.integrations()) })
            HDivider()
            Item(HexIcon.Bell, S.settings.notifications, { context.openNotificationSettings() })
            HDivider()
            Item(HexIcon.Download, S.settings.export, doExport, busy = exporting, tag = "export")
            HDivider()
            Item(HexIcon.Logout, S.settings.logout, { scope.launch { graph.auth.signOut() } })
            HDivider()
            Item(HexIcon.Trash, S.settings.delete, { confirmDelete = true }, danger = true, tag = "delete-account")
        }
        SectionTitle(S.settings.legal)
        HCard {
            Item(HexIcon.Chevron, S.settings.terms, { context.openUrl(BuildConfig.TERMS_URL) })
            HDivider()
            Item(HexIcon.Chevron, S.settings.privacyPolicy, { context.openUrl(BuildConfig.PRIVACY_URL) })
            HDivider()
            Item(HexIcon.Chevron, S.settings.licenses, { context.openUrl(BuildConfig.LICENSES_URL) })
        }
        message?.let { HText(it, style = Hex.type.callout) }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            DataText(S.settings.mapAttribution, tone = Tone.Ink3)
            DataText(S.settings.version(BuildConfig.VERSION_NAME), tone = Tone.Ink3)
        }
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { HText(S.settings.deleteConfirmTitle, style = Hex.type.title2) },
            text = { HText(S.settings.deleteConfirmBody) },
            confirmButton = {
                TextButtonH(S.settings.deleteConfirm, {
                    confirmDelete = false
                    scope.launch {
                        attempt { graph.api.deleteMe() }
                            .onSuccess { graph.auth.signOut() }
                            .onFailure { message = ErrorText.of(it) }
                    }
                })
            },
            dismissButton = { TextButtonH(S.common.cancel, { confirmDelete = false }) },
            containerColor = Hex.colors.surf,
        )
    }
}

/** 15A · Gizlilik bölgesi (200–800 m) ve "kim ne görür". Ev konumu sunucuda saklanmaz. */
@Composable
fun PrivacyScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val me by graph.me.me.collectAsStateWithLifecycle()
    var enabled by remember { mutableStateOf(false) }
    var radius by remember { mutableFloatStateOf(400f) }
    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(me) {
        me?.let {
            enabled = it.privacy.enabled
            it.privacy.radiusM?.let { r -> radius = r.toFloat() }
        }
    }
    val save: (Boolean, Int) -> Unit = { on, r ->
        busy = true
        scope.launch {
            val res = if (!on) attempt { graph.api.privacy(null, null) } else {
                // Sözleşme ev konumunu her değişiklikte ister; sunucu yalnız kaydırılmış merkezi saklar.
                val loc = currentLocation(context).pos
                if (loc == null) Result.failure(IllegalStateException(S.privacy.needLocation)) else attempt { graph.api.privacy(loc, Rules.clampRadius(r.toDouble())) }
            }
            res.onSuccess { graph.me.set(it); msg = S.privacy.homeSet }
                .onFailure { msg = if (it is ApiError) ErrorText.of(it) else it.message ?: S.common.genericError }
            busy = false
        }
    }
    val c = Hex.colors
    HScreen(title = S.privacy.title, onBack = nav::back, modifier = Modifier.testTag("privacy")) {
        HCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    HText(S.privacy.zone, style = Hex.type.title2)
                    HText(S.privacy.zoneSub, style = Hex.type.callout, tone = Tone.Ink2)
                }
                Switch(
                    enabled, { v -> enabled = v; save(v, radius.toInt()) },
                    modifier = Modifier.semantics { contentDescription = S.privacy.zone },
                    colors = SwitchDefaults.colors(checkedTrackColor = c.ink, checkedThumbColor = c.surf, uncheckedTrackColor = c.track, uncheckedThumbColor = c.ink2, uncheckedBorderColor = c.line2),
                )
            }
            if (enabled) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    DataText(S.privacy.inside, tone = Tone.Ink2)
                    DataText(S.privacy.radius(radius.toInt()))
                }
                val steps = (Rules.PRIVACY_RADIUS_MAX_M - Rules.PRIVACY_RADIUS_MIN_M) / 50 - 1
                Slider(
                    value = radius,
                    onValueChange = { radius = it },
                    onValueChangeFinished = { save(true, radius.toInt()) },
                    valueRange = Rules.PRIVACY_RADIUS_MIN_M.toFloat()..Rules.PRIVACY_RADIUS_MAX_M.toFloat(),
                    steps = steps,
                    modifier = Modifier.semantics { contentDescription = "${S.privacy.zone} ${S.privacy.radius(radius.toInt())}" },
                    colors = SliderDefaults.colors(thumbColor = c.ink, activeTrackColor = c.ink, inactiveTrackColor = c.track, activeTickColor = c.surf, inactiveTickColor = c.ink3),
                )
                HButton(S.privacy.setHome, { save(true, radius.toInt()) }, Modifier.fillMaxWidth(), kind = ButtonKind.Secondary, icon = HexIcon.Locate, loading = busy)
            }
            msg?.let { HText(it, style = Hex.type.callout) }
        }
        SectionTitle(S.privacy.whoSees)
        HCard {
            S.privacy.rows.forEachIndexed { i, r ->
                if (i > 0) HDivider()
                Row(Modifier.defaultMinSize(minHeight = 44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HText(r.k, style = Hex.type.callout, modifier = Modifier.weight(1f))
                    HText(r.v, style = Hex.type.callout, weight = FontWeight.SemiBold)
                    if (i != 1) HIcon(HexIcon.Lock, size = 16.dp, tint = c.ink2)
                }
            }
        }
        HText(S.privacy.footnote, style = Hex.type.callout, tone = Tone.Ink3)
    }
}

/**
 * 17A · Saat ve uygulamalar: aynı kurallar, 24 saat penceresi, aynı koşu bir kez. Strava OAuth
 * Custom Tabs'ta açılır; sunucu `hexrun://integrations?connected=strava` ile geri döndürür.
 */
@Composable
fun IntegrationsScreen(connected: String?, error: String?) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val q = remember { Query(scope) { graph.api.integrations() } }
    val state by q.state.collectAsStateWithLifecycle()
    var soon by remember { mutableStateOf(setOf<String>()) }
    var busy by remember { mutableStateOf<String?>(null) }
    var ask by remember { mutableStateOf<String?>(null) }
    var msg by remember { mutableStateOf(if (error != null) S.common.genericError else null) }
    LaunchedEffect(connected, error) { q.load() }
    val device = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}".take(80)
    val connect: (String) -> Unit = { p ->
        busy = p
        scope.launch {
            attempt { graph.api.connectIntegration(p, if (p in Providers.DEVICE_SOURCES) device else null) }
                .onSuccess { r -> r.url?.let { context.openUrl(it) }; q.load() }
                .onFailure { e ->
                    if (e is ApiError && (e.code == "not_configured" || e.status == 501)) soon = soon + p else msg = ErrorText.of(e)
                }
            busy = null
        }
    }
    HScreen(title = S.integrations.title, onBack = nav::back, modifier = Modifier.testTag("integrations")) {
        val data = state.data
        when {
            data != null -> {
                val byP = data.associateBy { it.provider }
                for ((title, list) in listOf(S.integrations.watches to Providers.WATCHES, S.integrations.apps to Providers.APPS)) {
                    SectionTitle(title)
                    HCard {
                        list.forEachIndexed { i, p ->
                            if (i > 0) HDivider()
                            IntegrationRow(p, byP[p], p in soon, busy == p, onConnect = { connect(p) }, onDisconnect = { ask = p }, onToggle = { patch ->
                                scope.launch { attempt { graph.api.updateIntegration(p, patch) }.onSuccess { q.load() } }
                            })
                        }
                    }
                }
                HText(S.integrations.rule, style = Hex.type.callout, tone = Tone.Ink3)
            }
            state.failed -> StateBlock(S.common.genericError, action = S.common.retry, onAction = { q.load() })
            else -> Skeleton(height = 240.dp)
        }
        msg?.let { HText(it, style = Hex.type.callout) }
    }
    ask?.let { p ->
        AlertDialog(
            onDismissRequest = { ask = null },
            title = { HText(S.integrations.disconnect, style = Hex.type.title2) },
            text = { HText(S.integrations.names[p] ?: p) },
            confirmButton = { TextButtonH(S.integrations.disconnect, { ask = null; scope.launch { attempt { graph.api.disconnectIntegration(p) }; q.load() } }) },
            dismissButton = { TextButtonH(S.common.cancel, { ask = null }) },
            containerColor = Hex.colors.surf,
        )
    }
}

@Composable
private fun IntegrationRow(p: String, dto: IntegrationDto?, soon: Boolean, busy: Boolean, onConnect: () -> Unit, onDisconnect: () -> Unit, onToggle: (IntegrationPatch) -> Unit) {
    val c = Hex.colors
    val isConnected = dto?.connected == true
    val health = p == "health_connect" || p == "apple_health"
    val sub = if (isConnected) {
        listOfNotNull(dto?.device, dto?.lastSyncAt?.let { S.integrations.lastSync(Dates.relativeLabel(it)) }).joinToString(" · ").ifEmpty {
            when {
                p == "wear_os" || p == "apple_watch" -> S.integrations.appInstalled
                health -> S.integrations.healthSub
                else -> ""
            }
        }
    } else if (health) S.integrations.healthSub else S.integrations.autoImport
    Column(Modifier.padding(vertical = 4.dp).testTag("integration-$p"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.defaultMinSize(minHeight = 48.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HIcon(if (p == "strava" || health) HexIcon.Pace else HexIcon.Watch, size = 22.dp)
            Column(Modifier.weight(1f)) {
                HText(S.integrations.names[p] ?: p, style = Hex.type.callout, weight = FontWeight.SemiBold)
                if (sub.isNotEmpty()) HText(sub, style = Hex.type.callout, tone = Tone.Ink2)
            }
            when {
                isConnected -> HButton(S.integrations.connected, onDisconnect, kind = ButtonKind.Ghost, icon = HexIcon.Check, contentDescription = "${S.integrations.connected}. ${S.integrations.disconnect}")
                soon -> HText(S.common.soon, style = Hex.type.label, tone = Tone.Ink3, upper = true)
                else -> HButton(S.integrations.connect, onConnect, kind = ButtonKind.Secondary, loading = busy)
            }
        }
        if (p == "strava" && isConnected) {
            for ((label, isImport) in listOf(S.integrations.stravaImport to true, S.integrations.stravaExport to false)) {
                Row(Modifier.fillMaxWidth().defaultMinSize(minHeight = 44.dp).padding(start = 34.dp), verticalAlignment = Alignment.CenterVertically) {
                    HText(label, style = Hex.type.callout, modifier = Modifier.weight(1f))
                    val v = if (isImport) dto?.importEnabled == true else dto?.exportEnabled == true
                    Switch(
                        v, { on -> onToggle(if (isImport) IntegrationPatch(importEnabled = on) else IntegrationPatch(exportEnabled = on)) },
                        modifier = Modifier.semantics { contentDescription = label },
                        colors = SwitchDefaults.colors(checkedTrackColor = c.ink, checkedThumbColor = c.surf, uncheckedTrackColor = c.track, uncheckedThumbColor = c.ink2, uncheckedBorderColor = c.line2),
                    )
                }
            }
        }
    }
}

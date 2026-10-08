package co.hexrun.app.nav

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import co.hexrun.app.AppGraph
import co.hexrun.app.data.AuthStatus
import co.hexrun.app.push.PushRegistrar
import co.hexrun.app.run.RunUploadWorker
import co.hexrun.app.ui.screens.auth.AuthScreen
import co.hexrun.app.ui.screens.auth.EmailScreen
import co.hexrun.app.ui.screens.auth.ProfileSetupScreen
import co.hexrun.app.ui.screens.duel.DuelScreen
import co.hexrun.app.ui.screens.duel.DuelSelectScreen
import co.hexrun.app.ui.screens.main.MainScreen
import co.hexrun.app.ui.screens.notifications.NotificationsScreen
import co.hexrun.app.ui.screens.onboarding.OnboardingScreen
import co.hexrun.app.ui.screens.onboarding.PermissionsScreen
import co.hexrun.app.ui.screens.profile.BadgeDetailScreen
import co.hexrun.app.ui.screens.profile.ProfileScreen
import co.hexrun.app.ui.screens.run.RunScreen
import co.hexrun.app.ui.screens.run.SummaryScreen
import co.hexrun.app.ui.screens.settings.IntegrationsScreen
import co.hexrun.app.ui.screens.settings.PrivacyScreen
import co.hexrun.app.ui.screens.settings.SettingsScreen
import co.hexrun.app.ui.screens.share.ShareScreen
import co.hexrun.app.ui.theme.Hex
import co.hexrun.core.deeplink.DeepLink
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private fun NavBackStackEntry.arg(name: String): String? = arguments?.getString(name).orNullIfBlank()

private fun opt(vararg names: String) = names.map { n -> navArgument(n) { type = NavType.StringType; nullable = true; defaultValue = null } }

/**
 * Kök: giriş kapısı (onboarding → izinler → giriş → profil → harita; yarım koşu varsa koşu modu),
 * gezinti grafiği, derin bağlantılar, kuyruk gönderimi ve push kaydı.
 */
@Composable
fun AppRoot(graph: AppGraph, pendingLink: DeepLink?, onLinkConsumed: () -> Unit) {
    val controller = rememberNavController()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs by graph.prefs.prefs.collectAsStateWithLifecycle()
    val status by graph.auth.status.collectAsStateWithLifecycle()
    val run by graph.runController.state.collectAsStateWithLifecycle()
    var recovered by remember { mutableStateOf(false) }
    var heldLink by remember { mutableStateOf<DeepLink?>(null) }
    val backEntry by controller.currentBackStackEntryAsState()

    val nav = remember(controller) {
        AppNav(controller) { link -> heldLink = link }
    }

    // Açılışta yarım kalan koşuyu geri yükle (ön planda: servis başlatılabilir).
    LaunchedEffect(Unit) {
        graph.runController.recover()
        recovered = true
    }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        graph.permissions.refresh(graph.prefs.prefs.value)
        scope.launch { runCatching { graph.runQueue.flush() } }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { graph.runController.flush() }

    // Kuyruktaki koşuları uygulama açıkken dakikada bir dene; kalırsa WorkManager devralır.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                delay(60_000)
                runCatching { graph.runQueue.flush() }
                if (graph.runQueue.pending().isNotEmpty()) RunUploadWorker.schedule(context)
            }
        }
    }

    LaunchedEffect(prefs.loaded) { if (prefs.loaded) graph.permissions.refresh(prefs) }

    // Push: izin varsa jeton kaydı.
    LaunchedEffect(status) {
        if (status == AuthStatus.SIGNED_IN) {
            PushRegistrar.register(context)
            graph.me.ensure()
        }
    }

    LaunchedEffect(pendingLink) {
        if (pendingLink != null) {
            heldLink = pendingLink
            onLinkConsumed()
        }
    }

    val ready = prefs.loaded && status != AuthStatus.LOADING && recovered

    fun gate(): String = when {
        run.active && status == AuthStatus.SIGNED_IN -> Routes.run()
        !prefs.onboardingDone -> Routes.ONBOARDING
        !prefs.permissionsDone -> Routes.PERMISSIONS
        status != AuthStatus.SIGNED_IN -> Routes.AUTH
        prefs.needsProfile -> Routes.AUTH_PROFILE
        else -> Routes.main()
    }

    // Oturum kapanınca girişe dön.
    LaunchedEffect(status, ready) {
        if (ready && status == AuthStatus.SIGNED_OUT) {
            val r = controller.currentBackStackEntry?.destination?.route
            if (r != null && r !in setOf(Routes.ONBOARDING, Routes.PERMISSIONS, Routes.AUTH, Routes.AUTH_EMAIL)) nav.reset(gate())
        }
    }

    // Derin bağlantı: oturum açık ve kapı geçildiyse uygula.
    LaunchedEffect(heldLink, ready, status, prefs.needsProfile, backEntry != null) {
        val link = heldLink ?: return@LaunchedEffect
        if (!ready || status != AuthStatus.SIGNED_IN || prefs.needsProfile || !prefs.onboardingDone) return@LaunchedEffect
        if (backEntry == null) return@LaunchedEffect
        heldLink = null
        if (link is DeepLink.Region) nav.regionRequest.value = link.cell
        Routes.of(link)?.let { route ->
            if (link is DeepLink.Run && run.active) nav.go(Routes.run()) else nav.go(route)
        }
    }

    CompositionLocalProvider(LocalNav provides nav, LocalGraph provides graph) {
        Box(Modifier.fillMaxSize().background(Hex.colors.bg)) {
            if (ready) {
                NavHost(navController = controller, startDestination = remember { gate() }) {
                    composable(Routes.ONBOARDING) { OnboardingScreen() }
                    composable(Routes.PERMISSIONS) { PermissionsScreen(onDone = { nav.reset(gateAfterPermissions(status, prefs.needsProfile)) }) }
                    composable(Routes.AUTH) { AuthScreen() }
                    composable(Routes.AUTH_EMAIL) { EmailScreen() }
                    composable(Routes.AUTH_PROFILE) { ProfileSetupScreen() }
                    composable(Routes.MAIN, arguments = opt("tab")) { MainScreen(initialTab = it.arg("tab") ?: "map") }
                    composable(Routes.RUN, arguments = opt("defend", "attack", "firstLoop")) {
                        RunScreen(defend = it.arg("defend"), attack = it.arg("attack"), firstLoop = it.arg("firstLoop") == "true")
                    }
                    composable(Routes.SUMMARY, arguments = opt("clientRunId", "runId")) { SummaryScreen(it.arg("clientRunId"), it.arg("runId")) }
                    composable(Routes.DUEL) { DuelScreen(it.arg("id") ?: "") }
                    composable(Routes.DUEL_SELECT, arguments = opt("cell", "cells", "defender", "revenge")) {
                        DuelSelectScreen(it.arg("cell"), it.arg("cells")?.split(',')?.filter { c -> c.isNotBlank() } ?: emptyList(), it.arg("defender"), it.arg("revenge"))
                    }
                    composable(Routes.PROFILE, arguments = opt("tab", "code")) { ProfileScreen(it.arg("tab"), it.arg("code")) }
                    composable(Routes.BADGE) { BadgeDetailScreen(it.arg("id") ?: "") }
                    composable(Routes.SETTINGS) { SettingsScreen() }
                    composable(Routes.PRIVACY) { PrivacyScreen() }
                    composable(Routes.INTEGRATIONS, arguments = opt("connected", "error")) { IntegrationsScreen(it.arg("connected"), it.arg("error")) }
                    composable(Routes.NOTIFICATIONS) { NotificationsScreen() }
                    composable(Routes.SHARE) { ShareScreen(it.arg("runId") ?: "") }
                }
            }
        }
    }
}

private fun gateAfterPermissions(status: AuthStatus, needsProfile: Boolean): String = when {
    status != AuthStatus.SIGNED_IN -> Routes.AUTH
    needsProfile -> Routes.AUTH_PROFILE
    else -> Routes.main()
}

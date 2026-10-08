package co.hexrun.app.nav

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavHostController
import co.hexrun.app.AppGraph
import co.hexrun.core.deeplink.DeepLink
import kotlinx.coroutines.flow.MutableStateFlow

/** Ekranların gezinti eylemleri. */
class AppNav(val controller: NavHostController, val open: (DeepLink) -> Unit) {
    /** Haritada açılacak bölge sheet'i (derin bağlantı ya da bildirim). */
    val regionRequest = MutableStateFlow<String?>(null)

    fun go(route: String) = controller.navigate(route) { launchSingleTop = true }

    fun back() {
        if (!controller.popBackStack()) controller.navigate(Routes.main()) { launchSingleTop = true }
    }

    /** Ana sekmelere dön (koşu/özet sonrası); geri yığın temizlenir. */
    fun toMain(tab: String = "map") = controller.navigate(Routes.main(tab)) {
        popUpTo(controller.graph.id) { inclusive = true }
        launchSingleTop = true
    }

    /** Geri yığını temizleyerek yeni köke geç (giriş kapısı geçişleri). */
    fun reset(route: String) = controller.navigate(route) {
        popUpTo(controller.graph.id) { inclusive = true }
        launchSingleTop = true
    }

    fun replace(route: String) {
        val current = controller.currentBackStackEntry?.destination?.route
        controller.navigate(route) {
            if (current != null) popUpTo(current) { inclusive = true }
            launchSingleTop = true
        }
    }
}

val LocalNav = staticCompositionLocalOf<AppNav> { error("AppNav yok") }
val LocalGraph = staticCompositionLocalOf<AppGraph> { error("AppGraph yok") }

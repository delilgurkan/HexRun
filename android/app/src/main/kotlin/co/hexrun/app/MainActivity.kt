package co.hexrun.app

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import co.hexrun.app.nav.AppRoot
import co.hexrun.app.ui.theme.HexRunTheme
import co.hexrun.core.deeplink.DeepLink
import co.hexrun.core.deeplink.DeepLinks

/**
 * Tek etkinlik: Compose gezinti. Derin bağlantılar (hexrun://…, https://hexrun.co/invite|r/…,
 * push `data.url`) hem açılışta hem `onNewIntent`'te çözülür.
 */
class MainActivity : ComponentActivity() {
    private var pendingLink by mutableStateOf<DeepLink?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val graph = (application as HexRunApp).graph
        if (savedInstanceState == null) pendingLink = linkOf(intent)
        setContent {
            val dark = isSystemInDarkTheme()
            LaunchedEffect(dark) {
                enableEdgeToEdge(
                    statusBarStyle = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
                    navigationBarStyle = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
                )
            }
            HexRunTheme(dark = dark) {
                AppRoot(graph = graph, pendingLink = pendingLink, onLinkConsumed = { pendingLink = null })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        linkOf(intent)?.let { pendingLink = it }
    }

    private fun linkOf(intent: Intent?): DeepLink? {
        val url = intent?.dataString ?: intent?.getStringExtra("url") ?: intent?.getStringExtra("deeplink")
        return DeepLinks.parse(url)
    }
}

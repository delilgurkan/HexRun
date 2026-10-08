package co.hexrun.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import co.hexrun.wear.ui.WearRoot

/** Tek ekranlı saat uygulaması; durum [WearApp.store]'dan, yükler PhoneListenerService'ten gelir. */
class MainActivity : ComponentActivity() {
    private val app: WearApp get() = application as WearApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { WearRoot(app.store) }
    }

    override fun onResume() {
        super.onResume()
        // Servis uyurken gelen son HUD'u kaçırmamak için Data Layer'dan yeniden oku.
        app.bridge.refresh()
    }
}

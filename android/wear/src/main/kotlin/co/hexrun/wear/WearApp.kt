package co.hexrun.wear

import android.app.Application
import co.hexrun.wear.data.Haptics
import co.hexrun.wear.data.PhoneBridge
import co.hexrun.wear.state.WearStore

/**
 * Süreç boyunca tek durum tutucu: dinleyici servisi (telefon yükleri) ve etkinlik (arayüz)
 * aynı [WearStore]'u paylaşır. Yan etkiler [PhoneBridge]'de çalışır.
 */
class WearApp : Application() {
    val store: WearStore = WearStore()
    lateinit var bridge: PhoneBridge
        private set

    override fun onCreate() {
        super.onCreate()
        bridge = PhoneBridge(this, store, Haptics(this))
        store.effectHandler = bridge::handle
    }
}

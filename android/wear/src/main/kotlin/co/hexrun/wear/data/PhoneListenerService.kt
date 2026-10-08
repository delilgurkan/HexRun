package co.hexrun.wear.data

import co.hexrun.core.WatchPayload
import co.hexrun.wear.WearApp
import co.hexrun.wear.state.WearAction
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/** Telefon yüklerini (HUD ve anlık olaylar) uygulama kapalıyken de alır ve durum tutucuya iletir. */
class PhoneListenerService : WearableListenerService() {
    private val store get() = (application as WearApp).store

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        // Tampon bu yöntem dönünce kapatılır; öğeler hemen çözülür.
        for (event in dataEvents) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            val hud = PhoneBridge.decodeHud(event.dataItem) ?: continue
            store.dispatch(WearAction.Hud(hud, System.currentTimeMillis(), live = true))
        }
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        if (messageEvent.path != WatchPayload.PATH_EVENT) return
        val event = WatchPayload.decodeEvent(messageEvent.data) ?: return
        store.dispatch(WearAction.Event(event, System.currentTimeMillis()))
    }
}

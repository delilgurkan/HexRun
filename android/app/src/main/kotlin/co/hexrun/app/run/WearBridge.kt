package co.hexrun.app.run

import android.content.Context
import co.hexrun.core.WatchEvent
import co.hexrun.core.WatchHud
import co.hexrun.core.WatchPayload
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService

/**
 * Telefon tarafı saat köprüsü (docs/NATIVE.md "Telefon ↔ saat protokolü"):
 * - durum: DataClient `/hexrun/hud`, anahtar `json` (en son durum kazanır),
 * - olay: MessageClient `/hexrun/event` (tick, conquest, loop_open) → bağlı tüm saatlere,
 * - komut: MessageClient `/hexrun/command` (pause/resume/finish) ← saatten ([WatchCommandService]).
 * Google Play hizmetleri ya da saat yoksa çağrılar sessizce başarısız olur.
 */
class WearBridge(context: Context) : WatchSink {
    private val app = context.applicationContext
    private val data by lazy { runCatching { Wearable.getDataClient(app) }.getOrNull() }
    private val messages by lazy { runCatching { Wearable.getMessageClient(app) }.getOrNull() }
    private val nodes by lazy { runCatching { Wearable.getNodeClient(app) }.getOrNull() }

    override fun publish(hud: WatchHud) {
        val client = data ?: return
        runCatching {
            val req = PutDataMapRequest.create(WatchPayload.PATH_HUD).apply {
                dataMap.putString(WatchPayload.KEY_JSON, WatchPayload.encodeHud(hud))
                dataMap.putLong("ts", hud.ts)
            }.asPutDataRequest().setUrgent()
            client.putDataItem(req)
        }
    }

    override fun event(e: WatchEvent) {
        val m = messages ?: return
        val n = nodes ?: return
        val bytes = WatchPayload.encodeEvent(e)
        runCatching {
            n.connectedNodes.addOnSuccessListener { list ->
                for (node in list) runCatching { m.sendMessage(node.id, WatchPayload.PATH_EVENT, bytes) }
            }
        }
    }
}

/**
 * Saat → telefon komutları (`/hexrun/command`). Süreç kapalıysa da sistem bu servisi başlatır;
 * komut işlendikten hemen sonra güncel HUD yayımlanır (saat iyimser arayüzünü 5 sn içinde doğrular).
 */
class WatchCommandService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != WatchPayload.PATH_COMMAND) return
        val cmd = WatchPayload.decodeCommand(event.data) ?: return
        (application as co.hexrun.app.HexRunApp).graph.runController.onWatchCommand(cmd)
    }
}

object NoWatch : WatchSink {
    override fun publish(hud: WatchHud) = Unit
    override fun event(e: WatchEvent) = Unit
}

package co.hexrun.app.run

import android.content.Context
import co.hexrun.core.WatchCommand
import co.hexrun.core.WatchEvent
import co.hexrun.core.WatchHud
import co.hexrun.core.WatchPayload
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

/**
 * Telefon tarafı saat köprüsü (docs/NATIVE.md "Telefon ↔ saat protokolü"):
 * - durum: DataClient `/hexrun/hud`, anahtar `json` (en son durum kazanır),
 * - olay: MessageClient `/hexrun/event` (tick, conquest, loop_open) → bağlı tüm saatlere,
 * - komut: MessageClient `/hexrun/command` (pause/resume/finish) ← saatten.
 * Google Play hizmetleri ya da saat yoksa çağrılar sessizce başarısız olur.
 */
class WearBridge(context: Context) : WatchSink {
    private val app = context.applicationContext
    private val data by lazy { runCatching { Wearable.getDataClient(app) }.getOrNull() }
    private val messages by lazy { runCatching { Wearable.getMessageClient(app) }.getOrNull() }
    private val nodes by lazy { runCatching { Wearable.getNodeClient(app) }.getOrNull() }
    private var listener: MessageClient.OnMessageReceivedListener? = null
    @Volatile private var lastState: String? = null

    override fun publish(hud: WatchHud) {
        // Boşta durumu yalnız bir kez yazılır (gereksiz senkronizasyon yok).
        if (hud.state == "idle" && lastState == "idle") return
        lastState = hud.state
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

    /** Saat komutlarını dinlemeye başlar (uygulama süreci yaşadıkça). */
    fun listen(onCommand: (WatchCommand) -> Unit) {
        val m = messages ?: return
        if (listener != null) return
        val l = MessageClient.OnMessageReceivedListener { ev: MessageEvent ->
            if (ev.path == WatchPayload.PATH_COMMAND) WatchPayload.decodeCommand(ev.data)?.let(onCommand)
        }
        listener = l
        runCatching { m.addListener(l) }
    }
}

object NoWatch : WatchSink {
    override fun publish(hud: WatchHud) = Unit
    override fun event(e: WatchEvent) = Unit
}

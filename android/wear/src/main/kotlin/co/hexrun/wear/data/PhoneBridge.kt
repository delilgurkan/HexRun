package co.hexrun.wear.data

import android.content.Context
import android.net.Uri
import android.util.Log
import co.hexrun.core.WatchCommand
import co.hexrun.core.WatchHud
import co.hexrun.core.WatchPayload
import co.hexrun.wear.state.CommandAction
import co.hexrun.wear.state.WearAction
import co.hexrun.wear.state.WearEffect
import co.hexrun.wear.state.WearStore
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Wearable Data Layer köprüsü (docs/NATIVE.md "Telefon ↔ saat protokolü"):
 *  - telefon → saat HUD: DataClient `/hexrun/hud`, anahtar `json` ([PhoneListenerService] + açılışta [refresh]),
 *  - telefon → saat olay: MessageClient `/hexrun/event` ([PhoneListenerService]),
 *  - saat → telefon komut: MessageClient `/hexrun/command` ([handle]).
 */
class PhoneBridge(
    context: Context,
    private val store: WearStore,
    private val haptics: Haptics,
) {
    private val app = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun handle(effect: WearEffect) {
        when (effect) {
            is WearEffect.Vibrate -> haptics.play(effect.haptic)
            is WearEffect.Send -> scope.launch { send(effect.action) }
        }
    }

    /** Uygulama öne gelince son HUD'u Data Layer'dan oku (servis o sırada çalışmıyor olabilir). */
    fun refresh() {
        scope.launch {
            try {
                val uri = Uri.Builder()
                    .scheme(PutDataRequest.WEAR_URI_SCHEME)
                    .authority("*")
                    .path(WatchPayload.PATH_HUD)
                    .build()
                val buffer = Wearable.getDataClient(app).getDataItems(uri).await()
                val huds = try {
                    buffer.mapNotNull { decodeHud(it) }
                } finally {
                    buffer.release()
                }
                huds.maxByOrNull { it.ts }?.let {
                    store.dispatch(WearAction.Hud(it, System.currentTimeMillis(), live = false))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "HUD okunamadı", e)
            }
        }
    }

    private suspend fun send(action: CommandAction) {
        val bytes = WatchPayload.encodeCommand(WatchCommand(action = action.wire))
        val sent = try {
            val nodes = Wearable.getNodeClient(app).connectedNodes.await()
            // Önce yakındaki (Bluetooth) telefon; yoksa bulut üzerinden bağlı düğümler.
            val ordered = nodes.sortedByDescending { it.isNearby }
            var ok = false
            for (node in ordered) {
                try {
                    Wearable.getMessageClient(app).sendMessage(node.id, WatchPayload.PATH_COMMAND, bytes).await()
                    ok = true
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "Komut ${action.wire} ${node.displayName} düğümüne gitmedi", e)
                }
            }
            ok
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Bağlı düğümler alınamadı", e)
            false
        }
        if (!sent) store.dispatch(WearAction.CommandFailed(action))
    }

    companion object {
        private const val TAG = "HexRunWear"

        fun decodeHud(item: DataItem): WatchHud? {
            if (item.uri.path != WatchPayload.PATH_HUD) return null
            val json = DataMapItem.fromDataItem(item).dataMap.getString(WatchPayload.KEY_JSON) ?: return null
            return WatchPayload.decodeHud(json)
        }
    }
}

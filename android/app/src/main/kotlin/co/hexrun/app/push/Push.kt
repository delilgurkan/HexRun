package co.hexrun.app.push

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import co.hexrun.app.BuildConfig
import co.hexrun.app.HexRunApp
import co.hexrun.app.launchSafe
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.tasks.await

/**
 * FCM: google-services.json varsa Firebase kendiliğinden başlar; yoksa BuildConfig'teki değerlerle
 * elle başlatılır. İkisi de yoksa push kapalıdır (uygulama çalışmaya devam eder).
 */
object PushRegistrar {
    fun initFirebase(context: Context): Boolean {
        if (runCatching { FirebaseApp.getApps(context).isNotEmpty() }.getOrDefault(false)) return true
        if (BuildConfig.FIREBASE_APP_ID.isBlank() || BuildConfig.FIREBASE_API_KEY.isBlank() || BuildConfig.FIREBASE_PROJECT_ID.isBlank()) return false
        return runCatching {
            FirebaseApp.initializeApp(
                context,
                FirebaseOptions.Builder()
                    .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                    .setApiKey(BuildConfig.FIREBASE_API_KEY)
                    .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                    .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID.ifBlank { null })
                    .build(),
            )
            true
        }.getOrDefault(false)
    }

    /** İzin verilmişse FCM jetonunu sunucuya kaydeder (PUT /v1/me/push-token). İzin istemez. */
    suspend fun register(context: Context) {
        if (!Notifications.canPost(context)) return
        if (!initFirebase(context)) return
        val token = runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull() ?: return
        send(context, token)
    }

    suspend fun send(context: Context, token: String) {
        val graph = (context.applicationContext as HexRunApp).graph
        if (graph.prefs.prefs.value.pushToken == token) return
        runCatching { graph.api.pushToken(token, platform = "android", provider = "fcm") }
            .onSuccess { graph.prefs.update { it.copy(pushToken = token) } }
    }
}

/** FCM: yeni jeton ve ön plandayken gelen bildirimler (`data.url` → derin bağlantı). */
class HexMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val graph = (application as HexRunApp).graph
        graph.appScope.launchSafe { PushRegistrar.send(this, token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        val title = message.notification?.title ?: d["title"] ?: return
        val body = message.notification?.body ?: d["body"] ?: ""
        val url = d["url"] ?: d["deeplink"] ?: "hexrun://notifications"
        Notifications.show(this, Notifications.CHANNEL_GAME, (d["id"] ?: message.messageId ?: title).hashCode(), title, body, url)
    }
}

/** "Hatırlat": etkinlik başlarken yerel bildirim (AlarmManager, kesin olmayan zamanlama). */
class EventReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra(EXTRA_TITLE) ?: return
        Notifications.show(context, Notifications.CHANNEL_EVENTS, title.hashCode(), title, intent.getStringExtra(EXTRA_BODY) ?: "", "hexrun://events")
    }

    companion object {
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_BODY = "body"

        private fun pi(context: Context, id: String, title: String?, body: String?): PendingIntent {
            val i = Intent(context, EventReminderReceiver::class.java).setAction("co.hexrun.app.REMIND.$id")
            if (title != null) i.putExtra(EXTRA_TITLE, title).putExtra(EXTRA_BODY, body)
            return PendingIntent.getBroadcast(context, id.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }

        fun schedule(context: Context, id: String, title: String, body: String, inMinutes: Int) {
            val am = context.getSystemService(AlarmManager::class.java) ?: return
            val at = System.currentTimeMillis() + maxOf(1, inMinutes) * 60_000L
            runCatching { am.set(AlarmManager.RTC_WAKEUP, at, pi(context, id, title, body)) }
        }

        fun cancel(context: Context, id: String) {
            val am = context.getSystemService(AlarmManager::class.java) ?: return
            runCatching { am.cancel(pi(context, id, null, null)) }
        }
    }
}

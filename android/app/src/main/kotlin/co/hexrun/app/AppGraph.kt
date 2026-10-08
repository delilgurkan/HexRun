package co.hexrun.app

import android.content.Context
import android.os.Build
import co.hexrun.app.data.AuthRepository
import co.hexrun.app.data.DataStorePrefsStore
import co.hexrun.app.data.FileAppendLog
import co.hexrun.app.data.FileKeyValueStore
import co.hexrun.app.data.MapCache
import co.hexrun.app.data.MeRepository
import co.hexrun.app.data.PermissionsRepository
import co.hexrun.app.data.PrefsStore
import co.hexrun.app.data.SecureTokenStore
import co.hexrun.app.run.AndroidHaptics
import co.hexrun.app.run.RunController
import co.hexrun.app.run.RunUploadWorker
import co.hexrun.app.run.ServiceLocationControl
import co.hexrun.app.run.WearBridge
import co.hexrun.core.api.ApiClient
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.api.HttpHexRunApi
import co.hexrun.core.run.RunQueue
import co.hexrun.core.store.KeyValueStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Elle bağımlılık enjeksiyonu: uygulama ömrü boyunca tek örnekler. ViewModel'ler arayüzleri
 * (HexRunApi, PrefsStore…) alır; testler sahtelerini verir.
 */
class AppGraph(context: Context) {
    val context: Context = context.applicationContext
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val kv: KeyValueStore = FileKeyValueStore(this.context)
    val prefs: PrefsStore = DataStorePrefsStore(this.context, appScope)
    val permissions = PermissionsRepository(this.context)
    val mapCache = MapCache(kv)

    val client = ApiClient(
        baseUrl = BuildConfig.API_URL,
        tokens = SecureTokenStore(this.context),
        extraHeaders = mapOf(
            "User-Agent" to "HexRun-Android/${BuildConfig.VERSION_NAME} (${Build.MANUFACTURER} ${Build.MODEL}; Android ${Build.VERSION.RELEASE})",
            "Accept-Language" to "tr-TR,tr;q=0.9",
        ),
    )
    val api: HexRunApi = HttpHexRunApi(client)
    val me = MeRepository(api)
    val auth = AuthRepository(client, api, prefs, onSignedOut = {
        me.set(null)
        mapCache.clear()
    })

    val runQueue = RunQueue(kv, submit = { api.submitRun(it) })
    val wear = WearBridge(this.context)

    val runController = RunController(
        scope = appScope,
        log = FileAppendLog(this.context),
        queue = runQueue,
        api = api,
        mapCache = mapCache,
        haptics = AndroidHaptics(this.context),
        location = ServiceLocationControl(this.context),
        watch = wear,
        uuid = { UUID.randomUUID().toString() },
        scheduleUpload = { RunUploadWorker.schedule(this.context) },
        deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".take(80),
    )
}

fun CoroutineScope.launchSafe(block: suspend () -> Unit) {
    launch { runCatching { block() } }
}

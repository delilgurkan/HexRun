package co.hexrun.app

import android.app.Application
import co.hexrun.app.push.Notifications
import co.hexrun.app.push.PushRegistrar
import co.hexrun.app.run.RunUploadWorker
import co.hexrun.core.cells.Cells
import com.uber.h3core.H3Core
import org.maplibre.android.MapLibre

class HexRunApp : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        // H3: önce APK'daki jniLibs (arm64/arm), olmazsa JAR kaynağından çıkarma.
        Cells.loader = { runCatching { H3Core.newSystemInstance() }.getOrElse { H3Core.newInstance() } }
        MapLibre.getInstance(this)
        Notifications.createChannels(this)
        PushRegistrar.initFirebase(this)
        graph = AppGraph(this)
        graph.appScope.launchSafe {
            graph.auth.init()
            if (graph.runQueue.pending().isNotEmpty()) RunUploadWorker.schedule(this)
        }
    }
}

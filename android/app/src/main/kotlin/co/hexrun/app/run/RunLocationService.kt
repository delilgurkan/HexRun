package co.hexrun.app.run

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import co.hexrun.app.HexRunApp
import co.hexrun.app.MainActivity
import co.hexrun.app.R
import co.hexrun.app.push.Notifications
import co.hexrun.core.format.Format
import co.hexrun.core.geo.TrackPoint
import co.hexrun.core.i18n.S
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Koşu sırasında konum: Fused Location Provider, `foregroundServiceType="location"` ön plan
 * servisi ve "Koşu sürüyor" bildirimi. Ekran kapalıyken de iz çizilir. Süreç öldürülüp servis
 * yeniden başlatılırsa (START_STICKY) koşu günlükten geri yüklenir.
 */
class RunLocationService : Service() {
    private lateinit var fused: FusedLocationProviderClient
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var notifJob: Job? = null
    private var updating = false

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val pts = result.locations.map { l ->
                TrackPoint(l.latitude, l.longitude, l.time, if (l.hasAccuracy()) l.accuracy.toDouble() else null)
            }
            graph().runController.ingest(pts)
        }
    }

    private fun graph() = (application as HexRunApp).graph

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopEverything()
            return START_NOT_STICKY
        }
        if (!graph().permissions.hasFineLocation) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            ServiceCompat.startForeground(
                this,
                Notifications.RUN_ID,
                buildNotification(),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0,
            )
        } catch (e: Exception) {
            // Android 12+: arka plandan başlatma yasak ya da izin geri alındı.
            stopSelf()
            return START_NOT_STICKY
        }
        startUpdates()
        if (intent == null) {
            // Sistem servisi yeniden başlattı: süreç ölmüştü, koşuyu günlükten geri yükle.
            scope.launch { graph().runController.recover() }
        }
        startNotificationUpdates()
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startUpdates() {
        if (updating || !graph().permissions.hasFineLocation) return
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
            .setMinUpdateIntervalMillis(1000L)
            .setMinUpdateDistanceMeters(3f)
            .setWaitForAccurateLocation(false)
            .build()
        try {
            fused.requestLocationUpdates(req, callback, Looper.getMainLooper())
            updating = true
        } catch (e: SecurityException) {
            stopSelf()
        }
    }

    private fun startNotificationUpdates() {
        notifJob?.cancel()
        notifJob = scope.launch {
            while (isActive) {
                delay(5_000)
                Notifications.notifySafe(this@RunLocationService, Notifications.RUN_ID, buildNotification())
            }
        }
    }

    private fun buildNotification(): Notification {
        val snap = graph().runController.state.value.snap
        val body = if (snap != null) S.run.notificationBody(Format.km(snap.tracker.distanceM), Format.duration(snap.elapsedMs)) else null
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(android.net.Uri.parse("hexrun://run")).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, Notifications.CHANNEL_RUN)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(S.run.notificationTitle)
            .setContentText(body)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(open)
            .build()
    }

    private fun stopEverything() {
        if (updating) runCatching { fused.removeLocationUpdates(callback) }
        updating = false
        notifJob?.cancel()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        if (updating) runCatching { fused.removeLocationUpdates(callback) }
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "co.hexrun.app.run.STOP"
    }
}

/** [LocationControl]'ün Android uygulaması: ön plan servisini başlatır/durdurur. */
class ServiceLocationControl(private val context: Context) : LocationControl {
    override fun start() {
        runCatching { ContextCompat.startForegroundService(context, Intent(context, RunLocationService::class.java)) }
    }

    override fun stop() {
        runCatching { context.startService(Intent(context, RunLocationService::class.java).setAction(RunLocationService.ACTION_STOP)) }
    }
}

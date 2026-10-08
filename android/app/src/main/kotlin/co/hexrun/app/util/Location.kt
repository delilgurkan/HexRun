package co.hexrun.app.util

import android.annotation.SuppressLint
import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import android.Manifest
import android.content.pm.PackageManager
import co.hexrun.core.geo.LatLng
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await

data class CurrentLocation(val pos: LatLng? = null, val fix: Boolean = false, val accuracy: Double? = null)

fun Context.hasLocationPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

/** Tek seferlik güncel konum (izin varsa); yoksa null. */
@SuppressLint("MissingPermission")
suspend fun currentLocation(context: Context): CurrentLocation {
    if (!context.hasLocationPermission()) return CurrentLocation()
    val client = LocationServices.getFusedLocationProviderClient(context)
    val cur = runCatching { client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token).await() }.getOrNull()
    if (cur != null) return CurrentLocation(LatLng(cur.latitude, cur.longitude), true, if (cur.hasAccuracy()) cur.accuracy.toDouble() else null)
    val last = runCatching { client.lastLocation.await() }.getOrNull() ?: return CurrentLocation()
    return CurrentLocation(LatLng(last.latitude, last.longitude), false, null)
}

/**
 * Son bilinen + güncel konum (izin varsa). `fix` false iken koşu düğmesi "Konum bulunuyor…" der.
 * `key` değişince (izin verildi) yeniden denenir.
 */
@SuppressLint("MissingPermission")
@Composable
fun rememberCurrentLocation(key: Any?): CurrentLocation {
    val context = LocalContext.current
    var state by remember { mutableStateOf(CurrentLocation()) }
    LaunchedEffect(key) {
        if (!context.hasLocationPermission()) return@LaunchedEffect
        val client = LocationServices.getFusedLocationProviderClient(context)
        runCatching { client.lastLocation.await() }.getOrNull()?.let { state = CurrentLocation(LatLng(it.latitude, it.longitude), false, null) }
        val cur = currentLocation(context)
        if (cur.pos != null) state = cur
    }
    return state
}

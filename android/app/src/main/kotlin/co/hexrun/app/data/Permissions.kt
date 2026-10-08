package co.hexrun.app.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class LocPerm { UNKNOWN, DENIED, WHEN_IN_USE, ALWAYS }
enum class NotifPerm { UNKNOWN, GRANTED, DENIED }

data class PermState(val location: LocPerm = LocPerm.UNKNOWN, val notifications: NotifPerm = NotifPerm.UNKNOWN)

/**
 * İzin durumu. Android "reddedildi" ile "sorulmadı"yı ayırmaz; ilk sorudan sonra
 * `locationAsked` tercihine bakarız. Uygulama öne gelince yenilenir.
 */
class PermissionsRepository(private val context: Context) {
    private val _state = MutableStateFlow(PermState())
    val state: StateFlow<PermState> = _state.asStateFlow()

    fun has(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED

    val hasFineLocation: Boolean get() = has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)

    fun refresh(prefs: Prefs) {
        val fg = hasFineLocation
        val bg = fg && (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || has(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
        val loc = when {
            bg -> LocPerm.ALWAYS
            fg -> LocPerm.WHEN_IN_USE
            prefs.locationAsked -> LocPerm.DENIED
            else -> LocPerm.UNKNOWN
        }
        val notif = when {
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU -> NotifPerm.GRANTED
            has(Manifest.permission.POST_NOTIFICATIONS) -> NotifPerm.GRANTED
            prefs.notificationsAsked -> NotifPerm.DENIED
            else -> NotifPerm.UNKNOWN
        }
        _state.value = PermState(loc, notif)
    }

    companion object {
        val LOCATION = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    }
}

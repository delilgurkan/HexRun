package co.hexrun.wear.data

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import co.hexrun.wear.state.Haptic

/**
 * Bilek titreşimi. Olay titreşimleri (tık, halka, fetih) uygulama arka plandayken de çalmalı;
 * Android arka plan süreçlerinin dokunuş titreşimlerini yok sayar, bu yüzden bildirim kullanımıyla çalınır.
 */
class Haptics(context: Context) {
    private val vibrator: Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        }

    fun play(h: Haptic) {
        val v = vibrator ?: return
        if (!v.hasVibrator()) return
        val effect = VibrationEffect.createWaveform(h.pattern, -1)
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val usage = if (h.isEvent) VibrationAttributes.USAGE_NOTIFICATION else VibrationAttributes.USAGE_TOUCH
                v.vibrate(effect, VibrationAttributes.createForUsage(usage))
            } else {
                val attrs = AudioAttributes.Builder()
                    .setUsage(if (h.isEvent) AudioAttributes.USAGE_NOTIFICATION_EVENT else AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                @Suppress("DEPRECATION")
                v.vibrate(effect, attrs)
            }
        }
    }
}

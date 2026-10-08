package co.hexrun.app.run

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import co.hexrun.core.run.TickStrength

/** Koşu haptikleri (VibrationEffect). Titreşim yoksa sessizce hiçbir şey yapmaz. */
interface Haptics {
    fun tick(strength: TickStrength)
    /** Fetih kare 1: tek sert darbe. */
    fun closeImpact()
    /** Kare 2: her 10 petekte hafif tık. */
    fun cellTick()
    /** Rakip petek çatlarken çift tık. */
    fun crack()
    /** Kare 3: başarı. */
    fun success()
}

class AndroidHaptics(context: Context) : Haptics {
    private val vibrator: Vibrator? = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }.getOrNull()?.takeIf { it.hasVibrator() }

    private fun predefinedOr(id: Int, fallback: () -> VibrationEffect): VibrationEffect =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) VibrationEffect.createPredefined(id) else fallback()

    private fun play(e: VibrationEffect) {
        runCatching { vibrator?.vibrate(e) }
    }

    override fun tick(strength: TickStrength) = when (strength) {
        TickStrength.SINGLE -> play(predefinedOr(VibrationEffect.EFFECT_TICK) { VibrationEffect.createOneShot(18, 120) })
        TickStrength.DOUBLE -> play(VibrationEffect.createWaveform(longArrayOf(0, 18, 90, 18), intArrayOf(0, 160, 0, 160), -1))
    }

    override fun closeImpact() = play(predefinedOr(VibrationEffect.EFFECT_HEAVY_CLICK) { VibrationEffect.createOneShot(60, 255) })

    override fun cellTick() = play(predefinedOr(VibrationEffect.EFFECT_TICK) { VibrationEffect.createOneShot(10, 80) })

    override fun crack() = play(VibrationEffect.createWaveform(longArrayOf(0, 30, 70, 30), intArrayOf(0, 200, 0, 200), -1))

    override fun success() = play(VibrationEffect.createWaveform(longArrayOf(0, 40, 80, 80), intArrayOf(0, 180, 0, 255), -1))
}

object NoHaptics : Haptics {
    override fun tick(strength: TickStrength) = Unit
    override fun closeImpact() = Unit
    override fun cellTick() = Unit
    override fun crack() = Unit
    override fun success() = Unit
}

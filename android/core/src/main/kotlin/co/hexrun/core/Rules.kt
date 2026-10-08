package co.hexrun.core

/**
 * Kesinleşen kural setinin sabitleri (packages/core/src/constants.ts ile birebir).
 * Sunucu her zaman yetkilidir; istemci bu değerleri HUD ve önizleme için kullanır.
 */
object Rules {
    const val H3_RES = 12
    const val LOOP_CLOSE_M = 50.0
    const val LOOP_CLOSE_M_MASTER = 60.0
    const val LOOP_ARM_EXTRA_M = 50.0
    const val MIN_LOOP_LENGTH_M = 400.0
    const val MIN_LOOP_LENGTH_M_NEWBIE = 200.0
    const val CLOSING_MODE_M = 300.0
    const val NEW_CELL_POWER = 10
    const val OWNER_GAIN = 10
    const val PUSHBACK = 10
    const val ATTACK = 10
    const val DUEL_MIN_CELLS = 7
    const val DUEL_MAX_CELLS = 60
    const val MAX_ACTIVE_DUELS = 3
    const val ATTACK_DAILY_LIMIT = 2
    const val NEWBIE_ATTACK_LIMIT = 3
    const val NEWBIE_DAYS = 14
    const val DEFENSE_DAILY_LIMIT = 2
    const val CAPTURE_POWER = 50
    const val MAX_POWER = 100.0
    const val PRIVACY_RADIUS_MIN_M = 200
    const val PRIVACY_RADIUS_MAX_M = 800
    const val SIEGE_WARN = 0.7
    const val SIEGE_ALARM = 0.9
    const val PUSH_DAILY_CAP = 3
    const val INSIGNIA_SLOTS = 3
    const val TIMEZONE = "Europe/Istanbul"

    const val HOUR_MS = 3_600_000L
    const val DAY_MS = 24 * HOUR_MS

    /** Gizlilik yarıçapını 200–800 m aralığına sıkıştırır (core/privacy.ts `clampRadius`). */
    fun clampRadius(r: Double): Int {
        if (!r.isFinite()) return PRIVACY_RADIUS_MIN_M
        return jsRound(r).toInt().coerceIn(PRIVACY_RADIUS_MIN_M, PRIVACY_RADIUS_MAX_M)
    }
}

/** JavaScript `Math.round`: yarımlar +∞ yönüne yuvarlanır (−2,5 → −2). */
fun jsRound(x: Double): Double = if (x.isNaN() || x.isInfinite()) x else kotlin.math.floor(x + 0.5)

package co.hexrun.app.nav

import android.net.Uri
import co.hexrun.core.deeplink.DeepLink

/** Gezinti yolları (Navigation Compose, dizgi tabanlı). */
object Routes {
    const val ONBOARDING = "onboarding"
    const val PERMISSIONS = "permissions"
    const val AUTH = "auth"
    const val AUTH_EMAIL = "auth/email"
    const val AUTH_PROFILE = "auth/profile"
    const val MAIN = "main?tab={tab}"
    const val RUN = "run?defend={defend}&attack={attack}&firstLoop={firstLoop}"
    const val SUMMARY = "summary?clientRunId={clientRunId}&runId={runId}"
    const val DUEL = "duel/{id}"
    const val DUEL_SELECT = "duelSelect?cell={cell}&cells={cells}&defender={defender}&revenge={revenge}"
    const val PROFILE = "profile?tab={tab}&code={code}"
    const val BADGE = "badge/{id}"
    const val SETTINGS = "settings"
    const val PRIVACY = "privacy"
    const val INTEGRATIONS = "integrations?connected={connected}&error={error}"
    const val NOTIFICATIONS = "notifications"
    const val SHARE = "share/{runId}"

    private fun q(v: String?) = Uri.encode(v ?: "")

    fun main(tab: String = "map") = "main?tab=${q(tab)}"
    fun run(defend: String? = null, attack: String? = null, firstLoop: Boolean = false) =
        "run?defend=${q(defend)}&attack=${q(attack)}&firstLoop=$firstLoop"
    fun summary(clientRunId: String? = null, runId: String? = null) = "summary?clientRunId=${q(clientRunId)}&runId=${q(runId)}"
    fun duel(id: String) = "duel/${q(id)}"
    fun duelSelect(cell: String? = null, cells: List<String> = emptyList(), defender: String? = null, revenge: String? = null) =
        "duelSelect?cell=${q(cell)}&cells=${q(cells.joinToString(","))}&defender=${q(defender)}&revenge=${q(revenge)}"
    fun profile(tab: String? = null, code: String? = null) = "profile?tab=${q(tab)}&code=${q(code)}"
    fun badge(id: String) = "badge/${q(id)}"
    fun integrations(connected: String? = null, error: String? = null) = "integrations?connected=${q(connected)}&error=${q(error)}"
    fun share(runId: String) = "share/${q(runId)}"

    /** Derin bağlantı → yol. Bölge sayfası haritanın üstünde açılan sheet'tir (null + ayrı olay). */
    fun of(link: DeepLink): String? = when (link) {
        DeepLink.Map -> main("map")
        is DeepLink.Region -> main("map")
        is DeepLink.Run -> run(link.defendDuelId, link.attackDuelId)
        is DeepLink.Summary -> summary(link.clientRunId, link.runId)
        is DeepLink.Duel -> duel(link.id)
        is DeepLink.DuelRevenge -> duelSelect(revenge = link.duelId)
        is DeepLink.DuelSelect -> duelSelect(link.cell, link.cells, link.defender)
        DeepLink.Notifications -> NOTIFICATIONS
        is DeepLink.Profile -> profile(link.tab)
        is DeepLink.Badge -> badge(link.id)
        DeepLink.Settings -> SETTINGS
        DeepLink.Privacy -> PRIVACY
        is DeepLink.Integrations -> integrations(link.connected, link.error)
        is DeepLink.Share -> share(link.runId)
        is DeepLink.Friends -> profile("friends", link.code)
        DeepLink.League -> main("league")
        DeepLink.Team -> main("team")
        DeepLink.Events -> main("events")
        DeepLink.Auth -> null
    }
}

/** Boş dizgi → null (isteğe bağlı yol parametreleri). */
fun String?.orNullIfBlank(): String? = this?.takeIf { it.isNotBlank() }

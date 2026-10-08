package co.hexrun.core.deeplink

import java.net.URLDecoder

/** Uygulama içi hedefler (derin bağlantı, push `data.url`, bildirim eylemi). */
sealed interface DeepLink {
    data object Map : DeepLink
    data class Region(val cell: String) : DeepLink
    data class Run(val defendDuelId: String? = null, val attackDuelId: String? = null) : DeepLink
    data class Summary(val clientRunId: String? = null, val runId: String? = null) : DeepLink
    data class Duel(val id: String) : DeepLink
    /** "Geri al": kaybedilen düellonun alanıyla yeni düello seçimi. */
    data class DuelRevenge(val duelId: String) : DeepLink
    data class DuelSelect(val cell: String? = null, val cells: List<String> = emptyList(), val defender: String? = null) : DeepLink
    data object Notifications : DeepLink
    data class Profile(val tab: String? = null) : DeepLink
    data class Badge(val id: String) : DeepLink
    data object Settings : DeepLink
    data object Privacy : DeepLink
    data class Integrations(val connected: String? = null, val error: String? = null) : DeepLink
    data class Share(val runId: String) : DeepLink
    /** Arkadaş daveti (hexrun://friends?code=…, hexrun://invite/<kod>, https://hexrun.co/invite/<kod>). */
    data class Friends(val code: String? = null) : DeepLink
    data object League : DeepLink
    data object Team : DeepLink
    data object Events : DeepLink
    data object Auth : DeepLink
}

/**
 * `hexrun://…`, `https://hexrun.co/app/…`, uygulama bağlantıları `https://hexrun.co/invite/<kod>`
 * ve `https://hexrun.co/r/<yol>` (web yedek sayfası `hexrun://<yol>` kurar) çözümleyicisi.
 * Bilinmeyen bağlantı → null (uygulama yalnız açılır).
 */
object DeepLinks {
    private val SEG = Regex("^[A-Za-z0-9_.:-]{1,128}$")
    private val WEB = Regex("^https?://(www\\.)?hexrun\\.co(/.*)?$", RegexOption.IGNORE_CASE)

    fun parse(url: String?): DeepLink? {
        if (url.isNullOrBlank()) return null
        val u = url.trim()
        val rest: String = when {
            u.startsWith("hexrun://", ignoreCase = true) -> u.substring("hexrun://".length)
            u.startsWith("hexrun:", ignoreCase = true) -> u.substring("hexrun:".length)
            WEB.matches(u) -> {
                val path = u.replaceFirst(Regex("^https?://(www\\.)?hexrun\\.co", RegexOption.IGNORE_CASE), "")
                val p = path.removePrefix("/en/").let { if (it == path) path.removePrefix("/") else it }
                when {
                    p.startsWith("app/") -> p.removePrefix("app/")
                    p.startsWith("invite/") -> p // invite/<kod>
                    p.startsWith("r/") -> p.removePrefix("r/")
                    else -> return null
                }
            }
            u.startsWith("/") -> u.substring(1)
            else -> return null
        }.trimStart('/')
        val (pathPart, queryPart) = rest.split('?', limit = 2).let { it[0] to it.getOrNull(1) }
        val q = parseQuery(queryPart?.substringBefore('#'))
        val segs = pathPart.substringBefore('#').split('/').filter { it.isNotEmpty() }.map { decode(it) }
        if (segs.any { !SEG.matches(it) }) return null
        val head = segs.firstOrNull() ?: return DeepLink.Map
        val s1 = segs.getOrNull(1)
        val s2 = segs.getOrNull(2)
        return when (head) {
            "map" -> DeepLink.Map
            "region" -> (s1 ?: q["cell"])?.let { DeepLink.Region(it) }
            "run" -> when (s1) {
                null -> DeepLink.Run(q["defend"], q["attack"])
                "summary" -> DeepLink.Summary(q["clientRunId"], q["runId"] ?: s2)
                else -> DeepLink.Summary(runId = s1)
            }
            "duel" -> when (s1) {
                null -> null
                "select" -> DeepLink.DuelSelect(q["cell"], q["cells"]?.split(',')?.filter { it.isNotBlank() } ?: emptyList(), q["defender"])
                "revenge" -> s2?.let { DeepLink.DuelRevenge(it) }
                else -> DeepLink.Duel(s1)
            }
            "notifications" -> DeepLink.Notifications
            "profile" -> when (s1) {
                null -> DeepLink.Profile(q["tab"])
                "settings" -> DeepLink.Settings
                "privacy" -> DeepLink.Privacy
                "integrations" -> DeepLink.Integrations(q["connected"], q["error"])
                "badge" -> s2?.let { DeepLink.Badge(it) }
                "badges", "stats", "friends" -> DeepLink.Profile(s1)
                else -> DeepLink.Profile(null)
            }
            "settings" -> DeepLink.Settings
            "privacy" -> DeepLink.Privacy
            "integrations" -> DeepLink.Integrations(q["connected"], q["error"])
            "share" -> (s1 ?: q["runId"])?.let { DeepLink.Share(it) }
            "friends" -> DeepLink.Friends(q["code"] ?: s1)
            "invite" -> DeepLink.Friends(s1 ?: q["code"])
            "league" -> DeepLink.League
            "team" -> DeepLink.Team
            "events" -> DeepLink.Events
            "auth" -> DeepLink.Auth
            else -> null
        }
    }

    private fun decode(s: String): String = runCatching { URLDecoder.decode(s.replace("+", "%2B"), "UTF-8") }.getOrDefault(s)

    private fun parseQuery(q: String?): Map<String, String> {
        if (q.isNullOrEmpty()) return emptyMap()
        val out = LinkedHashMap<String, String>()
        for (pair in q.split('&')) {
            if (pair.isEmpty()) continue
            val k = pair.substringBefore('=')
            val v = if ('=' in pair) pair.substringAfter('=') else ""
            out[decode(k)] = runCatching { URLDecoder.decode(v, "UTF-8") }.getOrDefault(v)
        }
        return out
    }
}

package co.hexrun.core

import co.hexrun.core.deeplink.DeepLink
import co.hexrun.core.deeplink.DeepLinks
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DeepLinkTest {
    @Test
    fun parse() {
        assertEquals(DeepLink.Run(defendDuelId = "abc-1"), DeepLinks.parse("hexrun://run?defend=abc-1"))
        assertEquals(DeepLink.Run(), DeepLinks.parse("hexrun://run"))
        assertEquals(DeepLink.DuelRevenge("d9"), DeepLinks.parse("hexrun://duel/revenge/d9"))
        assertEquals(DeepLink.Duel("d9"), DeepLinks.parse("hexrun://duel/d9"))
        assertEquals(DeepLink.Notifications, DeepLinks.parse("hexrun://notifications"))
        assertEquals(DeepLink.Integrations(connected = "strava"), DeepLinks.parse("hexrun://integrations?connected=strava"))
        assertEquals(DeepLink.Integrations(error = "strava"), DeepLinks.parse("hexrun://profile/integrations?error=strava"))
        assertEquals(DeepLink.Friends("K7Q2"), DeepLinks.parse("hexrun://friends?code=K7Q2"))
        assertEquals(DeepLink.Friends("K7Q2"), DeepLinks.parse("hexrun://invite/K7Q2"))
        assertEquals(DeepLink.Friends("K7Q2"), DeepLinks.parse("https://hexrun.co/invite/K7Q2"))
        assertEquals(DeepLink.Friends("K7Q2"), DeepLinks.parse("https://www.hexrun.co/en/invite/K7Q2"))
        assertEquals(DeepLink.Share("r1"), DeepLinks.parse("https://hexrun.co/r/share/r1"))
        assertEquals(DeepLink.Region("8c1ec902e99c9ff"), DeepLinks.parse("https://hexrun.co/app/region/8c1ec902e99c9ff"))
        assertEquals(DeepLink.DuelSelect(cell = "c1", cells = listOf("c1", "c2"), defender = "p1"), DeepLinks.parse("hexrun://duel/select?cell=c1&cells=c1%2Cc2&defender=p1"))
        assertEquals(DeepLink.Badge("halka-ustasi"), DeepLinks.parse("hexrun://profile/badge/halka-ustasi"))
        assertEquals(DeepLink.Profile("badges"), DeepLinks.parse("hexrun://profile?tab=badges"))
        assertEquals(DeepLink.Map, DeepLinks.parse("hexrun://"))
        assertEquals(DeepLink.Events, DeepLinks.parse("hexrun://events"))
        assertEquals(DeepLink.Summary(runId = "r5"), DeepLinks.parse("hexrun://run/summary?runId=r5"))
        assertNull(DeepLinks.parse("https://example.com/invite/x"))
        assertNull(DeepLinks.parse("hexrun://bilinmeyen"))
        assertNull(DeepLinks.parse("https://hexrun.co/gizlilik/"))
        assertNull(DeepLinks.parse("hexrun://duel/<script>"))
        assertNull(DeepLinks.parse(null))
    }
}

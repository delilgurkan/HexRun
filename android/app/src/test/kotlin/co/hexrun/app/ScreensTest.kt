package co.hexrun.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import co.hexrun.app.data.LocPerm
import co.hexrun.app.data.NotifPerm
import co.hexrun.app.ui.Load
import co.hexrun.app.ui.screens.auth.ProfileSetupContent
import co.hexrun.app.ui.screens.auth.ProfileSetupUi
import co.hexrun.app.ui.screens.league.LeagueContent
import co.hexrun.app.ui.screens.league.LeagueUi
import co.hexrun.app.ui.screens.onboarding.OnboardingContent
import co.hexrun.app.ui.screens.onboarding.PermissionsContent
import co.hexrun.app.ui.screens.run.SummaryView
import co.hexrun.app.ui.theme.HexRunTheme
import co.hexrun.core.api.ApiError
import co.hexrun.core.api.DuelSuggestion
import co.hexrun.core.api.LeagueResponse
import co.hexrun.core.api.LeagueRow
import co.hexrun.core.api.LoopResult
import co.hexrun.core.api.RunReview
import co.hexrun.core.api.RunSummary
import co.hexrun.core.colors.Slot
import co.hexrun.core.i18n.S
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

/** Ana ekranların durumsuz içerikleri (Robolectric + Compose test kuralı; CI'da çalışır). */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], application = android.app.Application::class)
class ScreensTest {
    @get:Rule val rule = createComposeRule()

    private fun set(content: @androidx.compose.runtime.Composable () -> Unit) = rule.setContent { HexRunTheme(dark = true, systemFonts = true, content = content) }

    @Test
    fun onboardingPagesAndStart() {
        var done = 0
        set { OnboardingContent(onFinish = { done++ }) }
        rule.onNodeWithText(S.onboarding.pages[0].title).assertIsDisplayed()
        rule.onNodeWithText(S.common.continue_.uppercase(java.util.Locale.forLanguageTag("tr"))).performClick()
        rule.onNodeWithText(S.onboarding.pages[1].title).assertIsDisplayed()
        rule.onNodeWithText(S.common.continue_.uppercase(java.util.Locale.forLanguageTag("tr"))).performClick()
        rule.onNodeWithText(S.onboarding.start).performClick()
        assertEquals(1, done)
    }

    @Test
    fun permissionsRationaleBeforeSystemDialog() {
        var asked = 0
        var later = 0
        set {
            PermissionsContent(LocPerm.UNKNOWN, NotifPerm.UNKNOWN, onAskLocation = { asked++ }, onAskBackground = {}, onOpenSettings = {}, onAskNotifications = {}, onContinue = { later++ })
        }
        rule.onNodeWithText(S.permissions.locationWhy).assertIsDisplayed()
        rule.onNodeWithText(S.permissions.locationAsk).performClick()
        rule.onNodeWithText(S.permissions.later).performClick()
        assertEquals(1, asked)
        assertEquals(1, later)
    }

    @Test
    fun permissionsDeniedShowsSettings() {
        set { PermissionsContent(LocPerm.DENIED, NotifPerm.GRANTED, {}, {}, {}, {}, {}) }
        rule.onNodeWithText(S.permissions.locationDenied).assertIsDisplayed()
        rule.onNodeWithText(S.permissions.openSettings).assertIsDisplayed()
    }

    @Test
    fun profileSetupNeighborRuleAndSubmitEnabled() {
        set { ProfileSetupContent(ProfileSetupUi(username = "deniz", slot = Slot.LAC, mine = "deniz"), {}, {}, {}, {}) }
        rule.onNodeWithText(S.profileSetup.neighborRule("Lacivert")).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText(S.profileSetup.submit).assertIsEnabled()
    }

    @Test
    fun profileSetupInvalidDisablesSubmit() {
        set { ProfileSetupContent(ProfileSetupUi(username = "D!"), {}, {}, {}, {}) }
        rule.onNodeWithText(S.profileSetup.invalid).assertIsDisplayed()
        rule.onNodeWithText(S.profileSetup.submit).assertIsNotEnabled()
    }

    private val league = LeagueResponse(regionName = "Kadıköy", rows = listOf(LeagueRow(1, "p1", "Zeynep Kaya", "ZK", Slot.GOK, 19220.0, delta = 2)), updatedAt = "2026-10-05T08:00:00Z")

    @Test
    fun leagueStates() {
        var state = LeagueUi(data = Load(loading = true))
        val ui = androidx.compose.runtime.mutableStateOf(state)
        set { LeagueContent(ui.value, {}, {}, {}, {}) }
        rule.onNodeWithTag("league-loading").assertExists()
        ui.value = LeagueUi(data = Load(league))
        rule.onNodeWithTag("league-row-1").assertExists()
        ui.value = LeagueUi(data = Load(league, error = ApiError.network()))
        rule.onNodeWithTag("league-stale").assertExists()
        ui.value = LeagueUi(data = Load(league.copy(rows = emptyList())))
        rule.onNodeWithTag("league-empty").assertExists()
        ui.value = LeagueUi(data = Load(error = ApiError.network()))
        rule.onNodeWithTag("league-error").assertExists()
        state = ui.value
        assertTrue(state.data.failed)
    }

    private val base = RunSummary(id = "r1", startedAt = "2026-10-04T03:29:00Z", endedAt = "2026-10-04T04:14:00Z", distanceM = 6120.0, durationMs = 1_977_000, paceSecPerKm = 323.0, streakDays = 31)

    @Test
    fun summaryVariants() {
        val s = androidx.compose.runtime.mutableStateOf(base.copy(loops = listOf(LoopResult(newCells = 14, capturedCells = 48, status = "applied")), totalGainedAreaM2 = 19220.0))
        set { SummaryView(s.value, {}, {}, {}, { _, _ -> }) }
        rule.onNodeWithTag("summary-closed").assertExists()
        rule.onNodeWithText(S.summary.closedHead(62, 48)).assertIsDisplayed()
        s.value = base.copy(status = "open", openGapM = 430.0)
        rule.onNodeWithTag("summary-open").assertExists()
        rule.onNodeWithText(S.summary.openTag(430).uppercase(java.util.Locale.forLanguageTag("tr"))).assertExists()
        s.value = base.copy(loops = listOf(LoopResult(newCells = 2)), suggestions = listOf(DuelSuggestion(Fixtures.player(), List(21) { "c$it" }, 60.0, 1800.0)))
        rule.onNodeWithTag("suggestion-card").assertExists()
        s.value = base.copy(status = "review", review = RunReview(paceSecPerKm = 120.0, segmentM = 1200.0))
        rule.onNodeWithTag("summary-review").assertExists()
        rule.onNodeWithText(S.summary.reviewTitle).assertExists()
    }
}

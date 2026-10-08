package co.hexrun.app

import co.hexrun.app.data.AuthRepository
import co.hexrun.app.data.AuthStatus
import co.hexrun.app.data.MapCache
import co.hexrun.app.data.MemoryPrefsStore
import co.hexrun.app.data.MeRepository
import co.hexrun.app.ui.screens.auth.EmailUi
import co.hexrun.app.ui.screens.auth.EmailViewModel
import co.hexrun.app.ui.screens.auth.ProfileSetupViewModel
import co.hexrun.app.ui.screens.duel.DuelSelectViewModel
import co.hexrun.app.ui.screens.league.LeagueViewModel
import co.hexrun.app.ui.screens.map.MapUi
import co.hexrun.app.ui.screens.notifications.NotificationsViewModel
import co.hexrun.app.ui.screens.run.SummaryUi
import co.hexrun.app.ui.screens.run.SummaryViewModel
import co.hexrun.core.api.*
import co.hexrun.core.colors.Slot
import co.hexrun.core.i18n.S
import co.hexrun.core.run.RunQueue
import co.hexrun.core.store.MemoryKeyValueStore
import co.hexrun.core.ui.DuelSelection
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ViewModelsTest {
    @get:Rule val main = MainDispatcherRule()

    @Test
    fun profileSetupUsernameAvailabilityAndSubmit() = runTest(main.dispatcher) {
        var checked = 0
        var updated: UpdateMeRequest? = null
        val api = object : FakeApi() {
            override suspend fun me() = Fixtures.me()
            override suspend fun username(name: String): UsernameAvailability {
                checked++
                return UsernameAvailability(name, available = name != "alinmis")
            }
            override suspend fun updateMe(body: UpdateMeRequest): Me { updated = body; return Fixtures.me(username = body.username ?: "") }
        }
        val prefs = MemoryPrefsStore(co.hexrun.app.data.Prefs(loaded = true, needsProfile = true))
        val vm = ProfileSetupViewModel(api, prefs, MeRepository(api))
        advanceUntilIdle()
        vm.setUsername("AB")
        assertEquals(S.profileSetup.invalid, vm.ui.value.hint)
        vm.setUsername("alinmis")
        assertEquals(S.profileSetup.checking, vm.ui.value.hint)
        advanceTimeBy(200)
        vm.setUsername("deniz_k") // gecikme sıfırlanır: önceki kontrol iptal
        advanceUntilIdle()
        assertEquals(1, checked)
        assertTrue(vm.ui.value.ok)
        assertEquals(S.profileSetup.available, vm.ui.value.hint)
        vm.setUsername("alinmis")
        advanceUntilIdle()
        assertEquals(S.profileSetup.taken, vm.ui.value.hint)
        assertFalse(vm.ui.value.ok)
        vm.setUsername("deniz_k")
        advanceUntilIdle()
        vm.setSlot(Slot.ZUM)
        var done = false
        vm.submit { done = true }
        advanceUntilIdle()
        assertTrue(done)
        assertEquals(Slot.ZUM, updated?.slot)
        assertEquals("deniz_k", updated?.username)
        assertFalse(prefs.prefs.value.needsProfile)
    }

    @Test
    fun emailFlow() = runTest(main.dispatcher) {
        val api = object : FakeApi() {
            override suspend fun emailStart(email: String) = EmailStartResponse(true, devCode = "123456")
            override suspend fun emailVerify(email: String, code: String) =
                if (code == "123456") AuthResponse("a", "r".repeat(30), 900, Fixtures.me(), needsProfile = true)
                else throw ApiError(400, "invalid_code", "Kod hatalı.")
        }
        val client = ApiClient("http://localhost", MemoryTokenStore())
        val prefs = MemoryPrefsStore()
        val auth = AuthRepository(client, api, prefs)
        auth.init()
        val vm = EmailViewModel(api, auth, MeRepository(api))
        vm.setEmail("yanlış")
        vm.send()
        assertEquals(S.auth.invalidEmail, vm.ui.value.error)
        vm.setEmail("Deniz@Ornek.com ")
        vm.send()
        advanceUntilIdle()
        assertEquals(EmailUi.Step.CODE, vm.ui.value.step)
        assertEquals("123456", vm.ui.value.code)
        vm.setCode("12a34")
        assertEquals("1234", vm.ui.value.code)
        vm.verify { }
        advanceUntilIdle()
        assertEquals("Kod hatalı.", vm.ui.value.error)
        vm.setCode("123456")
        var needs: Boolean? = null
        vm.verify { needs = it }
        advanceUntilIdle()
        assertEquals(true, needs)
        assertEquals(AuthStatus.SIGNED_IN, auth.status.value)
        assertTrue(prefs.prefs.value.needsProfile)
    }

    @Test
    fun leagueKeepsStaleDataOnError() = runTest(main.dispatcher) {
        var fail = false
        val api = object : FakeApi() {
            override suspend fun league(scope: LeagueScope, period: LeaguePeriod): LeagueResponse {
                if (fail) throw ApiError.network()
                return LeagueResponse(regionName = "Kadıköy", rows = listOf(LeagueRow(1, "p1", "Zeynep", "ZK", Slot.GOK, 19220.0)), scope = scope.wire, period = period.wire)
            }
        }
        val me = MeRepository(api).also { it.set(Fixtures.me()) }
        val vm = LeagueViewModel(api, me)
        advanceUntilIdle()
        assertEquals(1, vm.ui.value.data.data?.rows?.size)
        assertEquals(0, vm.ui.value.meRow?.rank)
        fail = true
        vm.setPeriod(LeaguePeriod.MONTH)
        advanceUntilIdle()
        assertTrue(vm.ui.value.data.failed)
        assertEquals("Kadıköy", vm.ui.value.data.data?.regionName)
        assertEquals(LeaguePeriod.MONTH, vm.ui.value.period)
    }

    @Test
    fun duelSelectionPaintAndPreview() = runTest(main.dispatcher) {
        val cells = (1..10).map { "c$it" }
        var previews = 0
        val api = object : FakeApi() {
            override suspend fun region(cell: String) = RegionDetail(owner = Fixtures.player(), cells = cells, avgPower = 60.0, canStartDuel = true, duelSlotsLeft = 2)
            override suspend fun duelPreview(cells: List<String>): DuelPreview { previews++; return DuelPreview(ok = true, cells = cells.size, slotsLeft = 2) }
            override suspend fun createDuel(cells: List<String>) = DuelSummary("d1", attacker = Fixtures.player("me"), defender = Fixtures.player(), cells = cells)
        }
        val vm = DuelSelectViewModel(api, MapCache(MemoryKeyValueStore()), "c1", emptyList(), null, previewDelayMs = 400)
        advanceUntilIdle()
        assertEquals(DuelSelection.State.EMPTY, vm.ui.value.state)
        vm.strokeStart("c1")
        for (c in cells.drop(1).take(6)) vm.strokeMove(c)
        vm.strokeMove("baska") // izin verilmeyen petek boyanmaz
        vm.strokeEnd()
        assertEquals(7, vm.ui.value.selected.size)
        assertEquals(DuelSelection.State.OK, vm.ui.value.state)
        assertNull(vm.ui.value.currentPreview)
        advanceTimeBy(401)
        runCurrent()
        assertEquals(1, previews)
        assertTrue(vm.ui.value.currentPreview?.ok == true)
        vm.strokeStart("c1") // seçili petekten başlayan hareket siler
        vm.strokeEnd()
        assertEquals(6, vm.ui.value.selected.size)
        assertEquals(DuelSelection.State.SMALL, vm.ui.value.state)
        vm.strokeStart("c1"); vm.strokeEnd()
        advanceUntilIdle()
        vm.confirm()
        advanceUntilIdle()
        assertEquals("d1", vm.ui.value.created?.id)
    }

    @Test
    fun summaryFollowsQueue() = runTest(main.dispatcher) {
        var online = false
        val queue = RunQueue(MemoryKeyValueStore(), submit = { if (online) RunSummary(id = "srv-1", status = "applied") else throw ApiError.network() }, now = { 0L })
        val req = SubmitRunRequest("client-run-1", points = listOf(TrackPointDto(40.0, 29.0, 1), TrackPointDto(40.001, 29.0, 2)))
        queue.enqueue(req)
        queue.flush()
        val vm = SummaryViewModel(queue, FakeApi(), "client-run-1", null, sendingTimeoutMs = 8_000)
        runCurrent()
        assertEquals(SummaryUi.Kind.SENDING, vm.ui.value.kind)
        advanceTimeBy(8_001)
        runCurrent()
        assertEquals(SummaryUi.Kind.PENDING, vm.ui.value.kind)
        online = true
        vm.retry()
        advanceUntilIdle()
        assertEquals(SummaryUi.Kind.DONE, vm.ui.value.kind)
        assertEquals("srv-1", vm.ui.value.summary?.id)
    }

    @Test
    fun notificationsFilterAndMarkRead() = runTest(main.dispatcher) {
        val now = java.time.Instant.parse("2026-10-05T10:00:00Z").toEpochMilli()
        val read = ArrayList<List<String>?>()
        val api = object : FakeApi() {
            override suspend fun notifications(filter: NotificationFilter, cursor: String?) = Page(
                listOf(
                    NotificationDto("n1", "siege_warn", "siege", "Kuşatma", "…", "2026-10-05T08:00:00Z"),
                    NotificationDto("n2", "team", "team", "Takım", "…", "2026-10-04T08:00:00Z", read = true),
                ).filter { filter == NotificationFilter.ALL || it.category == filter.wire },
                null,
            )
            override suspend fun readNotifications(ids: List<String>?) { read += ids }
        }
        val vm = NotificationsViewModel(api, now = { now })
        advanceUntilIdle()
        assertEquals(2, vm.ui.value.items.size)
        assertEquals(listOf(co.hexrun.core.ui.Dates.DayGroup.TODAY, co.hexrun.core.ui.Dates.DayGroup.YESTERDAY), vm.groups().map { it.first })
        vm.markRead(listOf("n1"))
        assertTrue(vm.ui.value.items.first { it.id == "n1" }.read)
        advanceUntilIdle()
        assertEquals(listOf<List<String>?>(listOf("n1")), read)
        vm.setFilter(NotificationFilter.TEAM)
        advanceUntilIdle()
        assertEquals(listOf("n2"), vm.ui.value.items.map { it.id })
    }

    @Test
    fun mapUiSiegeAndEmpty() {
        val d = { id: String, power: Double, progress: Double -> DuelSummary(id, attacker = Fixtures.player("a"), defender = Fixtures.player("me"), power = power, progress = progress) }
        val ui = MapUi(
            me = Fixtures.me(),
            map = MapResponse(cells = listOf(MapCell("c1")), players = emptyList()),
            duels = DuelsResponse(defending = listOf(d("low", 100.0, 50.0), d("warn", 100.0, 72.0), d("alarm", 80.0, 75.0))),
        )
        assertEquals("alarm", ui.siege?.id)
        assertTrue(ui.isEmpty)
        assertFalse(ui.copy(firstLoopDismissed = true).isEmpty)
        assertFalse(ui.copy(offline = true).isEmpty)
    }
}

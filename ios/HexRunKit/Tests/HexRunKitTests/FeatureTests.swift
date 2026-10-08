import Foundation
import XCTest
@testable import HexRunKit

@MainActor
func makeApp(signedIn: Bool = true) async -> AppModel {
    MockBackend.state.reset()
    let tokens = MemoryTokenStore(signedIn ? Tokens(accessToken: "mock-access", refreshToken: "mock-refresh", expiresAt: Date().epochMs + 3_600_000) : nil)
    let api = HexRunAPI(client: MockBackend.makeClient(tokens: tokens))
    let kv = MemoryKeyValueStore()
    let app = AppModel(api: api, kv: kv, queue: RunQueue(kv: kv, submit: { try await api.submitRun($0) }))
    await app.boot()
    return app
}

final class FeatureTests: XCTestCase {
    @MainActor func testBootAndSignOut() async {
        let app = await makeApp()
        XCTAssertEqual(app.auth, .signedIn)
        XCTAssertEqual(app.me?.username, "denizkosar")
        await app.signOut()
        XCTAssertEqual(app.auth, .signedOut)
        XCTAssertNil(app.me)
        XCTAssertTrue(MockBackend.state.requests.contains("POST /v1/auth/logout"))
        let signedOut = await makeApp(signedIn: false)
        XCTAssertEqual(signedOut.auth, .signedOut)
    }

    @MainActor func testPrefsPersist() async {
        let app = await makeApp()
        app.prefs.onboardingDone = true
        app.prefs.remind = [.blitz]
        let again = AppModel(api: app.api, kv: app.kv, queue: app.queue)
        XCTAssertTrue(again.prefs.onboardingDone)
        XCTAssertEqual(again.prefs.remind, [.blitz])
    }

    @MainActor func testEmailLogin() async {
        let app = await makeApp(signedIn: false)
        MockBackend.state.needsProfile = true
        let m = EmailAuthModel(app: app)
        m.email = "kotu-adres"
        await m.send()
        XCTAssertEqual(m.error, S.auth.invalidEmail)
        m.email = "  Deniz@Example.com "
        await m.send()
        XCTAssertNil(m.error)
        XCTAssertEqual(m.step, .code)
        XCTAssertEqual(m.code, "123456", "geliştirme kodu doldurulur")
        m.code = "12ab34"
        XCTAssertEqual(m.code, "1234")
        let bad = await m.verify()
        XCTAssertFalse(bad)
        XCTAssertEqual(m.error, "Kod hatalı ya da süresi dolmuş.")
        m.code = "123456"
        let ok = await m.verify()
        XCTAssertTrue(ok)
        XCTAssertEqual(app.auth, .signedIn)
        XCTAssertTrue(app.prefs.needsProfile)
    }

    @MainActor func testProfileSetupAvailability() async throws {
        let app = await makeApp()
        app.me = nil
        let m = ProfileSetupModel(app: app, debounceMs: 1)
        m.username = "Ab"
        XCTAssertEqual(m.username, "ab")
        XCTAssertEqual(m.hint, S.profileSetup.invalid)
        m.username = "alinmis"
        XCTAssertEqual(m.hint, S.profileSetup.checking)
        try await Task.sleep(nanoseconds: 80_000_000)
        XCTAssertEqual(m.hint, S.profileSetup.taken)
        XCTAssertFalse(m.ok)
        m.username = "kosucu_42"
        try await Task.sleep(nanoseconds: 80_000_000)
        XCTAssertTrue(m.ok)
        XCTAssertEqual(m.hint, S.profileSetup.available)
        m.slot = .gok
        XCTAssertEqual(m.neighborRule, S.profileSetup.neighborRule("Gök"))
        app.prefs.needsProfile = true
        let done = await m.submit()
        XCTAssertTrue(done)
        XCTAssertFalse(app.prefs.needsProfile)
        XCTAssertEqual(app.me?.username, "kosucu_42")
        XCTAssertEqual(app.me?.slot, .gok)
    }

    @MainActor func testMapModelStatesAndSiege() async {
        let app = await makeApp()
        let m = MapModel(app: app)
        XCTAssertTrue(m.loading)
        await m.loadAll()
        XCTAssertNotNil(m.data)
        XCTAssertFalse(m.isEmpty)
        XCTAssertEqual(m.siege?.id, "d9", "%70 üstü kuşatma")
        XCTAssertEqual(m.unread, 2)
        XCTAssertFalse(app.mapCache.cells.isEmpty)
        XCTAssertNotNil(app.lastMap())
        app.location = .denied
        XCTAssertEqual(m.ctaLabel, S.map.runLocked)
        app.location = .whenInUse
        XCTAssertEqual(m.ctaLabel, S.map.locating)
        m.setPosition(Fixtures.moda, fix: true)
        XCTAssertEqual(m.ctaLabel, S.map.start)
        // Çevrimdışı: son bilinen harita soluk gösterilir.
        app.isOnline = false
        XCTAssertTrue(m.offline)
        XCTAssertNotNil(m.data)
    }

    @MainActor func testRegionCTA() async {
        let app = await makeApp()
        let rival = Fixtures.region(cell: Fixtures.mapCells.first { $0.ownerId == "emre" }!.id)
        if case .loop = RegionPresenter.cta(rival, me: app.me) {} else { XCTFail("aktif düelloda halka kapat") }
        var r = rival
        r.myDuel = nil
        r.canStartDuel = true
        XCTAssertEqual(RegionPresenter.cta(r, me: app.me), .duel)
        XCTAssertEqual(RegionPresenter.title(r, me: app.me), "Emre'in alanı")
        r.canStartDuel = false
        r.duelSlotsLeft = 0
        XCTAssertTrue(RegionPresenter.slotsFull(r, me: app.me))
        let mine = Fixtures.region(cell: H3.cellOf(Fixtures.moda))
        XCTAssertEqual(RegionPresenter.title(mine, me: app.me), S.region.myTitle)
        let empty = Fixtures.region(cell: H3.cellOf(lat: 41.2, lng: 29.1))
        XCTAssertEqual(RegionPresenter.title(empty, me: app.me), S.region.emptyTitle)
        XCTAssertEqual(RegionPresenter.cta(empty, me: app.me), .run)
    }

    @MainActor func testDuelSelectPaintEraseAndCreate() async throws {
        let app = await makeApp()
        let emreCells = Fixtures.mapCells.filter { $0.ownerId == "emre" }.map(\.id)
        let m = DuelSelectModel(app: app, request: DuelSelectRequest(cell: emreCells[0]), debounceMs: 1)
        await m.load()
        XCTAssertEqual(m.state, .empty)
        XCTAssertEqual(m.texts.kicker, S.duelSelect.kickerEmpty)
        m.beginStroke(at: emreCells[0])
        for c in emreCells.dropFirst() { m.continueStroke(at: c) }
        m.continueStroke(at: H3.cellOf(Fixtures.moda)) // başkasının peteği boyanmaz
        m.endStroke()
        XCTAssertEqual(m.selected.count, emreCells.count)
        XCTAssertEqual(m.state, emreCells.count >= 7 ? .ok : .small)
        // Tekrar kaydırınca silinir.
        m.beginStroke(at: emreCells[0])
        m.endStroke()
        XCTAssertEqual(m.selected.count, emreCells.count - 1)
        XCTAssertEqual(DuelSelection.state(count: 3, preview: nil), .small)
        XCTAssertEqual(DuelSelection.state(count: 61, preview: nil), .big)
        m.beginStroke(at: emreCells[0])
        m.endStroke()
        await m.refreshPreviewNow()
        XCTAssertTrue(m.canConfirm)
        await m.confirm()
        XCTAssertEqual(m.created?.id, "d-new")
        XCTAssertEqual(m.slotsUsed, 2)
        await m.edit()
        XCTAssertNil(m.created)
        XCTAssertEqual(m.selected.count, emreCells.count)
    }

    @MainActor func testSiegeNumbers() {
        var d = Fixtures.duelDefending
        d.power = 85
        d.progress = 60
        d.defensesToday = 1
        let morning = ISODate.parse("2026-10-05T04:00:00Z")! // Pazartesi 07:00 İstanbul → Sabah Avantajı
        let n = SiegeNumbers(duel: d, now: morning)
        XCTAssertEqual(n.hp, 25)
        XCTAssertEqual(n.powerAfter, 100)
        XCTAssertEqual(n.progressAfter, 50)
        XCTAssertEqual(n.hpAfter, 50)
        XCTAssertEqual(n.defensesLeft, 1)
        XCTAssertTrue(n.explain(d).contains("(Sabah Avantajı 2x)"))
    }

    @MainActor func testSummaryFromQueue() async throws {
        let app = await makeApp()
        let req = SubmitRunRequest(clientRunId: "q1", source: .phone, points: [])
        MockBackend.state.fail("/v1/runs", status: 503)
        await app.queue.enqueue(req)
        await app.queue.flush()
        let m = SummaryModel(app: app, request: .queued(clientRunId: "q1"), sendingGraceMs: 10)
        await m.start()
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(m.phase, .pending)
        MockBackend.state.reset()
        await m.retry()
        XCTAssertEqual(m.summary?.id, "run-1")
        XCTAssertEqual(SummaryPresenter.variant(m.summary!), .closed)
        XCTAssertEqual(SummaryPresenter.totalCells(m.summary!), 62)
        await m.sendNote("tünel")
        XCTAssertTrue(m.noteSent)
        await m.stop()
    }

    func testSummaryVariants() {
        XCTAssertEqual(SummaryPresenter.variant(Fixtures.summaryClosed), .closed)
        XCTAssertEqual(SummaryPresenter.variant(Fixtures.summaryOpen), .open)
        XCTAssertEqual(SummaryPresenter.variant(Fixtures.summarySuggestion), .suggestion)
        XCTAssertEqual(SummaryPresenter.variant(Fixtures.summaryReview), .review)
        XCTAssertEqual(S.summary.closedHead(62, 48), "62 petek senin, 48'i düelloyla")
        XCTAssertEqual(S.conquest.headline(14, 14, 0), "14 petek senin: 14'ü boştu.")
        XCTAssertEqual(S.conquest.headline(3, 1, 2), "3 petek senin: 1'i boştu, 2 tanesi güçlendi.")
    }

    @MainActor func testLeagueKeepsStaleRowsOnError() async {
        let app = await makeApp()
        let m = LeagueModel(app: app)
        XCTAssertTrue(m.loading)
        await m.load()
        XCTAssertEqual(m.league.value?.rows.count, 8)
        XCTAssertEqual(m.meRow?.id, "me")
        XCTAssertNotNil(m.endsIn())
        MockBackend.state.fail("/v1/league", status: 500)
        await m.select(period: .month)
        XCTAssertTrue(m.failed)
        XCTAssertNotNil(m.league.value, "son bilinen tablo korunur")
        XCTAssertNotNil(m.staleLabel())
        await m.select(period: .all)
        XCTAssertNil(m.endsIn())
        XCTAssertEqual(LeagueModel.deltaLabel(3), "▲ 3")
        XCTAssertEqual(LeagueModel.deltaLabel(-2), "▼ 2")
    }

    @MainActor func testNotificationsSectionsAndAction() async {
        let app = await makeApp()
        let m = NotificationsModel(app: app)
        await m.load()
        let sections = m.sections()
        XCTAssertEqual(sections.map(\.group), [.today, .yesterday, .week])
        let first = m.items.value!.first { $0.id == "n1" }!
        let link = await m.open(first)
        XCTAssertEqual(link, .run(defend: "d9", attack: nil))
        XCTAssertEqual(m.items.value?.first { $0.id == "n1" }?.read, true)
        await m.select(.siege)
        XCTAssertEqual(m.items.value?.map(\.id), ["n1"])
    }

    @MainActor func testFriendsClapIsOptimistic() async {
        let app = await makeApp()
        let m = FriendsModel(app: app)
        await m.load()
        XCTAssertEqual(m.friends.value?.friends.count, 2)
        await m.clap("f1")
        XCTAssertEqual(m.feed.value?.first?.claps, 5)
        XCTAssertEqual(m.feed.value?.first?.clappedByMe, true)
        MockBackend.state.fail("/v1/feed/f1", status: 500)
        m.feed.value?[0].clappedByMe = false
        m.feed.value?[0].claps = 1
        await m.clap("f1")
        XCTAssertEqual(m.feed.value?.first?.claps, 1, "hatada geri alınır")
    }

    @MainActor final class FakeReminders: ReminderScheduler {
        var scheduled: [String: Int] = [:]
        func schedule(id: String, title: String, body: String, afterSeconds: Int, deeplink: String) async { scheduled[id] = afterSeconds }
        func cancel(id: String) async { scheduled[id] = nil }
    }

    @MainActor func testEventsRemind() async {
        let app = await makeApp()
        let m = EventsModel(app: app)
        let rem = FakeReminders()
        m.reminders = rem
        m.tick(ISODate.parse("2026-10-05T02:59:00Z")!)
        XCTAssertNil(m.hero)
        let morning = m.events.first { $0.id == .morning }!
        XCTAssertEqual(morning.startsInMin, 1)
        await m.toggleRemind(morning)
        XCTAssertTrue(m.isReminded(.morning))
        XCTAssertEqual(rem.scheduled["event-morning"], 60)
        await m.toggleRemind(morning)
        XCTAssertFalse(m.isReminded(.morning))
        XCTAssertNil(rem.scheduled["event-morning"])
        m.tick(ISODate.parse("2026-10-10T04:00:00Z")!)
        XCTAssertEqual(m.hero?.id, .morning)
        XCTAssertEqual(m.others.count, 2)
        XCTAssertEqual(S.events.startsIn(30, 5), "1 g 6 sa sonra")
    }

    @MainActor func testBadgesInsigniaPlan() async {
        let app = await makeApp()
        let m = BadgesModel(app: app)
        await m.load()
        let data = m.badges.value!
        XCTAssertTrue(m.showIntro)
        let plan = InsigniaPlan(data: data, badgeId: "halka-ustasi", chosen: nil, running: false)
        XCTAssertEqual(plan.target, 1)
        XCTAssertNil(plan.equippedAt)
        XCTAssertEqual(plan.equipSlots(data.slots), ["oncu", "halka-ustasi", nil])
        let replace = InsigniaPlan(data: data, badgeId: "halka-ustasi", chosen: 0, running: false)
        XCTAssertEqual(replace.targetBadge?.id, "oncu")
        XCTAssertTrue(InsigniaPlan(data: data, badgeId: "oncu", chosen: nil, running: true).locked)
        let ok = await m.setSlots(plan.equipSlots(data.slots))
        XCTAssertTrue(ok)
        XCTAssertEqual(app.me?.canChangeInsignia, false)
        XCTAssertEqual(m.lastKnown, BadgesModel.Known(earned: 2, total: 40))
    }

    @MainActor func testPrivacyAndSettings() async {
        let app = await makeApp()
        let p = PrivacyModel(app: app)
        p.radius = 950
        await p.save(on: true)
        XCTAssertEqual(p.message, S.privacy.needLocation)
        p.currentLocation = { Fixtures.moda }
        await p.save(on: true)
        XCTAssertEqual(p.message, S.privacy.homeSet)
        XCTAssertEqual(app.me?.privacy.radiusM, 800, "800 m tavanı")
        let s = SettingsModel(app: app)
        let url = await s.export()
        XCTAssertNotNil(url)
        if let url { XCTAssertTrue(FileManager.default.fileExists(atPath: url.path)); try? FileManager.default.removeItem(at: url) }
        let deleted = await s.deleteAccount()
        XCTAssertTrue(deleted)
        XCTAssertEqual(app.auth, .signedOut)
    }

    @MainActor func testTeamAndIntegrations() async {
        let app = await makeApp()
        let t = TeamModel(app: app)
        await t.load()
        XCTAssertTrue(t.hasTeam)
        await t.leave()
        XCTAssertTrue(t.noTeam)
        let i = IntegrationsModel(app: app)
        await i.load()
        XCTAssertEqual(i.subtitle(.apple_watch), S.integrations.appInstalled)
        XCTAssertTrue(i.subtitle(.garmin).hasPrefix("Forerunner 265 · son eşitleme"))
        XCTAssertEqual(i.subtitle(.coros), S.integrations.autoImport)
        await i.set(.strava, exportEnabled: false)
        XCTAssertEqual(i.dto(.strava)?.exportEnabled, false)
    }

    @MainActor func testRevengeOpensDuelSelect() async {
        let app = await makeApp()
        let r = Router()
        r.handle(.duelRevenge("d1"))
        await r.resolveRevenge(api: app.api)
        guard case let .duelSelect(req) = r.cover else { return XCTFail("seçim açılmalı") }
        XCTAssertFalse(req.preselected.isEmpty)
    }

    func testFormattingHelpers() {
        XCTAssertEqual(Fmt.multiplier(1.5), "1,5x")
        XCTAssertEqual(Fmt.multiplier(2), "2x")
        XCTAssertEqual(Fmt.distanceLabel(1234), "1,2 km")
        XCTAssertEqual(Fmt.distanceLabel(436), "440 m")
        XCTAssertEqual(TRDate.runRange(ISODate.parse("2026-10-04T03:29:00Z")!, ISODate.parse("2026-10-04T04:14:00Z")!), "4 Ekim Pazar · 06:29–07:14")
        XCTAssertEqual(TRDate.shareDate(ISODate.parse("2026-10-04T03:29:00Z")!), "4 EKİM 2026")
        let now = ISODate.parse("2026-10-08T09:00:00Z")!
        XCTAssertEqual(TRDate.relative(ISODate.parse("2026-10-07T18:30:00Z")!, now: now), "Dün 21:30")
        XCTAssertEqual(TRDate.relative(ISODate.parse("2026-09-11T10:00:00Z")!, now: now), "11 Eyl")
        XCTAssertEqual(EventsPresenter.shortLabel(EventsPresenter.resolve(nil, now: ISODate.parse("2026-10-10T04:00:00Z")!).filter(\.active)), "güç 2x · saldırı 2x")
        XCTAssertEqual(Conquest.fillSchedule(3), [0, 14, 28])
        XCTAssertEqual(Conquest.fillSchedule(300).last, 1495)
        let proj = Silhouette.project([H3.boundary(H3.cellOf(Fixtures.moda))], width: 100, height: 80)
        XCTAssertEqual(proj.first?.count, 6)
        XCTAssertTrue(proj[0].allSatisfy { $0.x >= 0 && $0.x <= 100 && $0.y >= 0 && $0.y <= 80 })
    }
}

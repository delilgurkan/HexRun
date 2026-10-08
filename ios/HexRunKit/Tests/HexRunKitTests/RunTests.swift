import Foundation
import XCTest
@testable import HexRunKit

final class Clock: @unchecked Sendable {
    private let lock = NSLock()
    private var t: Int64
    init(_ t: Int64) { self.t = t }
    var now: Int64 { lock.lock(); defer { lock.unlock() }; return t }
    func advance(_ ms: Int64) { lock.lock(); t += ms; lock.unlock() }
}

final class RunSessionTests: XCTestCase {
    let t0 = ISODate.parse("2026-10-05T04:00:00Z")!.epochMs
    var circle: [TrackPoint] { Geo.circleTrack(center: Fixtures.moda, radiusM: 200, n: 180, t0: t0, speedMps: 3.2) }

    func testTransitions() throws {
        let clock = Clock(t0)
        let store = MemoryRunStore()
        let s = RunSession.create(store: store, clientRunId: "c1", now: { clock.now })
        XCTAssertEqual(s.status, .idle)
        XCTAssertEqual(s.addPoints(circle).count, 0, "başlamadan nokta alınmaz")
        try s.start()
        XCTAssertThrowsError(try s.start())
        XCTAssertEqual(s.status, .running)
        clock.advance(10_000)
        s.pause()
        XCTAssertEqual(s.status, .paused)
        clock.advance(60_000)
        XCTAssertEqual(s.snapshot().elapsedMs, 10_000)
        s.resume()
        clock.advance(5_000)
        XCTAssertEqual(s.snapshot().elapsedMs, 15_000)
        let req = try s.finish()
        XCTAssertEqual(req.clientRunId, "c1")
        XCTAssertEqual(s.status, .finished)
        XCTAssertNil(store.load(), "bitince yarım koşu kaydı silinir")
        XCTAssertThrowsError(try s.finish())
    }

    func testLoopClosedEventAndClosingMode() throws {
        let s = RunSession.create(store: MemoryRunStore(), now: { 0 })
        try s.start()
        var events: [RunSessionEvent] = []
        for p in circle { events += s.addPoints([p]) }
        let loops = events.compactMap { if case let .loopClosed(l) = $0 { return l } else { return nil } }
        XCTAssertEqual(loops.count, 1)
        XCTAssertEqual(loops.first?.index, 1)
        XCTAssertTrue(events.contains(.closingEnter))
        XCTAssertTrue(events.contains { if case .tick = $0 { return true } else { return false } })
        XCTAssertEqual(s.snapshot().tracker.loops.count, detectLoops(circle).count)
    }

    func testRecoveryReplaysLogIntoTracker() throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("hexrun-test-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let pts = circle
        do {
            let s = RunSession.create(store: FileRunStore(directory: dir), clientRunId: "crash", options: LoopOptions(closeRadiusM: 60), now: { 0 })
            try s.start()
            s.addPoints(Array(pts[0..<60]))
            s.pause()
            s.resume()
            s.addPoints(Array(pts[60..<120]))
            // Çökme: yarım yazılmış son satır.
            let h = try FileHandle(forWritingTo: dir.appendingPathComponent("log.jsonl"))
            _ = try h.seekToEnd()
            try h.write(contentsOf: Data(#"{"k":"p","p":{"lat":4"#.utf8))
            try h.close()
        }
        let restored = try XCTUnwrap(RunSession.restore(store: FileRunStore(directory: dir), now: { 0 }))
        XCTAssertEqual(restored.id, "crash")
        XCTAssertEqual(restored.status, .running)
        XCTAssertEqual(restored.points.count, 120)
        XCTAssertEqual(restored.snapshot().closeRadiusM, 60)
        // Aynı noktalar duraklat/devam ile canlı izleyiciye verilince aynı durum.
        let tr = LoopTracker(LoopOptions(closeRadiusM: 60))
        pts[0..<60].forEach { tr.push($0) }
        tr.pause(); tr.resume()
        pts[60..<120].forEach { tr.push($0) }
        XCTAssertEqual(restored.snapshot().tracker, tr.state())
        restored.addPoints(Array(pts[120...]))
        XCTAssertEqual(restored.snapshot().tracker.loops.count, 1)
    }

    func testRejectedPointsAreNotLogged() throws {
        let store = MemoryRunStore()
        let s = RunSession.create(store: store, now: { 0 })
        try s.start()
        s.addPoints([TrackPoint(lat: 40.98, lng: 29.02, t: 1000, acc: 5), TrackPoint(lat: 40.98, lng: 29.02, t: 2000, acc: 120)])
        s.addPoints([TrackPoint(lat: 40.98, lng: 29.02, t: 500, acc: 5), TrackPoint(lat: 41.5, lng: 29.02, t: 3000, acc: 5)])
        XCTAssertEqual(store.log.count, 1, "kötü doğruluk, geriye giden zaman ve sıçrama atılır")
    }

    func testClosingTicks() {
        XCTAssertEqual(closingTicks(prev: 100, next: 95), [])
        XCTAssertEqual(closingTicks(prev: 101, next: 99), [.single])
        XCTAssertEqual(closingTicks(prev: 72, next: 64), [.double, .double])
        XCTAssertEqual(closingTicks(prev: 300, next: 100).count, 3)
        XCTAssertEqual(closingTicks(prev: 90, next: 95), [])
        XCTAssertEqual(closingRemainingM(83), 85)
        XCTAssertEqual(gpsQuality(8), .strong)
        XCTAssertEqual(gpsQuality(35), .weak)
        XCTAssertEqual(gpsQuality(80), .searching)
    }
}

final class RunQueueTests: XCTestCase {
    func req(_ id: String) -> SubmitRunRequest { SubmitRunRequest(clientRunId: id, source: .phone, points: []) }

    final class Calls: @unchecked Sendable {
        private let lock = NSLock()
        private var ids: [String] = []
        var outcomes: [ApiError?] = []
        func next(_ id: String) -> ApiError? { lock.lock(); defer { lock.unlock() }; ids.append(id); return outcomes.isEmpty ? nil : outcomes.removeFirst() }
        var all: [String] { lock.lock(); defer { lock.unlock() }; return ids }
    }

    func makeQueue(_ kv: KeyValueStore, _ calls: Calls, clock: Clock) -> RunQueue {
        RunQueue(kv: kv, submit: { r in
            if let e = calls.next(r.clientRunId) { throw e }
            var s = Fixtures.summaryClosed
            s.id = "srv-" + r.clientRunId
            return s
        }, now: { clock.now }, baseDelayMs: 1_000, maxDelayMs: 60_000, random: { 0.5 })
    }

    func testIdempotentEnqueueAndSuccess() async {
        let calls = Calls()
        let q = makeQueue(MemoryKeyValueStore(), calls, clock: Clock(0))
        await q.enqueue(req("a"))
        await q.enqueue(req("a"))
        let pending = await q.pending()
        XCTAssertEqual(pending.count, 1)
        await q.flush()
        let st = await q.status("a")
        XCTAssertEqual(st, .done)
        let res = await q.result("a")
        XCTAssertEqual(res?.id, "srv-a")
        await q.enqueue(req("a"))
        await q.flush()
        XCTAssertEqual(calls.all, ["a"], "sonucu olan koşu tekrar gönderilmez")
    }

    func testBackoffWithJitter() {
        let q = makeQueue(MemoryKeyValueStore(), Calls(), clock: Clock(0))
        XCTAssertEqual(q.backoff(1, random: 0.5), 1_000)
        XCTAssertEqual(q.backoff(2, random: 0.5), 2_000)
        XCTAssertEqual(q.backoff(4, random: 0.5), 8_000)
        XCTAssertEqual(q.backoff(1, random: 0), 800)
        XCTAssertEqual(q.backoff(1, random: 1), 1_200)
        XCTAssertEqual(q.backoff(30, random: 0.5), 60_000, "tavan")
    }

    func testRetryableErrorBacksOffThenSucceeds() async {
        let calls = Calls()
        calls.outcomes = [ApiError.network, ApiError(status: 503, code: "x", message: "x")]
        let clock = Clock(10_000)
        let q = makeQueue(MemoryKeyValueStore(), calls, clock: clock)
        await q.enqueue(req("r"))
        await q.flush()
        var item = await q.pending().first
        XCTAssertEqual(item?.attempts, 1)
        XCTAssertEqual(item?.nextAttemptAt, 11_000)
        await q.flush()
        XCTAssertEqual(calls.all.count, 1, "vakti gelmeden denenmez")
        clock.advance(1_000)
        await q.flush()
        item = await q.pending().first
        XCTAssertEqual(item?.attempts, 2)
        XCTAssertEqual(item?.nextAttemptAt, 13_000)
        await q.flush(force: true)
        let st = await q.status("r")
        XCTAssertEqual(st, .done)
        XCTAssertEqual(calls.all, ["r", "r", "r"])
    }

    func testPermanent4xxDropsJob() async {
        let calls = Calls()
        calls.outcomes = [ApiError(status: 422, code: "validation", message: "Koşu çok kısa.")]
        let q = makeQueue(MemoryKeyValueStore(), calls, clock: Clock(0))
        await q.enqueue(req("bad"))
        await q.flush()
        let pending = await q.pending()
        XCTAssertTrue(pending.isEmpty)
        let st = await q.status("bad")
        XCTAssertEqual(st, .failed("Koşu çok kısa."))
        await q.flush(force: true)
        XCTAssertEqual(calls.all.count, 1)
    }

    func test401IsRetriedNotDropped() async {
        let calls = Calls()
        calls.outcomes = [ApiError(status: 401, code: "unauthorized", message: "x")]
        let q = makeQueue(MemoryKeyValueStore(), calls, clock: Clock(0))
        await q.enqueue(req("u"))
        await q.flush()
        let st = await q.status("u")
        XCTAssertEqual(st, .pending)
    }

    func testNetworkErrorStopsBatch() async {
        let calls = Calls()
        calls.outcomes = [ApiError.network]
        let q = makeQueue(MemoryKeyValueStore(), calls, clock: Clock(0))
        await q.enqueue(req("1"))
        await q.enqueue(req("2"))
        await q.flush()
        XCTAssertEqual(calls.all, ["1"])
    }

    func testReloadFromStorage() async {
        let kv = MemoryKeyValueStore()
        let calls = Calls()
        calls.outcomes = [ApiError.network]
        let q1 = makeQueue(kv, calls, clock: Clock(0))
        await q1.enqueue(req("persist"))
        await q1.flush()
        let q2 = makeQueue(kv, calls, clock: Clock(100_000))
        let pending = await q2.pending()
        XCTAssertEqual(pending.map(\.req.clientRunId), ["persist"])
        XCTAssertEqual(pending.first?.attempts, 1)
        await q2.flush()
        let st = await q2.status("persist")
        XCTAssertEqual(st, .done)
    }

    func testFileStorePersists() async {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("hexrun-kv-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let calls = Calls()
        calls.outcomes = [ApiError.timeout]
        await makeQueue(FileKeyValueStore(directory: dir), calls, clock: Clock(0)).enqueue(req("f"))
        let p = await makeQueue(FileKeyValueStore(directory: dir), calls, clock: Clock(0)).pending()
        XCTAssertEqual(p.count, 1)
    }
}

final class RunControllerTests: XCTestCase {
    @MainActor final class FakeLocation: LocationProvider {
        var onPoints: (@MainActor ([TrackPoint]) -> Void)?
        var running = false
        func startRunUpdates(_ f: @escaping @MainActor ([TrackPoint]) -> Void) { onPoints = f; running = true }
        func stopRunUpdates() { running = false }
    }
    @MainActor final class FakeHaptics: RunHaptics {
        var log: [String] = []
        func tick(_ s: TickStrength) { log.append("tick-\(s.rawValue)") }
        func closeImpact() { log.append("close") }
        func cellTick() { log.append("cell") }
        func crack() { log.append("crack") }
        func success() { log.append("success") }
    }
    @MainActor final class FakeAwake: ScreenAwake { var on = false; func setAwake(_ v: Bool) { on = v } }
    @MainActor final class FakeMirror: RunMirror {
        var all: [WatchPayload] = []
        var lastHud: WatchPayload.Hud? { all.reversed().compactMap { if case let .hud(h) = $0 { return h } else { return nil } }.first }
        func publish(_ p: WatchPayload) { all.append(p) }
    }

    @MainActor func testRunFlowEnqueuesRunAndMirrorsToWatch() async throws {
        let loc = FakeLocation(), hap = FakeHaptics(), awake = FakeAwake(), mirror = FakeMirror()
        let queue = RunQueue(kv: MemoryKeyValueStore(), submit: { _ in Fixtures.summaryClosed })
        let rc = RunController(store: MemoryRunStore(), location: loc, haptics: hap, awake: awake, queue: queue)
        rc.mirror = mirror
        var activity: [Bool] = []
        rc.onActivity = { activity.append($0) }
        try rc.start()
        XCTAssertTrue(rc.isActive)
        XCTAssertTrue(loc.running)
        XCTAssertTrue(awake.on)
        let pts = Geo.circleTrack(center: Fixtures.moda, radiusM: 200, n: 180, t0: 1_000_000, speedMps: 3.2)
        for p in pts { loc.onPoints?([p]) }
        XCTAssertNotNil(rc.conquest)
        XCTAssertGreaterThan(rc.conquest?.preview.cells.count ?? 0, 100)
        XCTAssertTrue(hap.log.contains("close"))
        XCTAssertTrue(hap.log.contains { $0.hasPrefix("tick") })
        XCTAssertTrue(mirror.all.contains(.tick))
        XCTAssertTrue(mirror.all.contains { if case let .conquest(c) = $0 { return c.cells > 100 } else { return false } })
        XCTAssertEqual(mirror.lastHud?.state, .running)
        XCTAssertGreaterThan(mirror.lastHud?.distanceM ?? 0, 1000)
        XCTAssertFalse(rc.handle(.pause))
        XCTAssertEqual(mirror.lastHud?.state, .paused)
        XCTAssertFalse(rc.handle(.resume))
        XCTAssertTrue(rc.handle(.finish))
        rc.dismissConquest()
        let id = await rc.finish()
        XCTAssertNotNil(id)
        XCTAssertFalse(rc.isActive)
        XCTAssertFalse(loc.running)
        XCTAssertFalse(awake.on)
        XCTAssertEqual(activity, [true, false])
        XCTAssertEqual(mirror.lastHud?.state, .finished)
        XCTAssertFalse(mirror.all.contains(.loopOpen), "halka kapandıysa loop_open yok")
        await queue.flush()
        let st = await queue.status(id!)
        XCTAssertEqual(st, .done)
    }

    @MainActor func testRecoverAfterKill() async throws {
        let store = MemoryRunStore()
        let queue = RunQueue(kv: MemoryKeyValueStore(), submit: { _ in Fixtures.summaryClosed })
        let rc1 = RunController(store: store, location: FakeLocation(), haptics: FakeHaptics(), awake: FakeAwake(), queue: queue)
        try rc1.start()
        rc1.ingest([TrackPoint(lat: 40.98, lng: 29.02, t: 1_000, acc: 5), TrackPoint(lat: 40.9801, lng: 29.02, t: 5_000, acc: 5)])
        let rc2 = RunController(store: store, location: FakeLocation(), haptics: FakeHaptics(), awake: FakeAwake(), queue: queue)
        XCTAssertTrue(rc2.recover())
        XCTAssertTrue(rc2.recovered)
        XCTAssertEqual(rc2.snapshot?.pointCount, 2)
    }


}

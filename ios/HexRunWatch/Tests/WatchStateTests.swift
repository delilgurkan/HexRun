import XCTest
import HexRunKit
#if canImport(HexRunWatch)
@testable import HexRunWatch
#endif

final class WatchStateTests: XCTestCase {
    let t0 = Date(timeIntervalSince1970: 1_791_300_000)

    func hud(_ state: WatchPayload.Hud.State = .running, distanceM: Double = 6120, durationMs: Int64 = 1_977_000, pace: Double? = 323,
             distToStartM: Double = 1200, armed: Bool = true, closing: Bool = false, events: [String] = ["morning", "blitz"],
             duel: WatchPayload.Duel? = nil, ts: Int64 = 1_791_300_000_000) -> WatchPayload.Hud {
        WatchPayload.Hud(state: state, distanceM: distanceM, durationMs: durationMs, paceSecPerKm: pace, distToStartM: distToStartM,
                         armed: armed, closingMode: closing, events: events, duel: duel, ts: ts)
    }

    func testSpecPayloadDecodesAndDrivesRunFace() {
        let dict: [String: Any] = [
            "type": "hud", "state": "running", "distanceM": 6120, "durationMs": 1_977_000, "paceSecPerKm": 323, "distToStartM": 1200,
            "armed": true, "closingMode": false, "events": ["morning", "blitz"], "duel": NSNull(), "ts": 1_791_300_000_000, "extra": "x",
        ]
        guard let p = WatchPayload(dictionary: dict) else { return XCTFail("decode") }
        var s = WatchState()
        XCTAssertEqual(s.reduce(.payload(p, at: t0)), [.start])
        let f = WatchFace.make(s, now: t0)
        XCTAssertEqual(f.kind, .run)
        XCTAssertEqual(f.kicker, "Halka açık · 1,2 km")
        XCTAssertEqual(f.value, "6,12")
        XCTAssertEqual(f.unit, "km")
        XCTAssertEqual(f.foot, ["5'23\"", "32:57"])
        XCTAssertEqual(f.chips, ["Sabah 2x", "Blitz 2x"])
    }

    func testApproachFace() {
        var s = WatchState()
        s.reduce(.payload(.hud(hud(distanceM: 8310, durationMs: 2_684_000, distToStartM: 86, closing: true)), at: t0))
        let f = WatchFace.make(s, now: t0)
        XCTAssertEqual(f.kind, .approach)
        XCTAssertEqual(f.value, "85 m")
        XCTAssertEqual(f.kicker, "Halkayı kapat")
        XCTAssertEqual(f.foot, ["8,31 km", "44:44"])
        XCTAssertEqual(f.progress!, (300 - 86) / 250, accuracy: 1e-9)
        XCTAssertEqual(WatchFace.approachProgress(400), 0)
        XCTAssertEqual(WatchFace.approachProgress(10), 1)
    }

    func testEnteringClosingModeBuzzesOnce() {
        var s = WatchState()
        s.reduce(.payload(.hud(hud()), at: t0))
        XCTAssertEqual(s.reduce(.payload(.hud(hud(closing: true, ts: 1_791_300_001_000)), at: t0)), [.notification])
        XCTAssertEqual(s.reduce(.payload(.hud(hud(closing: true, ts: 1_791_300_002_000)), at: t0)), [])
    }

    func testDuelFace() {
        var s = WatchState()
        s.reduce(.payload(.hud(hud(duel: .init(opponent: "Zeynep", coveredCells: 22, totalCells: 34))), at: t0))
        let f = WatchFace.make(s, now: t0)
        XCTAssertEqual(f.kind, .duel)
        XCTAssertEqual(f.kicker, "Düello · Zeynep")
        XCTAssertEqual(f.value, "22/34")
        XCTAssertEqual(f.tone, .duel)
        XCTAssertEqual(f.progress!, 22.0 / 34.0, accuracy: 1e-9)
    }

    func testEventsAndHaptics() {
        var s = WatchState()
        XCTAssertEqual(s.reduce(.payload(.tick, at: t0)), [.click])
        XCTAssertEqual(s.lastEvent, "tick")
        XCTAssertEqual(s.reduce(.payload(.loopOpen, at: t0)), [.notification])
        XCTAssertEqual(s.banner?.kind, .loopOpen)
        let c = WatchPayload.Conquest(cells: 62, areaM2: 19_220, captured: 48)
        XCTAssertEqual(s.reduce(.payload(.conquest(c), at: t0)), [.success])
        let f = WatchFace.conquest(c)
        XCTAssertEqual(f.value, "62")
        XCTAssertEqual(f.unit, "petek senin")
        XCTAssertEqual(f.foot, ["+19.220 m²", "48 rakipten"])
        s.reduce(.expire(now: t0.addingTimeInterval(4.9)))
        XCTAssertNotNil(s.conquest)
        s.reduce(.expire(now: t0.addingTimeInterval(5)))
        XCTAssertNil(s.conquest)
        XCTAssertNil(s.banner)
    }

    func testEventDictionariesFromSpec() {
        XCTAssertEqual(WatchPayload(dictionary: ["type": "tick"]), .tick)
        XCTAssertEqual(WatchPayload(dictionary: ["type": "loop_open"]), .loopOpen)
        XCTAssertEqual(WatchPayload(dictionary: ["type": "conquest", "cells": 62, "areaM2": 19220, "captured": 48]),
                       .conquest(.init(cells: 62, areaM2: 19_220, captured: 48)))
        let cmd = WatchPayload.command(.finish).dictionary
        XCTAssertEqual(cmd["type"] as? String, "command")
        XCTAssertEqual(cmd["action"] as? String, "finish")
    }

    func testStaleAfter30sWhileRunningOnly() {
        var s = WatchState()
        s.reduce(.payload(.hud(hud()), at: t0))
        XCTAssertFalse(s.isStale(now: t0.addingTimeInterval(30)))
        XCTAssertTrue(s.isStale(now: t0.addingTimeInterval(31)))
        XCTAssertEqual(WatchFace.make(s, now: t0.addingTimeInterval(31)).kind, .stale)
        XCTAssertEqual(WatchFace.make(s, now: t0.addingTimeInterval(31)).kicker, "Telefonla bağlantı yok")
        s.reduce(.payload(.hud(hud(.paused, ts: 1_791_300_001_000)), at: t0))
        XCTAssertFalse(s.isStale(now: t0.addingTimeInterval(600)))
    }

    func testStoredContextUsesOlderPhoneTimestamp() {
        var s = WatchState()
        // Telefon bu HUD'u 5 dk önce göndermiş; saat şimdi açıldı.
        let sentMs = Int64(t0.timeIntervalSince1970 * 1000) - 300_000
        XCTAssertEqual(s.reduce(.payload(.hud(hud(ts: sentMs)), at: t0, stored: true)), [])
        XCTAssertTrue(s.isStale(now: t0))
    }

    func testOlderHudIgnored() {
        var s = WatchState()
        s.reduce(.payload(.hud(hud(distanceM: 5000, ts: 2000)), at: t0))
        s.reduce(.payload(.hud(hud(distanceM: 4000, ts: 1000)), at: t0))
        XCTAssertEqual(s.hud.distanceM, 5000)
    }

    func testDurationExtrapolatesWhileRunning() {
        var s = WatchState()
        s.reduce(.payload(.hud(hud(durationMs: 60_000)), at: t0))
        XCTAssertEqual(s.displayDurationMs(now: t0.addingTimeInterval(3)), 63_000)
        s.reduce(.commandSent(.pause, at: t0))
        XCTAssertEqual(s.displayDurationMs(now: t0.addingTimeInterval(3)), 60_000)
    }

    func testOptimisticPauseResume() {
        var s = WatchState()
        s.reduce(.payload(.hud(hud()), at: t0))
        s.reduce(.commandSent(.pause, at: t0))
        XCTAssertEqual(s.displayState, .paused)
        XCTAssertEqual(WatchFace.make(s, now: t0).kind, .paused)
        XCTAssertEqual(s.reduce(.payload(.hud(hud(.paused, ts: 1_791_300_001_000)), at: t0)), [.stop])
        XCTAssertNil(s.pending)
        s.reduce(.commandSent(.resume, at: t0))
        XCTAssertEqual(s.displayState, .running)
        // Telefon onaylamazsa iyimser durum düşer.
        s.reduce(.expire(now: t0.addingTimeInterval(5)))
        XCTAssertNil(s.pending)
        XCTAssertEqual(s.displayState, .paused)
    }

    func testCommandFailureShowsBanner() {
        var s = WatchState()
        s.reduce(.commandSent(.finish, at: t0))
        XCTAssertEqual(s.reduce(.commandFailed(.finish, at: t0)), [.notification])
        XCTAssertNil(s.pending)
        XCTAssertEqual(s.banner?.kind, .unreachable)
    }

    func testFinishedAndIdleFaces() {
        var s = WatchState()
        XCTAssertEqual(WatchFace.make(s, now: t0).kind, .idle)
        XCTAssertEqual(WatchFace.make(s, now: t0).unit, "Telefonda koşuya başla")
        s.reduce(.payload(.hud(hud()), at: t0))
        s.reduce(.commandSent(.finish, at: t0))
        XCTAssertTrue(s.isFinishing)
        XCTAssertEqual(s.reduce(.payload(.hud(hud(.finished, ts: 1_791_300_009_000)), at: t0)), [.stop])
        XCTAssertNil(s.pending)
        XCTAssertEqual(WatchFace.make(s, now: t0).kind, .finished)
    }

    func testFormattingHelpers() {
        XCTAssertNil(WatchFace.chip("unknown"))
        XCTAssertEqual(WatchFace.chip("evening"), "Akşam 1,5x")
        XCTAssertEqual(WatchFace.spokenDuration(1_977_000), "32 dakika 57 saniye")
        XCTAssertEqual(WatchFace.spokenPace(323), "kilometrede 5 dakika 23 saniye")
        XCTAssertEqual(WatchFace.ratio(5, 0), 0)
    }
}

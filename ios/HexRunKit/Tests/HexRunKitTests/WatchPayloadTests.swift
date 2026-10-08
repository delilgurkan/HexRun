import Foundation
import XCTest
@testable import HexRunKit

final class WatchPayloadTests: XCTestCase {
    func testHudMatchesSpecExample() throws {
        let spec = #"{"type":"hud","state":"running","distanceM":6120,"durationMs":1977000,"paceSecPerKm":323,"distToStartM":85,"armed":true,"closingMode":true,"events":["morning","blitz"],"duel":{"opponent":"Zeynep","coveredCells":40,"totalCells":48},"ts":1791300000000}"#
        guard case let .hud(h)? = WatchPayload(json: Data(spec.utf8)) else { return XCTFail() }
        XCTAssertEqual(h.state, .running)
        XCTAssertEqual(h.durationMs, 1_977_000)
        XCTAssertEqual(h.paceSecPerKm, 323)
        XCTAssertEqual(h.duel, WatchPayload.Duel(opponent: "Zeynep", coveredCells: 40, totalCells: 48))
        XCTAssertEqual(h.events, ["morning", "blitz"])
        XCTAssertEqual(h.ts, 1_791_300_000_000)
        XCTAssertEqual(h.remainingM, 85)
        // Gidiş-dönüş: JSON ve sözlük.
        XCTAssertEqual(WatchPayload(json: WatchPayload.hud(h).json), .hud(h))
        XCTAssertEqual(WatchPayload(dictionary: WatchPayload.hud(h).dictionary), .hud(h))
        let o = try JSONSerialization.jsonObject(with: WatchPayload.hud(h).json) as! [String: Any]
        XCTAssertEqual(o["type"] as? String, "hud")
        XCTAssertEqual((o["duel"] as? [String: Any])?["totalCells"] as? Int, 48)
    }

    func testMissingAndUnknownFields() {
        guard case let .hud(h)? = WatchPayload(dictionary: ["type": "hud", "state": "paused", "extra": 1, "duel": NSNull()]) else { return XCTFail() }
        XCTAssertEqual(h.state, .paused)
        XCTAssertEqual(h.distanceM, 0)
        XCTAssertNil(h.paceSecPerKm)
        XCTAssertNil(h.duel)
        XCTAssertTrue(h.events.isEmpty)
        // nil değerler sözlükte yok (plist uyumlu).
        let d = WatchPayload.hud(WatchPayload.Hud(state: .idle, ts: 5)).dictionary
        XCTAssertNil(d["paceSecPerKm"])
        XCTAssertNil(d["duel"])
        XCTAssertEqual(d["state"] as? String, "idle")
        XCTAssertNil(WatchPayload(dictionary: ["type": "nope"]))
        XCTAssertNil(WatchPayload(dictionary: ["state": "running"]))
    }

    func testEventsAndCommands() {
        XCTAssertEqual(WatchPayload.tick.dictionary as? [String: String], ["type": "tick"])
        XCTAssertEqual(WatchPayload.loopOpen.dictionary as? [String: String], ["type": "loop_open"])
        let c = WatchPayload.conquest(.init(cells: 62, areaM2: 19_220, captured: 48))
        XCTAssertEqual(WatchPayload(dictionary: c.dictionary), c)
        XCTAssertEqual(c.dictionary["cells"] as? Int, 62)
        XCTAssertEqual(WatchPayload(dictionary: ["type": "command", "action": "finish"]), .command(.finish))
        XCTAssertEqual(WatchPayload.command(.pause).dictionary as? [String: String], ["type": "command", "action": "pause"])
        XCTAssertNil(WatchPayload(dictionary: ["type": "command", "action": "explode"]))
        XCTAssertEqual(WatchPayload(json: Data(#"{"type":"conquest"}"#.utf8)), .conquest(.init(cells: 0, areaM2: 0, captured: 0)))
    }
}

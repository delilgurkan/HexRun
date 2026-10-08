import XCTest
@testable import HexRunKit

final class DeepLinkTests: XCTestCase {
    func testSchemes() {
        XCTAssertEqual(DeepLink.parse("hexrun://run?defend=d9"), .run(defend: "d9", attack: nil))
        XCTAssertEqual(DeepLink.parse("hexrun://run"), .run(defend: nil, attack: nil))
        XCTAssertEqual(DeepLink.parse("hexrun://duel/revenge/d1"), .duelRevenge("d1"))
        XCTAssertEqual(DeepLink.parse("hexrun://duel/abc"), .duel("abc"))
        XCTAssertEqual(DeepLink.parse("hexrun://notifications"), .notifications)
        XCTAssertEqual(DeepLink.parse("hexrun://integrations?connected=strava"), .integrations(connected: "strava", error: nil))
        XCTAssertEqual(DeepLink.parse("hexrun://friends?code=DENIZ7"), .friends(code: "DENIZ7"))
        XCTAssertEqual(DeepLink.parse("hexrun://events"), .events)
        XCTAssertEqual(DeepLink.parse("hexrun://"), .map)
        XCTAssertEqual(DeepLink.parse("https://hexrun.co/invite/MODA42"), .invite("MODA42"))
        XCTAssertEqual(DeepLink.parse("https://hexrun.co/r/run-1"), .summary(runId: "run-1"))
        XCTAssertEqual(DeepLink.parse("https://www.hexrun.co/app/region/8c1ec902e99c9ff"), .region("8c1ec902e99c9ff"))
        XCTAssertNil(DeepLink.parse("https://evil.example/app/run"))
        XCTAssertNil(DeepLink.parse("hexrun://bilinmeyen"))
        XCTAssertNil(DeepLink.parse(nil))
    }

    func testPushPayload() {
        XCTAssertEqual(DeepLink.fromPush(["url": "hexrun://notifications", "aps": [:]]), .notifications)
        XCTAssertEqual(DeepLink.fromPush(["data": ["url": "hexrun://run?defend=x"]]), .run(defend: "x", attack: nil))
    }

    @MainActor func testRouterHandlesLinks() async {
        let r = Router()
        r.handle(.notifications)
        XCTAssertEqual(r.mapPath, [.notifications])
        r.handle(.league)
        XCTAssertEqual(r.tab, .league)
        r.handle(.run(defend: "d9", attack: nil))
        XCTAssertEqual(r.runRequest, RunContext(defendDuelId: "d9"))
        r.cover = .run
        r.handle(.notifications)
        XCTAssertEqual(r.mapPath, [.notifications], "koşu sırasında gezinme yok")
        r.cover = nil
        r.handle(.region("abc"))
        XCTAssertEqual(r.regionCell, "abc")
        r.handle(.duelRevenge("d1"))
        XCTAssertEqual(r.revengeDuelId, "d1")
    }
}

final class SVGPathTests: XCTestCase {
    func testParsesAllIcons() {
        for (name, d) in IconPaths.all {
            let ops = SVGPath.parse(d)
            XCTAssertGreaterThan(ops.count, 1, name)
            guard case .move = ops.first else { return XCTFail("\(name) M ile başlamalı") }
            for op in ops {
                switch op {
                case let .move(x, y), let .line(x, y), let .cubic(_, _, _, _, x, y), let .quad(_, _, x, y):
                    XCTAssert(x > -1 && x < 25 && y > -1 && y < 25, "\(name) ızgara dışında: \(x),\(y)")
                case .close: break
                }
            }
        }
    }

    func testRelativeAndImplicitCommands() {
        let hex = SVGPath.parse("M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z").map { op -> PathOp in
            if case let .line(x, y) = op { return .line((x * 10).rounded() / 10, (y * 10).rounded() / 10) }
            return op
        }
        let expected: [PathOp] = [.move(12, 2.8), .line(20, 7.4), .line(20, 16.6), .line(12, 21.2), .line(4, 16.6), .line(4, 7.4), .close]
        XCTAssertEqual(hex, expected)
        let arc = SVGPath.parse("M5 5a2 2 0 0 1 4 0")
        guard case let .cubic(_, _, _, _, x, y) = arc.last else { return XCTFail() }
        XCTAssertEqual(x, 9, accuracy: 1e-9)
        XCTAssertEqual(y, 5, accuracy: 1e-9)
        XCTAssertEqual(SVGPath.parse("M7 17h.01").last, .line(7.01, 17))
    }
}

import XCTest
@testable import HexRunKit

final class LoopVectorTests: XCTestCase {
    struct LoopCase: Decodable {
        struct Expected: Decodable {
            struct L: Decodable { var index: Int; var lengthM: Double; var areaM2: Double; var closedAt: Int64; var startedAt: Int64; var ringSize: Int }
            struct Sample: Decodable {
                var i: Int
                var distanceM: Double
                var durationMs: Int64
                var distToStartM: Double
                var armed: Bool
                var closingMode: Bool
                var paceSecPerKm: Double?
                var loops: Int
            }
            var closedAtIndex: [Int]
            var loops: [L]
            var samples: [Sample]
        }
        var name: String
        var options: LoopOptions
        var pauseAt: Int?
        var resumeAt: Int?
        var points: [TrackPoint]
        var expected: Expected
    }

    func testEveryLoopCase() throws {
        let cases = try Vectors.decode([LoopCase].self, "loops.json")
        XCTAssertEqual(cases.count, 10)
        for c in cases {
            let tr = LoopTracker(c.options)
            var closed: [Int] = []
            var samples: [Int: TrackerState] = [:]
            for (i, p) in c.points.enumerated() {
                if c.pauseAt == i { tr.pause() }
                if c.resumeAt == i { tr.resume() }
                if tr.push(p) != nil { closed.append(i) }
                samples[i] = tr.state()
            }
            XCTAssertEqual(closed, c.expected.closedAtIndex, c.name)
            let st = tr.state()
            XCTAssertEqual(st.loops.count, c.expected.loops.count, c.name)
            for (l, e) in zip(st.loops, c.expected.loops) {
                XCTAssertEqual(l.index, e.index, c.name)
                assertClose(l.lengthM, e.lengthM, "\(c.name) lengthM")
                assertClose(l.areaM2, e.areaM2, "\(c.name) areaM2")
                XCTAssertEqual(l.closedAt, e.closedAt, c.name)
                XCTAssertEqual(l.startedAt, e.startedAt, c.name)
                XCTAssertEqual(l.ring.count, e.ringSize, c.name)
            }
            XCTAssertFalse(c.expected.samples.isEmpty)
            for s in c.expected.samples {
                let g = try XCTUnwrap(samples[s.i], "\(c.name) #\(s.i)")
                let tag = "\(c.name) #\(s.i)"
                assertClose(g.distanceM, s.distanceM, tag + " distanceM")
                XCTAssertEqual(g.durationMs, s.durationMs, tag)
                assertClose(g.distToStartM, s.distToStartM, tag + " distToStartM")
                XCTAssertEqual(g.armed, s.armed, tag)
                XCTAssertEqual(g.closingMode, s.closingMode, tag)
                assertClose(g.paceSecPerKm, s.paceSecPerKm, tag + " pace")
                XCTAssertEqual(g.loops.count, s.loops, tag)
            }
        }
    }

    func testCircleTrackMatchesVectorPoints() throws {
        // circle-200m vektörü core `circleTrack(MODA, 200, 180, T0, 3.2)` ile üretildi.
        let cases = try Vectors.decode([LoopCase].self, "loops.json")
        let c = try XCTUnwrap(cases.first { $0.name == "circle-200m" })
        let t0 = ISODate.parse("2026-10-05T04:00:00Z")!.epochMs
        let pts = Geo.circleTrack(center: LatLng(lat: 40.9819, lng: 29.0254), radiusM: 200, n: 180, t0: t0, speedMps: 3.2)
        XCTAssertEqual(pts.count, c.points.count)
        for (a, b) in zip(pts, c.points) {
            XCTAssertEqual(a.lat, b.lat, accuracy: 1e-12)
            XCTAssertEqual(a.lng, b.lng, accuracy: 1e-12)
            XCTAssertEqual(a.t, b.t)
        }
    }
}

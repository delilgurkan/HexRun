import XCTest
@testable import HexRunKit

final class GeoVectorTests: XCTestCase {
    struct GeoFile: Decodable {
        struct Hav: Decodable { var a: LatLng; var b: LatLng; var m: Double }
        struct Dest: Decodable { var from: LatLng; var bearing: Double; var distM: Double; var to: LatLng }
        struct Area: Decodable { var ring: [LatLng]; var m2: Double }
        var haversine: [Hav]
        var destination: [Dest]
        var polygonArea: [Area]
    }

    func testGeoVectors() throws {
        let g = try Vectors.decode(GeoFile.self, "geo.json")
        XCTAssertFalse(g.haversine.isEmpty)
        for h in g.haversine { assertClose(Geo.haversineM(h.a, h.b), h.m, "haversine") }
        for d in g.destination {
            let to = Geo.destination(d.from, bearingDeg: d.bearing, distM: d.distM)
            assertClose(to.lat, d.to.lat, rel: 1e-9, "dest lat")
            assertClose(to.lng, d.to.lng, rel: 1e-9, "dest lng")
        }
        for a in g.polygonArea { assertClose(Geo.polygonAreaM2(a.ring), a.m2, "area") }
    }
}

final class CellVectorTests: XCTestCase {
    struct CellsFile: Decodable {
        struct Of: Decodable { var p: LatLng; var res: Int32; var cell: String }
        struct Bnd: Decodable { var cell: String; var boundary: [LatLng] }
        struct Poly: Decodable { var ring: [LatLng]; var res: Int32; var cells: [String] }
        var cellOf: [Of]
        var boundary: [Bnd]
        var polygon: Poly
    }

    func testCellVectors() throws {
        let c = try Vectors.decode(CellsFile.self, "cells.json")
        for o in c.cellOf { XCTAssertEqual(H3.cellOf(o.p, res: o.res), o.cell) }
        for b in c.boundary {
            let got = H3.boundary(b.cell)
            XCTAssertEqual(got.count, b.boundary.count)
            for (x, y) in zip(got, b.boundary) {
                XCTAssertEqual(x.lat, y.lat, accuracy: 1e-9)
                XCTAssertEqual(x.lng, y.lng, accuracy: 1e-9)
            }
        }
        let cells = H3.cellsInPolygon(c.polygon.ring, res: c.polygon.res).sorted()
        XCTAssertEqual(cells, c.polygon.cells)
        XCTAssertFalse(cells.isEmpty)
    }

    func testNeighborsAndConnectivity() {
        let c = H3.cellOf(lat: 40.9819, lng: 29.0254)
        let n = H3.neighbors(c)
        XCTAssertEqual(n.count, 6)
        XCTAssertFalse(n.contains(c))
        XCTAssertTrue(H3.isConnected([c] + n))
        XCTAssertTrue(H3.isGameCell(c))
        let far = H3.cellOf(lat: 41.1, lng: 29.2)
        XCTAssertFalse(H3.isConnected([c, far]))
        XCTAssertEqual(H3.components([c, far] + n).first?.count, 7)
        XCTAssertGreaterThan(H3.areaM2(c), 250)
        XCTAssertLessThan(H3.areaM2(c), 350)
        let ctr = H3.center(c)
        XCTAssertEqual(H3.cellOf(ctr), c)
    }
}

final class FormatVectorTests: XCTestCase {
    func testFormatVectors() throws {
        let f = try XCTUnwrap(try Vectors.json("format.json") as? [String: [[Any]]])
        for row in try XCTUnwrap(f["km"]) {
            XCTAssertEqual(Fmt.km((row[0] as! NSNumber).doubleValue, digits: (row[1] as! NSNumber).intValue), row[2] as? String)
        }
        for row in try XCTUnwrap(f["pace"]) {
            let v = (row[0] as? NSNumber)?.doubleValue
            XCTAssertEqual(Fmt.pace(v), row[1] as? String)
        }
        for row in try XCTUnwrap(f["duration"]) {
            XCTAssertEqual(Fmt.duration((row[0] as! NSNumber).doubleValue), row[1] as? String)
        }
        for row in try XCTUnwrap(f["int"]) {
            XCTAssertEqual(Fmt.int((row[0] as! NSNumber).doubleValue), row[1] as? String)
        }
        for row in try XCTUnwrap(f["area"]) {
            XCTAssertEqual(Fmt.area((row[0] as! NSNumber).doubleValue), row[1] as? String)
        }
        for row in try XCTUnwrap(f["initials"]) {
            XCTAssertEqual(Fmt.initials(row[0] as! String), row[1] as? String, "\(row[0])")
        }
    }
}

final class EventVectorTests: XCTestCase {
    struct EventsFile: Decodable {
        struct Active: Decodable { var t: String; var active: [String] }
        struct Win: Decodable { var t: String; var id: String; var active: Bool; var endsInMin: Int?; var startsInMin: Int }
        var active: [Active]
        var windows: [Win]
    }

    func ms(_ s: String) -> Int64 { ISODate.parse(s)!.epochMs }

    func testEventVectors() throws {
        let e = try Vectors.decode(EventsFile.self, "events.json")
        XCTAssertNotNil(TimeZone(identifier: "Europe/Istanbul"))
        for a in e.active {
            XCTAssertEqual(GameEvents.active(ms: ms(a.t)).map(\.id.rawValue), a.active, a.t)
        }
        for w in e.windows {
            let got = GameEvents.window(EventId(rawValue: w.id)!, ms: ms(w.t))
            XCTAssertEqual(got.active, w.active, "\(w.t) \(w.id)")
            XCTAssertEqual(got.endsInMin, w.endsInMin, "\(w.t) \(w.id)")
            XCTAssertEqual(got.startsInMin, w.startsInMin, "\(w.t) \(w.id)")
        }
    }
}

final class HatVectorTests: XCTestCase {
    struct HatCase: Decodable { var power: Double; var progress: Double; var ghost: Double; var segments: [HatSegment] }

    func testHatVectors() throws {
        let cases = try Vectors.decode([HatCase].self, "hat.json")
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let got = Hat.segments(power: c.power, progress: c.progress, ghostTo: c.ghost)
            XCTAssertEqual(got.count, c.segments.count)
            for (x, y) in zip(got, c.segments) {
                XCTAssertEqual(x.owner, y.owner, accuracy: 1e-9)
                XCTAssertEqual(x.siege, y.siege, accuracy: 1e-9)
                XCTAssertEqual(x.ghost, y.ghost, accuracy: 1e-9)
            }
        }
    }
}

final class ColorVectorTests: XCTestCase {
    struct ColorCase: Decodable {
        struct N: Decodable { var id: String; var slot: Slot }
        var viewer: String?
        var nodes: [N]
        var edges: [[String]]
        var result: [String: Slot]
    }

    func testColorVectors() throws {
        let cases = try Vectors.decode([ColorCase].self, "colors.json")
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let got = Palette.assignDisplayColors(viewer: c.viewer, nodes: c.nodes.map { .init(id: $0.id, slot: $0.slot) }, edges: c.edges.map { ($0[0], $0[1]) })
            XCTAssertEqual(got, c.result, "viewer \(c.viewer ?? "nil")")
        }
    }

    func testPaletteRules() {
        XCTAssertEqual(Palette.slots.count, 8)
        XCTAssertTrue(Palette.clash(.zum, .gul))
        XCTAssertTrue(Palette.clash(.mer, .keh))
        XCTAssertFalse(Palette.clash(.keh, .gok))
        XCTAssertEqual(Palette.hex(.lac, dark: true), "#1B7EBF")
        XCTAssertEqual(Palette.hex(.lac, dark: false), "#0072B2")
    }
}

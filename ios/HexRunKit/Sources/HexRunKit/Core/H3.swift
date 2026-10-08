import CH3
import Foundation

public typealias CellId = String

/// Uber H3 (vendored C, v4.5.0) için ince Swift sarmalayıcı. h3-js ile birebir
/// aynı dizinleri üretir (`shared/test-vectors/cells.json`).
public enum H3 {
    public static func index(_ id: CellId) -> UInt64? {
        UInt64(id, radix: 16)
    }

    public static func string(_ h: UInt64) -> CellId {
        String(h, radix: 16)
    }

    /// Noktanın res-12 (varsayılan) peteği.
    public static func cellOf(_ p: LatLng, res: Int32 = Rules.h3Res) -> CellId {
        cellOf(lat: p.lat, lng: p.lng, res: res)
    }

    public static func cellOf(lat: Double, lng: Double, res: Int32 = Rules.h3Res) -> CellId {
        var g = CH3.LatLng(lat: degsToRads(lat), lng: degsToRads(lng))
        var out: H3Index = 0
        let err = latLngToCell(&g, res, &out)
        return err == 0 ? string(out) : ""
    }

    public static func isValid(_ id: CellId) -> Bool {
        guard let h = index(id) else { return false }
        return isValidCell(h) != 0
    }

    public static func isGameCell(_ id: CellId) -> Bool {
        guard let h = index(id), isValidCell(h) != 0 else { return false }
        return getResolution(h) == Rules.h3Res
    }

    public static func resolution(_ id: CellId) -> Int {
        guard let h = index(id) else { return -1 }
        return Int(getResolution(h))
    }

    public static func center(_ id: CellId) -> LatLng {
        guard let h = index(id) else { return LatLng(lat: 0, lng: 0) }
        var g = CH3.LatLng(lat: 0, lng: 0)
        _ = cellToLatLng(h, &g)
        return LatLng(lat: radsToDegs(g.lat), lng: radsToDegs(g.lng))
    }

    /// Peteğin köşeleri (derece), h3-js `cellToBoundary` sırasıyla.
    public static func boundary(_ id: CellId) -> [LatLng] {
        guard let h = index(id) else { return [] }
        var b = CellBoundary()
        guard cellToBoundary(h, &b) == 0 else { return [] }
        let n = Int(b.numVerts)
        return withUnsafeBytes(of: &b.verts) { raw -> [LatLng] in
            let verts = raw.bindMemory(to: CH3.LatLng.self)
            return (0..<n).map { LatLng(lat: radsToDegs(verts[$0].lat), lng: radsToDegs(verts[$0].lng)) }
        }
    }

    /// Poligonun (kapalı halka) içindeki petekler: merkezi poligonun içinde olan hücreler.
    public static func cellsInPolygon(_ ring: [LatLng], res: Int32 = Rules.h3Res) -> [CellId] {
        guard ring.count >= 3 else { return [] }
        var verts = ring.map { CH3.LatLng(lat: degsToRads($0.lat), lng: degsToRads($0.lng)) }
        return verts.withUnsafeMutableBufferPointer { buf -> [CellId] in
            var poly = GeoPolygon(geoloop: GeoLoop(numVerts: Int32(buf.count), verts: buf.baseAddress), numHoles: 0, holes: nil)
            var size: Int64 = 0
            guard maxPolygonToCellsSize(&poly, res, 0, &size) == 0, size > 0 else { return [] }
            var out = [H3Index](repeating: 0, count: Int(size))
            let err = out.withUnsafeMutableBufferPointer { o in polygonToCells(&poly, res, 0, o.baseAddress) }
            guard err == 0 else { return [] }
            return out.filter { $0 != 0 }.map(string)
        }
    }

    /// Altı komşu (kendisi hariç).
    public static func neighbors(_ id: CellId) -> [CellId] {
        guard let h = index(id) else { return [] }
        var out = [H3Index](repeating: 0, count: 7)
        let err = out.withUnsafeMutableBufferPointer { gridDisk(h, 1, $0.baseAddress) }
        guard err == 0 else { return [] }
        return out.filter { $0 != 0 && $0 != h }.map(string)
    }

    public static func areaM2(_ id: CellId) -> Double {
        guard let h = index(id) else { return 0 }
        var a = 0.0
        _ = cellAreaM2(h, &a)
        return a
    }

    public static func areaM2<S: Sequence>(_ ids: S) -> Double where S.Element == CellId {
        ids.reduce(0) { $0 + areaM2($1) }
    }

    public static func parent(_ id: CellId, res: Int32) -> CellId? {
        guard let h = index(id) else { return nil }
        var out: H3Index = 0
        return cellToParent(h, res, &out) == 0 ? string(out) : nil
    }

    /// Bağlı bileşenler (kenar komşuluğu), büyükten küçüğe.
    public static func components(_ ids: [CellId]) -> [[CellId]] {
        let set = Set(ids)
        var seen = Set<CellId>()
        var out: [[CellId]] = []
        for start in set.sorted() where !seen.contains(start) {
            var comp: [CellId] = []
            var stack = [start]
            seen.insert(start)
            while let c = stack.popLast() {
                comp.append(c)
                for n in neighbors(c) where set.contains(n) && !seen.contains(n) {
                    seen.insert(n)
                    stack.append(n)
                }
            }
            out.append(comp.sorted())
        }
        return out.sorted { a, b in a.count != b.count ? a.count > b.count : a[0] < b[0] }
    }

    public static func isConnected(_ ids: [CellId]) -> Bool {
        let set = Set(ids)
        if set.count <= 1 { return true }
        return (components(Array(set)).first?.count ?? 0) == set.count
    }
}

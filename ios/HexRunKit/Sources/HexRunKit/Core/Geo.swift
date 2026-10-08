import Foundation

/// Coğrafi nokta (derece).
public struct LatLng: Codable, Hashable, Sendable {
    public var lat: Double
    public var lng: Double
    public init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }
}

/// GPS noktası: `t` epoch ms (watchOS'ta Int 32 bit olduğundan Int64), `acc` yatay doğruluk (m).
public struct TrackPoint: Codable, Hashable, Sendable {
    public var lat: Double
    public var lng: Double
    public var t: Int64
    public var acc: Double?
    public init(lat: Double, lng: Double, t: Int64, acc: Double? = nil) {
        self.lat = lat
        self.lng = lng
        self.t = t
        self.acc = acc
    }
    public var latLng: LatLng { LatLng(lat: lat, lng: lng) }
}

/// Basit küresel geometri (WGS84 küre yaklaşımı; core `geo.ts` ile birebir).
public enum Geo {
    public static let earthRadiusM = 6_371_008.8

    @inlinable static func rad(_ d: Double) -> Double { d * Double.pi / 180 }

    public static func haversineM(_ a: LatLng, _ b: LatLng) -> Double {
        let dLat = rad(b.lat - a.lat)
        let dLng = rad(b.lng - a.lng)
        let s1 = sin(dLat / 2)
        let s2 = sin(dLng / 2)
        let s = s1 * s1 + cos(rad(a.lat)) * cos(rad(b.lat)) * s2 * s2
        return 2 * earthRadiusM * asin(min(1, s.squareRoot()))
    }

    public static func haversineM(_ a: TrackPoint, _ b: TrackPoint) -> Double {
        haversineM(a.latLng, b.latLng)
    }

    public static func pathLengthM(_ points: [LatLng]) -> Double {
        guard points.count > 1 else { return 0 }
        var d = 0.0
        for i in 1..<points.count { d += haversineM(points[i - 1], points[i]) }
        return d
    }

    /// Bir noktayı verilen yön (derece, kuzeyden saat yönünde) ve mesafe ile taşır.
    public static func destination(_ p: LatLng, bearingDeg: Double, distM: Double) -> LatLng {
        let delta = distM / earthRadiusM
        let theta = rad(bearingDeg)
        let phi1 = rad(p.lat)
        let lambda1 = rad(p.lng)
        let phi2 = asin(sin(phi1) * cos(delta) + cos(phi1) * sin(delta) * cos(theta))
        let lambda2 = lambda1 + atan2(sin(theta) * sin(delta) * cos(phi1), cos(delta) - sin(phi1) * sin(phi2))
        let lngDeg = ((lambda2 * 180) / Double.pi + 540).truncatingRemainder(dividingBy: 360) - 180
        return LatLng(lat: (phi2 * 180) / Double.pi, lng: lngDeg)
    }

    /// Küçük poligonlar için yerel düzlem yaklaşımıyla alan (m²).
    public static func polygonAreaM2(_ ring: [LatLng]) -> Double {
        guard ring.count >= 3 else { return 0 }
        let lat0 = rad(ring[0].lat)
        let kx = cos(lat0) * earthRadiusM
        var s = 0.0
        var j = ring.count - 1
        for i in 0..<ring.count {
            let xi = rad(ring[i].lng) * kx
            let yi = rad(ring[i].lat) * earthRadiusM
            let xj = rad(ring[j].lng) * kx
            let yj = rad(ring[j].lat) * earthRadiusM
            s += xj * yi - xi * yj
            j = i
        }
        return abs(s / 2)
    }

    /// Dairesel halka (testler ve öneriler). Başlangıç merkezin güneyi; saat yönünde tam tur.
    public static func circleTrack(center: LatLng, radiusM: Double, n: Int, t0: Int64, speedMps: Double) -> [TrackPoint] {
        var pts: [TrackPoint] = []
        let step = (2 * Double.pi * radiusM) / Double(n)
        for i in 0...n {
            let p = destination(center, bearingDeg: 180 + (360 * Double(i)) / Double(n), distM: radiusM)
            let t = t0 + Int64(jsRound(((Double(i) * step) / speedMps) * 1000))
            pts.append(TrackPoint(lat: p.lat, lng: p.lng, t: t, acc: 5))
        }
        return pts
    }

    /// Daire çokgeni (yakalama halkası çizimi).
    public static func circle(center: LatLng, radiusM: Double, steps: Int = 48) -> [LatLng] {
        (0...steps).map { destination(center, bearingDeg: 360 * Double($0) / Double(steps), distM: radiusM) }
    }

    /// Başlangıç üçgeni (oryantiring işareti).
    public static func triangle(center: LatLng, sizeM: Double = 14) -> [LatLng] {
        [0, 120, 240, 0].map { destination(center, bearingDeg: $0, distM: sizeM) }
    }
}

import CH3
import Foundation

public enum H3 {
    public static func cell(lat: Double, lng: Double, res: Int32 = 12) -> String {
        var g = LatLng(lat: lat * .pi / 180, lng: lng * .pi / 180)
        var out: H3Index = 0
        _ = latLngToCell(&g, res, &out)
        return String(out, radix: 16)
    }
}

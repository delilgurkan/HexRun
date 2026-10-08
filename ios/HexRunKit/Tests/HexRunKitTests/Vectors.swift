import Foundation
import XCTest

/// Ortak test vektörleri depo kökünde: `shared/test-vectors/*.json` (TypeScript motorundan üretilir).
enum Vectors {
    static var directory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // HexRunKitTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // HexRunKit
            .deletingLastPathComponent() // ios
            .appendingPathComponent("../shared/test-vectors", isDirectory: true)
            .standardizedFileURL
    }

    static func data(_ name: String) throws -> Data {
        let url = directory.appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw NSError(domain: "Vectors", code: 1, userInfo: [NSLocalizedDescriptionKey: "Vektör yok: \(url.path)"])
        }
        return try Data(contentsOf: url)
    }

    static func json(_ name: String) throws -> Any {
        try JSONSerialization.jsonObject(with: data(name))
    }

    static func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try JSONDecoder().decode(T.self, from: data(name))
    }
}

/// 1e-6 göreli (en az 1e-6 mutlak; vektörler 6 haneye yuvarlanmıştır).
func assertClose(_ a: Double?, _ b: Double?, rel: Double = 1e-6, _ msg: @autoclosure () -> String = "", file: StaticString = #filePath, line: UInt = #line) {
    switch (a, b) {
    case (nil, nil): return
    case let (x?, y?):
        let tol = max(rel * max(abs(x), abs(y)), 1e-6)
        XCTAssert(abs(x - y) <= tol, "\(x) ≠ \(y) \(msg())", file: file, line: line)
    default:
        XCTFail("\(String(describing: a)) ≠ \(String(describing: b)) \(msg())", file: file, line: line)
    }
}

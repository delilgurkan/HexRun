import XCTest
@testable import HexRunKit

final class SmokeTests: XCTestCase {
    func testCell() {
        XCTAssertEqual(H3.cell(lat: 40.9819, lng: 29.0254).count, 15)
    }
}

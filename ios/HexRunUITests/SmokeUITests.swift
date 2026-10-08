import XCTest

/// Duman akışı (sahte API, `-uiTestMockAPI`): onboarding → e-posta girişi → harita → koşu → özet.
final class SmokeUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testOnboardingLoginRunSummary() {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestMockAPI"]
        app.launch()

        // 01 · Onboarding (3 ekran)
        XCTAssertTrue(app.buttons["onboarding-continue"].waitForExistence(timeout: 10))
        app.buttons["onboarding-continue"].tap()
        app.buttons["onboarding-continue"].tap()
        app.buttons["onboarding-start"].tap()

        // İzin gerekçesi: sahte modda sistem penceresi açılmaz.
        let later = app.buttons["perm-later"]
        XCTAssertTrue(later.waitForExistence(timeout: 5))
        if app.buttons["perm-location"].exists { app.buttons["perm-location"].tap() }
        later.tap()

        // 02 · E-posta kodu (geliştirme kodu otomatik dolar)
        XCTAssertTrue(app.buttons["auth-email"].waitForExistence(timeout: 5))
        app.buttons["auth-email"].tap()
        let email = app.textFields["email-input"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        email.tap()
        email.typeText("deniz@example.com")
        app.buttons["email-send"].tap()
        let verify = app.buttons["email-verify"]
        XCTAssertTrue(verify.waitForExistence(timeout: 5))
        verify.tap()

        // 03 · Harita
        let start = app.buttons["start-run"]
        XCTAssertTrue(start.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["bell"].exists)
        start.tap()

        // 05 · Koşu (simüle 200 m halka) → 07 fetih anı
        XCTAssertTrue(app.otherElements["run-screen"].waitForExistence(timeout: 10) || app.buttons["pause"].waitForExistence(timeout: 10))
        let cont = app.buttons["conquest-continue"]
        if cont.waitForExistence(timeout: 20) { cont.tap() }

        // Bitir: 1,5 sn basılı tut
        let finish = app.otherElements["finish"].exists ? app.otherElements["finish"] : app.buttons["finish"]
        XCTAssertTrue(finish.waitForExistence(timeout: 5))
        finish.press(forDuration: 2.0)

        // 08 · Özet
        XCTAssertTrue(app.buttons["summary-done"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["gained"].exists)
        app.buttons["summary-done"].tap()
        XCTAssertTrue(start.waitForExistence(timeout: 5))
    }
}

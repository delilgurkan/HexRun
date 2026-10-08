import CoreHaptics
import UIKit
import HexRunKit

/// Haptik: kapanış modunda tık (her 10 m, son 20 m'de çift), fetih anı için CoreHaptics deseni.
@MainActor
final class Haptics: RunHaptics {
    private var engine: CHHapticEngine?

    init() {
        if CHHapticEngine.capabilitiesForHardware().supportsHaptics {
            engine = try? CHHapticEngine()
            engine?.isAutoShutdownEnabled = true
        }
    }

    func tick(_ s: TickStrength) {
        let g = UIImpactFeedbackGenerator(style: .light)
        g.impactOccurred()
        if s == .double {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.09) { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        }
    }

    func closeImpact() { UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 1) }
    func cellTick() { UISelectionFeedbackGenerator().selectionChanged() }

    func crack() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.07) { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    }

    func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }

    /// Fetih anı (2,4 sn): kare 1 sert darbe, kare 2 artan doku, kare 3 başarı.
    func playConquest(cells: Int) {
        guard let engine else { return }
        var events: [CHHapticEvent] = [
            CHHapticEvent(eventType: .hapticTransient, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.9),
            ], relativeTime: 0),
            CHHapticEvent(eventType: .hapticContinuous, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.35),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3),
            ], relativeTime: 0.3, duration: 1.5),
        ]
        let ticks = min(15, cells / 10)
        for i in 0..<ticks {
            events.append(CHHapticEvent(eventType: .hapticTransient, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.5),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.6),
            ], relativeTime: 0.3 + 1.5 * Double(i) / Double(max(1, ticks))))
        }
        events.append(CHHapticEvent(eventType: .hapticTransient, parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
        ], relativeTime: 2.0))
        do {
            try engine.start()
            let player = try engine.makePlayer(with: CHHapticPattern(events: events, parameters: []))
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            success()
        }
    }
}

/// Koşu sırasında ekran açık kalır.
@MainActor
final class ScreenAwakeService: ScreenAwake {
    func setAwake(_ on: Bool) { UIApplication.shared.isIdleTimerDisabled = on }
}

import Foundation

public enum EventId: String, Codable, CaseIterable, Sendable {
    case morning, blitz, evening
}

public enum MoveKind: String, Codable, Sendable {
    case gain, attack, pushback
}

public struct GameEvent: Hashable, Sendable {
    public var id: EventId
    public var name: String
    public var move: MoveKind
    public var multiplier: Double
    public var window: String
    public var description: String
}

/// Zaman çarpanları (Europe/Istanbul): Sabah 06–09, Blitz Cmt–Paz, Akşam 18–21 (core `events.ts`).
public enum GameEvents {
    public static let all: [EventId: GameEvent] = [
        .morning: GameEvent(id: .morning, name: "Sabah Avantajı", move: .gain, multiplier: 2, window: "06:00–09:00",
                            description: "Nerede koşarsan koş, halkadan kendi peteklerine 2x güç."),
        .blitz: GameEvent(id: .blitz, name: "Hafta Sonu Blitz", move: .attack, multiplier: 2, window: "Cmt–Paz",
                          description: "Hafta sonu düello saldırıları 2x."),
        .evening: GameEvent(id: .evening, name: "Akşam Savunması", move: .pushback, multiplier: 1.5, window: "18:00–21:00",
                            description: "Sahibin halkası saldırganları 1,5x geri iter."),
    ]

    public static func active(ms: Int64, zone: TimeZone = GameTime.zone) -> [GameEvent] {
        let lt = GameTime.localTime(ms: ms, zone: zone)
        var out: [GameEvent] = []
        if lt.hour >= 6 && lt.hour < 9 { out.append(all[.morning]!) }
        if lt.weekday == 6 || lt.weekday == 0 { out.append(all[.blitz]!) }
        if lt.hour >= 18 && lt.hour < 21 { out.append(all[.evening]!) }
        return out
    }

    public static func multiplier(_ move: MoveKind, ms: Int64) -> Double {
        active(ms: ms).first { $0.move == move }?.multiplier ?? 1
    }

    public struct Window: Hashable, Sendable {
        public var active: Bool
        public var endsInMin: Int?
        public var startsInMin: Int
    }

    /// Bir sonraki başlangıç ve aktifse bitiş (dakika adımlı tarama, en fazla 8 gün).
    public static func window(_ id: EventId, ms: Int64, zone: TimeZone = GameTime.zone) -> Window {
        func isOn(_ t: Int64) -> Bool { active(ms: t, zone: zone).contains { $0.id == id } }
        let step: Int64 = 60_000
        let limit = 8 * 24 * 60
        let on = isOn(ms)
        var t = ms
        var n = 0
        if on {
            while isOn(t) && n < limit { t += step; n += 1 }
            return Window(active: true, endsInMin: n, startsInMin: 0)
        }
        while !isOn(t) && n < limit { t += step; n += 1 }
        return Window(active: false, endsInMin: nil, startsInMin: n)
    }
}

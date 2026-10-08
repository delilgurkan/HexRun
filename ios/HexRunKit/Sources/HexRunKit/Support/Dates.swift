import Foundation

/// Türkçe tarih/saat biçimleri (Europe/Istanbul): "4 Ekim Pazar · 06:29–07:14", "Dün 21:30".
public enum TRDate {
    public static let months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
    public static let monthsShort = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
    public static let days = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"]

    static func lt(_ d: Date) -> LocalTime { GameTime.localTime(d) }
    static func pad(_ n: Int) -> String { n < 10 ? "0\(n)" : "\(n)" }

    public static func hhmm(_ d: Date) -> String {
        let p = lt(d)
        return "\(pad(p.hour)):\(pad(p.minute))"
    }

    /// "4 Ekim Pazar"
    public static func dayLabel(_ d: Date) -> String {
        let p = lt(d)
        return "\(p.dayOfMonth) \(months[p.month - 1]) \(days[p.weekday])"
    }

    /// "4 Ekim Pazar · 06:29–07:14"
    public static func runRange(_ start: Date, _ end: Date) -> String {
        "\(dayLabel(start)) · \(hhmm(start))–\(hhmm(end))"
    }

    /// "4 EKİM 2026"
    public static func shareDate(_ d: Date) -> String {
        let p = lt(d)
        return "\(p.dayOfMonth) \(Fmt.turkishUpper(months[p.month - 1])) \(p.year)"
    }

    public static func monthName(_ d: Date) -> String { months[lt(d).month - 1] }

    /// "11 Eyl"
    public static func shortDate(_ d: Date) -> String {
        let p = lt(d)
        return "\(p.dayOfMonth) \(monthsShort[p.month - 1])"
    }

    public enum DayGroup: String, CaseIterable, Sendable { case today, yesterday, week, earlier }

    public static func dayGroup(_ d: Date, now: Date = Date()) -> DayGroup {
        let diff = GameTime.dayIndex(ms: now.epochMs) - GameTime.dayIndex(ms: d.epochMs)
        if diff <= 0 { return .today }
        if diff == 1 { return .yesterday }
        if diff < 7 { return .week }
        return .earlier
    }

    public static func groupLabel(_ g: DayGroup) -> String {
        switch g {
        case .today: return S.common.today
        case .yesterday: return S.common.yesterday
        case .week: return S.common.thisWeek
        case .earlier: return S.common.earlier
        }
    }

    /// "Bugün 06:52", "Dün 21:30", "11 Eyl"
    public static func relative(_ d: Date, now: Date = Date()) -> String {
        switch dayGroup(d, now: now) {
        case .today: return "Bugün \(hhmm(d))"
        case .yesterday: return "Dün \(hhmm(d))"
        default: return shortDate(d)
        }
    }

    public static func minutesAgo(_ d: Date, now: Date = Date()) -> Int {
        max(0, Int(jsRound(now.timeIntervalSince(d) / 60)))
    }
}

/// Etkinlik listesi ve etiketleri (sunucu verisi + yerel `eventWindow` sayaçları).
public enum EventsPresenter {
    /// "güç 2x · saldırı 2x"
    public static func shortLabel(_ events: [ActiveEvent]) -> String {
        events.map { "\(S.events.moves[$0.move] ?? $0.move.rawValue) \(Fmt.multiplier($0.multiplier))" }.joined(separator: " · ")
    }

    public static func names(_ events: [ActiveEvent]) -> String? {
        events.isEmpty ? nil : events.map(\.name).joined(separator: " + ")
    }

    public static func resolve(_ server: [ActiveEvent]?, now: Date = Date()) -> [ActiveEvent] {
        EventId.allCases.map { id in
            let w = GameEvents.window(id, ms: now.epochMs)
            let e = GameEvents.all[id]!
            let s = server?.first { $0.id == id }
            return ActiveEvent(
                id: id, name: s?.name ?? e.name, move: e.move, multiplier: s?.multiplier ?? e.multiplier,
                window: s?.window ?? e.window, description: s?.description ?? e.description,
                active: w.active, endsInMin: w.endsInMin, startsInMin: w.startsInMin,
                participantsToday: s?.participantsToday ?? 0
            )
        }
    }

    public static func activeNow(_ now: Date = Date()) -> [ActiveEvent] {
        resolve(nil, now: now).filter(\.active)
    }

    /// Bitiş saati "23:59" gibi.
    public static func endsAtLabel(_ endsInMin: Int?, now: Date = Date()) -> String? {
        guard let m = endsInMin else { return nil }
        return TRDate.hhmm(now.addingTimeInterval(Double(m * 60 - 60)))
    }

    /// Etkinlik adının son kelimesi ("Hafta Sonu Blitz" → "Blitz").
    public static func shortName(_ e: ActiveEvent) -> String {
        e.name.split(separator: " ").last.map(String.init) ?? e.name
    }
}

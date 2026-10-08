import Foundation
import HexRunKit

/// Saat metinleri (Türkçe).
enum WS {
    static let idleTitle = "HexRun"
    static let idleBody = "Telefonda koşuya başla"
    static let idleHint = "Koşuyu telefondan başlat; saat canlı gösterir."
    static let run = "Koşu"
    static let km = "km"
    static let closeLoop = "Halkayı kapat"
    static let startAhead = "başlangıca dön"
    static let duelCells = "petek dolaşıldı"
    static let conquest = "Fetih"
    static let conquestCells = "petek senin"
    static let paused = "Duraklatıldı"
    static let finished = "Koşu bitti"
    static let finishedSub = "Özet telefonda"
    static let stale = "Telefonla bağlantı yok"
    static let staleSub = "Telefonu yakında tut"
    static let finishing = "Bitiriliyor…"
    static let pause = "Duraklat"
    static let resume = "Devam"
    static let finish = "Bitir"
    static let holdToFinish = "Bitirmek için basılı tut"
    static let finishA11y = "Koşuyu bitir"
    static let finishA11yHint = "Koşuyu bitirir; ekranda 1,5 saniye basılı tutarak da bitirebilirsin"
    static let loopOpenBanner = "Halka açık kaldı"
    static let unreachableBanner = "Telefona ulaşılamadı"
    static let notConnected = "Telefon bağlı değil"
    static let dismiss = "Kapat"
    static func loopOpen(_ d: String) -> String { "Halka açık · \(d)" }
    static func duel(_ name: String) -> String { "Düello · \(name)" }
    static func capturedFrom(_ n: Int) -> String { "\(Fmt.int(n)) rakipten" }
    static func cellsOf(_ a: Int, _ b: Int) -> String { "\(a) / \(b) petek" }
}

/// Tek ekranlık sunum: üst satır (kicker), tek büyük rakam, birim, alt satır. WatchKit/SwiftUI'den bağımsız.
struct WatchFace: Equatable, Sendable {
    enum Kind: Equatable, Sendable { case idle, run, approach, duel, paused, finished, stale, conquest }
    /// Kicker rengi: `accent` = kehribar, `duel` = gök (rakip), `muted` = ikincil mürekkep, `warning` = kiremit.
    enum Tone: Equatable, Sendable { case accent, duel, muted, warning }

    var kind: Kind
    var kicker: String
    var tone: Tone
    var value: String
    var unit: String
    var foot: [String]
    /// Etkinlik çipleri ("Sabah 2x").
    var chips: [String] = []
    /// Halka/ilerleme 0…1 (düello kapsama, yaklaşma, fetih).
    var progress: Double?
    /// VoiceOver için tek cümle.
    var accessibility: String

    /// Ekran seçimi: bağlantı yok > bitti > duraklatıldı > yaklaşma > düello > koşu.
    static func make(_ s: WatchState, now: Date) -> WatchFace {
        let h = s.hud
        let km = Fmt.km(h.distanceM)
        let time = Fmt.duration(s.displayDurationMs(now: now))
        let pace = Fmt.pace(h.paceSecPerKm)
        let chips = h.events.compactMap(chip)

        switch h.state {
        case .idle:
            return WatchFace(kind: .idle, kicker: WS.idleTitle, tone: .accent, value: "", unit: WS.idleBody, foot: [],
                             accessibility: "\(WS.idleTitle). \(WS.idleBody)")
        case .finished:
            return WatchFace(kind: .finished, kicker: WS.finished, tone: .accent, value: km, unit: WS.km, foot: [time, WS.finishedSub],
                             accessibility: "\(WS.finished). \(spokenKm(h.distanceM)), \(spokenDuration(h.durationMs)). \(WS.finishedSub)")
        case .running, .paused:
            break
        }

        if s.isStale(now: now) {
            return WatchFace(kind: .stale, kicker: WS.stale, tone: .warning, value: km, unit: WS.km, foot: [WS.staleSub],
                             accessibility: "\(WS.stale). \(WS.staleSub). Son bilinen \(spokenKm(h.distanceM))")
        }

        if s.displayState == .paused {
            return WatchFace(kind: .paused, kicker: WS.paused, tone: .muted, value: km, unit: WS.km, foot: [pace, time], chips: chips,
                             accessibility: "\(WS.paused). \(spokenKm(h.distanceM)), \(spokenDuration(h.durationMs))")
        }

        if h.closingMode {
            let rem = h.remainingM
            return WatchFace(kind: .approach, kicker: WS.closeLoop, tone: .accent, value: "\(rem) m", unit: WS.startAhead,
                             foot: ["\(km) km", time], chips: chips, progress: approachProgress(h.distToStartM),
                             accessibility: "\(WS.closeLoop). Başlangıca \(rem) metre. \(spokenKm(h.distanceM)), \(spokenDuration(s.displayDurationMs(now: now)))")
        }

        if let d = h.duel, d.totalCells > 0 {
            let name = d.opponent.isEmpty ? "Rakip" : d.opponent
            return WatchFace(kind: .duel, kicker: WS.duel(name), tone: .duel, value: "\(d.coveredCells)/\(d.totalCells)", unit: WS.duelCells,
                             foot: ["\(km) km", time], chips: chips, progress: ratio(d.coveredCells, d.totalCells),
                             accessibility: "\(WS.duel(name)). \(d.totalCells) petekten \(d.coveredCells) petek dolaşıldı. \(spokenKm(h.distanceM))")
        }

        let kicker = h.armed ? WS.loopOpen(Fmt.distanceLabel(h.distToStartM)) : WS.run
        return WatchFace(kind: .run, kicker: kicker, tone: h.armed ? .accent : .muted, value: km, unit: WS.km, foot: [pace, time], chips: chips,
                         accessibility: "\(kicker). \(spokenKm(h.distanceM)). Tempo \(spokenPace(h.paceSecPerKm)). Süre \(spokenDuration(s.displayDurationMs(now: now)))"
                            + (chips.isEmpty ? "" : ". " + chips.joined(separator: ", ")))
    }

    /// Fetih kartı.
    static func conquest(_ c: WatchPayload.Conquest) -> WatchFace {
        var foot = ["+\(Fmt.area(c.areaM2))"]
        if c.captured > 0 { foot.append(WS.capturedFrom(c.captured)) }
        return WatchFace(kind: .conquest, kicker: WS.conquest, tone: .accent, value: Fmt.int(c.cells), unit: WS.conquestCells, foot: foot,
                         progress: 1,
                         accessibility: "\(WS.conquest). \(c.cells) petek senin, artı \(Fmt.int(c.areaM2)) metrekare"
                            + (c.captured > 0 ? ", \(c.captured) petek rakipten" : ""))
    }

    // MARK: - Yardımcılar

    /// Etkinlik kimliği → kısa çip: "morning" → "Sabah 2x". Bilinmeyen kimlik atlanır.
    static func chip(_ id: String) -> String? {
        guard let e = EventId(rawValue: id), let ev = GameEvents.all[e] else { return nil }
        let short: String
        switch e {
        case .morning: short = "Sabah"
        case .blitz: short = "Blitz"
        case .evening: short = "Akşam"
        }
        return "\(short) \(Fmt.multiplier(ev.multiplier))"
    }

    /// "Halkayı kapat" ilerlemesi: 300 m'de 0, yakalama yarıçapında (50 m) 1.
    static func approachProgress(_ distToStartM: Double) -> Double {
        let span = Rules.closingModeM - Rules.loopCloseM
        guard span > 0, distToStartM.isFinite else { return 0 }
        return min(1, max(0, (Rules.closingModeM - distToStartM) / span))
    }

    static func ratio(_ a: Int, _ b: Int) -> Double {
        guard b > 0 else { return 0 }
        return min(1, max(0, Double(a) / Double(b)))
    }

    static func spokenKm(_ m: Double) -> String { "\(Fmt.km(m)) kilometre" }

    static func spokenPace(_ secPerKm: Double?) -> String {
        guard let v = secPerKm, v.isFinite, v > 0 else { return "yok" }
        let s = Int(jsRound(v))
        return "kilometrede \(s / 60) dakika \(s % 60) saniye"
    }

    static func spokenDuration(_ ms: Int64) -> String {
        let s = max(0, Int(ms / 1000))
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        var parts: [String] = []
        if h > 0 { parts.append("\(h) saat") }
        if h > 0 || m > 0 { parts.append("\(m) dakika") }
        parts.append("\(sec) saniye")
        return parts.joined(separator: " ")
    }
}

/// Şerit metni.
extension WatchState.BannerKind {
    var text: String {
        switch self {
        case .loopOpen: return WS.loopOpenBanner
        case .unreachable: return WS.unreachableBanner
        }
    }
}

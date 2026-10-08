import Foundation
import Observation

/// 16 · Düello alanı seçimi: kaydırdıkça boya, aynı yerden tekrar kaydırınca sil (7–60).
public enum DuelSelection {
    public enum PaintMode: Sendable { case add, remove }
    public enum State: Equatable, Sendable { case empty, small, big, limit, invalid, ok }

    /// Hareketin ilk peteği seçiliyse silme, değilse ekleme modu.
    public static func paintMode(first: String, selected: Set<String>) -> PaintMode {
        selected.contains(first) ? .remove : .add
    }

    public static func apply(_ selected: Set<String>, cell: String, mode: PaintMode, allowed: Set<String>) -> Set<String> {
        var next = selected
        guard allowed.contains(cell) else { return next }
        switch mode {
        case .add: if next.count < Rules.duelMaxCells { next.insert(cell) }
        case .remove: next.remove(cell)
        }
        return next
    }

    public static func state(count n: Int, preview: DuelPreview?) -> State {
        if n == 0 { return .empty }
        if n < Rules.duelMinCells { return .small }
        if n > Rules.duelMaxCells { return .big }
        if let p = preview, !p.ok {
            if p.error == .limit { return .limit }
            if p.error == .size { return n < Rules.duelMinCells ? .small : .big }
            return .invalid
        }
        return .ok
    }
}

@MainActor
@Observable
public final class DuelSelectModel: RemoteLoading {
    public let request: DuelSelectRequest
    public var region = Remote<RegionDetail>()
    public private(set) var selected: Set<String>
    public var painting = true
    public private(set) var preview: DuelPreview?
    public private(set) var previewFor: [String] = []
    public private(set) var created: DuelSummary?
    public var error: String?
    public var busy = false
    @ObservationIgnored private let app: AppModel
    @ObservationIgnored private let debouncer: Debouncer
    @ObservationIgnored private var stroke: (mode: DuelSelection.PaintMode, last: String?)?

    public init(app: AppModel, request: DuelSelectRequest, debounceMs: UInt64 = 400) {
        self.app = app
        self.request = request
        selected = Set(request.preselected)
        debouncer = Debouncer(ms: debounceMs)
    }

    public func load() async {
        await load(\.region) { try await app.api.region(cell: request.cell) }
        schedulePreview()
    }

    public var owner: PublicPlayer? { region.value?.owner }
    public var ownerName: String { owner?.firstName ?? "" }
    public var allowed: Set<String> { Set(region.value?.cells ?? []) }
    public var ids: [String] { selected.sorted() }

    /// Bölgenin petekleri (önbellekte yoksa sahip rengiyle).
    public var ownerCells: [MapCell] {
        guard let r = region.value else { return [] }
        return r.cells.map { app.mapCache.cells[$0] ?? MapCell(id: $0, ownerId: r.owner?.id, power: r.avgPower, slot: r.owner?.slot) }
    }

    public var state: DuelSelection.State {
        DuelSelection.state(count: selected.count, preview: previewFor == ids ? preview : nil)
    }

    // MARK: Boyama

    public func beginStroke(at cell: String) {
        guard painting, created == nil else { return }
        let m = DuelSelection.paintMode(first: cell, selected: selected)
        stroke = (m, cell)
        selected = DuelSelection.apply(selected, cell: cell, mode: m, allowed: allowed)
        schedulePreview()
    }

    public func continueStroke(at cell: String) {
        guard let s = stroke, s.last != cell else { return }
        stroke = (s.mode, cell)
        selected = DuelSelection.apply(selected, cell: cell, mode: s.mode, allowed: allowed)
        schedulePreview()
    }

    public func endStroke() { stroke = nil }

    func schedulePreview() {
        let snapshot = ids
        guard snapshot.count >= Rules.duelMinCells, snapshot.count <= Rules.duelMaxCells, created == nil else {
            preview = nil
            previewFor = []
            return
        }
        debouncer.run { [weak self] in await self?.fetchPreview(snapshot) }
    }

    func fetchPreview(_ cells: [String]) async {
        guard let p = try? await app.api.duelPreview(cells) else { return }
        guard cells == ids else { return }
        preview = p
        previewFor = cells
    }

    /// Önizlemeyi beklemeden hemen iste (testler, erişilebilirlik).
    public func refreshPreviewNow() async {
        debouncer.cancel()
        await fetchPreview(ids)
    }

    // MARK: Metinler

    public var slotsUsed: Int { max(0, 3 - (preview?.slotsLeft ?? region.value?.duelSlotsLeft ?? 3)) + (created == nil ? 0 : 1) }

    public var texts: (kicker: String, head: String, side: String, sub: String) {
        let area = preview?.areaM2 ?? Double(selected.count) * Rules.approxCellAreaM2
        var k = S.duelSelect.kickerSel, h = S.duelSelect.headSel(selected.count), sd = S.duelSelect.sideArea(Fmt.area(area)), sb = S.duelSelect.subSel
        switch state {
        case .empty: (k, h, sd, sb) = (S.duelSelect.kickerEmpty, S.duelSelect.headEmpty, S.common.cells(0), S.duelSelect.subEmpty(ownerName))
        case .small: (k, sd, sb) = (S.duelSelect.kickerSmall, S.duelSelect.sideMin, S.duelSelect.subSmall)
        case .big: (k, sd, sb) = (S.duelSelect.kickerBig, S.duelSelect.sideMax, S.duelSelect.subBig)
        case .limit: (k, sb) = (S.duelSelect.kickerLimit, S.duelSelect.subLimit)
        case .invalid: (k, sb) = (S.duelSelect.kickerError, preview?.error == .not_connected ? S.duelSelect.subNotConnected : S.common.genericError)
        case .ok: break
        }
        return (k, h, sd, sb)
    }

    public var hint: String { state == .empty ? S.duelSelect.hintEmpty(ownerName) : S.duelSelect.hint }
    public var canConfirm: Bool { state == .ok && preview?.ok == true && previewFor == ids && !busy }

    public func confirm() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            created = try await app.api.createDuel(ids)
            if let c = created { app.mapCache.attacking.append(c) }
        } catch {
            self.error = errorText(error)
        }
    }

    /// Alanı düzenle: düelloyu geri al, seçimi koru.
    public func edit() async {
        guard let c = created else { return }
        try? await app.api.cancelDuel(c.id)
        app.mapCache.attacking.removeAll { $0.id == c.id }
        selected = Set(c.cells)
        created = nil
        schedulePreview()
    }

    public var estMinutes: Int { Int(jsRound(((created?.routeLengthM ?? 0) / 1000) * 5.5)) }
}

/// 09B · Kuşatma ekranı hesapları (sahibin bakışı).
public struct SiegeNumbers: Equatable, Sendable {
    public var hp: Int
    public var powerAfter: Int
    public var progressAfter: Int
    public var hpAfter: Int
    public var defensesLeft: Int
    public var gainEvent: ActiveEvent?
    public var attackEventShort: String?

    public init(duel d: DuelSummary, now: Date = Date()) {
        let events = EventsPresenter.activeNow(now)
        let gain = events.first { $0.move == .gain }
        let push = events.first { $0.move == .pushback }
        gainEvent = gain
        attackEventShort = events.first { $0.move == .attack }.map(EventsPresenter.shortName)
        hp = Hat.duelHp(power: d.power, progress: d.progress)
        powerAfter = Int(min(Rules.maxPower, jsRound(d.power + Rules.ownerGain * (gain?.multiplier ?? 1))))
        progressAfter = Int(max(0, jsRound(d.progress - Rules.pushback * (push?.multiplier ?? 1))))
        hpAfter = Hat.duelHp(power: Double(powerAfter), progress: Double(progressAfter))
        defensesLeft = max(0, Rules.defenseDailyLimit - d.defensesToday)
    }

    public func explain(_ d: DuelSummary) -> String {
        let g = gainEvent.map { " (\($0.name) \(Fmt.multiplier($0.multiplier)))" } ?? ""
        return "Bu \(d.cells.count) peteği dolaşan bir halka kapatırsan: gücün \(Int(jsRound(d.power))) → \(powerAfter)\(g), \(d.attacker.firstName) \(Int(jsRound(d.progress))) → \(progressAfter); düello canın \(hp) → \(hpAfter)."
    }
}

@MainActor
@Observable
public final class DuelModel: RemoteLoading {
    public let id: String
    public var duel = Remote<DuelSummary>()
    public var region = Remote<RegionDetail>()
    @ObservationIgnored private let app: AppModel
    public init(app: AppModel, id: String) { self.app = app; self.id = id }

    public func load() async {
        await load(\.duel) { try await app.api.duel(id) }
        if let c = duel.value?.cells.first { await load(\.region) { try await app.api.region(cell: c) } }
    }

    public var defending: Bool { duel.value?.defender.id == app.me?.id }

    public func cancel() async {
        try? await app.api.cancelDuel(id)
        app.mapCache.attacking.removeAll { $0.id == id }
    }

    public var expiresInHours: Int? {
        guard let d = duel.value, let e = d.expiresAt, d.firstCountedAt == nil else { return nil }
        return max(0, Int(jsRound(e.timeIntervalSinceNow / 3600)))
    }
}

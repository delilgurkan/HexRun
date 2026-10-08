import SwiftUI
import HexRunKit

/// 08 · Koşu özeti: önce toprak, sonra fitness. A kapandı · B açık kaldı · C düello önerisi · inceleniyor.
struct SummaryScreen: View {
    @State private var model: SummaryModel
    @Environment(AppEnvironment.self) private var env
    @Environment(Router.self) private var router
    @Environment(\.theme) private var t
    @State private var shareId: IdentifiedString?

    init(app: AppModel, request: SummaryRequest) { _model = State(initialValue: SummaryModel(app: app, request: request)) }

    var body: some View {
        Group {
            if let s = model.summary {
                let v = SummaryPresenter.variant(s)
                HXScreen(title: S.summary.done, showBack: false, footer: {
                    if v != .review {
                        if s.totalGainedAreaM2 > 0 {
                            HXButton(S.summary.share, icon: .share, big: true) { shareId = IdentifiedString(id: s.id) }
                        }
                        HXButton(S.summary.toMap, kind: s.totalGainedAreaM2 > 0 ? .secondary : .primary, big: true) { done() }
                            .accessibilityIdentifier("summary-done")
                    }
                }) {
                    SummaryContent(s: s, model: model, onDone: done, onMakeLoop: {
                        router.cover = nil
                        Task { await env.startRun() }
                    }, onEditSuggestion: { sg in
                        router.cover = .duelSelect(DuelSelectRequest(cell: sg.cells.first ?? "", preselected: sg.cells, defenderId: sg.defender.id))
                    })
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("summary")
                .sheet(item: $shareId) { r in
                    NavigationStack { ShareScreen(app: env.app, runId: r.id) }.environment(\.theme, t)
                }
            } else {
                HXScreen(title: S.summary.done, showBack: false, footer: {
                    HXButton(S.summary.toMap, big: true) { done() }
                }) {
                    switch model.phase {
                    case .sending, .loadingRemote:
                        StateBlock(title: S.summary.sending)
                        Skeleton(height: 44)
                        Skeleton(height: 88)
                    case .pending:
                        StateBlock(icon: .check, title: S.summary.pendingTitle, bodyText: S.summary.pendingBody, action: S.common.retry) { Task { await model.retry() } }
                    case let .failed(msg):
                        StateBlock(title: S.summary.failedTitle, bodyText: msg)
                    default:
                        StateBlock(title: S.common.genericError, action: S.common.retry) { Task { await model.retry() } }
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("summary-pending")
            }
        }
        .task { await model.start() }
        .onDisappear { Task { await model.stop() } }
    }

    private func done() {
        router.cover = nil
        router.tab = .map
    }
}

struct SummaryContent: View {
    let s: RunSummary
    let model: SummaryModel
    let onDone: () -> Void
    let onMakeLoop: () -> Void
    let onEditSuggestion: (DuelSuggestion) -> Void
    @Environment(\.theme) private var t
    @State private var note = ""
    @State private var noteOpen = false

    var body: some View {
        let v = SummaryPresenter.variant(s)
        let range = SummaryPresenter.range(s)
        switch v {
        case .review: review
        case .open:
            VStack(alignment: .leading, spacing: 16) {
                if let g = s.openGapM { Tag(label: S.summary.openTag(Int(g.rounded()))) }
                Text("\(S.summary.done) · \(range)").hx(.label, tone: 2)
                Text(S.summary.openTitle).hx(.title1).accessibilityAddTraits(.isHeader)
                Text(S.summary.openBody).hx(.body, tone: 2)
                metrics
                Card {
                    row(.map, S.summary.openNoChange, S.summary.openNoChangeSub)
                    Divider2()
                    row(.pace, S.summary.monthDistance(TRDate.monthName(s.endedAt)), "+\(Fmt.km(s.distanceM)) km")
                    Divider2()
                    row(.streak, S.summary.streakLabel, S.common.streakDays(s.streakDays))
                }
                if let g = s.openGapM { HXButton(S.summary.makeLoop(Int(g.rounded())), big: true, action: onMakeLoop) }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("summary-open")
        case .closed, .suggestion:
            VStack(alignment: .leading, spacing: 16) {
                Text("\(S.summary.done) · \(range)").hx(.label, tone: 2)
                Text(S.summary.closedHead(SummaryPresenter.totalCells(s), SummaryPresenter.duelCells(s))).hx(.title1).accessibilityAddTraits(.isHeader)
                VStack(alignment: .leading, spacing: 2) {
                    Text(S.summary.gained).hx(.label, tone: 3)
                    Text("+\(Fmt.area(s.totalGainedAreaM2))").font(HXFont.font(.archivo, .black, 44)).monospacedDigit().foregroundStyle(t.c.ink)
                        .lineLimit(1).minimumScaleFactor(0.5).accessibilityIdentifier("gained")
                    if let h = SummaryPresenter.firstCountedHit(s) { Text("Can \(Int(h.hpBefore)) → \(Int(h.hpAfter))").hx(.data, tone: 2) }
                }
                metrics
                ForEach(s.newBadges) { b in Card { row(.defend, S.summary.newBadge(b.name), b.how) } }
                ForEach(SummaryPresenter.wonHits(s), id: \.duelId) { h in
                    Card { row(.siege, S.summary.duelWon(h.opponent?.firstName ?? ""), "\(S.summary.duelWonBody(h.cells)) · \(S.summary.streak(s.streakDays))") }
                }
                if v == .suggestion, let sg = s.suggestions.first { suggestion(sg) }
                HStack(spacing: 8) {
                    Icon(.streak, size: 18, color: t.c.ink2)
                    Text(S.summary.streak(s.streakDays)).hx(.callout, tone: 2)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(v == .suggestion ? "summary-suggestion" : "summary-closed")
        }
    }

    private var metrics: some View {
        HStack(spacing: 12) {
            Stat(label: S.common.distance, value: "\(Fmt.km(s.distanceM)) km")
            Stat(label: S.common.pace, value: "\(Fmt.pace(s.paceSecPerKm))/km")
            Stat(label: S.common.time, value: Fmt.duration(s.durationMs))
        }
    }

    private func row(_ icon: IconName, _ title: String, _ sub: String?) -> some View {
        HStack(spacing: 12) {
            Icon(icon, size: 18).frame(width: 36, height: 36).background(Circle().fill(t.c.surf2))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).hx(.callout)
                if let sub { Text(sub).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2) }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private func suggestion(_ sg: DuelSuggestion) -> some View {
        let name = sg.defender.firstName
        return Card {
            Tag(label: S.summary.suggestionTag)
            Text(S.summary.suggestionTitle(name)).hx(.title2)
            Text(S.summary.suggestionBody(name, sg.cells.count)).hx(.body, tone: 2)
            HStack(spacing: 12) {
                PlayerBadge(slot: sg.defender.slot, initials: sg.defender.initials, size: 36)
                VStack(alignment: .leading) {
                    Text(sg.defender.displayName).font(HXFont.font(.archivo, .bold, 15)).foregroundStyle(t.c.ink)
                    Text(S.summary.suggestionMeta(sg.cells.count, Int(sg.avgPower.rounded()))).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2)
                }
                Spacer()
                Text("can \(Int(sg.avgPower.rounded()))").hx(.data)
            }
            HStack(spacing: 12) {
                Stat(label: S.common.area, value: S.common.cells(sg.cells.count))
                Stat(label: S.summary.route, value: "~\(Fmt.km(sg.routeLengthM, digits: 1)) km")
            }
            Text(S.summary.suggestionNote(name)).hx(.callout, tone: 3)
            HStack(spacing: 12) {
                HXButton(S.common.notNow, kind: .secondary, action: onDone)
                HXButton(S.summary.editArea) { onEditSuggestion(sg) }.accessibilityIdentifier("edit-suggestion")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("suggestion-card")
    }

    /// 15B · Şüpheli halka cezalandırılmaz, bekletilir.
    private var review: some View {
        let segKm = Fmt.km(s.review?.segmentM ?? s.distanceM, digits: 1)
        let pace = s.review?.paceSecPerKm.map { "\(Fmt.pace($0))/km · \(segKm) km · " } ?? ""
        return VStack(alignment: .leading, spacing: 16) {
            Tag(label: S.summary.reviewTag)
            Text("\(S.summary.done) · \(pace)\(SummaryPresenter.range(s))").hx(.label, tone: 2)
            Text(S.summary.reviewTitle).hx(.title1).accessibilityAddTraits(.isHeader)
            Text(S.summary.reviewBody(segKm)).hx(.body, tone: 2)
            Card {
                row(.check, S.summary.reviewSaved, "\(Fmt.km(s.distanceM, digits: 1)) km · \(S.summary.streak(s.streakDays))")
                Divider2()
                row(.map, S.summary.reviewMapUnchanged, S.summary.reviewPendingCells(SummaryPresenter.pendingCells(s)))
                Divider2()
                row(.time, S.summary.reviewEta, S.summary.reviewEtaSub)
            }
            if noteOpen && !model.noteSent {
                TextField(S.summary.notePlaceholder, text: $note, axis: .vertical)
                    .lineLimit(3...6)
                    .font(HXFont.font(.archivo, .regular, 16))
                    .padding(12)
                    .frame(minHeight: 88, alignment: .top)
                    .background(RoundedRectangle(cornerRadius: Radii.s).fill(t.c.surf))
                    .overlay(RoundedRectangle(cornerRadius: Radii.s).stroke(t.c.line2, lineWidth: 1))
                    .accessibilityLabel(S.summary.addNote)
                    .onChange(of: note) { _, v in if v.count > 280 { note = String(v.prefix(280)) } }
                HXButton(S.common.save, disabled: note.trimmingCharacters(in: .whitespaces).isEmpty) { Task { await model.sendNote(note) } }
            }
            if model.noteSent { Text(S.summary.noteSent).hx(.callout) }
            HStack(spacing: 12) {
                if !model.noteSent { HXButton(S.summary.addNote, kind: .secondary) { noteOpen = true } }
                HXButton(S.common.done, action: onDone)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("summary-review")
    }
}

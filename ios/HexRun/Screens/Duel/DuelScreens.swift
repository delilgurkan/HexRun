import SwiftUI
import HexRunKit

/// 16 · Düello alanı seçimi: parmağını kaydırdıkça petekler boyanır, aynı yerden tekrar
/// kaydırınca seçim kalkar (7–60). Tamam → düello başlar ve rota çizilir. Tolerans gösterilmez.
struct DuelSelectScreen: View {
    @State private var model: DuelSelectModel
    @Environment(AppEnvironment.self) private var env
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.theme) private var t

    init(app: AppModel, request: DuelSelectRequest) { _model = State(initialValue: DuelSelectModel(app: app, request: request)) }

    var body: some View {
        @Bindable var m = model
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                HexMapView(
                    content: MapContent(cells: m.ownerCells, highlight: m.region.value?.cells ?? [], selection: m.created?.cells ?? m.ids,
                                        selectionSlot: app.me?.slot, route: m.created?.route ?? [], showPlayers: false),
                    camera: MapCamera(center: H3.center(m.request.cell), zoom: 16),
                    painting: m.painting && m.created == nil,
                    onPaint: { phase, cell in
                        switch phase {
                        case .began: if let c = cell { m.beginStroke(at: c) }
                        case .changed: if let c = cell { m.continueStroke(at: c) }
                        case .ended: m.endStroke()
                        }
                    }
                )
                .ignoresSafeArea(edges: .top)
                header
            }
            sheet
        }
        .background(t.c.bg.ignoresSafeArea())
        .task { await m.load() }
        .accessibilityIdentifier("duel-select")
    }

    private var header: some View {
        @Bindable var m = model
        return VStack(spacing: 8) {
            HStack(spacing: 8) {
                IconButton(.close, label: m.created == nil ? S.common.cancel : S.common.close, glass: true) { router.cover = nil }
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(S.duelSelect.title) · \(S.duelSelect.slot(m.slotsUsed))").font(HXFont.font(.archivo, .bold, 15)).foregroundStyle(t.c.ink)
                    if let o = m.owner {
                        HStack(spacing: 6) {
                            PlayerBadge(slot: o.slot, initials: o.initials, size: 20)
                            Text(S.duelSelect.owner(o.displayName, m.region.value?.cells.count ?? 0, Int((m.region.value?.avgPower ?? 0).rounded()))).hx(.data, tone: 2)
                        }
                    }
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: Radii.s).fill(t.c.glass))
                .overlay(RoundedRectangle(cornerRadius: Radii.s).stroke(t.c.line, lineWidth: 1))
            }
            if m.created == nil {
                Segmented(options: [(true, S.duelSelect.paint), (false, S.duelSelect.pan)], value: $m.painting)
                if m.painting { Text(m.hint).hx(.callout, tone: 2).multilineTextAlignment(.center) }
            }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.top, 8)
    }

    @ViewBuilder private var sheet: some View {
        let m = model
        VStack(alignment: .leading, spacing: 10) {
            if let c = m.created {
                let name = m.ownerName
                Text(S.duelSelect.started(name)).hx(.label, tone: 2)
                HStack(alignment: .firstTextBaseline) {
                    Text(S.duelSelect.routeReady).hx(.title1)
                    Spacer()
                    Text(S.common.cells(c.cells.count)).hx(.data)
                }
                Text(S.duelSelect.routeSub(name)).hx(.body, tone: 2)
                HStack(spacing: 12) {
                    Stat(label: S.duelSelect.statDistance, value: "\(Fmt.km(c.routeLengthM, digits: 1)) km")
                    Stat(label: S.duelSelect.statTime, value: "~\(m.estMinutes) dk")
                    Stat(label: S.duelSelect.statHp, value: "\(Int(c.hp.rounded()))")
                }
                HStack(spacing: 12) {
                    HXButton(S.duelSelect.edit, kind: .secondary) { Task { await m.edit() } }
                    HXButton(S.duelSelect.run, icon: .play) {
                        router.cover = nil
                        Task { await env.startRun(RunContext(attackDuelId: c.id)) }
                    }
                    .accessibilityIdentifier("duel-run")
                }
            } else {
                let tx = m.texts
                Text(tx.kicker).hx(.label, tone: 2).accessibilityIdentifier("selection-kicker")
                HStack(alignment: .firstTextBaseline) {
                    Text(tx.head).hx(.title1).accessibilityIdentifier("selection-head")
                    Spacer()
                    Text(tx.side).hx(.data, tone: 2)
                }
                Text(tx.sub).hx(.body, tone: 2).fixedSize(horizontal: false, vertical: true)
                if let p = m.preview, p.ok, m.state == .ok {
                    HStack(spacing: 12) {
                        Stat(label: S.duelSelect.statDistance, value: "\(Fmt.km(p.routeLengthM, digits: 1)) km")
                        Stat(label: S.duelSelect.statTime, value: "~\(p.estMinutes) dk")
                        Stat(label: S.duelSelect.statHp, value: "\(Int(p.avgPower.rounded()))")
                    }
                }
                if let e = m.error { Text(e).hx(.callout) }
                HStack(spacing: 12) {
                    HXButton(S.common.cancel, kind: .secondary) { router.cover = nil }
                    HXButton(S.duelSelect.confirm, loading: m.busy, disabled: !m.canConfirm) { Task { await m.confirm() } }
                        .accessibilityIdentifier("duel-confirm")
                }
            }
        }
        .padding(Space.gutter)
        .padding(.bottom, 4)
        .background(UnevenRoundedRectangle(topLeadingRadius: Radii.sheet, topTrailingRadius: Radii.sheet).fill(t.c.surf).ignoresSafeArea(edges: .bottom))
    }
}

/// 09B · Kuşatma ekranı (sahibin bakışı) ya da saldırganın düello özeti.
struct DuelScreen: View {
    @State private var model: DuelModel
    @State private var confirmCancel = false
    @Environment(AppEnvironment.self) private var env
    @Environment(AppModel.self) private var app
    @Environment(\.theme) private var t
    @Environment(\.dismiss) private var dismiss

    init(app: AppModel, id: String) { _model = State(initialValue: DuelModel(app: app, id: id)) }

    var body: some View {
        HXScreen(title: S.siege.title) {
            if let d = model.duel.value, let me = app.me {
                siege(d, me: me)
            } else if model.duel.isFailed {
                StateBlock(title: S.common.genericError, action: S.common.retry) { Task { await model.load() } }
            } else {
                Skeleton(width: 240, height: 28)
                Skeleton(height: 16)
                Skeleton(height: 120)
            }
        }
        .task { await model.load() }
        .confirmationDialog(S.siege.cancelDuel, isPresented: $confirmCancel, titleVisibility: .visible) {
            Button(S.siege.cancelDuel, role: .destructive) { Task { await model.cancel(); dismiss() } }
            Button(S.common.cancel, role: .cancel) {}
        }
    }

    @ViewBuilder private func siege(_ d: DuelSummary, me: Me) -> some View {
        let defending = d.defender.id == me.id
        let rival = defending ? d.attacker : d.defender
        let n = SiegeNumbers(duel: d)
        VStack(alignment: .leading, spacing: 16) {
            Text(defending ? S.siege.head(rival.firstName, n.hp) : S.siege.attacking(rival.firstName)).hx(.label, tone: 2)
            Text(S.siege.cells(d.cells.count)).hx(.title1).accessibilityAddTraits(.isHeader)
            if defending, let r = model.region.value {
                Text(S.siege.yourArea(r.cells.count, Fmt.area(r.areaM2), r.ownedSinceDays ?? 0)).hx(.data, tone: 2)
            }
            Card {
                HStack {
                    HStack(spacing: 8) {
                        PlayerBadge(slot: d.attacker.slot, initials: d.attacker.initials, size: 32)
                        Text("\(defending ? d.attacker.firstName : S.common.you) \(Int(d.progress.rounded()))").font(HXFont.font(.archivo, .bold, 15)).foregroundStyle(t.c.ink)
                    }
                    Spacer()
                    HStack(spacing: 8) {
                        Text("\(defending ? S.common.you : d.defender.firstName) \(Int(d.power.rounded()))").font(HXFont.font(.archivo, .bold, 15)).foregroundStyle(t.c.ink)
                        PlayerBadge(slot: d.defender.slot, initials: d.defender.initials, size: 32)
                    }
                }
                HatView(power: d.power, progress: d.progress, ownerColor: t.player(d.defender.slot), attackerColor: t.player(d.attacker.slot), size: .lg)
                    .accessibilityIdentifier("siege-hat")
                Text(S.siege.hpLeft(n.hp)).hx(.title2)
                Text(S.siege.estimate(d.loopsToCapture, n.attackEventShort)).hx(.body, tone: 2)
            }
            if defending {
                Text(n.explain(d)).hx(.body, tone: 2)
                Text(S.siege.defensesLeft(n.defensesLeft)).hx(.callout)
            } else {
                Text("\(S.region.duelHp(n.hp, d.cells.count)) · \(d.attacksToday)/\(d.attackLimitToday)").hx(.body, tone: 2)
                if let h = model.expiresInHours { Text(S.siege.expires(h)).hx(.callout, tone: 3) }
            }
            if let last = d.lastAttackAt {
                SectionTitle(S.region.history)
                Text("\(TRDate.relative(last)) · halka").hx(.data, tone: 2)
            }
            HXButton(defending ? S.siege.cta : S.siege.attackCta, icon: defending ? .defend : .play, big: true) {
                Task { await env.startRun(defending ? RunContext(defendDuelId: d.id) : RunContext(attackDuelId: d.id)) }
            }
            .accessibilityIdentifier("siege-cta")
            if !defending { HXButton(S.siege.cancelDuel, kind: .ghost) { confirmCancel = true } }
        }
        .accessibilityIdentifier(defending ? "siege" : "attack")
    }
}

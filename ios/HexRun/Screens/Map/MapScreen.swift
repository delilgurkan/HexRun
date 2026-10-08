import CoreLocation
import SwiftUI
import HexRunKit

/// 03 · Ana harita. Arayüz yalnız dört köşede ve tek birincil eylemde.
/// Durumlar: dolu, boş (ilk halka önerisi), yükleniyor (petek dokusu), çevrimdışı (soluk + tekrar dene).
struct MapScreen: View {
    @State private var model: MapModel
    @State private var camera: MapCamera?
    @Environment(AppEnvironment.self) private var env
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.theme) private var t

    init(app: AppModel) { _model = State(initialValue: MapModel(app: app)) }

    var body: some View {
        ZStack {
            t.c.land.ignoresSafeArea()
            HexMapView(
                content: MapContent(
                    cells: model.data?.cells ?? [], myId: model.myId, players: model.data?.players ?? [],
                    attackers: model.data?.attackersLast48h ?? 0, faded: model.offline, suggestion: model.suggestion?.ring ?? []
                ),
                camera: camera,
                onBoundsChange: { b in model.setBBox(b) },
                onTapCell: { id in router.regionCell = id },
                onPlayerTap: { p in if let m = p.marker { router.regionCell = H3.cellOf(m) } }
            )
            .ignoresSafeArea()
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("map-screen")
            if model.loading { HexTexture(opacity: 0.9).ignoresSafeArea() }
            overlays
        }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if let p = env.mock ? Fixtures.moda : env.location.lastKnown {
                model.setPosition(p, fix: env.mock)
                camera = MapCamera(center: p, zoom: 15, token: 1, animated: false)
            }
            env.location.onLocation = { loc in
                let p = LatLng(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude)
                let first = model.position == nil
                model.setPosition(p, fix: true)
                if first { camera = MapCamera(center: p, zoom: 15, token: (camera?.token ?? 0) + 1) }
            }
            env.location.startMonitoringForMap()
            await model.loadAll()
            // Dakikada bir tazele.
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                if Task.isCancelled { break }
                await model.loadAll()
            }
        }
        .onDisappear { env.location.stopMonitoringForMap() }
        .onChange(of: app.location) { _, _ in env.location.startMonitoringForMap() }
    }

    @ViewBuilder private var overlays: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    IconButton(label: S.map.avatarA11y, size: 48, action: { router.push(.profile(tab: .stats)) }) {
                        if let me = app.me {
                            PlayerBadge(slot: me.slot, initials: me.initials, size: 44, goldFrame: me.goldFrame, ring: true)
                        } else {
                            Skeleton(width: 44, height: 44, radius: 22)
                        }
                    }
                    .accessibilityIdentifier("avatar")
                    if let s = model.stats.value, s.streakDays > 0 { Chip(label: S.map.streakChip(s.streakDays), icon: .streak, glass: true) }
                    if let me = app.me, me.newbieDaysLeft > 0 { Chip(label: S.rookie.chip(me.newbieDaysLeft), glass: true) }
                    Spacer()
                    IconButton(.bell, label: S.map.bellA11y(model.unread), glass: true, badge: model.unread) { router.push(.notifications) }
                        .accessibilityIdentifier("bell")
                }
                if let chip = model.eventsChip {
                    Chip(label: chip, icon: .events, glass: true) { router.tab = .events }
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("events-chip")
                }
                if model.loading { Chip(label: S.map.loadingRegions, glass: true).accessibilityIdentifier("map-loading") }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.top, 8)
            Spacer()
            HStack {
                Spacer()
                IconButton(.locate, label: S.map.myLocation, glass: true) {
                    if let p = model.position { camera = MapCamera(center: p, zoom: 15.5, token: (camera?.token ?? 0) + 1) }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 10)
            VStack(spacing: 10) {
                if model.offline {
                    OfflineCard(minutes: model.offlineMinutes) { Task { await model.loadMap() } }
                }
                if !model.offline, let siege = model.siege, let me = app.me {
                    SiegeBanner(duel: siege, ownerSlot: me.slot) { router.push(.duel(siege.id)) }
                }
                if let s = model.suggestion {
                    FirstLoopCard(s: s, onStart: { Task { await env.startRun(RunContext(firstLoop: true)) } }, onDismiss: { model.dismissFirstLoop() })
                } else {
                    HXButton(model.ctaLabel, icon: app.runLocked ? .lock : .play, big: true, disabled: model.waitingGps && !env.mock, minHeight: Target.run,
                             accessibilityHint: app.runLocked ? S.map.runLockedBody : nil) {
                        if app.runLocked { env.openSettings() } else { Task { await env.startRun() } }
                    }
                    .accessibilityLabel(app.runLocked ? S.map.runLocked : S.map.startA11y)
                    .accessibilityIdentifier("start-run")
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 12)
        }
    }
}

/// 03b · Boş: "İlk halkan" önerisi.
struct FirstLoopCard: View {
    let s: FirstLoopSuggestion
    let onStart: () -> Void
    let onDismiss: () -> Void
    @Environment(\.theme) private var t

    var body: some View {
        Panel {
            HStack {
                Text("\(S.map.firstLoopTag) · \(S.map.firstLoopMeta(Fmt.km(s.lengthM, digits: 1), Fmt.area(s.areaM2)))").hx(.label, tone: 2)
                Spacer()
                Tag(label: S.map.firstDay)
            }
            Text(S.map.firstLoopTitle).hx(.title2)
            Text(S.map.firstLoopBody(Fmt.km(s.lengthM, digits: 1))).hx(.body, tone: 2)
            HStack(spacing: 12) {
                ForEach(Array(S.map.firstLoopSteps.enumerated()), id: \.offset) { i, st in
                    HStack(spacing: 6) {
                        Icon(i == 0 ? .start : i == 1 ? .loop : .map, size: 16, color: t.c.ink2)
                        Text(st).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2)
                    }
                }
            }
            HXButton(S.map.firstLoopCta, big: true, action: onStart).accessibilityIdentifier("first-loop-start")
            HXButton(S.map.ownRoute, kind: .ghost, action: onDismiss).frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("first-loop")
    }
}

/// 03b · Hata: çevrimdışı, son bilinen harita soluk.
struct OfflineCard: View {
    let minutes: Int
    let onRetry: () -> Void
    var body: some View {
        Panel {
            HStack(spacing: 8) {
                Icon(.layers, size: 18)
                Text(S.map.offlineTitle).hx(.title2)
            }
            Text(S.map.offlineBody(minutes)).hx(.body, tone: 2)
            HXButton(S.common.retry, kind: .secondary, action: onRetry)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("offline-card")
    }
}

/// 09A · Haritada kuşatma uyarısı (%70 eşiği). Yalnız sen ve saldıran görür.
struct SiegeBanner: View {
    let duel: DuelSummary
    let ownerSlot: Slot
    let onDefend: () -> Void
    @Environment(\.theme) private var t

    var body: some View {
        let name = duel.attacker.firstName
        Panel {
            HStack(spacing: 12) {
                PlayerBadge(slot: duel.attacker.slot, initials: duel.attacker.initials, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(S.map.siegeBanner(name)).font(HXFont.font(.archivo, .bold, 15)).foregroundStyle(t.c.ink)
                    Text(S.map.siegeBannerBody(name, duel.lastAttackAt.map(TRDate.hhmm) ?? "—", duel.loopsToCapture))
                        .font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2)
                }
                Spacer(minLength: 0)
                HXButton(S.map.defend, icon: .defend, action: onDefend)
            }
            HatView(power: duel.power, progress: duel.progress, ownerColor: t.player(ownerSlot), attackerColor: t.player(duel.attacker.slot), size: .sm)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("siege-banner")
    }
}

/// 04 · Bölge detayı (sheet).
struct RegionSheet: View {
    @State private var model: RegionModel
    @Environment(AppEnvironment.self) private var env
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.theme) private var t
    @Environment(\.dismiss) private var dismiss

    init(app: AppModel, cell: String) { _model = State(initialValue: RegionModel(app: app, cell: cell)) }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if let r = model.region.value {
                RegionContent(r: r, me: app.me, onCTA: { cta(r) }, onOpenDuel: { d in
                    router.regionCell = nil
                    router.push(.duel(d.id))
                })
            } else if model.region.isFailed {
                StateBlock(title: S.common.genericError, action: S.common.retry) { Task { await model.load() } }
                    .padding(Space.gutter)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Skeleton(width: 220, height: 30)
                    Skeleton(width: 140, height: 16)
                    Skeleton(height: 8)
                    Skeleton(height: 60)
                    Spacer()
                }
                .padding(Space.gutter)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("region-loading")
            }
            IconButton(.close, label: S.common.close) { dismiss() }.padding(8)
        }
        .background(t.c.surf)
        .task { await model.load() }
    }

    private func cta(_ r: RegionDetail) {
        switch RegionPresenter.cta(r, me: app.me) {
        case .loop, .run:
            router.regionCell = nil
            Task { await env.startRun(r.myDuel.map { RunContext(attackDuelId: $0.id) } ?? RunContext()) }
        case .duel:
            router.regionCell = nil
            router.cover = .duelSelect(DuelSelectRequest(cell: model.cell, defenderId: r.owner?.id))
        }
    }
}

struct RegionContent: View {
    let r: RegionDetail
    let me: Me?
    let onCTA: () -> Void
    let onOpenDuel: (DuelSummary) -> Void
    @Environment(\.theme) private var t

    var body: some View {
        let owner = r.owner
        let mine = RegionPresenter.isMine(r, me: me)
        let ownerColor = owner.map { t.player($0.slot) } ?? t.c.ink3
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        if let o = owner { PlayerBadge(slot: o.slot, initials: o.initials, size: 44, goldFrame: o.goldFrame, hidden: r.hidden) }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(RegionPresenter.title(r, me: me)).hx(.title1).lineLimit(2).accessibilityAddTraits(.isHeader)
                            Text(S.region.meta(r.cells.count, Fmt.area(r.areaM2))).hx(.data, tone: 2)
                        }
                    }
                    .padding(.trailing, 44)
                    ForEach(r.activeEvents.filter(\.active)) { e in Chip(label: RegionPresenter.eventChip(e), icon: .events) }
                    if r.hidden { Text(S.region.hidden).hx(.body, tone: 2) }
                    if let o = owner, !r.hidden {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(o.displayName).font(HXFont.font(.archivo, .bold, 15)).foregroundStyle(t.c.ink)
                                    Text(S.region.ownerSince(r.ownedSinceDays ?? 0, o.teamName)).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 0) {
                                    Text("\(Int(r.avgPower.rounded()))").hx(.title1)
                                    Text(S.common.power).hx(.label, tone: 3)
                                }
                            }
                            HatView(power: r.avgPower, progress: r.myDuel?.progress, ownerColor: ownerColor,
                                    attackerColor: me.map { t.player($0.slot) }, size: .md)
                                .accessibilityIdentifier("region-hat")
                            if let line = RegionPresenter.duelLine(r) { Text(line).hx(.data, tone: 2) }
                        }
                    }
                    HStack(spacing: 12) {
                        Stat(label: S.region.area, value: Fmt.area(r.areaM2))
                        if owner != nil {
                            Stat(label: S.region.ownership, value: r.ownedSinceDays.map(S.region.ownershipDays) ?? "—")
                            Stat(label: S.region.lastDefense, value: r.lastDefenseAt.map { TRDate.relative($0) } ?? S.region.never)
                        }
                    }
                    if r.myDuel != nil, let o = owner { Text(S.region.privateDuel(o.firstName)).hx(.callout, tone: 3) }
                    if let o = owner, !r.hidden, !mine, !o.insignia.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionTitle(S.region.insignia(o.firstName))
                            ForEach(o.insignia, id: \.self) { id in
                                let info = Insignia.byId(id)
                                HStack(alignment: .top) {
                                    Text(info?.name ?? id).font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.ink)
                                    Spacer()
                                    Text(info?.effect ?? "").font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2).multilineTextAlignment(.trailing)
                                }
                            }
                        }
                    }
                    if mine, !r.incomingDuels.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            SectionTitle(S.region.incoming)
                            ForEach(r.incomingDuels) { d in
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(spacing: 10) {
                                        PlayerBadge(slot: d.attacker.slot, initials: d.attacker.initials, size: 28)
                                        Text(d.attacker.displayName).hx(.callout)
                                        Spacer()
                                        HXButton(S.map.defend, kind: .secondary, icon: .defend) { onOpenDuel(d) }
                                    }
                                    HatView(power: d.power, progress: d.progress, ownerColor: ownerColor, attackerColor: t.player(d.attacker.slot), size: .sm)
                                }
                            }
                        }
                    }
                    if !r.history.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionTitle(S.region.history)
                            ForEach(Array(r.history.enumerated()), id: \.offset) { _, h in
                                HStack(alignment: .top, spacing: 12) {
                                    Text(TRDate.shortDate(h.at)).hx(.data, tone: 3).frame(width: 56, alignment: .leading)
                                    Text(h.text).hx(.callout, tone: 2)
                                }
                            }
                        }
                    }
                    if RegionPresenter.slotsFull(r, me: me) { Text(S.region.slotsFull).hx(.callout, tone: 3) }
                }
                .padding(Space.gutter)
            }
            Divider2()
            HXButton(RegionPresenter.cta(r, me: me).label, big: true, action: onCTA)
                .padding(Space.gutter)
                .accessibilityIdentifier("region-cta")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("region")
    }
}

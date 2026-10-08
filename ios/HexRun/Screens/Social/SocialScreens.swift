import SwiftUI
import HexRunKit

/// 11 · Lig: yerel bölge, kategori ve dönem ayrı kontroller; senin satırın altta sabit.
struct LeagueScreen: View {
    @State private var model: LeagueModel
    @Environment(AppEnvironment.self) private var env
    @Environment(\.theme) private var t

    init(app: AppModel) { _model = State(initialValue: LeagueModel(app: app)) }

    var body: some View {
        @Bindable var m = model
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(S.league.title).hx(.title1).accessibilityAddTraits(.isHeader)
                    Text(m.region).hx(.title2, tone: 2)
                }
                .frame(minHeight: 48)
                Segmented(options: [(LeagueScope.individual, S.league.individual), (.team, S.league.team)], value: $m.scope) { _ in Task { await m.load() } }
                    .accessibilityIdentifier("league-scope")
                Segmented(options: [(LeaguePeriod.week, S.league.week), (.month, S.league.month), (.all, S.league.all)], value: $m.period) { _ in Task { await m.load() } }
                    .accessibilityIdentifier("league-period")
                if m.league.value != nil, !m.empty {
                    HStack {
                        Text("\(S.league.metric) · \(m.metric)").hx(.label, tone: 2)
                        Spacer()
                        if let e = m.endsIn() { Text(e).hx(.data, tone: 2) }
                    }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 8)

            if m.loading {
                VStack(alignment: .leading, spacing: 8) {
                    Text(S.league.loading).hx(.callout, tone: 2)
                    ForEach(0..<8, id: \.self) { _ in Skeleton(height: 52) }
                    Spacer()
                }
                .padding(.horizontal, Space.gutter)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("league-loading")
            } else if m.failed && m.league.value == nil {
                StateBlock(title: S.league.errorTitle, action: S.common.retry) { Task { await m.load() } }
                    .padding(.horizontal, Space.gutter)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("league-error")
                Spacer()
            } else if m.empty {
                VStack(alignment: .leading) {
                    StateBlock(title: S.league.emptyTitle, bodyText: S.league.emptyBody(m.region))
                    HXButton(S.map.start, big: true) { Task { await env.startRun() } }
                    Spacer()
                }
                .padding(.horizontal, Space.gutter)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("league-empty")
            } else {
                if let stale = m.staleLabel() {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(S.league.errorTitle).font(HXFont.font(.archivo, .bold, 15)).foregroundStyle(t.c.ink)
                            Text(stale).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2)
                        }
                        Spacer()
                        HXButton(S.common.retry, kind: .secondary) { Task { await m.load() } }
                    }
                    .padding(.horizontal, Space.gutter)
                    .padding(.bottom, 8)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("league-stale")
                }
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(m.league.value?.rows ?? []) { r in LeagueRowView(r: r, faded: m.failed) }
                    }
                    .padding(.bottom, 96)
                }
                .refreshable { await m.load() }
            }
        }
        .background(t.c.bg.ignoresSafeArea())
        .overlay(alignment: .bottom) {
            if let me = m.meRow, !m.loading {
                VStack(alignment: .leading, spacing: 0) {
                    LeagueRowView(r: me, pinned: true)
                    if let note = m.league.value?.meNote {
                        Text(note).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2)
                            .padding(.horizontal, Space.gutter).padding(.bottom, 8)
                    }
                }
                .background(RoundedRectangle(cornerRadius: Radii.m).fill(t.c.surf))
                .overlay(RoundedRectangle(cornerRadius: Radii.m).stroke(t.c.line, lineWidth: 1))
                .padding(8)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await m.load() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("league")
    }
}

struct LeagueRowView: View {
    let r: LeagueRow
    var faded = false
    var pinned = false
    @Environment(\.theme) private var t

    var body: some View {
        HStack(spacing: 12) {
            Text(r.rank > 0 ? "\(r.rank)" : "—").hx(.data, tone: 2).frame(width: 28, alignment: .trailing)
            PlayerBadge(slot: r.slot, initials: r.initials, size: 32, ring: r.isMe)
            VStack(alignment: .leading, spacing: 2) {
                Text(r.isMe ? S.common.you : r.name).font(HXFont.font(.archivo, r.isMe ? .bold : .medium, 15)).foregroundStyle(t.c.ink).lineLimit(1)
                if let s = r.subtitle { Text(s).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2).lineLimit(1) }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(Fmt.int(r.valueM2)).hx(.data)
                if let d = LeagueModel.deltaLabel(r.delta) { Text(d).font(HXFont.font(.mono, .medium, 12)).foregroundStyle(t.c.ink2) }
            }
        }
        .padding(.horizontal, Space.gutter)
        .frame(minHeight: 60)
        .background(r.isMe ? t.c.surf2 : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: pinned ? Radii.m : 0))
        .opacity(faded ? 0.5 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(S.league.rankA11y(r.rank, r.isMe ? S.common.you : r.name, Fmt.area(r.valueM2)))
        .accessibilityIdentifier(pinned ? "league-me" : "league-row-\(r.rank)")
    }
}

/// 12 · Takım: yalnız üyelerin toplam m²'si ile sıralanır; savunma bireysel.
struct TeamScreen: View {
    @State private var model: TeamModel
    @State private var confirmLeave = false
    @Environment(Router.self) private var router
    @Environment(\.theme) private var t

    init(app: AppModel) { _model = State(initialValue: TeamModel(app: app)) }

    var body: some View {
        @Bindable var m = model
        HXScreen(title: S.team.title, large: true, showBack: false) {
            if case let .some(.some(team)) = m.team.value {
                teamView(team)
            } else if m.noTeam {
                VStack(alignment: .leading, spacing: 16) {
                    StateBlock(icon: .team, title: S.team.noTeamTitle, bodyText: S.team.noTeamBody)
                    Card {
                        HXTextField(placeholder: S.team.createPlaceholder, text: $m.name)
                        HXButton(S.team.create, loading: m.busy, disabled: m.name.trimmingCharacters(in: .whitespaces).count < 3) { Task { await m.create() } }
                    }
                    Card {
                        HXTextField(placeholder: S.team.joinPlaceholder, text: $m.code, mono: true).textInputAutocapitalization(.characters)
                        HXButton(S.team.join, kind: .secondary, loading: m.busy, disabled: m.code.trimmingCharacters(in: .whitespaces).count < 4) { Task { await m.join() } }
                    }
                    if let e = m.error { Text(e).hx(.callout) }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("no-team")
            } else if m.team.isFailed {
                StateBlock(title: S.common.genericError, action: S.common.retry) { Task { await m.load() } }
            } else {
                Skeleton(width: 220, height: 36)
                Skeleton(height: 60)
                Skeleton(height: 120)
            }
        }
        .task { await m.load() }
        .confirmationDialog(S.team.leave, isPresented: $confirmLeave, titleVisibility: .visible) {
            Button(S.team.leave, role: .destructive) { Task { await m.leave() } }
            Button(S.common.cancel, role: .cancel) {}
        } message: { Text(S.team.leaveConfirm) }
    }

    private func teamView(_ team: TeamResponse) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(team.name).hx(.title1).accessibilityAddTraits(.isHeader)
                Text(model.subtitle(team)).hx(.callout, tone: 2)
            }
            HStack(spacing: 12) {
                Stat(label: S.team.shared, value: Fmt.area(team.territoryM2))
                Stat(label: S.team.week, value: "+\(Fmt.area(team.weekGainM2))")
                Stat(label: S.team.cellsLabel, value: Fmt.int(team.cells))
            }
            if let l = model.league.value, !l.rows.isEmpty {
                Card {
                    SectionTitle(S.team.leagueTitle(l.regionName)) {
                        Button(S.team.toLeague) { router.tab = .league }.font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.ink).frame(minHeight: Target.min)
                    }
                    ForEach(l.rows.prefix(3)) { r in
                        HStack(spacing: 10) {
                            Text("\(r.rank)").hx(.data, tone: 2).frame(width: 20)
                            Text(r.name).font(HXFont.font(.archivo, r.isMe || r.id == team.id ? .bold : .medium, 15)).foregroundStyle(t.c.ink)
                            Spacer()
                            Text("\(Fmt.int(r.valueM2)) m²").hx(.data)
                        }
                        .frame(minHeight: 36)
                    }
                }
            }
            SectionTitle(S.team.membersTitle)
            ForEach(team.members, id: \.player.id) { mem in
                HStack(spacing: 12) {
                    PlayerBadge(slot: mem.player.slot, initials: mem.player.initials, size: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(mem.player.displayName).font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.ink)
                        if mem.role == .captain { Text(S.team.captainRole).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2) }
                    }
                    Spacer()
                    Text(Fmt.int(mem.territoryM2)).hx(.data)
                }
                .frame(minHeight: 48)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(mem.player.displayName), \(Fmt.area(mem.territoryM2))")
            }
            if let code = team.inviteCode {
                ShareLink(item: S.friends.inviteMessage(code)) {
                    HStack(spacing: 8) {
                        Icon(.share, size: 20)
                        Text(S.team.inviteCode(code)).font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.ink)
                    }
                    .frame(maxWidth: .infinity, minHeight: Target.min)
                    .background(RoundedRectangle(cornerRadius: Radii.m).fill(t.c.surf2))
                }
            }
            Text(S.team.noTeamBody).hx(.callout, tone: 3)
            HXButton(S.team.leave, kind: .danger) { confirmLeave = true }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("team")
    }
}

/// 12 · Etkinlik: aktif pencere ve diğer çarpanlar; sayaçlar yerel `eventWindow` ile.
struct EventsScreen: View {
    @State private var model: EventsModel
    @Environment(AppEnvironment.self) private var env
    @Environment(\.theme) private var t

    init(app: AppModel) { _model = State(initialValue: EventsModel(app: app)) }

    var body: some View {
        let m = model
        HXScreen(title: S.events.title, large: true, showBack: false) {
            if let hero = m.hero {
                Card {
                    HStack {
                        Text(S.events.nowEverywhere(hero.window)).hx(.label, tone: 2)
                        Spacer()
                        if let e = hero.endsInMin {
                            let hm = EventsModel.hm(e)
                            Text(S.events.remaining(hm.h, hm.m)).hx(.data).accessibilityIdentifier("event-countdown")
                        }
                    }
                    Text(hero.name).hx(.title1)
                    Text(hero.description).hx(.body, tone: 2)
                    if hero.participantsToday > 0 { Text(S.events.participants(Fmt.int(hero.participantsToday))).hx(.callout) }
                    HXButton(S.map.start, big: true) { Task { await env.startRun() } }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("event-hero")
            } else {
                StateBlock(icon: .events, title: S.events.noneActive, bodyText: S.events.noneActiveBody)
            }
            SectionTitle(S.events.others)
            Card {
                ForEach(Array(m.others.enumerated()), id: \.offset) { i, e in
                    if i > 0 { Divider2() }
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.name + (e.active ? " · \(S.events.active)" : "")).font(HXFont.font(.archivo, .bold, 15)).foregroundStyle(t.c.ink)
                            Text(m.label(e)).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2)
                        }
                        .accessibilityElement(children: .combine)
                        Spacer()
                        if e.active {
                            Text(EventsPresenter.endsAtLabel(e.endsInMin, now: m.now) ?? "").hx(.data)
                        } else {
                            VStack(alignment: .trailing, spacing: 4) {
                                let hm = EventsModel.hm(e.startsInMin)
                                Text(S.events.startsIn(hm.h, hm.m)).hx(.data, tone: 2)
                                HXButton(m.isReminded(e.id) ? S.events.reminded : S.events.remind, kind: m.isReminded(e.id) ? .secondary : .ghost) {
                                    Task { await m.toggleRemind(e) }
                                }
                            }
                        }
                    }
                    .frame(minHeight: 48)
                }
            }
            Text(S.events.rules).hx(.callout, tone: 3)
        }
        .task {
            m.reminders = env.push
            await m.load()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                m.tick()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("events")
    }
}

/// 13 · Bildirim merkezi: filtreler + satır içi eylem (Savun, Geri al).
struct NotificationsScreen: View {
    @State private var model: NotificationsModel
    @Environment(AppEnvironment.self) private var env
    @Environment(\.theme) private var t

    init(app: AppModel) { _model = State(initialValue: NotificationsModel(app: app)) }

    var body: some View {
        let m = model
        HXScreen(title: S.notifications.title, right: {
            Button(S.notifications.markRead) { Task { await m.markRead() } }
                .font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.ink)
                .frame(minHeight: Target.min).padding(.horizontal, 8)
                .accessibilityIdentifier("mark-read")
        }) {
            HStack(spacing: 8) {
                ForEach(NotificationFilter.allCases, id: \.self) { f in
                    Chip(label: S.notifications.filters[f] ?? f.rawValue, selected: m.filter == f) { Task { await m.select(f) } }
                        .accessibilityIdentifier("filter-\(f.rawValue)")
                }
            }
            if m.items.value == nil && !m.items.isFailed {
                ForEach(0..<5, id: \.self) { _ in Skeleton(height: 56) }
            } else if m.items.isFailed && (m.items.value ?? []).isEmpty {
                StateBlock(title: S.notifications.error, action: S.common.retry) { Task { await m.load() } }
            } else if (m.items.value ?? []).isEmpty {
                StateBlock(icon: .bell, title: S.notifications.empty).accessibilityElement(children: .contain).accessibilityIdentifier("notifications-empty")
            } else {
                ForEach(m.sections()) { sec in
                    Text(sec.title).hx(.label, tone: 2).accessibilityAddTraits(.isHeader).padding(.top, 8)
                    ForEach(sec.items) { n in
                        NotificationRow(n: n, onOpen: {
                            Task { if let link = await m.open(n) { env.router.handle(link) } }
                        }, onAction: {
                            if let link = DeepLink.parse(n.action?.deeplink) { env.router.handle(link) }
                        })
                    }
                }
                if m.nextCursor != nil {
                    HXButton(S.notifications.loadMore, kind: .ghost) { Task { await m.loadMore() } }
                }
            }
        }
        .task { await m.load() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("notifications")
    }
}

struct NotificationRow: View {
    let n: NotificationDto
    let onOpen: () -> Void
    let onAction: () -> Void
    @Environment(\.theme) private var t

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            icon
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .top, spacing: 8) {
                    Text(n.title).font(HXFont.font(.archivo, n.read ? .medium : .bold, 15)).foregroundStyle(t.c.ink)
                    Spacer()
                    Text(NotificationsModel.timeLabel(n)).font(HXFont.font(.mono, .medium, 12)).foregroundStyle(t.c.ink3)
                }
                Text(n.body).font(HXFont.font(.archivo, .medium, 14)).foregroundStyle(t.c.ink2)
                if let a = n.action {
                    HXButton(a.label, action: onAction).padding(.top, 6).accessibilityIdentifier("notif-action-\(n.id)")
                }
            }
            if !n.read { Circle().fill(t.c.ink).frame(width: 8, height: 8).padding(.top, 6).accessibilityHidden(true) }
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
        .onTapGesture(perform: onOpen)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(n.read ? "" : "Okunmamış. ")\(n.title). \(n.body)")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("notif-\(n.id)")
    }

    /// Oyun dilinden ikon: kuşatma = tarama, el değiştirme = iki renk, erime = hayalet segment.
    @ViewBuilder private var icon: some View {
        let box = RoundedRectangle(cornerRadius: 12)
        switch NotificationsModel.icon(n.kind) {
        case .hatch:
            Canvas { ctx, sz in
                var p = Path()
                var x: CGFloat = -sz.height
                while x < sz.width { p.move(to: CGPoint(x: x, y: sz.height)); p.addLine(to: CGPoint(x: x + sz.height, y: 0)); x += 6 }
                ctx.stroke(p, with: .color(t.c.ink), lineWidth: 2.5)
            }
            .frame(width: 40, height: 40).background(t.c.surf2).clipShape(box)
        case .swap:
            ZStack {
                box.fill(t.c.surf2)
                RoundedRectangle(cornerRadius: 4).fill(t.player(.gul)).frame(width: 18, height: 18).offset(x: -4, y: -4)
                RoundedRectangle(cornerRadius: 4).fill(t.player(.keh)).frame(width: 18, height: 18)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(t.c.casing, lineWidth: 1.5)).offset(x: 4, y: 4)
            }
            .frame(width: 40, height: 40)
        case .ghost:
            HStack(spacing: 2) {
                ForEach(Array([1.0, 1.0, 0.32, 0].enumerated()), id: \.offset) { _, o in
                    RoundedRectangle(cornerRadius: 1).fill(o > 0 ? t.player(.keh).opacity(o) : t.c.track).frame(height: 8)
                }
            }
            .padding(.horizontal, 6).frame(width: 40, height: 40).background(box.fill(t.c.surf2))
        case .events: Icon(.events, size: 20).frame(width: 40, height: 40).background(box.fill(t.c.surf2))
        case .team: Icon(.team, size: 20).frame(width: 40, height: 40).background(box.fill(t.c.surf2))
        case .eye: Icon(.eye, size: 20).frame(width: 40, height: 40).background(box.fill(t.c.surf2))
        case .defend: Icon(.defend, size: 20).frame(width: 40, height: 40).background(box.fill(t.c.surf2))
        case .bell: Icon(.bell, size: 20).frame(width: 40, height: 40).background(box.fill(t.c.surf2))
        }
    }
}

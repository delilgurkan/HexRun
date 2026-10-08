import SwiftUI
import HexRunKit

/// Profil: haritadaki avatardan açılır. İstatistik · Rozetler (Nişanlar) · Arkadaşlar.
struct ProfileScreen: View {
    @State private var tab: ProfileTab
    @State private var stats: StatsModel
    @State private var badges: BadgesModel
    @State private var friends: FriendsModel
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    init(app: AppModel, tab: ProfileTab) {
        _tab = State(initialValue: tab)
        _stats = State(initialValue: StatsModel(app: app))
        _badges = State(initialValue: BadgesModel(app: app))
        _friends = State(initialValue: FriendsModel(app: app))
    }

    var body: some View {
        HXScreen(title: S.profile.title, right: {
            IconButton(.gear, label: S.profile.settings) { router.push(.settings) }
        }) {
            if let me = app.me {
                HStack(spacing: 12) {
                    PlayerBadge(slot: me.slot, initials: me.initials, size: 56, goldFrame: me.goldFrame, ring: true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(me.displayName).hx(.title2)
                        Text("@\(me.username)" + (me.teamName.map { " · \($0)" } ?? "")).hx(.callout, tone: 2)
                    }
                }
            } else {
                Skeleton(height: 56)
            }
            Segmented(options: [(ProfileTab.stats, S.profile.stats), (.badges, S.profile.badges), (.friends, S.profile.friends)], value: $tab)
            if let me = app.me {
                switch tab {
                case .stats: StatsTab(model: stats, me: me)
                case .badges: BadgesTab(model: badges, me: me)
                case .friends: FriendsTab(model: friends)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile")
    }
}

/// 10 · İstatistik: önce toprak (silüet), sonra savunma ve seri.
struct StatsTab: View {
    let model: StatsModel
    let me: Me
    @Environment(\.theme) private var t

    var body: some View {
        Group {
            if let s = model.stats.value {
                content(s)
            } else if model.stats.isFailed {
                StateBlock(title: S.common.genericError, action: S.common.retry) { Task { await model.load() } }
            } else {
                VStack(spacing: 12) { Skeleton(height: 96); Skeleton(height: 60); Skeleton(height: 60) }
            }
        }
        .task { await model.load() }
    }

    private func content(_ s: StatsResponse) -> some View {
        let heights = StatsModel.barHeights(s)
        return VStack(alignment: .leading, spacing: 16) {
            Card {
                Text(S.stats.territory).hx(.label, tone: 2)
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(Fmt.area(s.territoryM2)).hx(.title1)
                        Text(S.stats.territoryMeta(s.cells, s.regionName, s.regionRank)).hx(.callout, tone: 2)
                    }
                    Spacer()
                    if !s.silhouettes.isEmpty { SilhouetteView(rings: s.silhouettes, color: t.player(me.slot), stroke: t.c.casing).frame(width: 96, height: 72) }
                }
            }
            HStack(spacing: 16) {
                Stat(label: S.stats.monthDistance(TRDate.monthName(Date())), value: "\(Fmt.km(s.monthDistanceM, digits: 1)) km")
                Stat(label: S.stats.avgPace, value: "\(Fmt.pace(s.avgPaceSecPerKm))/km")
            }
            HStack(spacing: 16) {
                Stat(label: S.stats.defense, value: "\(s.defenses.won) / \(s.defenses.total)")
                Stat(label: S.stats.biggestLoop, value: Fmt.area(s.biggestLoopM2))
            }
            Card {
                HStack(spacing: 8) {
                    Icon(.streak)
                    Text(S.stats.streak(s.streakDays)).hx(.title2)
                    Spacer()
                    Text(S.stats.bestStreak(s.bestStreakDays)).hx(.data, tone: 2)
                }
                Text(S.stats.last14).hx(.label, tone: 3)
                HStack(alignment: .bottom, spacing: 4) {
                    ForEach(Array(s.last14Days.enumerated()), id: \.offset) { i, d in
                        RoundedRectangle(cornerRadius: 2).fill(d.ran ? t.player(me.slot) : t.c.track)
                            .frame(maxWidth: .infinity).frame(height: heights[i])
                    }
                }
                .frame(height: 40, alignment: .bottom)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(S.stats.last14): \(s.last14Days.filter(\.ran).count) gün koşu")
            }
            SectionTitle(S.stats.recent)
            if s.recent.isEmpty {
                Text(S.stats.noRecent).hx(.body, tone: 2)
            } else {
                Card {
                    ForEach(Array(s.recent.enumerated()), id: \.offset) { i, r in
                        if i > 0 { Divider2() }
                        HStack(spacing: 12) {
                            Text("\(TRDate.relative(r.at).split(separator: " ").first.map(String.init) ?? "") · \(r.text)").hx(.callout)
                            Spacer()
                            Text(r.delta).hx(.data)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            Text("\(Fmt.int(s.cells)) petek").hx(.data, tone: 3)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("stats")
    }
}

/// 10b · Rozetler: boş (yapılacaklar), yükleniyor (iskelet), hata (son bilinen sayı korunur).
struct BadgesTab: View {
    let model: BadgesModel
    let me: Me
    @Environment(AppEnvironment.self) private var env
    @Environment(Router.self) private var router
    @Environment(\.theme) private var t

    var body: some View {
        Group {
            if let data = model.badges.value {
                if data.earned == 0 { empty(data) } else { full(data) }
            } else if model.badges.isFailed {
                let known = model.lastKnown
                VStack(alignment: .leading, spacing: 12) {
                    Text(S.badges.errorTitle).hx(.title2)
                    Text(S.badges.errorBody(known.earned, known.total)).hx(.body, tone: 2)
                    HXButton(S.common.retry, kind: .secondary) { Task { await model.load() } }
                    Text(S.common.errorCode(model.errorCode)).hx(.data, tone: 3)
                }
                .padding(.vertical, 12)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("badges-error")
            } else {
                ZStack(alignment: .topLeading) {
                    HexTexture()
                    VStack(alignment: .leading, spacing: 12) {
                        Text(S.badges.loading).hx(.title2)
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                            ForEach(0..<9, id: \.self) { _ in Skeleton(height: 96, radius: Radii.m - 6) }
                        }
                    }
                }
                .frame(minHeight: 320, alignment: .top)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(S.badges.loading)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("badges-loading")
            }
        }
        .task { await model.load() }
    }

    private func progressBar(_ b: BadgeDto) -> some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(t.c.track)
                Capsule().fill(t.c.ink).frame(width: g.size.width * min(1, b.progressTarget > 0 ? b.progressValue / b.progressTarget : 0))
            }
        }
        .frame(height: 6)
    }

    private func empty(_ data: BadgesResponse) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(S.badges.emptyTitle).hx(.title2)
            Text(S.badges.emptyBody(data.total)).hx(.body, tone: 2)
            ForEach(model.nearest) { b in
                Card {
                    HStack {
                        Text(b.name).font(HXFont.font(.archivo, .bold, 15)).foregroundStyle(t.c.ink)
                        Spacer()
                        Text("\(Int(b.progressValue))/\(Int(b.progressTarget))").hx(.data, tone: 2)
                    }
                    Text(b.how).hx(.callout, tone: 2)
                    progressBar(b)
                }
            }
            HXButton(S.badges.emptyCta, big: true) { Task { await env.startRun() } }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("badges-empty")
    }

    private func full(_ data: BadgesResponse) -> some View {
        let byId = Dictionary(data.badges.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let filled = data.slots.compactMap { $0 }.count
        return VStack(alignment: .leading, spacing: 16) {
            if model.showIntro {
                Card {
                    Text(S.badges.unlockedTitle).hx(.title2)
                    Text(S.badges.unlockedBody).hx(.body, tone: 2)
                    ForEach(Array(S.badges.unlockedPoints.enumerated()), id: \.offset) { i, p in
                        HStack(alignment: .top, spacing: 10) {
                            Text("0\(i + 1)").hx(.data, tone: 3)
                            Text(p).hx(.callout)
                        }
                    }
                    HXButton(S.common.done) { model.dismissIntro() }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("insignia-intro")
            }
            SectionTitle(S.badges.insignia) { Text(S.badges.insigniaMeta(filled)).hx(.data, tone: 2) }
            HStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { i in
                    let b = (i < data.slots.count ? data.slots[i] : nil).flatMap { byId[$0] }
                    Button { if let b { router.push(.badge(b.id)) } } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(b?.name ?? S.badges.emptySlot).font(HXFont.font(.archivo, .bold, 13)).foregroundStyle(t.c.ink).lineLimit(2)
                            if let e = b?.insignia?.effect { Text(e).font(HXFont.font(.archivo, .medium, 12)).foregroundStyle(t.c.ink2).lineLimit(3) }
                            Spacer(minLength: 0)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
                        .background(RoundedRectangle(cornerRadius: Radii.m - 6).fill(b != nil ? t.c.surf : Color.clear))
                        .overlay(RoundedRectangle(cornerRadius: Radii.m - 6).stroke(t.c.line2, style: StrokeStyle(lineWidth: 1, dash: b == nil ? [4, 3] : [])))
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityLabel(b.map { "\($0.name): \($0.insignia?.effect ?? "")" } ?? S.badges.emptySlot)
                    .accessibilityIdentifier("slot-\(i)")
                }
            }
            Text(S.badges.insigniaNote).hx(.callout, tone: 3)
            SectionTitle(S.badges.collection) { Text(S.badges.collectionMeta(data.earned, data.total)).hx(.data, tone: 2) }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(data.badges) { b in
                    Button { router.push(.badge(b.id)) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Icon(b.insignia != nil ? .defend : .map, size: 20, color: b.earned ? t.c.ink : t.c.ink3, fill: b.earned ? t.c.surf2 : nil)
                            Text(b.name).font(HXFont.font(.archivo, .semibold, 13)).foregroundStyle(b.earned ? t.c.ink : t.c.ink2).lineLimit(2)
                            if !b.earned { progressBar(b) }
                            Spacer(minLength: 0)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
                        .background(RoundedRectangle(cornerRadius: Radii.m - 6).fill(b.earned ? t.c.surf : Color.clear))
                        .overlay(RoundedRectangle(cornerRadius: Radii.m - 6).stroke(b.earned ? t.c.line2 : t.c.line, style: StrokeStyle(lineWidth: 1, dash: b.earned ? [] : [4, 3])))
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityLabel("\(b.name). \(b.earned ? "Kazanıldı" : "\(Int(b.progressValue))/\(Int(b.progressTarget))"). \(b.how)")
                    .accessibilityIdentifier("badge-\(b.id)")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("badges")
    }
}

/// 14B · Rozet detayı: hangi nişanın yerine takılacak (günde 1 değişiklik, koşuda kilitli).
struct BadgeDetailScreen: View {
    let id: String
    @State private var model: BadgesModel
    @State private var chosen: Int?
    @Environment(RunController.self) private var run
    @Environment(\.theme) private var t
    @Environment(\.dismiss) private var dismiss

    init(app: AppModel, id: String) {
        self.id = id
        _model = State(initialValue: BadgesModel(app: app))
    }

    var body: some View {
        Group {
            if let data = model.badges.value, data.badges.contains(where: { $0.id == id }) {
                detail(data)
            } else {
                HXScreen(title: S.badges.title) { Skeleton(height: 120) }
            }
        }
        .task { await model.load() }
    }

    private func detail(_ data: BadgesResponse) -> some View {
        let plan = InsigniaPlan(data: data, badgeId: id, chosen: chosen, running: run.isActive)
        let b = plan.badge
        let byId = Dictionary(data.badges.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return HXScreen(title: b.name, footer: {
            if b.earned && plan.slottable {
                if plan.equippedAt != nil {
                    HXButton(S.badges.unequip, kind: .secondary, big: true, loading: model.saving, disabled: plan.locked) {
                        Task { if await model.setSlots(plan.unequipSlots(data.slots)) { dismiss() } }
                    }
                } else {
                    HXButton(plan.targetBadge.map { S.badges.equipInto($0.name) } ?? S.badges.equipEmpty, big: true, loading: model.saving,
                             disabled: plan.locked || plan.target == nil) {
                        Task { if await model.setSlots(plan.equipSlots(data.slots)) { dismiss() } }
                    }
                    .accessibilityIdentifier("equip")
                }
            }
        }) {
            Text(plan.kicker).hx(.label, tone: 2)
            Text(b.name).hx(.title1).accessibilityAddTraits(.isHeader)
            if let ins = b.insignia { Text(ins.effect).hx(.title2) } else { Text(S.badges.notInsignia).hx(.body, tone: 2) }
            Card {
                SectionTitle(S.badges.howTo)
                Text(b.how).hx(.body)
                if let ins = b.insignia {
                    SectionTitle(S.badges.counter)
                    Text(ins.counter).hx(.body)
                    if !ins.slot { Text(S.badges.alwaysOn).hx(.data, tone: 2) }
                }
            }
            if b.earned && plan.slottable && plan.equippedAt == nil {
                SectionTitle(S.badges.replaceWhich)
                ForEach(0..<3, id: \.self) { i in
                    let cur = (i < data.slots.count ? data.slots[i] : nil).flatMap { byId[$0] }
                    let sel = plan.target == i
                    Button { chosen = i } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(cur?.name ?? S.badges.emptySlot).font(HXFont.font(.archivo, .bold, 15)).foregroundStyle(t.c.ink)
                            if let e = cur?.insignia?.effect { Text(e).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2) }
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, minHeight: Target.min + 8, alignment: .leading)
                        .overlay(RoundedRectangle(cornerRadius: Radii.m - 6).stroke(sel ? t.c.ink : t.c.line2, lineWidth: sel ? 2 : 1))
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityAddTraits(sel ? [.isSelected, .isButton] : .isButton)
                }
                Text(plan.locked ? S.badges.changeUsed : S.badges.changeNote).hx(.callout, tone: 3)
            }
            if let e = model.error { Text(e).hx(.callout) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("badge-detail")
    }
}

/// 11 + 18B · Arkadaşlar: oyun ilişkisi listesi ve alkışlı akış.
struct FriendsTab: View {
    let model: FriendsModel
    @State private var view = 0
    @Environment(Router.self) private var router
    @Environment(\.theme) private var t

    var body: some View {
        @Bindable var m = model
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Segmented(options: [(0, S.friends.feed), (1, S.friends.list)], value: $view)
                if let msg = m.inviteMessage {
                    ShareLink(item: msg) {
                        HStack(spacing: 6) {
                            Icon(.plus, size: 18, color: t.c.invInk)
                            Text(S.friends.invite).font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.invInk)
                        }
                        .padding(.horizontal, 14)
                        .frame(minHeight: Target.min)
                        .background(RoundedRectangle(cornerRadius: Radii.m).fill(t.c.inv))
                    }
                }
            }
            if view == 1 { list(m) } else { feed(m) }
        }
        .task {
            if let code = router.inviteCode {
                router.inviteCode = nil
                m.code = code
                view = 1
            }
            await m.load()
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("friends")
    }

    @ViewBuilder private func list(_ fm: FriendsModel) -> some View {
        @Bindable var m = fm
        if let f = m.friends.value {
            Text(S.friends.count(f.friends.count)).hx(.label, tone: 2)
            if f.friends.isEmpty {
                Text(S.friends.empty).hx(.body, tone: 2)
            } else {
                Card {
                    ForEach(Array(f.friends.enumerated()), id: \.offset) { i, fr in
                        if i > 0 { Divider2() }
                        HStack(spacing: 12) {
                            PlayerBadge(slot: fr.player.slot, initials: fr.player.initials, size: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(fr.player.displayName).font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.ink)
                                Text(fr.relation).font(HXFont.font(.archivo, .medium, 13)).foregroundStyle(t.c.ink2)
                            }
                            Spacer()
                            if fr.status == .besieging_you { Icon(.siege, size: 20) } else if fr.status == .running { Icon(.pace, size: 20) }
                        }
                        .frame(minHeight: 52)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(fr.player.displayName), \(fr.relation)")
                    }
                }
            }
            Card {
                Text(S.friends.addByCode).hx(.label, tone: 2)
                HStack(spacing: 8) {
                    HXTextField(placeholder: S.friends.codePlaceholder, text: $m.code, mono: true).textInputAutocapitalization(.characters)
                    HXButton(S.friends.add, loading: m.accepting, disabled: m.code.trimmingCharacters(in: .whitespaces).count < 4) { Task { await m.accept() } }
                }
                if let e = m.error { Text(e).hx(.callout) }
            }
        } else if m.friends.isFailed {
            StateBlock(title: S.common.genericError, action: S.common.retry) { Task { await m.load() } }
        } else {
            Skeleton(height: 160)
        }
    }

    @ViewBuilder private func feed(_ m: FriendsModel) -> some View {
        if let items = m.feed.value, !items.isEmpty {
            ForEach(items) { f in FeedRow(f: f) { Task { await m.clap(f.id) } } }
            if m.nextCursor != nil { HXButton(S.notifications.loadMore, kind: .ghost) { Task { await m.loadMore() } } }
        } else if m.feed.isFailed {
            StateBlock(title: S.common.genericError, action: S.common.retry) { Task { await m.loadFeed() } }
        } else if m.feed.value == nil {
            Skeleton(height: 160)
        } else {
            Text(S.friends.feedEmpty).hx(.body, tone: 2)
        }
    }
}

struct FeedRow: View {
    let f: FeedItem
    let onClap: () -> Void
    @Environment(\.theme) private var t

    var body: some View {
        Card {
            HStack(spacing: 10) {
                PlayerBadge(slot: f.player.slot, initials: f.player.initials, size: 32)
                Text("\(f.player.displayName) · \(f.timeLabel)").font(HXFont.font(.archivo, .semibold, 15)).foregroundStyle(t.c.ink)
            }
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.title).hx(.title2)
                    Text(f.subtitle).hx(.callout, tone: 2)
                }
                Spacer()
                if let sil = f.silhouette, !sil.isEmpty { SilhouetteView(rings: sil, color: t.player(f.player.slot), stroke: t.c.casing).frame(width: 72, height: 56) }
            }
            Button { if !f.clappedByMe { onClap() } } label: {
                HStack(spacing: 6) {
                    Icon(.clap, size: 18, color: f.clappedByMe ? t.c.invInk : t.c.ink)
                    Text("\(f.claps)").hx(.data, color: f.clappedByMe ? t.c.invInk : t.c.ink)
                }
                .padding(.horizontal, 12)
                .frame(minHeight: Target.min)
                .background(Capsule().fill(f.clappedByMe ? t.c.inv : t.c.surf2))
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel(S.friends.clapA11y(f.claps, f.clappedByMe))
            .accessibilityAddTraits(f.clappedByMe ? .isSelected : [])
            .accessibilityIdentifier("clap-\(f.id)")
        }
    }
}

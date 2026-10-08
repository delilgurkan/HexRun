import Foundation

/// Örnek veriler: önizlemeler, birim testleri ve `-uiTestMockAPI` sahte sunucusu için.
/// Değerler tasarım panolarındaki örneklerle aynıdır (Moda, Deniz Arslan, Selin, Emre…).
public enum Fixtures {
    public static let moda = LatLng(lat: 40.9819, lng: 29.0254)
    static let t0 = ISODate.parse("2026-10-04T03:29:00Z")!
    static let t1 = ISODate.parse("2026-10-04T04:14:00Z")!

    public static func player(_ id: String, _ name: String, _ slot: Slot, _ ini: String, team: String? = nil) -> PublicPlayer {
        PublicPlayer(id: id, username: name.lowercased().replacingOccurrences(of: " ", with: ""), displayName: name, initials: ini, slot: slot, teamName: team)
    }

    public static let emre = player("emre", "Emre Şahin", .lim, "EŞ")
    public static let selin = player("selin", "Selin Aydın", .gul, "SA")
    public static let zeynep = player("zeynep", "Zeynep Çelik", .gok, "ZÇ")

    public static let me = Me(
        id: "me", username: "denizkosar", displayName: "Deniz Arslan", initials: "DA", slot: .keh, teamName: "Moda Rüzgarı",
        insignia: ["oncu"], goldFrame: false, email: "deniz@example.com", createdAt: ISODate.parse("2026-08-01T00:00:00Z")!,
        newbieDaysLeft: 0, teamId: "t1", privacy: PrivacyState(enabled: false, radiusM: nil), canChangeInsignia: true, locale: "tr"
    )

    public static var mePlayer: PublicPlayer { me.asPlayer }

    public static func auth(needsProfile: Bool = false) -> AuthResponse {
        AuthResponse(accessToken: "mock-access", refreshToken: "mock-refresh", expiresIn: 900, user: me, needsProfile: needsProfile)
    }

    /// Moda çevresindeki gerçek res-12 petekleri: bizim alan, Selin'in kuşattığı kısım ve Emre'nin alanı.
    public static var mapCells: [MapCell] {
        let center = H3.cellOf(moda)
        var mine = [center] + H3.neighbors(center)
        mine += mine.flatMap(H3.neighbors)
        mine = Array(Set(mine)).sorted()
        let east = H3.cellOf(Geo.destination(moda, bearingDeg: 90, distM: 160))
        var rival = [east] + H3.neighbors(east)
        rival = rival.filter { !mine.contains($0) }
        let mineCells = mine.enumerated().map { i, id in
            MapCell(id: id, ownerId: "me", power: 85, slot: .keh, duel: i < 6 ? .defending : nil, progress: i < 6 ? 60 : nil, attackerSlot: i < 6 ? .gul : nil, ghost: i % 5 == 0 ? 9 : 0)
        }
        let rivalCells = rival.map { MapCell(id: $0, ownerId: "emre", power: 55, slot: .lim) }
        return mineCells + rivalCells
    }

    public static var map: MapResponse {
        let cells = mapCells
        return MapResponse(
            cells: cells,
            players: [
                MapPlayer(id: "me", displayName: "Deniz Arslan", initials: "DA", slot: .keh, goldFrame: false, hidden: false, marker: moda, cells: cells.filter { $0.ownerId == "me" }.count),
                MapPlayer(id: "emre", displayName: "Emre Şahin", initials: "EŞ", slot: .lim, goldFrame: false, hidden: false, marker: Geo.destination(moda, bearingDeg: 90, distM: 160), cells: cells.filter { $0.ownerId == "emre" }.count),
            ],
            attackersLast48h: 3,
            activeEvents: EventsPresenter.activeNow(),
            truncated: false,
            serverTime: Date()
        )
    }

    public static var duelDefending: DuelSummary {
        let cells = mapCells.filter { $0.duel == .defending }.map(\.id)
        return DuelSummary(
            id: "d9", status: .active, attacker: selin, defender: mePlayer, cells: cells, hp: 25, power: 85, progress: 60,
            createdAt: Date().addingTimeInterval(-86_400), firstCountedAt: Date().addingTimeInterval(-80_000), lastAttackAt: Date().addingTimeInterval(-3_600),
            attacksToday: 1, attackLimitToday: 2, defensesToday: 0, loopsToCapture: 2,
            route: H3.boundary(cells.first ?? H3.cellOf(moda)), routeLengthM: 2_900, expiresAt: nil
        )
    }

    public static var duelAttacking: DuelSummary {
        let cells = mapCells.filter { $0.ownerId == "emre" }.map(\.id)
        return DuelSummary(
            id: "d1", status: .active, attacker: mePlayer, defender: emre, cells: cells, hp: 35, power: 55, progress: 20,
            createdAt: Date().addingTimeInterval(-7_200), firstCountedAt: nil, lastAttackAt: nil,
            attacksToday: 0, attackLimitToday: 2, defensesToday: 0, loopsToCapture: 4,
            route: cells.first.map(H3.boundary) ?? [], routeLengthM: 4_600, expiresAt: Date().addingTimeInterval(40 * 3_600)
        )
    }

    public static var duels: DuelsResponse { DuelsResponse(attacking: [duelAttacking], defending: [duelDefending]) }

    public static func region(cell: String) -> RegionDetail {
        let cells = mapCells
        let c = cells.first { $0.id == cell }
        let owner: PublicPlayer? = c?.ownerId == "me" ? mePlayer : c?.ownerId == "emre" ? emre : nil
        let ids = cells.filter { $0.ownerId != nil && $0.ownerId == c?.ownerId }.map(\.id)
        return RegionDetail(
            owner: owner, hidden: false, cells: owner == nil ? [cell] : ids, areaM2: H3.areaM2(owner == nil ? [cell] : ids),
            avgPower: owner == nil ? 0 : (c?.power ?? 0), ownedSinceDays: owner == nil ? nil : 34,
            lastDefenseAt: owner == nil ? nil : Date().addingTimeInterval(-90_000),
            myDuel: owner?.id == "emre" ? duelAttacking : nil,
            incomingDuels: owner?.id == "me" ? [duelDefending] : [],
            history: owner == nil ? [] : [RegionHistoryItem(at: Date().addingTimeInterval(-34 * 86_400), text: "\(owner!.displayName) aldı")],
            activeEvents: EventsPresenter.activeNow(), canStartDuel: owner?.id == "emre" ? false : owner != nil && owner?.id != "me",
            duelSlotsLeft: 2
        )
    }

    static func loop(newCells: Int = 14, captured: Int = 48, cells: Int = 62, gained: Double = 19_220, status: LoopStatus = .applied, hits: [DuelHitDto] = []) -> LoopResult {
        LoopResult(index: 1, status: status, closedAt: t1, lengthM: 3_000, areaM2: 19_220, cells: cells, newCells: newCells, reinforced: 0,
                   capturedCells: captured, gainedAreaM2: gained, hits: hits, multipliers: Multipliers(gain: 2, attack: 2, pushback: 1))
    }

    static func summaryBase(id: String = "run-1") -> RunSummary {
        RunSummary(id: id, source: .phone, startedAt: t0, endedAt: t1, distanceM: 8_400, durationMs: 45 * 60_000 + 13_000, paceSecPerKm: 323,
                   loops: [], openGapM: nil, status: .applied, review: nil, newBadges: [], streakDays: 35, monthDistanceM: 126_400,
                   suggestions: [], totalGainedAreaM2: 0)
    }

    public static var summaryClosed: RunSummary {
        var s = summaryBase()
        s.loops = [loop(hits: [DuelHitDto(duelId: "d1", role: .attack, counted: true, reason: nil, opponent: emre, hpBefore: 20, hpAfter: 0, captured: true, cells: 48)])]
        s.totalGainedAreaM2 = 19_220
        s.newBadges = [BadgeDto(id: "safak-akincisi", name: "Şafak Akıncısı", category: "zaman", how: "Sabah Avantajı sırasında ilk fetih", earned: true, earnedAt: t1, progress: [1, 1], insignia: nil)]
        return s
    }

    public static var summaryOpen: RunSummary {
        var s = summaryBase()
        s.status = .open
        s.openGapM = 430
        s.distanceM = 7_950
        s.paceSecPerKm = 331
        return s
    }

    public static var summarySuggestion: RunSummary {
        var s = summaryBase()
        s.loops = [loop(newCells: 6, captured: 0, cells: 6, gained: 1_860)]
        s.totalGainedAreaM2 = 1_860
        s.suggestions = [DuelSuggestion(defender: zeynep, cells: mapCells.filter { $0.ownerId == "emre" }.map(\.id), avgPower: 55, routeLengthM: 4_600)]
        return s
    }

    public static var summaryReview: RunSummary {
        var s = summaryBase()
        s.status = .review
        s.distanceM = 6_100
        s.loops = [loop(cells: 44, status: .review)]
        s.review = RunReview(reasons: ["speed"], paceSecPerKm: 125, segmentM: 1_200, note: nil)
        return s
    }

    static func badge(_ id: String, _ name: String, _ earned: Bool, _ p: [Double], _ ins: BadgeInsignia? = nil) -> BadgeDto {
        BadgeDto(id: id, name: name, category: "halka", how: "\(name) nasıl", earned: earned, earnedAt: earned ? ISODate.parse("2026-09-21T10:00:00Z") : nil, progress: p, insignia: ins)
    }

    public static var badgesEmpty: BadgesResponse {
        let b = [badge("ilk-halka", "İlk Halka", false, [0, 1]), badge("seri-7", "7 Gün", false, [3, 7]), badge("erken-kus", "Erken Kuş", false, [2, 10])]
        return BadgesResponse(earned: 0, total: 40, badges: b, nearest: b, slots: [nil, nil, nil], canChangeInsignia: true)
    }

    public static var badgesFull: BadgesResponse {
        BadgesResponse(earned: 2, total: 40, badges: [
            badge("halka-ustasi", "Halka Ustası", true, [10, 10], BadgeInsignia(kind: "kural", effect: "Halka 50 m yerine 60 m'de kapanır", slot: true, counter: "Yok")),
            badge("oncu", "Öncü", true, [100, 100], BadgeInsignia(kind: "kesif", effect: "Boş petekler 12 güçle başlar", slot: true, counter: "Yok")),
            badge("sur", "Sur", false, [4, 10]),
        ], nearest: [], slots: ["oncu", nil, nil], canChangeInsignia: true)
    }

    public static func league(rows n: Int = 8, scope: LeagueScope = .individual, period: LeaguePeriod = .week) -> LeagueResponse {
        let rows = (0..<n).map { i in
            LeagueRow(rank: i + 1, id: i == 2 ? "me" : "p\(i)", name: i == 2 ? "Deniz Arslan" : "Oyuncu \(i)", initials: i == 2 ? "DA" : "O\(i)",
                      slot: Palette.slots[i % 8], valueM2: Double(31_620 - i * 1_000), delta: i == 2 ? 13 : -1, subtitle: nil, isMe: i == 2)
        }
        return LeagueResponse(regionId: "r1", regionName: "Kadıköy", scope: scope, period: period, rows: rows,
                              me: n > 2 ? rows[2] : nil, meNote: n > 2 ? "2.'ye 1.000 m² geride" : nil,
                              endsAt: Date().addingTimeInterval(Double((2 * 24 + 7) * 3_600 + 60)), updatedAt: Date())
    }

    public static var stats: StatsResponse {
        StatsResponse(
            territoryM2: 19_220, cells: 62, regionRank: 3, regionName: "Kadıköy", monthDistanceM: 126_400, avgPaceSecPerKm: 331,
            defenses: Defenses(won: 7, total: 9), biggestLoopM2: 19_220, streakDays: 34, bestStreakDays: 41,
            last14Days: (0..<14).map { DayGain(day: "2026-09-\(String(format: "%02d", 21 + $0 > 30 ? 30 : 21 + $0))", gainedM2: Double(($0 * 37) % 900), ran: $0 % 3 != 1) },
            recent: [RecentItem(at: Date().addingTimeInterval(-3_600), text: "Moda'da halka", delta: "+1.860 m²")],
            silhouettes: [H3.boundary(H3.cellOf(moda))]
        )
    }

    public static var team: TeamResponse {
        TeamResponse(id: "t1", name: "Moda Rüzgarı", slot: .keh, inviteCode: "MODA42", captain: mePlayer,
                     members: [TeamMember(player: mePlayer, role: .captain, territoryM2: 19_220), TeamMember(player: emre, role: .member, territoryM2: 8_400)],
                     territoryM2: 27_620, weekGainM2: 3_100, cells: 90, regionRank: 2)
    }

    public static var friends: FriendsResponse {
        FriendsResponse(friends: [
            FriendItem(player: selin, relation: "seni kuşatıyor", status: .besieging_you),
            FriendItem(player: emre, relation: "şu an koşuyor", status: .running),
        ], inviteCode: "DENIZ7")
    }

    public static var feed: Page<FeedItem> {
        Page(items: [
            FeedItem(id: "f1", player: emre, kind: .conquest, title: "Kalamış'ı aldı", subtitle: "+2.140 m² · 7 petek", timeLabel: "2 sa önce", claps: 4, clappedByMe: false, silhouette: [H3.boundary(H3.cellOf(moda))]),
            FeedItem(id: "f2", player: selin, kind: .streak, title: "30 gün seri", subtitle: "Her gün koştu", timeLabel: "dün", claps: 9, clappedByMe: true, silhouette: nil),
        ], nextCursor: nil)
    }

    public static var notifications: [NotificationDto] {
        [
            NotificationDto(id: "n1", kind: .siegeWarn, category: "siege", title: "Selin'le düello · 17 petek", body: "Blitz'te 2 halka daha atarsa onun olur",
                            createdAt: Date().addingTimeInterval(-1_800), read: false, action: NotificationAction(label: "Savun", deeplink: "hexrun://run?defend=d9")),
            NotificationDto(id: "n2", kind: .duelWon, category: "region", title: "Emre'yle düelloyu kazandın", body: "48 petek 50 güçle senin",
                            createdAt: Date().addingTimeInterval(-26 * 3_600), read: true, action: nil),
            NotificationDto(id: "n3", kind: .decayWarning, category: "region", title: "Kalamış eriyor", body: "3 gündür halka yok · 12 petek · güç 64 → 54",
                            createdAt: Date().addingTimeInterval(-4 * 86_400), read: true, action: nil),
            NotificationDto(id: "n4", kind: .cellsLost, category: "region", title: "Emre 12 peteğini aldı", body: "Rövanş için alan hazır",
                            createdAt: Date().addingTimeInterval(-5 * 3_600), read: false, action: NotificationAction(label: "Geri al", deeplink: "hexrun://duel/revenge/d1")),
        ]
    }

    public static var integrations: [IntegrationDto] {
        [
            IntegrationDto(provider: .apple_watch, connected: true, importEnabled: true, exportEnabled: false, lastSyncAt: nil, device: nil),
            IntegrationDto(provider: .garmin, connected: true, importEnabled: true, exportEnabled: false, lastSyncAt: Date().addingTimeInterval(-7_200), device: "Forerunner 265"),
            IntegrationDto(provider: .strava, connected: true, importEnabled: true, exportEnabled: true, lastSyncAt: nil, device: nil),
        ]
    }

    public static var shareCard: ShareCard {
        ShareCard(dateLabel: "4 EKİM 2026", kicker: "Moda · Sabah Avantajı", gainedAreaM2: 19_220, line: "62 petek senin, 48'i düelloyla",
                  distanceM: 8_400, durationMs: 2_713_000, paceSecPerKm: 323, username: "denizkosar", teamName: "Moda Rüzgarı", slot: .keh,
                  silhouette: mapCells.filter { $0.ownerId == "me" }.map { H3.boundary($0.id) })
    }

    public static var preview: DuelPreview {
        DuelPreview(ok: true, error: nil, cells: 12, areaM2: 3_700, avgPower: 55, routeLengthM: 2_400, estMinutes: 14, slotsLeft: 2)
    }
}

import Foundation

public struct BBox: Hashable, Sendable, Codable {
    public var minLat: Double
    public var minLng: Double
    public var maxLat: Double
    public var maxLng: Double
    public init(minLat: Double, minLng: Double, maxLat: Double, maxLng: Double) {
        self.minLat = minLat; self.minLng = minLng; self.maxLat = maxLat; self.maxLng = maxLng
    }

    public static func around(_ c: LatLng, delta: Double = 0.01) -> BBox {
        BBox(minLat: c.lat - delta, minLng: c.lng - delta, maxLat: c.lat + delta, maxLng: c.lng + delta)
    }

    public var queryValue: String {
        [minLat, minLng, maxLat, maxLng].map { String(format: "%.6f", $0) }.joined(separator: ",")
    }
}

/// Tüm REST uçları (`packages/contracts` + `docs/API.md` ile birebir).
public struct HexRunAPI: Sendable {
    public let client: APIClient

    public init(client: APIClient) { self.client = client }

    static let noAuth = APIClient.Options(auth: false)

    // MARK: Kimlik
    public func emailStart(_ email: String) async throws -> EmailStartResponse {
        try await client.request(.POST, "/auth/email/start", body: EmailStartRequest(email: email), options: Self.noAuth)
    }
    public func emailVerify(_ email: String, code: String) async throws -> AuthResponse {
        try await client.request(.POST, "/auth/email/verify", body: EmailVerifyRequest(email: email, code: code), options: Self.noAuth)
    }
    public func apple(identityToken: String, fullName: String?) async throws -> AuthResponse {
        try await client.request(.POST, "/auth/apple", body: AppleAuthRequest(identityToken: identityToken, fullName: fullName), options: Self.noAuth)
    }
    public func google(idToken: String) async throws -> AuthResponse {
        try await client.request(.POST, "/auth/google", body: GoogleAuthRequest(idToken: idToken), options: Self.noAuth)
    }
    public func logout(refreshToken: String) async throws {
        try await client.requestVoid(.POST, "/auth/logout", body: RefreshRequest(refreshToken: refreshToken), options: Self.noAuth)
    }

    // MARK: Profil
    public func me() async throws -> Me { try await client.request(.GET, "/me") }
    public func updateMe(_ body: UpdateMeRequest) async throws -> Me { try await client.request(.PATCH, "/me", body: body) }
    public func username(_ name: String) async throws -> UsernameAvailability {
        try await client.request(.GET, "/usernames/\(APIClient.encode(name))")
    }
    public func deleteMe() async throws { try await client.requestVoid(.DELETE, "/me") }
    public func exportData() async throws -> Data {
        try await client.send(.GET, "/me/export", options: APIClient.Options(timeout: 60)).0
    }
    public func privacy(_ body: PrivacyRequest) async throws -> Me { try await client.request(.PUT, "/me/privacy", body: body) }
    public func pushToken(_ token: String, platform: Platform = .ios, provider: PushProvider = .apns) async throws {
        try await client.requestVoid(.PUT, "/me/push-token", body: PushTokenRequest(token: token, platform: platform, provider: provider))
    }
    public func stats() async throws -> StatsResponse { try await client.request(.GET, "/me/stats") }
    public func badges() async throws -> BadgesResponse { try await client.request(.GET, "/me/badges") }
    public func setInsignia(_ slots: [String?]) async throws -> BadgesResponse {
        try await client.request(.PUT, "/me/insignia", body: SetInsigniaRequest(slots: slots))
    }
    public func shield(_ cells: [String]) async throws { try await client.requestVoid(.POST, "/me/shield", body: ShieldRequest(cells: cells)) }
    /// Koşu başlarken true, biterken false.
    public func activity(running: Bool) async throws { try await client.requestVoid(.PUT, "/me/activity", body: ActivityRequest(running: running)) }

    // MARK: Harita
    public func map(_ b: BBox) async throws -> MapResponse { try await client.request(.GET, "/map", query: [("bbox", b.queryValue)]) }
    public func region(cell: String) async throws -> RegionDetail { try await client.request(.GET, "/map/region", query: [("cell", cell)]) }
    /// 204 → nil (öneri yok).
    public func firstLoop(lat: Double, lng: Double) async throws -> FirstLoopSuggestion? {
        try await client.requestOptional(.GET, "/map/first-loop", query: [("lat", "\(lat)"), ("lng", "\(lng)")])
    }

    // MARK: Koşu
    public func submitRun(_ body: SubmitRunRequest) async throws -> RunSummary {
        try await client.request(.POST, "/runs", body: body, options: APIClient.Options(timeout: 45))
    }
    public func runs(cursor: String? = nil) async throws -> Page<RunListItem> { try await client.request(.GET, "/runs", query: [("cursor", cursor)]) }
    public func run(_ id: String) async throws -> RunSummary { try await client.request(.GET, "/runs/\(id)") }
    public func runNote(_ id: String, text: String) async throws { try await client.requestVoid(.POST, "/runs/\(id)/note", body: NoteRequest(text: text)) }
    public func share(_ id: String) async throws -> ShareCard { try await client.request(.GET, "/runs/\(id)/share") }

    // MARK: Düello
    public func duelPreview(_ cells: [String]) async throws -> DuelPreview { try await client.request(.POST, "/duels/preview", body: CreateDuelRequest(cells: cells)) }
    public func createDuel(_ cells: [String]) async throws -> DuelSummary { try await client.request(.POST, "/duels", body: CreateDuelRequest(cells: cells)) }
    public func duels() async throws -> DuelsResponse { try await client.request(.GET, "/duels") }
    public func duel(_ id: String) async throws -> DuelSummary { try await client.request(.GET, "/duels/\(id)") }
    public func cancelDuel(_ id: String) async throws { try await client.requestVoid(.DELETE, "/duels/\(id)") }

    // MARK: Lig, takım, sosyal
    public func league(scope: LeagueScope, period: LeaguePeriod) async throws -> LeagueResponse {
        try await client.request(.GET, "/league", query: [("scope", scope.rawValue), ("period", period.rawValue)])
    }
    /// 204 → nil (takım yok).
    public func myTeam() async throws -> TeamResponse? { try await client.requestOptional(.GET, "/teams/mine") }
    public func team(_ id: String) async throws -> TeamResponse { try await client.request(.GET, "/teams/\(id)") }
    public func createTeam(name: String) async throws -> TeamResponse { try await client.request(.POST, "/teams", body: CreateTeamRequest(name: name)) }
    public func joinTeam(code: String) async throws -> TeamResponse { try await client.request(.POST, "/teams/join", body: JoinTeamRequest(code: code)) }
    public func leaveTeam() async throws { try await client.requestVoid(.POST, "/teams/leave") }
    public func friends() async throws -> FriendsResponse { try await client.request(.GET, "/friends") }
    public func acceptFriend(code: String) async throws -> FriendsResponse { try await client.request(.POST, "/friends/accept", body: JoinTeamRequest(code: code)) }
    public func removeFriend(_ id: String) async throws { try await client.requestVoid(.DELETE, "/friends/\(id)") }
    public func feed(cursor: String? = nil) async throws -> Page<FeedItem> { try await client.request(.GET, "/feed", query: [("cursor", cursor)]) }
    public func clap(_ id: String) async throws -> ClapResponse? { try await client.requestOptional(.POST, "/feed/\(id)/clap") }

    // MARK: Bildirim, etkinlik
    public func notifications(filter: NotificationFilter, cursor: String? = nil) async throws -> Page<NotificationDto> {
        try await client.request(.GET, "/notifications", query: [("filter", filter.rawValue), ("cursor", cursor)])
    }
    public func markRead(_ ids: [String]? = nil) async throws { try await client.requestVoid(.POST, "/notifications/read", body: ReadRequest(ids: ids)) }
    public func events() async throws -> [ActiveEvent] { try await client.request(.GET, "/events") }
    public func remindEvent(_ id: EventId, on: Bool) async throws { try await client.requestVoid(.POST, "/events/\(id.rawValue)/remind", body: RemindRequest(on: on)) }

    // MARK: Entegrasyon
    public func integrations() async throws -> [IntegrationDto] { try await client.request(.GET, "/integrations") }
    public func connect(_ p: IntegrationProvider, device: String? = nil) async throws -> ConnectResponse {
        try await client.request(.POST, "/integrations/\(p.rawValue)/connect", body: ConnectRequest(device: device))
    }
    public func updateIntegration(_ p: IntegrationProvider, _ body: IntegrationUpdate) async throws -> IntegrationDto {
        try await client.request(.PATCH, "/integrations/\(p.rawValue)", body: body)
    }
    public func disconnect(_ p: IntegrationProvider) async throws { try await client.requestVoid(.DELETE, "/integrations/\(p.rawValue)") }
}

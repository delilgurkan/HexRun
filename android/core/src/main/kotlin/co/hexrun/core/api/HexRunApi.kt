package co.hexrun.core.api

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Locale

/**
 * Tüm REST uçları (packages/contracts + docs/API.md). Arayüz: ViewModel testleri sahte
 * uygulama kullanır. `null` dönüşler 204 (ör. takım yok, öneri yok) anlamına gelir.
 */
interface HexRunApi {
    // Kimlik
    suspend fun emailStart(email: String): EmailStartResponse
    suspend fun emailVerify(email: String, code: String): AuthResponse
    suspend fun google(idToken: String): AuthResponse
    suspend fun logout(refreshToken: String)

    // Profil
    suspend fun me(): Me
    suspend fun updateMe(body: UpdateMeRequest): Me
    suspend fun username(name: String): UsernameAvailability
    suspend fun deleteMe()
    suspend fun exportMe(): String
    /** home null → gizlilik bölgesini kapat. */
    suspend fun privacy(home: co.hexrun.core.geo.LatLng?, radiusM: Int?): Me
    suspend fun pushToken(token: String, platform: String = "android", provider: String = "fcm")
    suspend fun stats(): StatsResponse
    suspend fun badges(): BadgesResponse
    suspend fun setInsignia(slots: List<String?>): BadgesResponse
    suspend fun shield(cells: List<String>)
    suspend fun activity(running: Boolean)

    // Harita
    suspend fun map(b: Bbox): MapResponse
    suspend fun region(cell: String): RegionDetail
    suspend fun firstLoop(lat: Double, lng: Double): FirstLoopSuggestion?

    // Koşu
    suspend fun submitRun(body: SubmitRunRequest): RunSummary
    suspend fun runs(cursor: String? = null): Page<RunListItem>
    suspend fun run(id: String): RunSummary
    suspend fun runNote(id: String, text: String)
    suspend fun share(id: String): ShareCard

    // Düello
    suspend fun duelPreview(cells: List<String>): DuelPreview
    suspend fun createDuel(cells: List<String>): DuelSummary
    suspend fun duels(): DuelsResponse
    suspend fun duel(id: String): DuelSummary
    suspend fun cancelDuel(id: String)

    // Lig, takım, sosyal
    suspend fun league(scope: LeagueScope, period: LeaguePeriod): LeagueResponse
    suspend fun myTeam(): TeamResponse?
    suspend fun team(id: String): TeamResponse
    suspend fun createTeam(name: String): TeamResponse
    suspend fun joinTeam(code: String): TeamResponse
    suspend fun leaveTeam()
    suspend fun friends(): FriendsResponse
    suspend fun acceptFriend(code: String): FriendsResponse
    suspend fun removeFriend(id: String)
    suspend fun feed(cursor: String? = null): Page<FeedItem>
    suspend fun clap(id: String): ClapResponse?

    // Bildirim, etkinlik
    suspend fun notifications(filter: NotificationFilter, cursor: String? = null): Page<NotificationDto>
    suspend fun readNotifications(ids: List<String>? = null)
    suspend fun events(): List<ActiveEvent>
    suspend fun remindEvent(id: String, on: Boolean)

    // Entegrasyon
    suspend fun integrations(): List<IntegrationDto>
    suspend fun connectIntegration(provider: String, device: String? = null): ConnectResponse
    suspend fun updateIntegration(provider: String, body: IntegrationPatch): IntegrationDto
    suspend fun disconnectIntegration(provider: String)
}

private fun <T> T?.req(path: String): T = this ?: throw ApiError(200, "empty", "Sunucu yanıtı boş geldi ($path).")

/** OkHttp tabanlı gerçek uygulama. */
class HttpHexRunApi(val client: ApiClient) : HexRunApi {
    private val c = client

    override suspend fun emailStart(email: String): EmailStartResponse =
        c.post<EmailStartResponse, EmailStartRequest>("/auth/email/start", EmailStartRequest(email), auth = false).req("email/start")

    override suspend fun emailVerify(email: String, code: String): AuthResponse =
        c.post<AuthResponse, EmailVerifyRequest>("/auth/email/verify", EmailVerifyRequest(email, code), auth = false).req("email/verify")

    override suspend fun google(idToken: String): AuthResponse =
        c.post<AuthResponse, GoogleAuthRequest>("/auth/google", GoogleAuthRequest(idToken), auth = false).req("auth/google")

    override suspend fun logout(refreshToken: String) {
        c.requestRaw(Method.POST, "/auth/logout", c.json.encodeToString(RefreshRequest.serializer(), RefreshRequest(refreshToken)), auth = false)
    }

    override suspend fun me(): Me = c.get<Me>("/me").req("me")
    override suspend fun updateMe(body: UpdateMeRequest): Me = c.patch<Me, UpdateMeRequest>("/me", body).req("me")
    override suspend fun username(name: String): UsernameAvailability =
        c.get<UsernameAvailability>("/usernames/${java.net.URLEncoder.encode(name, "UTF-8").replace("+", "%20")}").req("usernames")
    override suspend fun deleteMe() = c.delete("/me")
    override suspend fun exportMe(): String = c.requestRaw(Method.GET, "/me/export", timeoutMs = 60_000) ?: "{}"

    override suspend fun privacy(home: co.hexrun.core.geo.LatLng?, radiusM: Int?): Me {
        // Sunucu şeması `home`u null olarak açıkça ister (nullable, opsiyonel değil).
        val body = buildJsonObject {
            if (home == null) put("home", JsonNull) else put("home", buildJsonObject { put("lat", home.lat); put("lng", home.lng) })
            if (radiusM != null) put("radiusM", radiusM)
        }
        return c.request(Method.PUT, "/me/privacy", Me.serializer(), body.toString()).req("me/privacy")
    }

    override suspend fun pushToken(token: String, platform: String, provider: String) {
        c.requestRaw(Method.PUT, "/me/push-token", c.json.encodeToString(PushTokenRequest.serializer(), PushTokenRequest(token, platform, provider)))
    }

    override suspend fun stats(): StatsResponse = c.get<StatsResponse>("/me/stats").req("me/stats")
    override suspend fun badges(): BadgesResponse = c.get<BadgesResponse>("/me/badges").req("me/badges")
    override suspend fun setInsignia(slots: List<String?>): BadgesResponse =
        c.put<BadgesResponse, SetInsigniaRequest>("/me/insignia", SetInsigniaRequest(slots)).req("me/insignia")

    override suspend fun shield(cells: List<String>) {
        c.requestRaw(Method.POST, "/me/shield", c.json.encodeToString(CellsRequest.serializer(), CellsRequest(cells)))
    }

    override suspend fun activity(running: Boolean) {
        c.requestRaw(Method.PUT, "/me/activity", c.json.encodeToString(ActivityRequest.serializer(), ActivityRequest(running)))
    }

    override suspend fun map(b: Bbox): MapResponse {
        val bbox = listOf(b.minLat, b.minLng, b.maxLat, b.maxLng).joinToString(",") { String.format(Locale.ROOT, "%.6f", it) }
        return c.get<MapResponse>("/map", mapOf("bbox" to bbox)).req("map")
    }

    override suspend fun region(cell: String): RegionDetail = c.get<RegionDetail>("/map/region", mapOf("cell" to cell)).req("map/region")
    override suspend fun firstLoop(lat: Double, lng: Double): FirstLoopSuggestion? =
        c.get<FirstLoopSuggestion>("/map/first-loop", mapOf("lat" to lat, "lng" to lng))

    override suspend fun submitRun(body: SubmitRunRequest): RunSummary =
        c.post<RunSummary, SubmitRunRequest>("/runs", body, timeoutMs = 45_000).req("runs")

    override suspend fun runs(cursor: String?): Page<RunListItem> = c.get<Page<RunListItem>>("/runs", mapOf("cursor" to cursor)).req("runs")
    override suspend fun run(id: String): RunSummary = c.get<RunSummary>("/runs/$id").req("runs/id")
    override suspend fun runNote(id: String, text: String) {
        c.requestRaw(Method.POST, "/runs/$id/note", c.json.encodeToString(NoteRequest.serializer(), NoteRequest(text)))
    }

    override suspend fun share(id: String): ShareCard = c.get<ShareCard>("/runs/$id/share").req("share")

    override suspend fun duelPreview(cells: List<String>): DuelPreview =
        c.post<DuelPreview, CellsRequest>("/duels/preview", CellsRequest(cells)).req("duels/preview")

    override suspend fun createDuel(cells: List<String>): DuelSummary =
        c.post<DuelSummary, CellsRequest>("/duels", CellsRequest(cells)).req("duels")

    override suspend fun duels(): DuelsResponse = c.get<DuelsResponse>("/duels").req("duels")
    override suspend fun duel(id: String): DuelSummary = c.get<DuelSummary>("/duels/$id").req("duel")
    override suspend fun cancelDuel(id: String) = c.delete("/duels/$id")

    override suspend fun league(scope: LeagueScope, period: LeaguePeriod): LeagueResponse =
        c.get<LeagueResponse>("/league", mapOf("scope" to scope.wire, "period" to period.wire)).req("league")

    override suspend fun myTeam(): TeamResponse? = c.get<TeamResponse>("/teams/mine")
    override suspend fun team(id: String): TeamResponse = c.get<TeamResponse>("/teams/$id").req("team")
    override suspend fun createTeam(name: String): TeamResponse =
        c.post<TeamResponse, CreateTeamRequest>("/teams", CreateTeamRequest(name)).req("teams")

    override suspend fun joinTeam(code: String): TeamResponse =
        c.post<TeamResponse, CodeRequest>("/teams/join", CodeRequest(code)).req("teams/join")

    override suspend fun leaveTeam() {
        c.requestRaw(Method.POST, "/teams/leave", "{}")
    }

    override suspend fun friends(): FriendsResponse = c.get<FriendsResponse>("/friends").req("friends")
    override suspend fun acceptFriend(code: String): FriendsResponse =
        c.post<FriendsResponse, CodeRequest>("/friends/accept", CodeRequest(code)).req("friends/accept")

    override suspend fun removeFriend(id: String) = c.delete("/friends/$id")
    override suspend fun feed(cursor: String?): Page<FeedItem> = c.get<Page<FeedItem>>("/feed", mapOf("cursor" to cursor)).req("feed")
    override suspend fun clap(id: String): ClapResponse? =
        c.request(Method.POST, "/feed/$id/clap", ClapResponse.serializer(), "{}")

    override suspend fun notifications(filter: NotificationFilter, cursor: String?): Page<NotificationDto> =
        c.get<Page<NotificationDto>>("/notifications", mapOf("filter" to filter.wire, "cursor" to cursor)).req("notifications")

    override suspend fun readNotifications(ids: List<String>?) {
        c.requestRaw(Method.POST, "/notifications/read", c.json.encodeToString(ReadNotificationsRequest.serializer(), ReadNotificationsRequest(ids)))
    }

    override suspend fun events(): List<ActiveEvent> =
        c.request(Method.GET, "/events", ListSerializer(ActiveEvent.serializer())).req("events")

    override suspend fun remindEvent(id: String, on: Boolean) {
        c.requestRaw(Method.POST, "/events/$id/remind", c.json.encodeToString(RemindRequest.serializer(), RemindRequest(on)))
    }

    override suspend fun integrations(): List<IntegrationDto> =
        c.request(Method.GET, "/integrations", ListSerializer(IntegrationDto.serializer())).req("integrations")

    override suspend fun connectIntegration(provider: String, device: String?): ConnectResponse =
        c.post<ConnectResponse, ConnectRequest>("/integrations/$provider/connect", ConnectRequest(device)).req("connect")

    override suspend fun updateIntegration(provider: String, body: IntegrationPatch): IntegrationDto =
        c.patch<IntegrationDto, IntegrationPatch>("/integrations/$provider", body).req("integrations/p")

    override suspend fun disconnectIntegration(provider: String) = c.delete("/integrations/$provider")
}

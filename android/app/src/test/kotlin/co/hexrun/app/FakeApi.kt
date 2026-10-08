package co.hexrun.app

import co.hexrun.core.api.*
import co.hexrun.core.geo.LatLng

/** Sahte API: testler yalnız gereken uçları geçersiz kılar; diğerleri çağrılırsa test düşer. */
open class FakeApi : HexRunApi {
    private fun no(): Nothing = throw NotImplementedError("FakeApi: çağrı beklenmiyordu")
    override suspend fun emailStart(email: String): EmailStartResponse = no()
    override suspend fun emailVerify(email: String, code: String): AuthResponse = no()
    override suspend fun google(idToken: String): AuthResponse = no()
    override suspend fun logout(refreshToken: String) = Unit
    override suspend fun me(): Me = no()
    override suspend fun updateMe(body: UpdateMeRequest): Me = no()
    override suspend fun username(name: String): UsernameAvailability = no()
    override suspend fun deleteMe() = no()
    override suspend fun exportMe(): String = no()
    override suspend fun privacy(home: LatLng?, radiusM: Int?): Me = no()
    override suspend fun pushToken(token: String, platform: String, provider: String) = Unit
    override suspend fun stats(): StatsResponse = no()
    override suspend fun badges(): BadgesResponse = no()
    override suspend fun setInsignia(slots: List<String?>): BadgesResponse = no()
    override suspend fun shield(cells: List<String>) = no()
    override suspend fun activity(running: Boolean) = Unit
    override suspend fun map(b: Bbox): MapResponse = no()
    override suspend fun region(cell: String): RegionDetail = no()
    override suspend fun firstLoop(lat: Double, lng: Double): FirstLoopSuggestion? = null
    override suspend fun submitRun(body: SubmitRunRequest): RunSummary = no()
    override suspend fun runs(cursor: String?): Page<RunListItem> = no()
    override suspend fun run(id: String): RunSummary = no()
    override suspend fun runNote(id: String, text: String) = Unit
    override suspend fun share(id: String): ShareCard = no()
    override suspend fun duelPreview(cells: List<String>): DuelPreview = no()
    override suspend fun createDuel(cells: List<String>): DuelSummary = no()
    override suspend fun duels(): DuelsResponse = DuelsResponse()
    override suspend fun duel(id: String): DuelSummary = no()
    override suspend fun cancelDuel(id: String) = Unit
    override suspend fun league(scope: LeagueScope, period: LeaguePeriod): LeagueResponse = no()
    override suspend fun myTeam(): TeamResponse? = null
    override suspend fun team(id: String): TeamResponse = no()
    override suspend fun createTeam(name: String): TeamResponse = no()
    override suspend fun joinTeam(code: String): TeamResponse = no()
    override suspend fun leaveTeam() = Unit
    override suspend fun friends(): FriendsResponse = no()
    override suspend fun acceptFriend(code: String): FriendsResponse = no()
    override suspend fun removeFriend(id: String) = Unit
    override suspend fun feed(cursor: String?): Page<FeedItem> = Page()
    override suspend fun clap(id: String): ClapResponse? = null
    override suspend fun notifications(filter: NotificationFilter, cursor: String?): Page<NotificationDto> = Page()
    override suspend fun readNotifications(ids: List<String>?) = Unit
    override suspend fun events(): List<ActiveEvent> = emptyList()
    override suspend fun remindEvent(id: String, on: Boolean) = Unit
    override suspend fun integrations(): List<IntegrationDto> = emptyList()
    override suspend fun connectIntegration(provider: String, device: String?): ConnectResponse = no()
    override suspend fun updateIntegration(provider: String, body: IntegrationPatch): IntegrationDto = no()
    override suspend fun disconnectIntegration(provider: String) = Unit
}

object Fixtures {
    fun player(id: String = "p1", name: String = "Zeynep Kaya", slot: co.hexrun.core.colors.Slot = co.hexrun.core.colors.Slot.GOK) =
        PublicPlayer(id = id, username = name.lowercase().replace(' ', '_'), displayName = name, initials = co.hexrun.core.format.Format.initials(name), slot = slot)

    fun me(id: String = "me", username: String = "") = Me(id = id, username = username, displayName = "Deniz Arslan", initials = "DA")
}

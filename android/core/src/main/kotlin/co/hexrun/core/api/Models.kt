@file:Suppress("unused")

package co.hexrun.core.api

import co.hexrun.core.colors.Slot
import co.hexrun.core.geo.LatLng
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/*
 * HexRun API v1 sözleşmesi — packages/contracts/src/index.ts ile birebir.
 * Sayısal alanlar sunucuda kesirli olabildiğinden çoğunlukla Double; sayımlar Int.
 * Varsayılan değerler: eksik ya da null gelen alan istemciyi çökertmesin (coerceInputValues).
 */

@Serializable
data class ApiErrorBody(val error: ApiErrorDetail)

@Serializable
data class ApiErrorDetail(val code: String, val message: String? = null)

/* ─────────────── Kimlik ─────────────── */

@Serializable data class EmailStartRequest(val email: String)
@Serializable data class EmailStartResponse(val sent: Boolean = true, val devCode: String? = null)
@Serializable data class EmailVerifyRequest(val email: String, val code: String)
@Serializable data class GoogleAuthRequest(val idToken: String)
@Serializable data class RefreshRequest(val refreshToken: String)

@Serializable
data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    /** Erişim jetonunun ömrü (sn). */
    val expiresIn: Long,
    val user: Me,
    val needsProfile: Boolean = false,
)

/* ─────────────── Profil ─────────────── */

@Serializable
data class PublicPlayer(
    val id: String,
    val username: String = "",
    val displayName: String = "",
    val initials: String = "",
    val slot: Slot = Slot.KEH,
    val teamName: String? = null,
    val insignia: List<String> = emptyList(),
    val goldFrame: Boolean = false,
) {
    val firstName: String get() = displayName.split(' ').firstOrNull()?.takeIf { it.isNotEmpty() } ?: username
}

@Serializable
data class Privacy(val enabled: Boolean = false, val radiusM: Int? = null)

@Serializable
data class Me(
    val id: String,
    val username: String = "",
    val displayName: String = "",
    val initials: String = "",
    val slot: Slot = Slot.KEH,
    val teamName: String? = null,
    val insignia: List<String> = emptyList(),
    val goldFrame: Boolean = false,
    val email: String? = null,
    val createdAt: String = "",
    val newbieDaysLeft: Int = 0,
    val teamId: String? = null,
    val privacy: Privacy = Privacy(),
    val canChangeInsignia: Boolean = true,
    val locale: String = "tr",
)

@Serializable
data class UpdateMeRequest(val username: String? = null, val displayName: String? = null, val slot: Slot? = null)

@Serializable
data class UsernameAvailability(val username: String = "", val available: Boolean = false, val reason: String? = null)

@Serializable
data class PushTokenRequest(val token: String, val platform: String, val provider: String? = null)

@Serializable data class ActivityRequest(val running: Boolean)

/* ─────────────── Harita ─────────────── */

@Serializable
data class MapCell(
    val id: String,
    val ownerId: String? = null,
    val power: Double = 0.0,
    val slot: Slot? = null,
    /** `defending` = sana saldırılıyor, `attacking` = senin düellon. */
    val duel: String? = null,
    val progress: Double? = null,
    val attackerSlot: Slot? = null,
    val ghost: Double = 0.0,
) {
    val hidden: Boolean get() = ownerId?.startsWith("hidden:") == true
}

@Serializable
data class MapPlayer(
    val id: String,
    val displayName: String = "",
    val initials: String = "",
    val slot: Slot = Slot.KEH,
    val goldFrame: Boolean = false,
    val hidden: Boolean = false,
    val marker: LatLng? = null,
    val cells: Int = 0,
)

@Serializable
data class ActiveEvent(
    val id: String,
    val name: String = "",
    val move: String = "gain",
    val multiplier: Double = 1.0,
    val window: String = "",
    val description: String = "",
    val active: Boolean = false,
    val endsInMin: Int? = null,
    val startsInMin: Int = 0,
    val participantsToday: Int = 0,
)

@Serializable
data class MapResponse(
    val cells: List<MapCell> = emptyList(),
    val players: List<MapPlayer> = emptyList(),
    val attackersLast48h: Int = 0,
    val activeEvents: List<ActiveEvent> = emptyList(),
    val truncated: Boolean = false,
    val serverTime: String = "",
)

@Serializable
data class FirstLoopSuggestion(
    val ring: List<LatLng> = emptyList(),
    val lengthM: Double = 0.0,
    val areaM2: Double = 0.0,
    val emptyCells: Int = 0,
)

@Serializable data class RegionHistoryItem(val at: String, val text: String)

@Serializable
data class RegionDetail(
    val owner: PublicPlayer? = null,
    val hidden: Boolean = false,
    val cells: List<String> = emptyList(),
    val areaM2: Double = 0.0,
    val avgPower: Double = 0.0,
    val ownedSinceDays: Int? = null,
    val lastDefenseAt: String? = null,
    val myDuel: DuelSummary? = null,
    val incomingDuels: List<DuelSummary> = emptyList(),
    val history: List<RegionHistoryItem> = emptyList(),
    val activeEvents: List<ActiveEvent> = emptyList(),
    val canStartDuel: Boolean = false,
    val duelSlotsLeft: Int = 0,
)

/* ─────────────── Koşu ─────────────── */

@Serializable
data class TrackPointDto(val lat: Double, val lng: Double, val t: Long, val acc: Double? = null)

@Serializable
data class SubmitRunRequest(
    /** İstemcinin ürettiği UUID: tekrar gönderim güvenli (idempotent). */
    val clientRunId: String,
    val source: String = "phone",
    val points: List<TrackPointDto>,
    val externalId: String? = null,
    val device: String? = null,
)

@Serializable
data class DuelHitDto(
    val duelId: String,
    val role: String = "attack",
    val counted: Boolean = false,
    /** `coverage` kullanıcıya "alan kapsanmadı" diye gösterilir, yüzde gösterilmez. */
    val reason: String? = null,
    val opponent: PublicPlayer? = null,
    val hpBefore: Double = 0.0,
    val hpAfter: Double = 0.0,
    val captured: Boolean = false,
    val cells: Int = 0,
)

@Serializable
data class Multipliers(val gain: Double = 1.0, val attack: Double = 1.0, val pushback: Double = 1.0)

@Serializable
data class LoopResult(
    val index: Int = 0,
    val status: String = "applied",
    val closedAt: String = "",
    val lengthM: Double = 0.0,
    val areaM2: Double = 0.0,
    val cells: Int = 0,
    val newCells: Int = 0,
    val reinforced: Int = 0,
    val capturedCells: Int = 0,
    val gainedAreaM2: Double = 0.0,
    val hits: List<DuelHitDto> = emptyList(),
    val multipliers: Multipliers = Multipliers(),
)

@Serializable
data class DuelSuggestion(
    val defender: PublicPlayer,
    val cells: List<String> = emptyList(),
    val avgPower: Double = 0.0,
    val routeLengthM: Double = 0.0,
)

@Serializable
data class RunReview(
    val reasons: List<String> = emptyList(),
    val paceSecPerKm: Double? = null,
    val segmentM: Double? = null,
    val note: String? = null,
)

@Serializable
data class RunSummary(
    val id: String,
    val source: String = "phone",
    val startedAt: String = "",
    val endedAt: String = "",
    val distanceM: Double = 0.0,
    val durationMs: Long = 0,
    val paceSecPerKm: Double? = null,
    val loops: List<LoopResult> = emptyList(),
    val openGapM: Double? = null,
    /** applied | review | open | stats_only | duplicate */
    val status: String = "applied",
    val review: RunReview? = null,
    val newBadges: List<BadgeDto> = emptyList(),
    val streakDays: Int = 0,
    val monthDistanceM: Double = 0.0,
    val suggestions: List<DuelSuggestion> = emptyList(),
    val totalGainedAreaM2: Double = 0.0,
)

@Serializable
data class RunListItem(
    val id: String,
    val source: String = "phone",
    val startedAt: String = "",
    val endedAt: String = "",
    val distanceM: Double = 0.0,
    val durationMs: Long = 0,
    val status: String = "applied",
    val gainedAreaM2: Double = 0.0,
    val loops: Int = 0,
)

@Serializable
data class Page<T>(val items: List<T> = emptyList(), val nextCursor: String? = null)

@Serializable data class NoteRequest(val text: String)

/* ─────────────── Düello ─────────────── */

@Serializable data class CellsRequest(val cells: List<String>)

@Serializable
data class DuelSummary(
    val id: String,
    /** active | won | expired | closed | reset | cancelled */
    val status: String = "active",
    val attacker: PublicPlayer,
    val defender: PublicPlayer,
    val cells: List<String> = emptyList(),
    val hp: Double = 0.0,
    val power: Double = 0.0,
    val progress: Double = 0.0,
    val createdAt: String = "",
    val firstCountedAt: String? = null,
    val lastAttackAt: String? = null,
    val attacksToday: Int = 0,
    val attackLimitToday: Int = 2,
    val defensesToday: Int = 0,
    val loopsToCapture: Int = 0,
    val route: List<LatLng> = emptyList(),
    val routeLengthM: Double = 0.0,
    val expiresAt: String? = null,
)

@Serializable
data class DuelPreview(
    val ok: Boolean = false,
    /** self | size | not_owned | mixed_owner | not_connected | limit | overlap | duplicate_cells */
    val error: String? = null,
    val cells: Int = 0,
    val areaM2: Double = 0.0,
    val avgPower: Double = 0.0,
    val routeLengthM: Double = 0.0,
    val estMinutes: Int = 0,
    val slotsLeft: Int = 0,
)

@Serializable
data class DuelsResponse(val attacking: List<DuelSummary> = emptyList(), val defending: List<DuelSummary> = emptyList())

/* ─────────────── İlerleme ─────────────── */

@Serializable data class Defenses(val won: Int = 0, val total: Int = 0)
@Serializable data class DayGain(val day: String, val gainedM2: Double = 0.0, val ran: Boolean = false)
@Serializable data class RecentItem(val at: String, val text: String = "", val delta: String = "")

@Serializable
data class StatsResponse(
    val territoryM2: Double = 0.0,
    val cells: Int = 0,
    val regionRank: Int? = null,
    val regionName: String? = null,
    val monthDistanceM: Double = 0.0,
    val avgPaceSecPerKm: Double? = null,
    val defenses: Defenses = Defenses(),
    val biggestLoopM2: Double = 0.0,
    val streakDays: Int = 0,
    val bestStreakDays: Int = 0,
    val last14Days: List<DayGain> = emptyList(),
    val recent: List<RecentItem> = emptyList(),
    val silhouettes: List<List<LatLng>> = emptyList(),
)

@Serializable
data class InsigniaInfo(val kind: String = "", val effect: String = "", val slot: Boolean = false, val counter: String = "")

@Serializable
data class BadgeDto(
    val id: String,
    val name: String = "",
    val category: String = "",
    val how: String = "",
    val earned: Boolean = false,
    val earnedAt: String? = null,
    val progress: List<Double> = listOf(0.0, 1.0),
    val insignia: InsigniaInfo? = null,
) {
    val progressNow: Double get() = progress.getOrElse(0) { 0.0 }
    val progressMax: Double get() = progress.getOrElse(1) { 1.0 }
}

@Serializable
data class BadgesResponse(
    val earned: Int = 0,
    val total: Int = 0,
    val badges: List<BadgeDto> = emptyList(),
    val nearest: List<BadgeDto> = emptyList(),
    val slots: List<String?> = listOf(null, null, null),
    val canChangeInsignia: Boolean = true,
)

@Serializable data class SetInsigniaRequest(val slots: List<String?>)

/* ─────────────── Lig, takım, sosyal ─────────────── */

@Serializable
data class LeagueRow(
    val rank: Int = 0,
    val id: String,
    val name: String = "",
    val initials: String = "",
    val slot: Slot = Slot.KEH,
    val valueM2: Double = 0.0,
    val delta: Int? = null,
    val subtitle: String? = null,
    val isMe: Boolean = false,
)

@Serializable
data class LeagueResponse(
    val regionId: String = "",
    val regionName: String = "",
    val scope: String = "individual",
    val period: String = "week",
    val rows: List<LeagueRow> = emptyList(),
    val me: LeagueRow? = null,
    val meNote: String? = null,
    val endsAt: String? = null,
    val updatedAt: String = "",
)

@Serializable
data class TeamMember(val player: PublicPlayer, val role: String = "member", val territoryM2: Double = 0.0)

@Serializable
data class TeamResponse(
    val id: String,
    val name: String = "",
    val slot: Slot = Slot.KEH,
    val inviteCode: String? = null,
    val captain: PublicPlayer,
    val members: List<TeamMember> = emptyList(),
    val territoryM2: Double = 0.0,
    val weekGainM2: Double = 0.0,
    val cells: Int = 0,
    val regionRank: Int? = null,
)

@Serializable data class CreateTeamRequest(val name: String)
@Serializable data class CodeRequest(val code: String)

@Serializable
data class FriendItem(
    val player: PublicPlayer,
    val relation: String = "",
    /** besieging_you | running | idle | you_besiege */
    val status: String = "idle",
)

@Serializable
data class FriendsResponse(val friends: List<FriendItem> = emptyList(), val inviteCode: String = "")

@Serializable
data class FeedItem(
    val id: String,
    val player: PublicPlayer,
    val kind: String = "conquest",
    val title: String = "",
    val subtitle: String = "",
    val timeLabel: String = "",
    val claps: Int = 0,
    val clappedByMe: Boolean = false,
    val silhouette: List<List<LatLng>>? = null,
)

@Serializable data class ClapResponse(val claps: Int = 0, val clappedByMe: Boolean = false)

/* ─────────────── Bildirim, etkinlik ─────────────── */

@Serializable data class NotificationAction(val label: String, val deeplink: String)

@Serializable
data class NotificationDto(
    val id: String,
    val kind: String = "",
    /** siege | region | team | other */
    val category: String = "other",
    val title: String = "",
    val body: String = "",
    val createdAt: String = "",
    val read: Boolean = false,
    val action: NotificationAction? = null,
)

@Serializable data class ReadNotificationsRequest(val ids: List<String>? = null)
@Serializable data class RemindRequest(val on: Boolean)

/* ─────────────── Entegrasyon, paylaşım ─────────────── */

@Serializable
data class IntegrationDto(
    val provider: String,
    val connected: Boolean = false,
    val importEnabled: Boolean = false,
    val exportEnabled: Boolean = false,
    val lastSyncAt: String? = null,
    val device: String? = null,
)

@Serializable data class ConnectRequest(val device: String? = null)
@Serializable data class ConnectResponse(val url: String? = null)
@Serializable data class IntegrationPatch(val importEnabled: Boolean? = null, val exportEnabled: Boolean? = null)

@Serializable
data class ShareCard(
    val dateLabel: String = "",
    val kicker: String = "",
    val gainedAreaM2: Double = 0.0,
    val line: String = "",
    val distanceM: Double = 0.0,
    val durationMs: Long = 0,
    val paceSecPerKm: Double? = null,
    val username: String = "",
    val teamName: String? = null,
    val slot: Slot = Slot.KEH,
    val silhouette: List<List<LatLng>> = emptyList(),
)

/** Bölge sınırı kutusu (harita isteği). */
data class Bbox(val minLat: Double, val minLng: Double, val maxLat: Double, val maxLng: Double)

enum class NotificationFilter(val wire: String) { ALL("all"), SIEGE("siege"), REGION("region"), TEAM("team") }
enum class LeagueScope(val wire: String) { INDIVIDUAL("individual"), TEAM("team") }
enum class LeaguePeriod(val wire: String) { WEEK("week"), MONTH("month"), ALL("all") }

/** Saat/uygulama sağlayıcıları (Android listesi). */
object Providers {
    val WATCHES = listOf("wear_os", "garmin", "coros", "suunto", "polar")
    val APPS = listOf("strava", "health_connect")
    val DEVICE_SOURCES = setOf("apple_watch", "wear_os", "apple_health", "health_connect")
}

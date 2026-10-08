package co.hexrun.app.data

import co.hexrun.core.api.ApiClient
import co.hexrun.core.api.AuthResponse
import co.hexrun.core.api.DuelSummary
import co.hexrun.core.api.DuelsResponse
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.api.MapCell
import co.hexrun.core.api.MapResponse
import co.hexrun.core.api.Me
import co.hexrun.core.api.HexJson
import co.hexrun.core.store.KeyValueStore
import co.hexrun.core.ui.ConquestContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

enum class AuthStatus { LOADING, SIGNED_OUT, SIGNED_IN }

/** Oturum: jetonlar ApiClient'ın deposunda; durum akışı UI geçişlerini yönetir. */
class AuthRepository(
    private val client: ApiClient,
    private val api: HexRunApi,
    private val prefs: PrefsStore,
    private val onSignedOut: () -> Unit = {},
) {
    private val _status = MutableStateFlow(AuthStatus.LOADING)
    val status: StateFlow<AuthStatus> = _status.asStateFlow()

    suspend fun init() {
        client.onLogout = {
            _status.value = AuthStatus.SIGNED_OUT
            onSignedOut()
        }
        _status.value = if (client.tokens.get() != null) AuthStatus.SIGNED_IN else AuthStatus.SIGNED_OUT
    }

    suspend fun completeSignIn(res: AuthResponse, me: MeRepository) {
        client.saveAuth(res)
        me.set(res.user)
        prefs.update { it.copy(needsProfile = res.needsProfile) }
        _status.value = AuthStatus.SIGNED_IN
    }

    suspend fun signOut() {
        val t = client.tokens.get()
        if (t != null) runCatching { api.logout(t.refreshToken) }
        client.tokens.clear()
        _status.value = AuthStatus.SIGNED_OUT
        onSignedOut()
    }
}

/** Oturum açan oyuncu (Me) önbelleği: ekranlar arası paylaşılır. */
class MeRepository(private val api: HexRunApi) {
    private val _me = MutableStateFlow<Me?>(null)
    val me: StateFlow<Me?> = _me.asStateFlow()

    fun set(m: Me?) { _me.value = m }

    suspend fun refresh(): Me? = runCatching { api.me() }.onSuccess { _me.value = it }.getOrNull() ?: _me.value

    suspend fun ensure(): Me? = _me.value ?: refresh()
}

@Serializable
data class LastMap(val at: Long, val res: MapResponse)

/**
 * Son bilinen harita ve düellolar: koşu sırasında fetih önizlemesi, düello kapsaması ve
 * çevrimdışı harita için (mobile/src/state/mapCache.ts).
 */
class MapCache(private val kv: KeyValueStore) {
    @Volatile var myId: String? = null
    private val cells = LinkedHashMap<String, MapCell>()
    @Volatile var attacking: List<DuelSummary> = emptyList(); private set
    @Volatile var defending: List<DuelSummary> = emptyList(); private set
    private val _duels = MutableStateFlow<DuelsResponse?>(null)
    val duels: StateFlow<DuelsResponse?> = _duels.asStateFlow()

    @Synchronized
    fun rememberMap(res: MapResponse, me: String?) {
        myId = me
        for (c in res.cells) cells[c.id] = c
        // Bellek sınırı.
        while (cells.size > 20_000) cells.remove(cells.keys.first())
    }

    fun rememberDuels(d: DuelsResponse) {
        attacking = d.attacking
        defending = d.defending
        _duels.value = d
    }

    @Synchronized
    fun cellsSnapshot(): Map<String, MapCell> = HashMap(cells)

    @Synchronized
    fun cell(id: String): MapCell? = cells[id]

    fun conquestContext(): ConquestContext = ConquestContext(myId, cellsSnapshot(), attacking)

    suspend fun saveLast(res: MapResponse, at: Long = System.currentTimeMillis()) {
        runCatching { kv.set(KEY, HexJson.encodeToString(LastMap.serializer(), LastMap(at, res))) }
    }

    suspend fun readLast(): LastMap? = runCatching { kv.get(KEY)?.let { HexJson.decodeFromString(LastMap.serializer(), it) } }.getOrNull()

    @Synchronized
    fun clear() {
        cells.clear()
        attacking = emptyList()
        defending = emptyList()
        _duels.value = null
        myId = null
    }

    private companion object {
        const val KEY = "hexrun.lastMap.v1"
    }
}

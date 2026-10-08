package co.hexrun.app.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.hexrun.app.ui.Query
import co.hexrun.app.ui.attempt
import co.hexrun.core.api.BadgesResponse
import co.hexrun.core.api.ErrorText
import co.hexrun.core.api.FeedItem
import co.hexrun.core.api.HexJson
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.store.KeyValueStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable
data class BadgeCount(val earned: Int, val total: Int)

data class FeedUi(val items: List<FeedItem> = emptyList(), val cursor: String? = null, val loading: Boolean = true, val error: Throwable? = null)

/** Profil sekmeleri: istatistik, rozetler (+ son bilinen sayı), arkadaşlar ve alkışlı akış. */
class ProfileViewModel(private val api: HexRunApi, private val kv: KeyValueStore) : ViewModel() {
    val stats = Query(viewModelScope) { api.stats() }
    val badges = Query(viewModelScope) { api.badges().also { saveCount(it) } }
    val friends = Query(viewModelScope) { api.friends() }
    private val _feed = MutableStateFlow(FeedUi())
    val feed: StateFlow<FeedUi> = _feed.asStateFlow()
    private val _lastBadges = MutableStateFlow<BadgeCount?>(null)
    val lastBadges: StateFlow<BadgeCount?> = _lastBadges.asStateFlow()
    private val _friendError = MutableStateFlow<String?>(null)
    val friendError: StateFlow<String?> = _friendError.asStateFlow()

    init {
        stats.load()
        badges.load()
        friends.load()
        loadFeed()
        viewModelScope.launch {
            _lastBadges.value = runCatching { kv.get(KEY)?.let { HexJson.decodeFromString(BadgeCount.serializer(), it) } }.getOrNull()
        }
    }

    private suspend fun saveCount(b: BadgesResponse) {
        runCatching { kv.set(KEY, HexJson.encodeToString(BadgeCount.serializer(), BadgeCount(b.earned, b.total))) }
    }

    fun loadFeed(more: Boolean = false) {
        val cur = _feed.value
        if (more && cur.cursor == null) return
        _feed.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            attempt { api.feed(if (more) cur.cursor else null) }
                .onSuccess { p -> _feed.update { it.copy(items = if (more) it.items + p.items else p.items, cursor = p.nextCursor, loading = false) } }
                .onFailure { e -> _feed.update { it.copy(loading = false, error = e) } }
        }
    }

    /** Alkış: iyimser güncelleme, hata olursa geri al. */
    fun clap(id: String) {
        val before = _feed.value.items
        val item = before.firstOrNull { it.id == id } ?: return
        if (item.clappedByMe) return
        _feed.update { s -> s.copy(items = s.items.map { if (it.id == id) it.copy(clappedByMe = true, claps = it.claps + 1) else it }) }
        viewModelScope.launch {
            attempt { api.clap(id) }
                .onSuccess { r -> if (r != null) _feed.update { s -> s.copy(items = s.items.map { if (it.id == id) it.copy(claps = r.claps, clappedByMe = r.clappedByMe) else it }) } }
                .onFailure { _feed.update { s -> s.copy(items = s.items.map { if (it.id == id) item else it }) } }
        }
    }

    fun acceptFriend(code: String, onDone: () -> Unit = {}) {
        _friendError.value = null
        viewModelScope.launch {
            attempt { api.acceptFriend(code.trim()) }
                .onSuccess { friends.set(it); onDone() }
                .onFailure { _friendError.value = ErrorText.of(it) }
        }
    }

    fun setInsignia(slots: List<String?>, onDone: () -> Unit, onError: (String) -> Unit) {
        viewModelScope.launch {
            attempt { api.setInsignia(slots) }
                .onSuccess { badges.set(it); saveCount(it); onDone() }
                .onFailure { onError(ErrorText.of(it)) }
        }
    }

    private companion object {
        const val KEY = "hexrun.badges.last.v1"
    }
}

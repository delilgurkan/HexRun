package co.hexrun.app.ui.screens.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.hexrun.app.data.LastMap
import co.hexrun.app.data.MapCache
import co.hexrun.app.data.MeRepository
import co.hexrun.app.data.PrefsStore
import co.hexrun.app.ui.attempt
import co.hexrun.core.api.ActiveEvent
import co.hexrun.core.api.ApiError
import co.hexrun.core.api.Bbox
import co.hexrun.core.api.DuelSummary
import co.hexrun.core.api.DuelsResponse
import co.hexrun.core.api.FirstLoopSuggestion
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.api.MapResponse
import co.hexrun.core.api.Me
import co.hexrun.core.api.NotificationFilter
import co.hexrun.core.api.StatsResponse
import co.hexrun.core.geo.LatLng
import co.hexrun.core.hat.Hat
import co.hexrun.core.ui.EventsUi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class MapUi(
    val me: Me? = null,
    val map: MapResponse? = null,
    val loading: Boolean = true,
    val offline: Boolean = false,
    val lastMap: LastMap? = null,
    val duels: DuelsResponse? = null,
    val stats: StatsResponse? = null,
    val events: List<ActiveEvent>? = null,
    val unread: Int = 0,
    val suggestion: FirstLoopSuggestion? = null,
    val firstLoopDismissed: Boolean = false,
    val position: LatLng? = null,
    val fix: Boolean = false,
) {
    /** Gösterilen harita: canlı, yoksa çevrimdışıyken son bilinen. */
    val shown: MapResponse? get() = map ?: if (offline) lastMap?.res else null
    val myCells: Int get() = stats?.cells ?: shown?.players?.firstOrNull { it.id == me?.id }?.cells ?: shown?.cells?.count { it.ownerId != null && it.ownerId == me?.id } ?: 0
    val isEmpty: Boolean get() = shown != null && !offline && myCells == 0 && !firstLoopDismissed
    val activeEvents: List<ActiveEvent> get() = EventsUi.resolve(shown?.activeEvents?.takeIf { it.isNotEmpty() } ?: events).filter { it.active }

    /** Haritadaki kuşatma uyarısı: %70 eşiğini geçen en ilerlemiş düello. */
    val siege: DuelSummary?
        get() = duels?.defending.orEmpty()
            .filter { it.status == "active" && Hat.siegeLevel(it.power, it.progress) != Hat.SiegeLevel.NONE }
            .maxByOrNull { if (it.power > 0) it.progress / it.power else 0.0 }
}

/**
 * 03 · Ana harita durumu: görünür alan değişince (gecikmeli) harita isteği, dakikada bir yenileme,
 * çevrimdışıyken son bilinen harita, boşsa ilk halka önerisi.
 */
class MapViewModel(
    private val api: HexRunApi,
    private val meRepo: MeRepository,
    private val prefs: PrefsStore,
    private val cache: MapCache,
    private val now: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _ui = MutableStateFlow(MapUi())
    val ui: StateFlow<MapUi> = _ui.asStateFlow()
    private var bbox: Bbox? = null
    private var mapJob: Job? = null
    private var firstLoopFor: LatLng? = null

    init {
        viewModelScope.launch { meRepo.me.collect { m -> _ui.update { it.copy(me = m) }; cache.myId = m?.id } }
        viewModelScope.launch { prefs.prefs.collect { p -> _ui.update { it.copy(firstLoopDismissed = p.firstLoopDismissed) } } }
        viewModelScope.launch { cache.duels.collect { d -> if (d != null) _ui.update { it.copy(duels = d) } } }
        viewModelScope.launch { _ui.update { it.copy(lastMap = cache.readLast()) } }
        viewModelScope.launch { meRepo.ensure() }
        refreshSide()
        viewModelScope.launch {
            while (isActive) {
                delay(60_000)
                loadMap()
            }
        }
    }

    fun refreshSide() {
        viewModelScope.launch { attempt { api.duels() }.onSuccess { cache.rememberDuels(it) } }
        viewModelScope.launch { attempt { api.stats() }.onSuccess { s -> _ui.update { it.copy(stats = s) } } }
        viewModelScope.launch { attempt { api.events() }.onSuccess { e -> _ui.update { it.copy(events = e) } } }
        viewModelScope.launch {
            attempt { api.notifications(NotificationFilter.ALL) }.onSuccess { p -> _ui.update { it.copy(unread = p.items.count { n -> !n.read }) } }
        }
    }

    fun onBounds(b: Bbox) {
        bbox = b
        mapJob?.cancel()
        mapJob = viewModelScope.launch {
            delay(300)
            loadMap()
        }
    }

    fun retry() {
        viewModelScope.launch { loadMap() }
        refreshSide()
    }

    private suspend fun loadMap() {
        val b = bbox ?: return
        _ui.update { it.copy(loading = it.map == null) }
        attempt { api.map(b) }
            .onSuccess { res ->
                cache.rememberMap(res, _ui.value.me?.id)
                cache.saveLast(res, now())
                _ui.update { it.copy(map = res, loading = false, offline = false) }
                maybeFirstLoop()
            }
            .onFailure { e ->
                val network = e is ApiError && e.isNetwork
                _ui.update { it.copy(loading = false, offline = network || it.offline) }
            }
    }

    fun onPosition(p: LatLng, fix: Boolean) {
        _ui.update { it.copy(position = p, fix = it.fix || fix) }
        maybeFirstLoop()
    }

    private fun maybeFirstLoop() {
        val u = _ui.value
        val p = u.position ?: return
        if (!u.isEmpty || u.suggestion != null || firstLoopFor != null) return
        firstLoopFor = p
        viewModelScope.launch {
            attempt { api.firstLoop(p.lat, p.lng) }.onSuccess { s -> _ui.update { it.copy(suggestion = s) } }.onFailure { firstLoopFor = null }
        }
    }

    fun dismissFirstLoop() {
        viewModelScope.launch { prefs.update { it.copy(firstLoopDismissed = true) } }
    }
}

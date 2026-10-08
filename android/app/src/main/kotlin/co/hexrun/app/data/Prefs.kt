package co.hexrun.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import co.hexrun.core.api.HexJson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class Prefs(
    @Transient val loaded: Boolean = false,
    val onboardingDone: Boolean = false,
    val permissionsDone: Boolean = false,
    val needsProfile: Boolean = false,
    val firstLoopDismissed: Boolean = false,
    val insigniaIntroSeen: Boolean = false,
    /** Hatırlatılacak etkinlik kimlikleri. */
    val remind: Set<String> = emptySet(),
    /** Konum izni en az bir kez soruldu mu (reddedildi/sorulmadı ayrımı için). */
    val locationAsked: Boolean = false,
    val notificationsAsked: Boolean = false,
    /** Son kaydedilen push jetonu (gereksiz PUT'ları önler). */
    val pushToken: String? = null,
)

/** Uygulama tercihleri (onboarding, izin adımı, hatırlatmalar…). */
interface PrefsStore {
    val prefs: StateFlow<Prefs>
    suspend fun update(fn: (Prefs) -> Prefs)
}

class MemoryPrefsStore(initial: Prefs = Prefs(loaded = true)) : PrefsStore {
    private val s = MutableStateFlow(initial)
    override val prefs: StateFlow<Prefs> = s.asStateFlow()
    override suspend fun update(fn: (Prefs) -> Prefs) = s.update { fn(it).copy(loaded = true) }
}

private val Context.dataStore by preferencesDataStore(name = "hexrun_prefs")

/** DataStore tabanlı tercihler: tek anahtarda JSON. */
class DataStorePrefsStore(private val context: Context, scope: CoroutineScope) : PrefsStore {
    private val key = stringPreferencesKey("prefs.v1")
    private val s = MutableStateFlow(Prefs())
    override val prefs: StateFlow<Prefs> = s.asStateFlow()

    init {
        scope.launch {
            val raw = runCatching { context.dataStore.data.first()[key] }.getOrNull()
            val p = raw?.let { runCatching { HexJson.decodeFromString(Prefs.serializer(), it) }.getOrNull() } ?: Prefs()
            s.value = p.copy(loaded = true)
        }
    }

    override suspend fun update(fn: (Prefs) -> Prefs) {
        val next = fn(s.value).copy(loaded = true)
        s.value = next
        runCatching { context.dataStore.edit { it[key] = HexJson.encodeToString(Prefs.serializer(), next) } }
    }
}

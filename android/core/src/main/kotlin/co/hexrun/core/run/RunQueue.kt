package co.hexrun.core.run

import co.hexrun.core.api.ApiError
import co.hexrun.core.api.HexJson
import co.hexrun.core.api.RunSummary
import co.hexrun.core.api.SubmitRunRequest
import co.hexrun.core.store.KeyValueStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToLong

@Serializable
data class QueuedRun(
    val req: SubmitRunRequest,
    val attempts: Int = 0,
    /** Bir sonraki deneme zamanı (epoch ms). */
    val nextAttemptAt: Long = 0,
    val createdAt: Long = 0,
    val lastError: String? = null,
    /** Kalıcı hata (4xx): bir daha denenmez. */
    val failed: Boolean = false,
)

@Serializable
data class RunQueueState(
    val items: List<QueuedRun> = emptyList(),
    /** clientRunId → sunucu özeti (ekleme sırasıyla). */
    val results: Map<String, RunSummary> = emptyMap(),
)

enum class QueueStatus { DONE, PENDING, FAILED, UNKNOWN }

/**
 * Çevrimdışı koşu kuyruğu (mobile/src/api/runQueue.ts). Her koşu bir istemci UUID'si taşır;
 * sunucu `clientRunId` ile idempotent olduğundan aynı koşu tekrar gönderilse de bir kez sayılır.
 * Geçici hatalarda üstel geri çekilme + ±%20 titreşim; kalıcı 4xx hatada iş bırakılır.
 */
class RunQueue(
    private val kv: KeyValueStore,
    private val submit: suspend (SubmitRunRequest) -> RunSummary,
    private val now: () -> Long = System::currentTimeMillis,
    private val baseDelayMs: Long = 5_000,
    private val maxDelayMs: Long = 10 * 60_000,
    private val random: () -> Double = { Math.random() },
    private val keepResults: Int = 20,
) {
    private var state: RunQueueState? = null
    private val stateLock = Mutex()
    private val flushLock = Mutex()
    private val _version = MutableStateFlow(0)

    /** Her kaydetmede artar: UI aboneliği için. */
    val changes: StateFlow<Int> = _version.asStateFlow()

    private suspend fun loadLocked(): RunQueueState {
        state?.let { return it }
        val s = runCatching { kv.get(KEY)?.let { HexJson.decodeFromString(RunQueueState.serializer(), it) } }.getOrNull() ?: RunQueueState()
        state = s
        return s
    }

    suspend fun load(): RunQueueState = stateLock.withLock { loadLocked() }

    private suspend fun saveLocked(s: RunQueueState) {
        state = s
        runCatching { kv.set(KEY, HexJson.encodeToString(RunQueueState.serializer(), s)) }
        _version.value = _version.value + 1
    }

    suspend fun enqueue(req: SubmitRunRequest) = stateLock.withLock {
        val s = loadLocked()
        if (s.results.containsKey(req.clientRunId) || s.items.any { it.req.clientRunId == req.clientRunId }) return@withLock
        val t = now()
        saveLocked(s.copy(items = s.items + QueuedRun(req, 0, t, t)))
    }

    suspend fun pending(): List<QueuedRun> = load().items.filter { !it.failed }

    suspend fun result(clientRunId: String): RunSummary? = load().results[clientRunId]

    suspend fun status(clientRunId: String): QueueStatus {
        val s = load()
        if (s.results.containsKey(clientRunId)) return QueueStatus.DONE
        val it = s.items.firstOrNull { it.req.clientRunId == clientRunId } ?: return QueueStatus.UNKNOWN
        return if (it.failed) QueueStatus.FAILED else QueueStatus.PENDING
    }

    /** Geri çekilme: taban × 2^(deneme−1), tavan, ±%20 titreşim. */
    fun backoff(attempts: Int): Long {
        val exp = min(maxDelayMs.toDouble(), baseDelayMs * 2.0.pow(maxOf(0, attempts - 1)))
        return (exp * (0.8 + 0.4 * random())).roundToLong()
    }

    /**
     * Vakti gelen işleri gönderir. `force` geri çekilmeyi yok sayar ("Tekrar dene").
     * Aynı anda tek gönderim: devam eden varsa onun bitmesi beklenir.
     */
    suspend fun flush(force: Boolean = false) {
        if (!flushLock.tryLock()) {
            flushLock.withLock { }
            return
        }
        try {
            doFlush(force)
        } finally {
            flushLock.unlock()
        }
    }

    private suspend fun doFlush(force: Boolean) {
        val due = stateLock.withLock { loadLocked().items.filter { !it.failed && (force || it.nextAttemptAt <= now()) } }
        for (item in due) {
            val id = item.req.clientRunId
            try {
                val summary = submit(item.req)
                stateLock.withLock {
                    val s = loadLocked()
                    val results = LinkedHashMap(s.results)
                    results[id] = summary
                    while (results.size > keepResults) results.remove(results.keys.first())
                    saveLocked(s.copy(items = s.items.filter { it.req.clientRunId != id }, results = results))
                }
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                stateLock.withLock {
                    val s = loadLocked()
                    val cur = s.items.firstOrNull { it.req.clientRunId == id } ?: return@withLock
                    val attempts = cur.attempts + 1
                    val permanent = e is ApiError && !e.isRetryable && e.status != 401
                    val next = cur.copy(
                        attempts = attempts,
                        lastError = e.message ?: e.toString(),
                        failed = permanent,
                        nextAttemptAt = if (permanent) cur.nextAttemptAt else now() + backoff(attempts),
                    )
                    saveLocked(s.copy(items = s.items.map { if (it.req.clientRunId == id) next else it }))
                }
                // Ağ yoksa diğerlerini de deneme.
                if (e is ApiError && e.isNetwork) break
            }
        }
    }

    /** En yakın deneme zamanı (zamanlayıcı için); bekleyen yoksa null. */
    suspend fun nextDueAt(): Long? = pending().minOfOrNull { it.nextAttemptAt }

    /** Bellekteki durumu bırakır; bir sonraki erişim depodan okur (süreç yeniden başlamış gibi). */
    suspend fun reload() = stateLock.withLock { state = null }

    companion object {
        const val KEY = "hexrun.runQueue.v1"
    }
}

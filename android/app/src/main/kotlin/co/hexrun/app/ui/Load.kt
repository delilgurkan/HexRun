package co.hexrun.app.ui

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Yüklenebilir veri: son bilinen değer korunur (hata/yenileme sırasında soluk gösterim için). */
data class Load<T>(val data: T? = null, val loading: Boolean = false, val error: Throwable? = null) {
    /** İlk yükleme (henüz veri yok). */
    val initialLoading: Boolean get() = data == null && loading
    val failed: Boolean get() = error != null
}

/** Basit sorgu: yükle, yenile, iyimser güncelle. */
class Query<T>(private val scope: CoroutineScope, private val fetch: suspend () -> T) {
    private val _state = MutableStateFlow(Load<T>(loading = true))
    val state: StateFlow<Load<T>> = _state.asStateFlow()
    private var job: Job? = null

    fun load(): Job {
        job?.cancel()
        _state.update { it.copy(loading = true, error = null) }
        return scope.launch {
            try {
                val d = fetch()
                _state.value = Load(d)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                _state.update { it.copy(loading = false, error = e) }
            }
        }.also { job = it }
    }

    fun set(d: T) {
        _state.value = Load(d)
    }

    fun update(fn: (T) -> T) {
        _state.update { s -> s.data?.let { s.copy(data = fn(it)) } ?: s }
    }
}

/** Askıya alan bloğu çalıştırır; iptal dışındaki hataları sonuç olarak döner. */
suspend fun <T> attempt(block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (e: CancellationException) {
    throw e
} catch (e: Throwable) {
    Result.failure(e)
}

package co.hexrun.core.store

import java.util.concurrent.ConcurrentHashMap

/** Kalıcı anahtar/değer deposu (Android: dosya; test: bellek). */
interface KeyValueStore {
    suspend fun get(key: String): String?
    suspend fun set(key: String, value: String)
    suspend fun remove(key: String)
}

class MemoryKeyValueStore : KeyValueStore {
    val map = ConcurrentHashMap<String, String>()
    override suspend fun get(key: String): String? = map[key]
    override suspend fun set(key: String, value: String) { map[key] = value }
    override suspend fun remove(key: String) { map.remove(key) }
}

/**
 * Yalnız sona eklenen günlük (koşu kaydı). Her satır bağımsız bir JSON kaydıdır; uygulama
 * yazma ortasında öldürülürse yalnız son (yarım) satır kaybolur.
 */
interface AppendLog {
    suspend fun append(lines: List<String>)
    suspend fun readAll(): List<String>
    suspend fun clear()
}

class MemoryAppendLog : AppendLog {
    val lines = ArrayList<String>()
    override suspend fun append(lines: List<String>) { synchronized(this.lines) { this.lines.addAll(lines) } }
    override suspend fun readAll(): List<String> = synchronized(lines) { lines.toList() }
    override suspend fun clear() { synchronized(lines) { lines.clear() } }
}

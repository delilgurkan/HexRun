package co.hexrun.app.data

import android.content.Context
import android.content.SharedPreferences
import android.util.AtomicFile
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import co.hexrun.core.api.HexJson
import co.hexrun.core.api.TokenStore
import co.hexrun.core.api.Tokens
import co.hexrun.core.store.AppendLog
import co.hexrun.core.store.KeyValueStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * Jetonlar Android Keystore anahtarıyla şifrelenmiş SharedPreferences'ta (AES-256-GCM).
 * Bellekte önbelleklenir. Şifreli depo açılamazsa (bozuk anahtar) temizlenip yeniden kurulur.
 */
class SecureTokenStore(private val context: Context) : TokenStore {
    @Volatile private var cache: Tokens? = null
    @Volatile private var loaded = false
    private val prefs: SharedPreferences by lazy { open() }

    private fun open(): SharedPreferences = try {
        create()
    } catch (e: Exception) {
        context.deleteSharedPreferences(FILE)
        create()
    }

    private fun create(): SharedPreferences = EncryptedSharedPreferences.create(
        FILE,
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    override suspend fun get(): Tokens? {
        if (loaded) return cache
        return withContext(Dispatchers.IO) {
            cache = runCatching { prefs.getString(KEY, null)?.let { HexJson.decodeFromString(Tokens.serializer(), it) } }.getOrNull()
            loaded = true
            cache
        }
    }

    override suspend fun set(t: Tokens) {
        cache = t
        loaded = true
        withContext(Dispatchers.IO) { prefs.edit().putString(KEY, HexJson.encodeToString(Tokens.serializer(), t)).commit() }
    }

    override suspend fun clear() {
        cache = null
        loaded = true
        withContext(Dispatchers.IO) { prefs.edit().remove(KEY).commit() }
    }

    private companion object {
        const val FILE = "hexrun.secure"
        const val KEY = "hexrun.tokens.v1"
    }
}

/** Dosya tabanlı anahtar/değer deposu: her anahtar ayrı bir AtomicFile (çökmeye dayanıklı yazma). */
class FileKeyValueStore(context: Context, dirName: String = "kv") : KeyValueStore {
    private val dir = File(context.filesDir, dirName).apply { mkdirs() }
    private val lock = Mutex()

    private fun file(key: String) = AtomicFile(File(dir, key.replace(Regex("[^A-Za-z0-9._-]"), "_")))

    override suspend fun get(key: String): String? = withContext(Dispatchers.IO) {
        lock.withLock { runCatching { String(file(key).readFully(), Charsets.UTF_8) }.getOrNull() }
    }

    override suspend fun set(key: String, value: String) = withContext(Dispatchers.IO) {
        lock.withLock {
            val f = file(key)
            var out: FileOutputStream? = null
            try {
                out = f.startWrite()
                out.write(value.toByteArray(Charsets.UTF_8))
                f.finishWrite(out)
            } catch (e: Exception) {
                if (out != null) f.failWrite(out)
            }
        }
    }

    override suspend fun remove(key: String) = withContext(Dispatchers.IO) { lock.withLock { file(key).delete() } }
}

/**
 * Koşu günlüğü: satır satır sona eklenen dosya. Her eklemede `fsync` yapılır; süreç öldürülürse
 * en çok son yarım satır kaybolur (okurken atlanır).
 */
class FileAppendLog(context: Context, name: String = "active-run.jsonl") : AppendLog {
    private val file = File(context.filesDir, name)
    private val lock = Mutex()

    override suspend fun append(lines: List<String>) = withContext(Dispatchers.IO) {
        if (lines.isEmpty()) return@withContext
        lock.withLock {
            FileOutputStream(file, true).use { os ->
                os.write(lines.joinToString(separator = "\n", postfix = "\n").toByteArray(Charsets.UTF_8))
                runCatching { os.fd.sync() }
            }
        }
    }

    override suspend fun readAll(): List<String> = withContext(Dispatchers.IO) {
        lock.withLock { if (file.exists()) file.readLines(Charsets.UTF_8).filter { it.isNotBlank() } else emptyList() }
    }

    override suspend fun clear() = withContext(Dispatchers.IO) { lock.withLock { if (file.exists()) file.delete(); Unit } }
}

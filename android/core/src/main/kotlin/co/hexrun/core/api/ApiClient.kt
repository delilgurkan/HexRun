package co.hexrun.core.api

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.io.InterruptedIOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

enum class Method { GET, POST, PUT, PATCH, DELETE }

/** Ham yanıt: durum kodu ve gövde metni. */
data class RawResponse(val code: Int, val body: String) {
    val ok: Boolean get() = code in 200..299
}

/**
 * Tipli HTTP istemcisi: `/v1` taban yolu, Bearer JWT, istek zaman aşımı, 401'de tek seferlik
 * jeton yenileme (eşzamanlı 401'ler tek yenilemeyi paylaşır), yenileme reddedilirse çıkış.
 *
 * Yenileme jetonu her kullanımda döner ve eski jeton tekrar gelirse sunucu tüm oturum ailesini
 * iptal eder; bu yüzden 401 alan istek, depodaki erişim jetonu kendi kullandığından farklıysa
 * (başka bir istek zaten yeniledi) yeniden yenilemez, yeni jetonla tekrar dener.
 */
class ApiClient(
    baseUrl: String,
    val tokens: TokenStore,
    http: OkHttpClient? = null,
    private val timeoutMs: Long = 15_000,
    private val now: () -> Long = System::currentTimeMillis,
    @Volatile var onLogout: (() -> Unit)? = null,
    val json: Json = HexJson,
    /** Her isteğe eklenen başlıklar (ör. User-Agent, Accept-Language). */
    private val extraHeaders: Map<String, String> = emptyMap(),
) {
    val baseUrl: String = baseUrl.trimEnd('/')
    private val http: OkHttpClient = http ?: OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Any()
    private var refreshing: Deferred<Tokens?>? = null

    fun url(path: String, query: Map<String, Any?> = emptyMap()): HttpUrl {
        val p = if (path.startsWith("/")) path else "/$path"
        val b = "$baseUrl/v1$p".toHttpUrl().newBuilder()
        for ((k, v) in query) if (v != null) b.addQueryParameter(k, v.toString())
        return b.build()
    }

    suspend fun saveAuth(res: AuthResponse) {
        tokens.set(Tokens(res.accessToken, res.refreshToken, now() + res.expiresIn * 1000))
    }

    /**
     * İstek gönderir, 2xx gövdesini döner (204/boş → null). Hata → [ApiError].
     * @param body JSON metni (null → gövdesiz).
     */
    suspend fun requestRaw(
        method: Method,
        path: String,
        body: String? = null,
        query: Map<String, Any?> = emptyMap(),
        auth: Boolean = true,
        timeoutMs: Long? = null,
    ): String? {
        var t = if (auth) tokens.get() else null
        // Süresi dolmak üzereyse önden yenile (30 sn pay).
        if (auth && t != null && t.expiresAt - 30_000 < now()) {
            val fresh = refresh(t)
            if (fresh == null) {
                logout()
                throw ApiError(401, "unauthorized", "Oturumun sona erdi. Tekrar giriş yap.")
            }
            t = fresh
        }
        var res = send(method, path, body, query, t?.accessToken, timeoutMs)
        if (res.code == 401 && auth && t != null) {
            val fresh = refresh(t)
            if (fresh == null) {
                logout()
                throw ApiError.fromBody(res.code, res.body, json)
            }
            res = send(method, path, body, query, fresh.accessToken, timeoutMs)
            if (res.code == 401) {
                logout()
                throw ApiError.fromBody(res.code, res.body, json)
            }
        }
        if (!res.ok) throw ApiError.fromBody(res.code, res.body, json)
        if (res.code == 204 || res.body.isEmpty()) return null
        return res.body
    }

    suspend fun <T> request(
        method: Method,
        path: String,
        deserializer: KSerializer<T>,
        body: String? = null,
        query: Map<String, Any?> = emptyMap(),
        auth: Boolean = true,
        timeoutMs: Long? = null,
    ): T? {
        val text = requestRaw(method, path, body, query, auth, timeoutMs) ?: return null
        return try {
            json.decodeFromString(deserializer, text)
        } catch (e: Exception) {
            throw ApiError(200, "bad_json", "Sunucu yanıtı okunamadı.", e)
        }
    }

    suspend inline fun <reified T> get(path: String, query: Map<String, Any?> = emptyMap(), timeoutMs: Long? = null): T? =
        request(Method.GET, path, serializer<T>(), null, query, true, timeoutMs)

    suspend inline fun <reified T, reified B> post(path: String, body: B, auth: Boolean = true, timeoutMs: Long? = null): T? =
        request(Method.POST, path, serializer<T>(), json.encodeToString(serializer<B>(), body), emptyMap(), auth, timeoutMs)

    suspend inline fun <reified T, reified B> put(path: String, body: B): T? =
        request(Method.PUT, path, serializer<T>(), json.encodeToString(serializer<B>(), body))

    suspend inline fun <reified T, reified B> patch(path: String, body: B): T? =
        request(Method.PATCH, path, serializer<T>(), json.encodeToString(serializer<B>(), body))

    suspend fun delete(path: String) {
        requestRaw(Method.DELETE, path)
    }

    /**
     * Jeton yenileme. Eşzamanlı çağrılar tek isteği paylaşır. `used` bu isteğin kullandığı
     * jetonsa ve depoda daha yenisi varsa yenileme yapılmaz.
     * Ağ hatasında [ApiError] fırlatır (oturum kapatılmaz); gerçek retde null döner.
     */
    suspend fun refresh(used: Tokens? = null): Tokens? {
        val current = tokens.get()
        if (used != null && current != null && current.accessToken != used.accessToken) return current
        val d = synchronized(lock) {
            refreshing ?: scope.async(start = CoroutineStart.LAZY) {
                try {
                    doRefresh()
                } finally {
                    synchronized(lock) { refreshing = null }
                }
            }.also { refreshing = it }
        }
        d.start()
        return d.await()
    }

    private suspend fun doRefresh(): Tokens? {
        val rt = tokens.get()?.refreshToken ?: return null
        val res = send(Method.POST, "/auth/refresh", json.encodeToString(RefreshRequest.serializer(), RefreshRequest(rt)), emptyMap(), null, null)
        if (!res.ok) {
            // Gerçek ret (400/401/403): oturum bitti. Sunucu hatası: geçici, oturum korunur.
            if (res.code == 400 || res.code == 401 || res.code == 403) return null
            throw ApiError.fromBody(res.code, res.body, json)
        }
        val body = try {
            json.decodeFromString(AuthResponse.serializer(), res.body)
        } catch (e: Exception) {
            return null
        }
        saveAuth(body)
        return tokens.get()
    }

    suspend fun logout() {
        tokens.clear()
        onLogout?.invoke()
    }

    private suspend fun send(
        method: Method,
        path: String,
        body: String?,
        query: Map<String, Any?>,
        accessToken: String?,
        timeoutMs: Long?,
    ): RawResponse {
        val rb = Request.Builder().url(url(path, query)).header("Accept", "application/json")
        for ((k, v) in extraHeaders) rb.header(k, v)
        if (accessToken != null) rb.header("Authorization", "Bearer $accessToken")
        val reqBody = body?.toRequestBody(JSON)
        when (method) {
            Method.GET -> rb.get()
            Method.DELETE -> if (reqBody != null) rb.delete(reqBody) else rb.delete()
            Method.POST -> rb.post(reqBody ?: EMPTY_JSON.toRequestBody(JSON))
            Method.PUT -> rb.put(reqBody ?: EMPTY_JSON.toRequestBody(JSON))
            Method.PATCH -> rb.patch(reqBody ?: EMPTY_JSON.toRequestBody(JSON))
        }
        val client = http.newBuilder().callTimeout(timeoutMs ?: this.timeoutMs, TimeUnit.MILLISECONDS).build()
        val call = client.newCall(rb.build())
        return try {
            call.await()
        } catch (e: InterruptedIOException) {
            throw ApiError.timeout(e)
        } catch (e: IOException) {
            throw ApiError.network(e)
        }
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private const val EMPTY_JSON = "{}"
    }
}

/** OkHttp çağrısını askıya alınabilir yapar; eşyordam iptal edilirse çağrı da iptal edilir. */
suspend fun Call.await(): RawResponse = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { runCatching { cancel() } }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (!cont.isCancelled) cont.resumeWithException(e)
        }

        override fun onResponse(call: Call, response: Response) {
            val r = try {
                response.use { RawResponse(it.code, it.body?.string() ?: "") }
            } catch (e: IOException) {
                if (!cont.isCancelled) cont.resumeWithException(e)
                return
            }
            cont.resume(r)
        }
    })
}

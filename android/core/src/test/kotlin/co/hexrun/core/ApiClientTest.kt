package co.hexrun.core

import co.hexrun.core.api.ApiClient
import co.hexrun.core.api.ApiError
import co.hexrun.core.api.ErrorText
import co.hexrun.core.api.HttpHexRunApi
import co.hexrun.core.api.MemoryTokenStore
import co.hexrun.core.api.Tokens
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

private fun me(id: String = "u1") = """{"id":"$id","username":"deniz","displayName":"Deniz Arslan","initials":"DA","slot":"keh","teamName":null,"insignia":[],"goldFrame":false,"email":null,"createdAt":"2026-10-01T00:00:00Z","newbieDaysLeft":3,"teamId":null,"privacy":{"enabled":false,"radiusM":null},"canChangeInsignia":true,"locale":"tr","unknownField":1}"""

private fun auth(access: String, refresh: String) = """{"accessToken":"$access","refreshToken":"$refresh","expiresIn":900,"user":${me()},"needsProfile":false}"""

class ApiClientTest {
    private lateinit var server: MockWebServer
    private val now = 1_000_000L

    @BeforeEach fun setUp() { server = MockWebServer(); server.start() }
    @AfterEach fun tearDown() { server.shutdown() }

    private fun client(tokens: MemoryTokenStore, onLogout: () -> Unit = {}, timeoutMs: Long = 5_000) =
        ApiClient(server.url("/").toString(), tokens, timeoutMs = timeoutMs, now = { now }, onLogout = onLogout)

    private fun valid(access: String = "a1", refresh: String = "r1") = Tokens(access, refresh, now + 10 * 60_000)

    @Test
    fun `bearer token ve v1 taban yolu`() = runBlocking<Unit> {
        server.enqueue(MockResponse().setBody(me()))
        val api = HttpHexRunApi(client(MemoryTokenStore(valid())))
        val m = api.me()
        assertEquals("u1", m.id)
        val r = server.takeRequest()
        assertEquals("/v1/me", r.path)
        assertEquals("Bearer a1", r.getHeader("Authorization"))
    }

    @Test
    fun `401 sonrasi tek yenileme ve tekrar deneme`() = runBlocking<Unit> {
        val tokens = MemoryTokenStore(valid())
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when {
                request.path == "/v1/auth/refresh" -> MockResponse().setBody(auth("a2", "r2"))
                request.getHeader("Authorization") == "Bearer a2" -> MockResponse().setBody(me())
                else -> MockResponse().setResponseCode(401).setBody("""{"error":{"code":"unauthorized","message":"Oturum geçersiz."}}""")
            }
        }
        val api = HttpHexRunApi(client(tokens))
        assertEquals("u1", api.me().id)
        assertEquals("a2", tokens.get()!!.accessToken)
        assertEquals("r2", tokens.get()!!.refreshToken)
        val paths = (0 until server.requestCount).map { server.takeRequest().path }
        assertEquals(listOf("/v1/me", "/v1/auth/refresh", "/v1/me"), paths)
    }

    @Test
    fun `eszamanli 401ler tek yenileme istegi paylasir`() = runBlocking<Unit> {
        val tokens = MemoryTokenStore(valid())
        val refreshes = AtomicInteger()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when {
                request.path == "/v1/auth/refresh" -> {
                    refreshes.incrementAndGet()
                    MockResponse().setBody(auth("a2", "r2")).setBodyDelay(200, TimeUnit.MILLISECONDS)
                }
                request.getHeader("Authorization") == "Bearer a2" -> MockResponse().setBody(me())
                else -> MockResponse().setResponseCode(401)
            }
        }
        val api = HttpHexRunApi(client(tokens))
        val results = (1..6).map { async(kotlinx.coroutines.Dispatchers.IO) { api.me().id } }.awaitAll()
        assertEquals(List(6) { "u1" }, results)
        assertEquals(1, refreshes.get(), "yalnız bir yenileme")
    }

    @Test
    fun `baska istek zaten yenilediyse eski yenileme jetonu tekrar gonderilmez`() = runBlocking<Unit> {
        // İstek a1 ile gider ve 401 alır; bu arada depo zaten a2'ye geçmiştir.
        val tokens = MemoryTokenStore(valid())
        var refreshes = 0
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when {
                request.path == "/v1/auth/refresh" -> { refreshes++; MockResponse().setResponseCode(401) }
                request.getHeader("Authorization") == "Bearer a2" -> MockResponse().setBody(me())
                else -> {
                    runBlocking { tokens.set(Tokens("a2", "r2", now + 600_000)) }
                    MockResponse().setResponseCode(401)
                }
            }
        }
        val api = HttpHexRunApi(client(tokens))
        assertEquals("u1", api.me().id)
        assertEquals(0, refreshes)
    }

    @Test
    fun `yenileme reddedilirse cikis yapilir`() = runBlocking<Unit> {
        val tokens = MemoryTokenStore(valid())
        var loggedOut = 0
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                if (request.path == "/v1/auth/refresh") MockResponse().setResponseCode(401).setBody("""{"error":{"code":"invalid_refresh","message":"Oturum sona erdi."}}""")
                else MockResponse().setResponseCode(401).setBody("""{"error":{"code":"unauthorized","message":"Giriş gerekli."}}""")
        }
        val api = HttpHexRunApi(client(tokens, onLogout = { loggedOut++ }))
        val e = assertFailsWith<ApiError> { api.me() }
        assertEquals(401, e.status)
        assertEquals("unauthorized", e.code)
        assertEquals(1, loggedOut)
        assertNull(tokens.get())
    }

    @Test
    fun `suresi dolmak uzere olan jeton onden yenilenir`() = runBlocking<Unit> {
        val tokens = MemoryTokenStore(Tokens("a1", "r1", now + 10_000))
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/v1/auth/refresh" -> MockResponse().setBody(auth("a2", "r2"))
                else -> if (request.getHeader("Authorization") == "Bearer a2") MockResponse().setBody(me()) else MockResponse().setResponseCode(401)
            }
        }
        assertEquals("u1", HttpHexRunApi(client(tokens)).me().id)
        assertEquals(listOf("/v1/auth/refresh", "/v1/me"), (0 until server.requestCount).map { server.takeRequest().path })
    }

    @Test
    fun `ApiError sunucunun Turkce mesajini tasir`() = runBlocking<Unit> {
        server.enqueue(MockResponse().setResponseCode(409).setBody("""{"error":{"code":"duel_limit","message":"Aynı anda en çok 3 düellon olabilir."}}"""))
        val e = assertFailsWith<ApiError> { HttpHexRunApi(client(MemoryTokenStore(valid()))).createDuel(listOf("8c1ec902e99c9ff")) }
        assertEquals(409, e.status)
        assertEquals("duel_limit", e.code)
        assertEquals("Aynı anda en çok 3 düellon olabilir.", e.message)
        assertEquals("Aynı anda en çok 3 düellon olabilir.", ErrorText.of(e))
        assertTrue(!e.isRetryable)
    }

    @Test
    fun `govdesiz hata ve 204`() = runBlocking<Unit> {
        server.enqueue(MockResponse().setResponseCode(503))
        server.enqueue(MockResponse().setResponseCode(204))
        val api = HttpHexRunApi(client(MemoryTokenStore(valid())))
        val e = assertFailsWith<ApiError> { api.me() }
        assertEquals("http_503", e.code)
        assertTrue(e.isRetryable)
        assertEquals(ErrorText.GENERIC, ErrorText.of(e))
        assertNull(api.myTeam())
    }

    @Test
    fun `zaman asimi ag hatasi olarak doner`() = runBlocking<Unit> {
        server.enqueue(MockResponse().setBody(me()).setHeadersDelay(2, TimeUnit.SECONDS))
        val e = assertFailsWith<ApiError> { HttpHexRunApi(client(MemoryTokenStore(valid()), timeoutMs = 300)).me() }
        assertEquals(0, e.status)
        assertEquals("timeout", e.code)
        assertTrue(e.isNetwork)
    }

    @Test
    fun `baglanti yoksa network hatasi`() = runBlocking<Unit> {
        val c = ApiClient("http://127.0.0.1:1", MemoryTokenStore(valid()), now = { now })
        val e = assertFailsWith<ApiError> { HttpHexRunApi(c).me() }
        assertEquals("network", e.code)
        assertEquals("Bağlantı kurulamadı.", ErrorText.of(e))
    }

    @Test
    fun `gizlilik kapatma home null gonderir ve harita bbox bicimi`() = runBlocking<Unit> {
        server.enqueue(MockResponse().setBody(me()))
        server.enqueue(MockResponse().setBody("""{"cells":[],"players":[],"attackersLast48h":0,"activeEvents":[],"truncated":false,"serverTime":"x"}"""))
        val api = HttpHexRunApi(client(MemoryTokenStore(valid())))
        api.privacy(null, null)
        assertEquals("""{"home":null}""", server.takeRequest().body.readUtf8())
        api.map(co.hexrun.core.api.Bbox(40.98, 29.02, 40.99, 29.03))
        assertEquals("/v1/map?bbox=40.980000%2C29.020000%2C40.990000%2C29.030000", server.takeRequest().path)
    }

    @Test
    fun `push jetonu fcm saglayicisiyla`() = runBlocking<Unit> {
        server.enqueue(MockResponse().setResponseCode(204))
        HttpHexRunApi(client(MemoryTokenStore(valid()))).pushToken("fcm-token-123456")
        val r = server.takeRequest()
        assertEquals("PUT", r.method)
        assertEquals("/v1/me/push-token", r.path)
        assertEquals("""{"token":"fcm-token-123456","platform":"android","provider":"fcm"}""", r.body.readUtf8())
    }
}

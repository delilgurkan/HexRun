package co.hexrun.core

import co.hexrun.core.api.ApiError
import co.hexrun.core.api.RunSummary
import co.hexrun.core.api.SubmitRunRequest
import co.hexrun.core.api.TrackPointDto
import co.hexrun.core.run.QueueStatus
import co.hexrun.core.run.RunQueue
import co.hexrun.core.store.MemoryKeyValueStore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RunQueueTest {
    private var clock = 1_000_000L
    private val kv = MemoryKeyValueStore()
    private fun req(id: String) = SubmitRunRequest(clientRunId = id, points = listOf(TrackPointDto(40.0, 29.0, 1), TrackPointDto(40.001, 29.0, 2)))
    private fun summary(id: String) = RunSummary(id = "srv-$id")

    @Test
    fun `basarili gonderim sonucu saklar ve kuyruktan cikarir`() = runBlocking<Unit> {
        val sent = ArrayList<String>()
        val q = RunQueue(kv, submit = { sent += it.clientRunId; summary(it.clientRunId) }, now = { clock })
        q.enqueue(req("aaaaaaaa"))
        q.enqueue(req("aaaaaaaa")) // aynı koşu iki kez kuyruğa girmez
        assertEquals(QueueStatus.PENDING, q.status("aaaaaaaa"))
        q.flush()
        assertEquals(listOf("aaaaaaaa"), sent)
        assertEquals(QueueStatus.DONE, q.status("aaaaaaaa"))
        assertEquals("srv-aaaaaaaa", q.result("aaaaaaaa")!!.id)
        q.enqueue(req("aaaaaaaa")) // sonucu olan koşu tekrar gönderilmez (idempotent)
        q.flush(force = true)
        assertEquals(1, sent.size)
    }

    @Test
    fun `gecici hatada ustel geri cekilme ve titresim`() = runBlocking<Unit> {
        var fail = true
        val q = RunQueue(kv, submit = { if (fail) throw ApiError(503, "http_503", "HTTP 503") else summary(it.clientRunId) }, now = { clock }, baseDelayMs = 5_000, random = { 0.5 })
        assertEquals(5_000, q.backoff(1))
        assertEquals(10_000, q.backoff(2))
        assertEquals(20_000, q.backoff(3))
        assertEquals(600_000, q.backoff(30), "tavan 10 dk")
        val jitterLow = RunQueue(kv, submit = { summary("x") }, random = { 0.0 }).backoff(1)
        val jitterHigh = RunQueue(kv, submit = { summary("x") }, random = { 1.0 }).backoff(1)
        assertEquals(4_000, jitterLow)
        assertEquals(6_000, jitterHigh)

        q.enqueue(req("bbbbbbbb"))
        q.flush()
        val item = q.pending().single()
        assertEquals(1, item.attempts)
        assertEquals(clock + 5_000, item.nextAttemptAt)
        q.flush() // vakti gelmedi: denenmez
        assertEquals(1, q.pending().single().attempts)
        clock += 5_000
        q.flush()
        assertEquals(2, q.pending().single().attempts)
        assertEquals(clock + 10_000, q.pending().single().nextAttemptAt)
        fail = false
        q.flush(force = true)
        assertEquals(QueueStatus.DONE, q.status("bbbbbbbb"))
    }

    @Test
    fun `kalici 4xx hatada is birakilir, 401 ve ag hatasi denenmeye devam eder`() = runBlocking<Unit> {
        val q = RunQueue(kv, submit = {
            when (it.clientRunId) {
                "c-422-xxx" -> throw ApiError(422, "validation", "Geçersiz koşu.")
                "c-401-xxx" -> throw ApiError(401, "unauthorized", "Giriş gerekli.")
                else -> throw ApiError.network()
            }
        }, now = { clock })
        q.enqueue(req("c-422-xxx"))
        q.enqueue(req("c-401-xxx"))
        q.flush()
        assertEquals(QueueStatus.FAILED, q.status("c-422-xxx"))
        assertEquals(QueueStatus.PENDING, q.status("c-401-xxx"))
        assertEquals(listOf("c-401-xxx"), q.pending().map { it.req.clientRunId })
        clock += 60_000
        q.enqueue(req("c-net-xxx"))
        q.flush()
        assertEquals(QueueStatus.PENDING, q.status("c-net-xxx"))
    }

    @Test
    fun `ag hatasinda diger isler denenmez`() = runBlocking<Unit> {
        val tried = ArrayList<String>()
        val q = RunQueue(kv, submit = { tried += it.clientRunId; throw ApiError.network() }, now = { clock })
        q.enqueue(req("d1-xxxxx"))
        q.enqueue(req("d2-xxxxx"))
        q.flush()
        assertEquals(listOf("d1-xxxxx"), tried)
    }

    @Test
    fun `depodan yeniden yukleme`() = runBlocking<Unit> {
        val q1 = RunQueue(kv, submit = { throw ApiError.network() }, now = { clock })
        q1.enqueue(req("eeeeeeee"))
        q1.flush()
        val q2 = RunQueue(kv, submit = { summary(it.clientRunId) }, now = { clock })
        assertEquals(1, q2.pending().size)
        assertEquals(1, q2.pending().single().attempts)
        q2.flush(force = true)
        assertEquals(QueueStatus.DONE, q2.status("eeeeeeee"))
        q1.reload()
        assertEquals(QueueStatus.DONE, q1.status("eeeeeeee"))
        assertNotNull(RunQueue(kv, submit = { summary("x") }).result("eeeeeeee"))
    }

    @Test
    fun `sonuc sayisi sinirli ve eszamanli flush tek gonderim yapar`() = runBlocking<Unit> {
        val gate = CompletableDeferred<Unit>()
        var calls = 0
        val q = RunQueue(kv, submit = { calls++; gate.await(); summary(it.clientRunId) }, now = { clock }, keepResults = 2)
        q.enqueue(req("f1-xxxxx"))
        val a = async(Dispatchers.Default) { q.flush() }
        val b = async(Dispatchers.Default) { kotlinx.coroutines.delay(50); q.flush() }
        kotlinx.coroutines.delay(150)
        gate.complete(Unit)
        a.await(); b.await()
        assertEquals(1, calls)
        q.enqueue(req("f2-xxxxx")); q.enqueue(req("f3-xxxxx"))
        q.flush()
        assertNull(q.result("f1-xxxxx"), "en eski sonuç düşer")
        assertTrue(q.result("f3-xxxxx") != null)
    }
}

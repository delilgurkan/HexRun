package co.hexrun.app.run

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import co.hexrun.app.HexRunApp
import java.util.concurrent.TimeUnit

/**
 * Çevrimdışı koşu kuyruğunu ağ gelince gönderir. Sunucu `clientRunId` ile idempotent olduğundan
 * tekrar denemek güvenlidir; kalıcı 4xx hatalar kuyrukta "failed" olarak kalır.
 */
class RunUploadWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val graph = (applicationContext as HexRunApp).graph
        graph.runQueue.flush(force = true)
        return if (graph.runQueue.pending().isEmpty()) Result.success() else Result.retry()
    }

    companion object {
        private const val NAME = "hexrun-run-upload"

        fun schedule(context: Context) {
            val req = OneTimeWorkRequestBuilder<RunUploadWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            runCatching { WorkManager.getInstance(context).enqueueUniqueWork(NAME, ExistingWorkPolicy.REPLACE, req) }
        }
    }
}

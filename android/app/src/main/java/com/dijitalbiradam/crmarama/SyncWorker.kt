package com.dijitalbiradam.crmarama

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        return try {
            prefs.lastResult = CallSync.run(applicationContext)
            Result.success()
        } catch (e: ApiException) {
            prefs.lastResult = "Hata: ${e.message}"
            if (e.status == 401) Result.failure() else Result.retry()
        } catch (e: Exception) {
            prefs.lastResult = "Bağlantı hatası, tekrar denenecek"
            Result.retry()
        }
    }

    companion object {
        private val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** 15 dakikada bir (Android'in izin verdiği en sık aralık) */
        fun schedulePeriodic(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(net)
                .setBackoffCriteria(BackoffPolicy.LINEAR, 1, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("crm-sync", ExistingPeriodicWorkPolicy.UPDATE, req)
        }

        /** Görüşme bitince birkaç saniye sonra hemen gönder */
        fun syncSoon(ctx: Context, delaySec: Long = 8) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setInitialDelay(delaySec, TimeUnit.SECONDS)
                .setConstraints(net)
                .setBackoffCriteria(BackoffPolicy.LINEAR, 1, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork("crm-sync-now", ExistingWorkPolicy.REPLACE, req)
        }

        fun cancelAll(ctx: Context) = WorkManager.getInstance(ctx).cancelAllWork()
    }
}

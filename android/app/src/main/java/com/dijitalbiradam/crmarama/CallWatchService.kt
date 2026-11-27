package com.dijitalbiradam.crmarama

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.database.ContentObserver
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.CallLog

/**
 * Arka planda sürekli çalışan küçük servis. Telefonun arama geçmişini izler; yeni bir kayıt
 * düştüğü anda (görüşme bitince) CRM'e gönderimi tetikler. Xiaomi gibi markalar yayınları
 * engellediği için yalnız görüşme-bitti yayınına güvenilmez.
 */
class CallWatchService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private val trigger = Runnable { SyncWorker.syncSoon(this, 1) }

    private val observer = object : ContentObserver(handler) {
        override fun onChange(selfChange: Boolean) {
            // Aynı arama için birden fazla değişiklik gelir; 4 sn bekleyip tek gönderim yap
            handler.removeCallbacks(trigger)
            handler.postDelayed(trigger, 4_000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        startAsForeground()
        if (CallSync.hasPermission(this)) {
            try { contentResolver.registerContentObserver(CallLog.Calls.CONTENT_URI, true, observer) } catch (_: Exception) {}
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Prefs(this).loggedIn) { stopSelf(); return START_NOT_STICKY }
        return START_STICKY
    }

    override fun onDestroy() {
        try { contentResolver.unregisterContentObserver(observer) } catch (_: Exception) {}
        handler.removeCallbacks(trigger)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startAsForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "CRM Arama", NotificationManager.IMPORTANCE_MIN).apply {
            description = "Müşteri aramalarını CRM'e aktarır"
            setShowBadge(false)
        })
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_app)
            .setContentTitle("CRM Arama açık")
            .setContentText("Müşteri aramaları CRM'e aktarılıyor")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(1, n)
    }

    companion object {
        private const val CHANNEL = "crm_arama_servis"

        fun start(ctx: Context) {
            if (!Prefs(ctx).loggedIn || !CallSync.hasPermission(ctx)) return
            try { ctx.startForegroundService(Intent(ctx, CallWatchService::class.java)) } catch (_: Exception) {}
        }

        fun stop(ctx: Context) = ctx.stopService(Intent(ctx, CallWatchService::class.java))
    }
}

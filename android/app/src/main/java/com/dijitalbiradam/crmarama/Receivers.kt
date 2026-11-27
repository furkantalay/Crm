package com.dijitalbiradam.crmarama

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager

class CallStateReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.getStringExtra(TelephonyManager.EXTRA_STATE) == TelephonyManager.EXTRA_STATE_IDLE && Prefs(ctx).loggedIn) {
            SyncWorker.syncSoon(ctx)
            CallWatchService.start(ctx)
        }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (Prefs(ctx).loggedIn) {
            SyncWorker.schedulePeriodic(ctx)
            SyncWorker.syncSoon(ctx, 30)
            CallWatchService.start(ctx)
        }
    }
}

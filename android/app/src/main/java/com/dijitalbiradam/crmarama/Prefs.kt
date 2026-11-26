package com.dijitalbiradam.crmarama

import android.content.Context

class Prefs(ctx: Context) {
    private val p = ctx.getSharedPreferences("crm_arama", Context.MODE_PRIVATE)

    var username: String? get() = p.getString("username", null); set(v) = p.edit().putString("username", v).apply()
    var fullName: String? get() = p.getString("full_name", null); set(v) = p.edit().putString("full_name", v).apply()
    var accessToken: String? get() = p.getString("access", null); set(v) = p.edit().putString("access", v).apply()
    var refreshToken: String? get() = p.getString("refresh", null); set(v) = p.edit().putString("refresh", v).apply()
    var expiresAt: Long get() = p.getLong("expires_at", 0); set(v) = p.edit().putLong("expires_at", v).apply()
    /** Gönderilen en son aramanın zamanı (ms) */
    var lastCallMs: Long get() = p.getLong("last_call_ms", 0); set(v) = p.edit().putLong("last_call_ms", v).apply()
    var lastSyncMs: Long get() = p.getLong("last_sync_ms", 0); set(v) = p.edit().putLong("last_sync_ms", v).apply()
    var lastResult: String? get() = p.getString("last_result", null); set(v) = p.edit().putString("last_result", v).apply()
    var totalSaved: Int get() = p.getInt("total_saved", 0); set(v) = p.edit().putInt("total_saved", v).apply()

    val loggedIn get() = refreshToken != null

    fun clear() = p.edit().clear().apply()
}

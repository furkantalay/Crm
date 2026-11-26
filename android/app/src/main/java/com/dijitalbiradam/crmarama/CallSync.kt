package com.dijitalbiradam.crmarama

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.CallLog
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.time.Instant

object CallSync {

    data class Call(val id: Long, val phone: String, val type: Int, val date: Long, val duration: Int)

    fun hasPermission(ctx: Context) =
        ctx.checkSelfPermission(Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED

    private fun norm10(phone: String): String = phone.filter { it.isDigit() }.takeLast(10)

    private fun sha256(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun dir(type: Int): String? = when (type) {
        CallLog.Calls.OUTGOING_TYPE -> "out"
        CallLog.Calls.INCOMING_TYPE -> "in"
        CallLog.Calls.MISSED_TYPE -> "missed"
        CallLog.Calls.REJECTED_TYPE -> "rejected"
        else -> null // engellenen, sesli mesaj vb. gönderilmez
    }

    private fun readCalls(ctx: Context, sinceMs: Long): List<Call> {
        val out = ArrayList<Call>()
        val cols = arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION)
        ctx.contentResolver.query(
            CallLog.Calls.CONTENT_URI, cols, "${CallLog.Calls.DATE} > ?", arrayOf(sinceMs.toString()),
            "${CallLog.Calls.DATE} ASC"
        )?.use { c ->
            while (c.moveToNext()) {
                out.add(Call(c.getLong(0), c.getString(1) ?: "", c.getInt(2), c.getLong(3), c.getInt(4)))
            }
        }
        return out
    }

    private fun device(ctx: Context, permissionOk: Boolean): JSONObject {
        val version = try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName } catch (_: Exception) { "?" }
        return JSONObject()
            .put("model", "${Build.MANUFACTURER} ${Build.MODEL} (Android ${Build.VERSION.RELEASE})")
            .put("version", version)
            .put("permission_ok", permissionOk)
    }

    /** Yeni aramaları CRM'e gönderir. Dönen metin ekranda "son durum" olarak gösterilir. */
    fun run(ctx: Context): String {
        val prefs = Prefs(ctx)
        if (!prefs.loggedIn) return "Giriş yapılmamış"
        val api = Api(prefs)

        if (!hasPermission(ctx)) {
            api.ingest(JSONArray(), device(ctx, false)) // yöneticiye "izin kapalı" görünsün
            return "Arama kaydı izni kapalı"
        }

        val firstRun = prefs.lastCallMs == 0L
        val since = if (firstRun) System.currentTimeMillis() - Config.INITIAL_DAYS * 86_400_000L
                    else prefs.lastCallMs - 2 * 3_600_000L // görüşme sürerken kaydedilmeyenler için 2 saat geriden al
        val calls = readCalls(ctx, since).filter { dir(it.type) != null && norm10(it.phone).length == 10 }

        // Giden aramalarda gizlilik: önce numaranın yalnız özeti (hash) sorulur,
        // CRM'de kayıtlı değilse numara telefondan hiç çıkmaz.
        val outHashes = calls.filter { it.type == CallLog.Calls.OUTGOING_TYPE }.map { sha256(norm10(it.phone)) }.distinct()
        val known = HashSet<String>()
        outHashes.chunked(500).forEach { known.addAll(api.matchHashes(it)) }

        val keep = calls.filter { it.type != CallLog.Calls.OUTGOING_TYPE || sha256(norm10(it.phone)) in known }

        var saved = 0
        if (keep.isEmpty()) {
            api.ingest(JSONArray(), device(ctx, true))
        } else {
            keep.chunked(200).forEach { batch ->
                val arr = JSONArray()
                batch.forEach { c ->
                    arr.put(JSONObject()
                        .put("key", "${c.id}-${c.date}")
                        .put("phone", c.phone)
                        .put("dir", dir(c.type))
                        .put("at", Instant.ofEpochMilli(c.date).toString())
                        .put("dur", c.duration))
                }
                saved += api.ingest(arr, device(ctx, true)).optInt("saved", 0)
            }
        }

        calls.maxOfOrNull { it.date }?.let { if (it > prefs.lastCallMs) prefs.lastCallMs = it }
        if (firstRun && calls.isEmpty()) prefs.lastCallMs = System.currentTimeMillis() - 2 * 3_600_000L
        prefs.lastSyncMs = System.currentTimeMillis()
        prefs.totalSaved = prefs.totalSaved + saved
        return if (saved > 0) "$saved yeni arama gönderildi" else "Yeni arama yok"
    }
}

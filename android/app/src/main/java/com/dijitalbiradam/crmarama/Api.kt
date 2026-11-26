package com.dijitalbiradam.crmarama

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiException(message: String, val status: Int = 0) : Exception(message)

/** Supabase ile düz HTTP konuşan küçük istemci (ek kütüphane yok). */
class Api(private val prefs: Prefs) {

    private fun request(path: String, body: String, token: String? = null): Pair<Int, String> {
        val c = URL(Config.SUPABASE_URL + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15_000
            c.readTimeout = 30_000
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.setRequestProperty("apikey", Config.PUBLISHABLE_KEY)
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            return code to text
        } finally {
            c.disconnect()
        }
    }

    private fun errorText(text: String): String = try {
        val j = JSONObject(text)
        j.optString("error_description").ifEmpty { j.optString("msg") }.ifEmpty { j.optString("message") }.ifEmpty { j.optString("error") }.ifEmpty { text }
    } catch (_: Exception) { text }

    /** CRM kullanıcı adı + şifre ile giriş */
    fun login(username: String, password: String) {
        val (c1, t1) = request("/functions/v1/auth-login",
            JSONObject().put("username", username).put("password", password).put("company", Config.COMPANY).toString())
        val j1 = try { JSONObject(t1) } catch (_: Exception) { JSONObject() }
        if (j1.has("reset_token")) throw ApiException("Önce CRM web sitesinden yeni şifre belirleyin, sonra bu şifreyle giriş yapın.")
        if (c1 !in 200..299 || !j1.has("email")) throw ApiException(j1.optString("error", "Kullanıcı adı veya şifre hatalı."), c1)

        val (c2, t2) = request("/auth/v1/token?grant_type=password",
            JSONObject().put("email", j1.getString("email")).put("password", password).toString())
        if (c2 !in 200..299) throw ApiException("Giriş yapılamadı: ${errorText(t2)}", c2)
        saveSession(JSONObject(t2))
        prefs.username = username
    }

    private fun saveSession(j: JSONObject) {
        prefs.accessToken = j.getString("access_token")
        prefs.refreshToken = j.getString("refresh_token")
        prefs.expiresAt = System.currentTimeMillis() + j.optLong("expires_in", 3600) * 1000
    }

    private fun token(): String {
        val rt = prefs.refreshToken ?: throw ApiException("Giriş yapılmamış", 401)
        if (prefs.accessToken != null && System.currentTimeMillis() < prefs.expiresAt - 120_000) return prefs.accessToken!!
        val (c, t) = request("/auth/v1/token?grant_type=refresh_token", JSONObject().put("refresh_token", rt).toString())
        if (c !in 200..299) throw ApiException("Oturum süresi doldu, tekrar giriş yapın.", 401)
        saveSession(JSONObject(t))
        return prefs.accessToken!!
    }

    private fun rpc(fn: String, args: JSONObject): String {
        var (c, t) = request("/rest/v1/rpc/$fn", args.toString(), token())
        if (c == 401) { prefs.expiresAt = 0; val r = request("/rest/v1/rpc/$fn", args.toString(), token()); c = r.first; t = r.second }
        if (c !in 200..299) throw ApiException(errorText(t), c)
        return t
    }

    /** Hangi numara özetleri CRM'de kayıtlı? (numaraların kendisi gönderilmez) */
    fun matchHashes(hashes: List<String>): Set<String> {
        if (hashes.isEmpty()) return emptySet()
        val t = rpc("match_phone_hashes", JSONObject().put("p_hashes", JSONArray(hashes)))
        val a = JSONArray(t)
        return (0 until a.length()).map { a.getString(it) }.toSet()
    }

    fun ingest(calls: JSONArray, device: JSONObject): JSONObject =
        JSONObject(rpc("ingest_calls", JSONObject().put("p_calls", calls).put("p_device", device)))

    fun whoAmI(): String? = try {
        JSONObject(rpc("app_whoami", JSONObject())).optString("full_name").ifEmpty { null }
    } catch (_: Exception) { null }
}

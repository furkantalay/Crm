package com.dijitalbiradam.crmarama

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.*
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var root: LinearLayout
    private val dp get() = resources.displayMetrics.density

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((20 * dp).toInt(), (20 * dp).toInt(), (20 * dp).toInt(), (40 * dp).toInt())
        }
        setContentView(ScrollView(this).apply { addView(root) })
        if (prefs.loggedIn) { SyncWorker.schedulePeriodic(this); CallWatchService.start(this) }
    }

    override fun onResume() {
        super.onResume()
        if (prefs.loggedIn) CallWatchService.start(this)
        render()
    }

    // ---------- küçük görünüm yardımcıları ----------
    private fun text(s: String, size: Float = 15f, bold: Boolean = false, color: Int = Color.parseColor("#0F172A")) =
        TextView(this).apply {
            text = s; textSize = size; setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
            setPadding(0, (6 * dp).toInt(), 0, (6 * dp).toInt())
        }

    private fun button(label: String, primary: Boolean = true, onClick: () -> Unit) = Button(this).apply {
        text = label; isAllCaps = false; textSize = 15f
        if (primary) { setBackgroundColor(Color.parseColor("#0F172A")); setTextColor(Color.WHITE) }
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = (8 * dp).toInt() }
    }

    private fun row(ok: Boolean, label: String, fixLabel: String?, fix: (() -> Unit)?): View =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(0, (4 * dp).toInt(), 0, (4 * dp).toInt())
            addView(text(if (ok) "✅  $label" else "❌  $label", 15f, !ok,
                if (ok) Color.parseColor("#166534") else Color.parseColor("#B91C1C")).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            if (!ok && fix != null) addView(Button(this@MainActivity).apply {
                text = fixLabel; isAllCaps = false; setOnClickListener { fix() }
            })
        }

    private fun divider() = View(this).apply {
        setBackgroundColor(Color.parseColor("#E2E8F0"))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (1 * dp).toInt())
            .apply { topMargin = (14 * dp).toInt(); bottomMargin = (10 * dp).toInt() }
    }

    // ---------- ekranlar ----------
    private fun render() {
        root.removeAllViews()
        root.addView(text("📞 CRM Arama", 26f, true))
        if (prefs.loggedIn) renderStatus() else renderLogin()
    }

    private fun renderLogin() {
        root.addView(text("CRM kullanıcı adınız ve şifrenizle giriş yapın.", 15f, color = Color.parseColor("#475569")))
        val user = EditText(this).apply { hint = "Kullanıcı adı"; inputType = InputType.TYPE_CLASS_TEXT; setText(prefs.username ?: "") }
        val pass = EditText(this).apply { hint = "Şifre"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
        val msg = text("", 14f, color = Color.parseColor("#B91C1C"))
        root.addView(user); root.addView(pass)
        lateinit var btn: Button
        btn = button("Giriş yap") {
            val u = user.text.toString().trim(); val p = pass.text.toString()
            if (u.isEmpty() || p.isEmpty()) { msg.text = "Kullanıcı adı ve şifre gerekli."; return@button }
            btn.isEnabled = false; msg.text = "Giriş yapılıyor…"
            Thread {
                try {
                    val api = Api(prefs)
                    api.login(u, p)
                    prefs.fullName = api.whoAmI() ?: u
                    runOnUiThread {
                        SyncWorker.schedulePeriodic(this)
                        askPermissions()
                        render()
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        btn.isEnabled = true; msg.text = e.message ?: "Giriş yapılamadı."
                        val t = (e as? ApiException)?.resetToken
                        if (t != null) {
                            pass.setText("")
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Config.CRM_WEB}/sifre-belirle?t=$t&kisa=1")))
                        }
                    }
                }
            }.start()
        }
        root.addView(btn); root.addView(msg)
        root.addView(divider())
        root.addView(privacyNote())
    }

    @SuppressLint("BatteryLife")
    private fun renderStatus() {
        root.addView(text("Giriş: ${prefs.fullName ?: prefs.username}", 16f, true))
        root.addView(divider())

        val permOk = CallSync.hasPermission(this)
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        val batteryOk = pm.isIgnoringBatteryOptimizations(packageName)

        root.addView(text("Kurulum", 18f, true))
        root.addView(row(permOk, "Arama kaydı izni", "İzin ver") { askPermissions() })
        root.addView(row(batteryOk, "Pil kısıtlaması kaldırıldı", "Kaldır") {
            try {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            } catch (_: Exception) { openAppSettings() }
        })
        brandTip()?.let {
            root.addView(text(it, 14f, color = Color.parseColor("#92400E")).apply { setBackgroundColor(Color.parseColor("#FEF3C7")); setPadding((10 * dp).toInt(), (10 * dp).toInt(), (10 * dp).toInt(), (10 * dp).toInt()) })
            root.addView(button("Uygulama ayarlarını aç", false) { openAppSettings() })
        }

        root.addView(divider())
        root.addView(text("Durum", 18f, true))
        val fmt = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale("tr"))
        root.addView(text("Son gönderim: " + (if (prefs.lastSyncMs > 0) fmt.format(Date(prefs.lastSyncMs)) else "henüz yok")))
        root.addView(text("Son sonuç: " + (prefs.lastResult ?: "—")))
        root.addView(text("Toplam gönderilen arama: ${prefs.totalSaved}"))
        val status = text("", 14f, color = Color.parseColor("#475569"))
        lateinit var syncBtn: Button
        syncBtn = button("Şimdi gönder") {
            syncBtn.isEnabled = false; status.text = "Gönderiliyor…"
            Thread {
                val r = try { CallSync.run(this) } catch (e: Exception) { "Hata: ${e.message}" }
                prefs.lastResult = r
                runOnUiThread { render() }
            }.start()
        }
        root.addView(syncBtn); root.addView(status)
        root.addView(button("CRM'i aç", false) { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Config.CRM_WEB))) })

        root.addView(divider())
        root.addView(privacyNote())
        root.addView(text("Uygulama kendi kendine çalışır; açık tutmanız gerekmez. Bildirim çubuğunda küçük bir \"CRM Arama açık\" bildirimi durur; bu, uygulamanın arka planda çalıştığını gösterir. Her görüşmeden birkaç saniye sonra ve ayrıca 15 dakikada bir gönderim yapar.", 13f, color = Color.parseColor("#64748B")))
        root.addView(button("Çıkış yap", false) {
            SyncWorker.cancelAll(this); CallWatchService.stop(this); prefs.clear(); render()
        })
    }

    private fun privacyNote() = text(
        "🔒 Gizlilik: Yalnızca CRM'de kayıtlı müşterilerle yapılan görüşmeler ve size gelen aramalar gönderilir. " +
            "CRM'de kayıtlı olmayan numaraları aramanız (kişisel aramalar) telefonunuzdan çıkmaz. Konuşma içeriği kaydedilmez.",
        13f, color = Color.parseColor("#475569"))

    private fun brandTip(): String? = when (Build.MANUFACTURER.lowercase()) {
        "xiaomi", "redmi", "poco" -> "Xiaomi için: Uygulama ayarları → Otomatik başlatma: AÇIK, Pil tasarrufu: Kısıtlama yok. Ayrıca son uygulamalar ekranında uygulamayı aşağı çekip kilitleyin."
        "samsung" -> "Samsung için: Ayarlar → Pil → Arka plan kullanım sınırları → \"Hiçbir zaman uyku moduna geçmeyen uygulamalar\" listesine CRM Arama'yı ekleyin."
        "oppo", "realme", "oneplus" -> "Bu marka için: Uygulama ayarları → Pil kullanımı → Arka planda çalışmaya izin ver ve Otomatik başlatma: AÇIK."
        "huawei", "honor" -> "Huawei için: Ayarlar → Pil → Uygulama başlatma → CRM Arama: Manuel yönet, üç seçeneği de AÇIK yapın."
        "vivo" -> "Vivo için: Ayarlar → Pil → Arka planda yüksek güç kullanımı → CRM Arama: AÇIK."
        else -> null
    }

    private fun openAppSettings() {
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
    }

    private fun askPermissions() {
        val perms = mutableListOf(Manifest.permission.READ_CALL_LOG, Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS)
        requestPermissions(perms.toTypedArray(), 1)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (CallSync.hasPermission(this)) { SyncWorker.syncSoon(this, 1); CallWatchService.start(this) }
        else if (!shouldShowRequestPermissionRationale(Manifest.permission.READ_CALL_LOG)) {
            Toast.makeText(this, "İzin kapalı. Uygulama ayarlarından \"Arama kayıtları\" iznini açın.", Toast.LENGTH_LONG).show()
            openAppSettings()
        }
        render()
    }
}

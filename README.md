# CRM

Satış ekipleri için çok şirketli (multi-tenant) CRM. Dijital Bir Adam'ın ofis CRM'inin yerine geçmek ve başka işletmelere satılmak üzere geliştiriliyor.

## Yapı

| Katman | Nerede |
|---|---|
| Arayüz | Next.js 15 (App Router) · Vercel · `crm.dijitalbiradam.com` |
| Veritabanı, giriş, dosyalar | Supabase · proje `crm` (Frankfurt, `unlcqrfaawhqzkgwzdbu`) |
| Erişim kuralları | PostgreSQL RLS: her şirket yalnız kendi verisini, satışçı yalnız kendine atananı görür |

```
src/app/giris          Giriş (kullanıcı adı + şifre)
src/app/(app)/         Giriş gerektiren ekranlar: Panel, Datalar, Satışlar
supabase/migrations    Veritabanı şeması (sırayla uygulanır)
supabase/functions     auth-login (eski şifre taşıma), legacy-migrate (eski CRM'den veri taşıma)
tests/rls_test.sql     Erişim kuralları testi (yerel Postgres)
```

## Geliştirme

```bash
cp .env.example .env.local
npm install
npm run dev
```

`.env.example` içindeki anahtar herkese açık (publishable) anahtardır; gizli anahtar kodda yoktur.

## Kurallar

- Kayıtlar silinmez, `is_active = false` ile pasife alınır (veritabanı silmeyi engeller).
- Her değişiklik `audit_logs` tablosuna otomatik yazılır.
- Şema değişikliği = `supabase/migrations` altına yeni numaralı dosya.

## Roller

`admin` · `yonetici` · `dataci` · `satisci` · `teknik`. Satışçı dışındaki roller şirketin tüm datasını görür; reklam yönetimindeki "admin özel" kayıtları yalnız admin görür.

## iyzico

- `iyzico-sync` (her saat, pg_cron) son 3 günün işlemlerini çeker; `iyzico_auto_match` tutar + tarih (−3/+1 gün) + taksitte **tek** aday varsa satışa bağlar ve `net_amount`'u iyzico'nun yatıracağı tutarla doldurur (`net_source = 'iyzico'`).
- Belirsiz eşleşmeler `/iyzico` ekranından elle bağlanır.
- Anahtarlar Supabase Edge Function Secrets'ta: `IYZICO_API_KEY`, `IYZICO_SECRET_KEY` (kodda yok).

## Geçiş günü kontrol listesi

1. Eski CRM'den taze yedek veri merkezine (eski Supabase projesi) aktarılır.
2. `legacy-migrate` adımları tetikleyiciler kapalıyken çalıştırılır (users → customers → diğerleri), sonra tetikleyiciler açılır ve sequence'lar ayarlanır.
3. iyzico net tutarlarını yeniden uygula (taşıma eski elle girilen tutarları yazar):
   `update sales s set net_amount = t.merchant_payout_amount from iyzico_transactions t where t.sale_id = s.id;`
   ardından `select iyzico_auto_match((select id from companies where slug='dijitalbiradam'));`
4. `legacy-migrate` ve `iyzico-backfill` fonksiyonları, `OLD_SERVICE_ROLE_KEY` secret'ı ve `migration_control` tablosu silinir.

## Telefon aramaları (CRM Arama Android uygulaması)

- Kod: `android/`. GitHub Actions (`.github/workflows/android.yml`) her `android/**` değişikliğinde APK üretir ve `public/crm-arama.apk` olarak siteye koyar; satışçılar `/uygulama` sayfasından indirir.
- İmza: `ANDROID_KEYSTORE_B64` ve `ANDROID_KEYSTORE_PASSWORD` GitHub secret'ları tanımlıysa kalıcı anahtarla, değilse geçici (debug) anahtarla imzalanır. Ekibe dağıtmadan önce kalıcı anahtara geçin; anahtar değişirse telefonlarda uygulamayı silip yeniden kurmak gerekir.
- Veri: `call_logs`, `call_devices`; uygulama `ingest_calls()` ve `match_phone_hashes()` çağırır. Kayıtlı olmayan numaraya giden aramalar telefondan çıkmaz (yalnız SHA-256 özeti sorulur).

## Funnel (Google Sheet → CRM)

- Eski veri merkezindeki `funnel_yedek` → `funnel_rows` (source = arsiv) taşındı (`hub-import`, tek seferlik).
- Canlı: sayfadaki Apps Script (`tools/funnel-apps-script.gs`, jeton `sync_control.funnel`) 5 dakikada bir `funnel-ingest` fonksiyonuna son 300 satırı yollar.
- Otomatik data açma `companies.settings.funnel_auto_create` ile açılır. **Geçiş gününden önce açmayın** (eski CRM'den yeniden aktarımla çift kayıt olur). Geçiş günü: `update companies set settings = settings || '{"funnel_auto_create":true}' where slug='dijitalbiradam';`

> **Geçiş günü notu (27.11.2026):** Yalnız AYNUR, ŞEVVAL, İREM, ZEYNEP (+ WEB) aktif satışçı. Diğer satışçılar yeni CRM'de pasife alındı; `legacy-migrate` yeniden çalıştırılınca `is_active` ve `receives_leads` değerlerinin eski CRM'den gelenle ezilmediğini kontrol edin.

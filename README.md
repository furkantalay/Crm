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

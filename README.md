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

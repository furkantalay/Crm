-- Eski kullanıcı ID eşlemesi
alter table profiles add column legacy_id int;
create unique index on profiles (company_id, legacy_id);

-- Eski şifre hash'leri (scrypt). Sadece servis anahtarı erişir; ilk girişte doğrulanıp Supabase şifresine çevrilir, sonra silinir.
create table legacy_credentials (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  password_hash text not null,
  created_at   timestamptz not null default now()
);
alter table legacy_credentials enable row level security;  -- politika yok = istemciden erişilemez

-- Taşıma kontrolü (tek kullanımlık jeton; geçiş tamamlanınca tablo silinecek)
create table migration_control (
  id     int primary key default 1 check (id = 1),
  token  text not null default encode(gen_random_bytes(24), 'hex')
);
alter table migration_control enable row level security;
insert into migration_control default values;

create extension if not exists pg_net;

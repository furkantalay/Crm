-- Yerel test: Supabase'in auth şemasını taklit eder, sonra RLS kurallarını dener.
\set ON_ERROR_STOP on

-- ---- Supabase taklidi ----
create schema if not exists auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated nologin;

-- Depo kökünden çalıştırın: psql -f tests/rls_test.sql
\i supabase/migrations/0001_schema.sql

grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

-- ---- Test verisi (süper kullanıcı olarak) ----
insert into companies (id, name, slug) values
  ('00000000-0000-0000-0000-00000000000a', 'Dijital Bir Adam', 'dba'),
  ('00000000-0000-0000-0000-00000000000b', 'Baska Firma', 'baska');

insert into auth.users values
  ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003'), ('10000000-0000-0000-0000-000000000004');

insert into profiles (id, company_id, full_name, username, role) values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Admin','admin','admin'),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','İREM','irem','satisci'),
  ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','ZEYNEP','zeynep','satisci'),
  ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-00000000000b','B Admin','badmin','admin');

insert into customers (company_id, full_name, phone, assigned_to) values
  ('00000000-0000-0000-0000-00000000000a','Ayça Tuna','905346917535','10000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-00000000000a','Kadir','5364275610','10000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-00000000000a','Bedriye','5466938975','10000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-00000000000b','B Müşteri','5550000000','10000000-0000-0000-0000-000000000004');

insert into sales (company_id, customer_id, seller_id, amount) values
  ('00000000-0000-0000-0000-00000000000a', 1, '10000000-0000-0000-0000-000000000002', 20000),
  ('00000000-0000-0000-0000-00000000000a', 2, '10000000-0000-0000-0000-000000000002', 23500),
  ('00000000-0000-0000-0000-00000000000a', 3, '10000000-0000-0000-0000-000000000003', 21000);

insert into ad_clients (company_id, brand, monthly_fee, is_admin_private) values
  ('00000000-0000-0000-0000-00000000000a','Genel Marka', 30000, false),
  ('00000000-0000-0000-0000-00000000000a','Özel Marka', 50000, true);

-- ---- Testler ----
create temp table results (test text, expected text, got text);
grant all on results to authenticated;

-- Admin (A şirketi)
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
insert into results select 'admin A datalar', '3', count(*)::text from customers;
insert into results select 'admin A reklam (özel dahil)', '2', count(*)::text from ad_clients;
insert into results select 'admin A loglar görünüyor', 'true', (count(*) > 0)::text from audit_logs;

-- Satışçı İREM
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
insert into results select 'İREM datalar (sadece kendi)', '2', count(*)::text from customers;
insert into results select 'İREM satışlar', '2', count(*)::text from sales;
insert into results select 'İREM reklam yönetimi', '0', count(*)::text from ad_clients;
insert into results select 'İREM loglar', '0', count(*)::text from audit_logs;
-- İREM görüşme notu ekler → müşteri son notu güncellenmeli
insert into interactions (company_id, customer_id, user_id, note)
  values ('00000000-0000-0000-0000-00000000000a', 1, auth.uid(), 'WP den ses iletim');
insert into results select 'görüşme notu müşteriye yansıdı', 'WP den ses iletim', last_note from customers where id = 1;
-- İREM, ZEYNEP'in müşterisini güncelleyemez
update customers set full_name = 'X' where id = 3;
reset role;
insert into results select 'İREM başkasının datasını değiştiremedi', 'Bedriye', full_name from customers where id = 3;

-- Silme engeli
do $$ begin
  begin delete from customers where id = 1;
        insert into results values ('silme engeli', 'engellendi', 'SİLİNDİ!');
  exception when others then
        insert into results values ('silme engeli', 'engellendi', 'engellendi');
  end;
end $$;

-- B şirketi admini A'nın verisini göremez
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
insert into results select 'B admin datalar (sadece B)', '1', count(*)::text from customers;
insert into results select 'B admin A satışları', '0', count(*)::text from sales;
reset role;

-- Satışçı özeti görünümü
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
insert into results select 'özet İREM ciro', '43500.00', total_revenue::text from v_seller_summary where seller_name = 'İREM';
insert into results select 'özet İREM aktif data', '2', active_data::text from v_seller_summary where seller_name = 'İREM';
reset role;

select test, expected, got, case when expected = got then 'OK' else 'HATA' end as sonuc from results;

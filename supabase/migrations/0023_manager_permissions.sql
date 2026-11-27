-- Yönetici yetkileri (Ayarlar → Yönetici yetkileri): companies.settings.manager_can
--   net: bize kalan / iyzico · ads: reklam yönetimi gelirleri · prim: herkesin primi · users: kullanıcı yönetimi
-- Admin her şeyi görür. Ekranlar uygulamada gizlenir; iyzico, reklam ve prim tabloları veritabanında da kilitlenir.

update companies set settings = coalesce(settings, '{}'::jsonb)
  || '{"manager_can":{"net":false,"ads":false,"prim":true,"users":true}}'::jsonb
 where slug = 'dijitalbiradam' and not (coalesce(settings, '{}'::jsonb) ? 'manager_can');

create or replace function manager_can(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select case current_user_role()
           when 'admin' then true
           when 'yonetici' then coalesce((select (settings->'manager_can'->>p_key)::boolean from companies where id = current_company_id()),
                                         p_key in ('prim','users'))
           else false end
$$;
revoke execute on function manager_can(text) from public, anon;
grant execute on function manager_can(text) to authenticated;

-- iyzico: admin, datacı, teknik + (yönetici, ayar açıksa)
drop policy if exists iyzico_read on iyzico_transactions;
create policy iyzico_read on iyzico_transactions for select
  using (company_id = (select current_company_id())
         and ((select current_user_role()) = any (array['admin','dataci','teknik']::user_role[]) or (select manager_can('net'))));
drop policy if exists iyzico_update on iyzico_transactions;
create policy iyzico_update on iyzico_transactions for update
  using (company_id = (select current_company_id())
         and ((select current_user_role()) = any (array['admin','dataci']::user_role[]) or (select manager_can('net'))))
  with check (company_id = (select current_company_id())
         and ((select current_user_role()) = any (array['admin','dataci']::user_role[]) or (select manager_can('net'))));

-- Reklam yönetimi: admin her şey; datacı özel olmayanlar; yönetici ayar açıksa özel olmayanlar
drop policy if exists ad_clients_all on ad_clients;
create policy ad_clients_all on ad_clients for all
  using (company_id = (select current_company_id()) and (
         (select current_user_role()) = 'admin'
         or (not is_admin_private and ((select current_user_role()) = 'dataci' or (select manager_can('ads'))))))
  with check (company_id = (select current_company_id()) and (
         (select current_user_role()) = 'admin'
         or (not is_admin_private and ((select current_user_role()) = 'dataci' or (select manager_can('ads'))))));

-- Prim kuralları: admin + (yönetici, ayar açıksa)
drop policy if exists commission_read on commission_rules;
create policy commission_read on commission_rules for select
  using (company_id = (select current_company_id()) and (select manager_can('prim')));

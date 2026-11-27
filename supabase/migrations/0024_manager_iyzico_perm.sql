-- iyzico ekranı ayrı yetki: yönetici iyzico ödemelerini ve brüt tutarları görür, "bize kalan" ayrı (net) yetkide.
update companies set settings = jsonb_set(settings, '{manager_can,iyzico}', 'true'::jsonb, true)
 where slug = 'dijitalbiradam';

create or replace function manager_can(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select case current_user_role()
           when 'admin' then true
           when 'yonetici' then coalesce((select (settings->'manager_can'->>p_key)::boolean from companies where id = current_company_id()),
                                         p_key in ('prim','users','iyzico'))
           else false end
$$;

drop policy if exists iyzico_read on iyzico_transactions;
create policy iyzico_read on iyzico_transactions for select
  using (company_id = (select current_company_id())
         and ((select current_user_role()) = any (array['admin','dataci','teknik']::user_role[]) or (select manager_can('iyzico'))));
drop policy if exists iyzico_update on iyzico_transactions;
create policy iyzico_update on iyzico_transactions for update
  using (company_id = (select current_company_id())
         and ((select current_user_role()) = any (array['admin','dataci']::user_role[]) or (select manager_can('iyzico'))))
  with check (company_id = (select current_company_id())
         and ((select current_user_role()) = any (array['admin','dataci']::user_role[]) or (select manager_can('iyzico'))));

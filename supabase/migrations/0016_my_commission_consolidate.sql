-- Satışçı yalnız kendi prim satırını görür (kademeler tablosu admin/yöneticiye kapalı kalır).
-- Şirket ayarı settings.show_own_commission = true değilse ve kullanıcının prim hakkı yoksa boş döner.
drop function if exists my_commission();

create or replace function my_commission(p_month date) returns table (
  total numeric, sale_count bigint, tier_kind text, tier_value numeric, monthly_commission numeric,
  daily_commission numeric, daily_bonus_days bigint, next_tier_min numeric, to_next_tier numeric, today_total numeric,
  today_commission numeric, next_daily_min numeric
)
language sql stable security definer set search_path = public as $$
  with me as (select id, company_id from profiles where id = auth.uid() and is_active and commission_eligible
              and coalesce((select (settings->>'show_own_commission')::boolean from companies c where c.id = profiles.company_id), false)),
  m as (select * from v_commission_monthly v, me where v.seller_id = me.id and v.month = date_trunc('month', p_month)::date),
  t as (select d.* from v_commission_daily d, me where d.seller_id = me.id and d.day = (now() at time zone 'Europe/Istanbul')::date)
  select m.total, m.sale_count, m.tier_kind, m.tier_value, m.monthly_commission, m.daily_commission, m.daily_bonus_days,
         m.next_tier_min, m.to_next_tier, t.total, t.commission,
         (select min(cr.min_amount) from commission_rules cr, me
           where cr.company_id = me.company_id and cr.period = 'daily' and cr.is_active and cr.min_amount > coalesce(t.total, 0))
  from me left join m on true left join t on true;
$$;
revoke execute on function my_commission(date) from public, anon;
grant execute on function my_commission(date) to authenticated;

update companies set settings = (settings - 'show_commission_to_sellers')
  || jsonb_build_object('show_own_commission', coalesce((settings->>'show_commission_to_sellers')::boolean, (settings->>'show_own_commission')::boolean, false))
where settings ? 'show_commission_to_sellers';

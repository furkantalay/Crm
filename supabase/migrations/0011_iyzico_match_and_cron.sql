-- (0011) Türkçe "İ" nedeniyle "İyzico" kaynağı tanınmıyordu: translate ile düzelt
create or replace function iyzico_auto_match(p_company uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with src as (
    select id from lookups where company_id = p_company and category = 'sale_source'
      and lower(translate(label, 'İIı', 'iii')) like '%iyzico%'
  ), cand as (
    select t.id as tid, s.id as sid
    from iyzico_transactions t
    join sales s on s.company_id = t.company_id
    where t.company_id = p_company and t.transaction_type = 'PAYMENT' and t.sale_id is null
      and coalesce(t.transaction_status, 1) in (1, 2)
      and s.is_active and s.iyzico_payment_id is null and s.sale_source_id in (select id from src)
      and (t.price = s.amount or t.paid_price = s.amount)
      and (t.transaction_date at time zone 'Europe/Istanbul')::date between s.order_date - 3 and s.order_date + 1
      and coalesce(nullif(t.installment, 0), 1) = coalesce(nullif(s.installments, 0), 1)
  ), uniq as (
    select c.tid, c.sid from cand c
    where (select count(*) from cand x where x.tid = c.tid) = 1
      and (select count(*) from cand y where y.sid = c.sid) = 1
  ), upd_t as (
    update iyzico_transactions t set sale_id = u.sid, matched_by = 'auto', matched_at = now()
    from uniq u where t.id = u.tid
    returning u.sid, t.payment_id, t.merchant_payout_amount
  )
  update sales s set iyzico_payment_id = ut.payment_id, net_amount = ut.merchant_payout_amount, net_source = 'iyzico'
  from upd_t ut where s.id = ut.sid;
  get diagnostics n = row_count;
  perform iyzico_refresh_refunds(p_company);
  return n;
end $$;
revoke execute on function iyzico_auto_match(uuid) from public, anon, authenticated;
grant execute on function iyzico_auto_match(uuid) to service_role;

-- (0012) Her saat 7. dakikada iyzico'dan son 3 günü çek
create extension if not exists pg_cron;
select cron.schedule('iyzico-sync-hourly', '7 * * * *', $job$
  select net.http_post(
    url := 'https://unlcqrfaawhqzkgwzdbu.supabase.co/functions/v1/iyzico-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-sync-token',(select token from public.sync_control where name='iyzico')),
    body := '{}'::jsonb, timeout_milliseconds := 300000);
$job$);

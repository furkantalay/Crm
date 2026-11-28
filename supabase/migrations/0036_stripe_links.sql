-- =====================================================================
-- STRIPE ÖDEME BAĞLANTISI (iyzico'nun yanında)
--  * Stripe hesabı ABD (DIJITAL BIR ADAM LLC), varsayılan USD. Bağlantı USD / EUR / TRY olabilir.
--  * Tek kullanımlık Payment Link (completed_sessions limit 1); stripe-link fonksiyonu 5 dk'da bir kontrol eder.
--  * Satış CRM'e TL olarak girilir: döviz ise ödeme günü TCMB döviz satış kuruyla çevrilir,
--    orijinal tutar/kur satışın extra alanında saklanır.
-- =====================================================================
alter table payment_links add column if not exists provider text not null default 'iyzico';
alter table payment_links add column if not exists currency text not null default 'TRY';
alter table payment_links add column if not exists amount_try numeric(12,2);
alter table payment_links add column if not exists fx_rate numeric(12,4);
do $$ begin
  alter table payment_links add constraint payment_links_provider_chk check (provider in ('iyzico', 'stripe'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table payment_links add constraint payment_links_currency_chk check (currency in ('TRY', 'USD', 'EUR'));
exception when duplicate_object then null; end $$;

insert into lookups (company_id, category, label, sort_order)
select c.id, 'sale_source', 'Stripe', 99 from companies c
 where not exists (select 1 from lookups l where l.company_id = c.id and l.category = 'sale_source' and l.label ilike 'stripe');

insert into sync_control (name) values ('stripe_links') on conflict do nothing;

create or replace function stripe_link_paid(p_link bigint, p_amount_try numeric, p_fx numeric, p_session text)
returns bigint language plpgsql security definer set search_path = public as $$
declare l payment_links%rowtype; v_sale bigint; v_src uuid; v_pm uuid; v_type uuid; v_cname text; v_orig text;
begin
  select * into l from payment_links where id = p_link for update;
  if not found or l.status <> 'bekliyor' or l.provider <> 'stripe' then return l.sale_id; end if;
  select id into v_src from lookups where company_id = l.company_id and category = 'sale_source' and label ilike 'stripe' limit 1;
  select id into v_pm from lookups where company_id = l.company_id and category = 'payment_method' and label = 'Tek Çekim' limit 1;
  select data_type_id, full_name into v_type, v_cname from customers where id = l.customer_id;
  v_orig := to_char(l.amount, 'FM999G999G990D00') || ' ' || l.currency;

  insert into sales (company_id, customer_id, seller_id, order_date, amount, net_amount, sale_source_id, payment_method_id,
                     data_type_id, note, created_by, extra)
  values (l.company_id, l.customer_id, l.seller_id, (now() at time zone 'Europe/Istanbul')::date, p_amount_try, p_amount_try,
          v_src, v_pm, v_type, coalesce(l.description, 'Stripe ödeme bağlantısı')
            || case when l.currency <> 'TRY' then ' (' || v_orig || ', kur ' || p_fx || ')' else '' end,
          l.seller_id,
          jsonb_build_object('payment_link', l.id, 'provider', 'stripe', 'currency', l.currency,
                             'amount_original', l.amount, 'fx_rate', p_fx, 'stripe_session', p_session))
  returning id into v_sale;
  insert into sale_products (sale_id, product_id) select v_sale, unnest(l.product_ids);

  update payment_links set status = 'odendi', paid_at = now(), sale_id = v_sale, amount_try = p_amount_try, fx_rate = p_fx
   where id = l.id;

  insert into notifications (company_id, user_id, customer_id, title, body, link)
  select l.company_id, u.id, l.customer_id, '💳 Stripe ödemesi geldi: ' || v_cname,
         v_orig || case when l.currency <> 'TRY' then ' ≈ ' || to_char(p_amount_try, 'FM999G999G990') || ' ₺' else '' end
           || ' · satış otomatik girildi', '/datalar/' || l.customer_id
    from profiles u
   where u.company_id = l.company_id and u.is_active and (u.id = l.seller_id or u.role in ('admin','yonetici'));
  return v_sale;
end $$;
revoke execute on function stripe_link_paid(bigint, numeric, numeric, text) from public, anon, authenticated;
grant execute on function stripe_link_paid(bigint, numeric, numeric, text) to service_role;

select cron.schedule('stripe-links-check', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://unlcqrfaawhqzkgwzdbu.supabase.co/functions/v1/stripe-link',
    headers := jsonb_build_object('Content-Type','application/json','x-sync-token',(select token from public.sync_control where name='stripe_links')),
    body := '{"action":"check"}'::jsonb, timeout_milliseconds := 60000)
  where exists (select 1 from public.payment_links where provider = 'stripe' and status = 'bekliyor' and created_at > now() - interval '30 days')
$$);

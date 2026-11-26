-- Datalar listesi için birleşik görünüm (RLS kullanıcı yetkisiyle uygulanır)
create or replace view v_customer_list with (security_invoker = true) as
select c.id, c.company_id, c.full_name, c.phone, c.sector, c.city,
       c.assigned_to, sp.full_name as seller_name,
       c.assigned_by, ap.full_name as assigner_name,
       c.data_type_id, dt.label as data_type,
       c.status_id, st.label as status, st.is_won as status_is_won,
       c.last_note, c.applied_at, c.last_action_at, c.created_at, c.is_active,
       -- Öncelik: son 30 günde başvurmuş ve henüz not girilmemiş
       (c.applied_at > now() - interval '30 days'
        and not exists (select 1 from interactions i
                        where i.customer_id = c.id and i.user_id is not null
                          and coalesce(i.channel, '') not in ('Excel', 'Mükerrer Data'))) as is_priority
from customers c
left join profiles sp on sp.id = c.assigned_to
left join profiles ap on ap.id = c.assigned_by
left join lookups  dt on dt.id = c.data_type_id
left join lookups  st on st.id = c.status_id;

-- Satış listesi görünümü
create or replace view v_sale_list with (security_invoker = true) as
select s.id, s.company_id, s.order_date, s.amount, s.net_amount, s.installments, s.payer_name,
       s.customer_id, c.full_name as customer_name, c.phone as customer_phone,
       s.seller_id, p.full_name as seller_name,
       s.sale_source_id, src.label as sale_source,
       s.payment_method_id, pm.label as payment_method,
       s.bank_id, b.label as bank,
       s.data_type_id, dt.label as data_type,
       s.note, s.is_active, s.created_at,
       (select string_agg(pr.name, ', ' order by pr.kind desc, pr.sort_order)
          from sale_products sp join products pr on pr.id = sp.product_id
         where sp.sale_id = s.id) as products
from sales s
join customers c on c.id = s.customer_id
left join profiles p on p.id = s.seller_id
left join lookups src on src.id = s.sale_source_id
left join lookups pm  on pm.id  = s.payment_method_id
left join lookups b   on b.id   = s.bank_id
left join lookups dt  on dt.id  = s.data_type_id;

-- Kullanıcı kendi "son görülme" zamanını güncelleyebilsin
create or replace function touch_last_seen() returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke execute on function touch_last_seen() from public, anon;
grant execute on function touch_last_seen() to authenticated;

-- Profil tetikleyicisi last_seen güncellemelerini log'a yazmasın
create or replace function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_table_name = 'profiles' and tg_op = 'UPDATE'
     and (to_jsonb(new) - 'last_seen_at') = (to_jsonb(old) - 'last_seen_at') then
    return new;
  end if;
  insert into audit_logs (company_id, user_id, action, table_name, row_id, old_data, new_data)
  values ((r->>'company_id')::uuid, auth.uid(), tg_op, tg_table_name, r->>'id',
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke execute on function log_change() from public, anon, authenticated;

-- Liste performansı
create index if not exists interactions_customer_user_idx on interactions (customer_id) where user_id is not null;
create index if not exists customers_company_name_idx on customers (company_id, lower(full_name));

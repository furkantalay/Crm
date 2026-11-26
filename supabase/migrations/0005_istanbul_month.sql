-- "Bu ay" hesabı İstanbul saatine göre yapılsın (sunucu UTC'de çalışıyor)
create or replace view v_seller_summary with (security_invoker = true) as
select p.company_id,
       p.id         as seller_id,
       p.full_name  as seller_name,
       p.is_active  as user_active,
       c.active_data, c.passive_data,
       s.month_sales, s.month_revenue, s.total_sales, s.total_revenue
from profiles p
cross join lateral (
  select count(*) filter (where is_active)     as active_data,
         count(*) filter (where not is_active) as passive_data
  from customers where assigned_to = p.id) c
cross join lateral (
  select count(*) filter (where order_date >= date_trunc('month', (now() at time zone 'Europe/Istanbul'))::date) as month_sales,
         coalesce(sum(amount) filter (where order_date >= date_trunc('month', (now() at time zone 'Europe/Istanbul'))::date), 0) as month_revenue,
         count(*)                  as total_sales,
         coalesce(sum(amount), 0)  as total_revenue
  from sales where seller_id = p.id and is_active) s
where p.role = 'satisci';

-- Satış hunisi (funnel_stages): dönemde başvuran datalar satışçı bazında hangi aşamaya ilerledi
-- Aşamalar: data → temas (mesaj/not/arama) → görüşüldü (Arandı/Olumsuz/Olumlu/Toplantı/Satış ya da konuşulan arama)
--           → sıcak (Olumlu/Toplantı, toplantı ya da beklenen satış kaydı) → satış
-- Not: funnel_report() ilk sürümdü, kullanılmıyor.
create or replace function funnel_stages(p_from date, p_to date)
returns table (user_id uuid, full_name text, leads int, touched int, talked int, warm int, sold int, revenue numeric, avg_days_to_sale numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_company uuid := current_company_id();
begin
  if current_user_role() not in ('admin','yonetici') then raise exception 'Yetkisiz'; end if;
  return query
  with st as (select id, label from lookups where company_id = v_company and category = 'contact_status'),
  c as (
    select cu.id, cu.assigned_to, cu.applied_at, (select label from st where st.id = cu.status_id) as status
      from customers cu
     where cu.company_id = v_company and cu.assigned_to is not null
       and cu.applied_at >= (p_from::timestamp at time zone 'Europe/Istanbul')
       and cu.applied_at < ((p_to + 1)::timestamp at time zone 'Europe/Istanbul')
  ),
  f as (
    select c.id, c.assigned_to, c.applied_at,
      (c.status is not null and c.status <> 'Yeni')
        or exists (select 1 from interactions i where i.customer_id = c.id and i.user_id is not null
                     and coalesce(i.channel,'') not in ('Excel','Mükerrer Data','Funnel'))
        or exists (select 1 from call_logs cl where cl.customer_id = c.id and cl.direction = 'out') as touched,
      c.status in ('Arandı','Olumsuz','Olumlu','Toplantı','Satış')
        or exists (select 1 from interactions i join st on st.id = i.status_id
                    where i.customer_id = c.id and st.label in ('Arandı','Olumsuz','Olumlu','Toplantı','Satış'))
        or exists (select 1 from call_logs cl where cl.customer_id = c.id and cl.duration_sec > 0) as talked,
      c.status in ('Olumlu','Toplantı','Satış')
        or exists (select 1 from meetings m where m.customer_id = c.id)
        or exists (select 1 from expected_sales e where e.customer_id = c.id) as warm,
      (select min(s.order_date) from sales s where s.customer_id = c.id and s.is_active) as first_sale,
      (select coalesce(sum(s.amount), 0) from sales s where s.customer_id = c.id and s.is_active) as rev
    from c
  )
  select p.id, p.full_name, count(*)::int,
         count(*) filter (where f.touched or f.talked or f.warm or f.first_sale is not null)::int,
         count(*) filter (where f.talked or f.warm or f.first_sale is not null)::int,
         count(*) filter (where f.warm or f.first_sale is not null)::int,
         count(*) filter (where f.first_sale is not null)::int,
         sum(f.rev),
         round(avg(greatest(0, f.first_sale - (f.applied_at at time zone 'Europe/Istanbul')::date)) filter (where f.first_sale is not null), 1)
    from f join profiles p on p.id = f.assigned_to
   group by p.id, p.full_name
   order by count(*) desc;
end $$;
revoke execute on function funnel_stages(date, date) from public, anon;
grant execute on function funnel_stages(date, date) to authenticated;

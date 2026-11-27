-- =====================================================================
-- SABAH ÖZETİ: dünün özeti her sabah 08:30'da admin/yöneticiye bildirim olarak gider
-- (WhatsApp numarası alınınca aynı metin WhatsApp'tan da gönderilecek)
-- =====================================================================

create or replace function daily_summary(p_company uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'Europe/Istanbul');
  v_to   timestamptz := ((p_day + 1)::timestamp at time zone 'Europe/Istanbul');
  r jsonb;
begin
  select jsonb_build_object(
    'day', p_day,
    'sales_count', (select count(*) from sales where company_id = p_company and is_active and order_date = p_day),
    'sales_sum', (select coalesce(sum(amount), 0) from sales where company_id = p_company and is_active and order_date = p_day),
    'month_sum', (select coalesce(sum(amount), 0) from sales where company_id = p_company and is_active
                   and order_date >= date_trunc('month', p_day)::date and order_date <= p_day),
    'new_leads', (select count(*) from customers where company_id = p_company and created_at >= v_from and created_at < v_to),
    'not_called', (select count(*) from customers where company_id = p_company and is_active and assigned_at >= v_from
                    and assigned_at < v_to and first_touch_at is null),
    'late_alerts', (select count(*) from customers where company_id = p_company and assigned_at >= v_from
                     and assigned_at < v_to and speed_alert >= 2),
    'missed_open', (select count(distinct cl.phone_norm) from call_logs cl where cl.company_id = p_company
                     and cl.direction in ('missed','rejected') and cl.started_at >= v_from and cl.started_at < v_to
                     and not exists (select 1 from call_logs x where x.company_id = p_company and x.phone_norm = cl.phone_norm
                                       and x.started_at > cl.started_at and (x.direction = 'out' or (x.direction = 'in' and x.duration_sec > 0)))),
    'links_paid', (select count(*) from payment_links where company_id = p_company and paid_at >= v_from and paid_at < v_to),
    'sellers', coalesce((select jsonb_agg(x order by x->>'sales_sum' desc nulls last) from (
        select jsonb_build_object(
          'name', p.full_name,
          'sales_count', (select count(*) from sales s where s.seller_id = p.id and s.is_active and s.order_date = p_day),
          'sales_sum', (select coalesce(sum(amount), 0) from sales s where s.seller_id = p.id and s.is_active and s.order_date = p_day),
          'calls_out', (select count(*) from call_logs c where c.user_id = p.id and c.direction = 'out' and c.started_at >= v_from and c.started_at < v_to),
          'talk_min', (select coalesce(sum(duration_sec), 0) / 60 from call_logs c where c.user_id = p.id and c.started_at >= v_from and c.started_at < v_to),
          'notes', (select count(*) from interactions i where i.user_id = p.id and i.created_at >= v_from and i.created_at < v_to),
          'active_min', (select count(*) from presence_pings x where x.user_id = p.id and x.active and x.at >= v_from and x.at < v_to),
          'leads', (select count(*) from customers c where c.assigned_to = p.id and c.assigned_at >= v_from and c.assigned_at < v_to)
        ) x
        from profiles p where p.company_id = p_company and p.is_active and p.role = 'satisci' and p.receives_leads
      ) t), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke execute on function daily_summary(uuid, date) from public, anon, authenticated;

create or replace function daily_summary_view(p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if current_user_role() not in ('admin','yonetici') then raise exception 'Yetkisiz'; end if;
  return daily_summary(current_company_id(), p_day);
end $$;
revoke execute on function daily_summary_view(date) from public, anon;
grant execute on function daily_summary_view(date) to authenticated;

create or replace function send_daily_summaries() returns int
language plpgsql security definer set search_path = public as $$
declare c record; s jsonb; v_day date := ((now() at time zone 'Europe/Istanbul')::date - 1); n int := 0; top text;
begin
  for c in select id from companies loop
    s := daily_summary(c.id, v_day);
    select string_agg((e->>'name') || ' ' || (e->>'sales_count'), ', ') into top
      from jsonb_array_elements(s->'sellers') e where (e->>'sales_count')::int > 0;
    insert into notifications (company_id, user_id, title, body, link)
    select c.id, p.id,
           '☀️ Dünün özeti: ' || (s->>'sales_count') || ' satış · ' || to_char((s->>'sales_sum')::numeric, 'FM999G999G990') || ' ₺',
           'Ay toplamı ' || to_char((s->>'month_sum')::numeric, 'FM999G999G990') || ' ₺ · ' || (s->>'new_leads') || ' yeni data'
             || case when (s->>'not_called')::int > 0 then ' · ' || (s->>'not_called') || ' data aranmadı' else '' end
             || coalesce(' · ' || top, ''),
           '/ozet?gun=' || v_day
      from profiles p where p.company_id = c.id and p.is_active and p.role in ('admin','yonetici');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function send_daily_summaries() from public, anon, authenticated;
select cron.schedule('daily-summary', '30 5 * * *', $$select public.send_daily_summaries()$$);  -- 08:30 İstanbul

-- =====================================================================
-- HIZ ALARMI + SATIŞÇININ GÜNLÜK LİSTESİ
--  * customers.assigned_at: data bir satışçıya atandığı an (uygulamadan ya da funnel'dan)
--  * customers.first_touch_at: atandıktan sonra ilk temas (giden arama, gelen görüşme ya da satışçı notu)
--  * speed_alerts(): her dakika; mesai içinde N dk temas yoksa satışçıya, M dk'da yöneticilere bildirim
--  * Ayar: companies.settings.speed = {"seller_min":5,"manager_min":15,"start":"09:00","end":"19:00","days":[1,2,3,4,5,6]}
-- =====================================================================

alter table customers add column if not exists assigned_at timestamptz;
alter table customers add column if not exists first_touch_at timestamptz;
alter table customers add column if not exists speed_alert smallint not null default 0;
create index if not exists customers_speed_open on customers (company_id, assigned_at)
  where first_touch_at is null and assigned_at is not null;

update companies set settings = coalesce(settings, '{}'::jsonb)
  || '{"speed":{"seller_min":5,"manager_min":15,"start":"09:00","end":"19:00","days":[1,2,3,4,5,6]}}'::jsonb
 where not (coalesce(settings, '{}'::jsonb) ? 'speed');

-- Atama anını yakala. Eski CRM'den aktarılan kayıtlar (legacy_id dolu, oturum yok) sayılmaz.
create or replace function track_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and (new.legacy_id is null or auth.uid() is not null) then
    new.assigned_at := now();
    new.first_touch_at := null;
    new.speed_alert := 0;
  end if;
  return new;
end $$;
drop trigger if exists trg_track_assignment on customers;
create trigger trg_track_assignment before insert or update of assigned_to on customers
  for each row execute function track_assignment();

-- İlk temas: satışçının notu
create or replace function touch_first_from_interaction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and coalesce(new.channel, '') not in ('Excel', 'Mükerrer Data', 'Funnel') then
    update customers set first_touch_at = new.created_at
     where id = new.customer_id and assigned_at is not null and first_touch_at is null and new.created_at >= assigned_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_first_touch_interaction on interactions;
create trigger trg_first_touch_interaction after insert on interactions
  for each row execute function touch_first_from_interaction();

-- İlk temas: telefon (giden arama denemesi ya da konuşulan gelen arama)
create or replace function touch_first_from_call() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is not null and (new.direction = 'out' or (new.direction = 'in' and new.duration_sec > 0)) then
    update customers set first_touch_at = new.started_at
     where id = new.customer_id and assigned_at is not null and first_touch_at is null and new.started_at >= assigned_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_first_touch_call on call_logs;
create trigger trg_first_touch_call after insert on call_logs
  for each row execute function touch_first_from_call();

-- Mesai içinde geçen dakika (atamadan şimdiye; mesai dışı süre sayılmaz)
create or replace function work_minutes_since(p_company uuid, p_from timestamptz) returns int
language plpgsql stable set search_path = public as $$
declare s jsonb; v_start time; v_end time; v_days int[]; d date; t0 timestamptz; t1 timestamptz; total numeric := 0;
begin
  select coalesce(settings->'speed', '{}'::jsonb) into s from companies where id = p_company;
  v_start := coalesce(s->>'start', '09:00')::time;
  v_end := coalesce(s->>'end', '19:00')::time;
  v_days := coalesce((select array_agg(x::int) from jsonb_array_elements_text(s->'days') x), array[1,2,3,4,5,6]);
  d := (p_from at time zone 'Europe/Istanbul')::date;
  while d <= (now() at time zone 'Europe/Istanbul')::date loop
    if extract(isodow from d)::int = any (v_days) then
      t0 := greatest(p_from, (d + v_start) at time zone 'Europe/Istanbul');
      t1 := least(now(), (d + v_end) at time zone 'Europe/Istanbul');
      if t1 > t0 then total := total + extract(epoch from t1 - t0) / 60; end if;
    end if;
    d := d + 1;
  end loop;
  return floor(total)::int;
end $$;

create or replace function speed_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_min int; v_seller int; v_manager int; n int := 0;
begin
  for r in
    select c.id, c.company_id, c.full_name, c.assigned_to, c.assigned_at, c.speed_alert, p.full_name as seller,
           coalesce((co.settings->'speed'->>'seller_min')::int, 5) as seller_min,
           coalesce((co.settings->'speed'->>'manager_min')::int, 15) as manager_min
      from customers c
      join profiles p on p.id = c.assigned_to
      join companies co on co.id = c.company_id
     where c.first_touch_at is null and c.assigned_at is not null and c.is_active
       and c.assigned_at > now() - interval '4 days' and c.speed_alert < 2
  loop
    v_min := work_minutes_since(r.company_id, r.assigned_at);
    if v_min >= r.manager_min and r.speed_alert < 2 then
      insert into notifications (company_id, user_id, customer_id, title, body, link)
      select r.company_id, m.id, r.id, '🚨 ' || r.manager_min || ' dakikadır aranmadı: ' || r.full_name,
             r.seller || ' · ' || v_min || ' dk (mesai içi)', '/datalar/' || r.id
        from profiles m where m.company_id = r.company_id and m.is_active and m.role in ('admin','yonetici');
      update customers set speed_alert = 2 where id = r.id;
      n := n + 1;
    elsif v_min >= r.seller_min and r.speed_alert < 1 then
      insert into notifications (company_id, user_id, customer_id, title, body, link)
      values (r.company_id, r.assigned_to, r.id, '⏰ Hemen ara: ' || r.full_name,
              v_min || ' dakikadır aranmadı. ' || r.manager_min || '. dakikada yöneticiye bildirilecek.', '/datalar/' || r.id);
      update customers set speed_alert = 1 where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function speed_alerts() from public, anon, authenticated;
select cron.schedule('speed-alerts', '* * * * *', $$select public.speed_alerts()$$);

-- İlk temas istatistiği (Data Dağıtımı ekranı)
create or replace function speed_stats(p_from date, p_to date)
returns table (user_id uuid, full_name text, assigned int, touched int, open_now int,
               avg_min numeric, median_min numeric, within_seller_min int, late int)
language plpgsql stable security definer set search_path = public as $$
declare v_company uuid := current_company_id(); v_sm int;
begin
  if current_user_role() not in ('admin','yonetici') then raise exception 'Yetkisiz'; end if;
  select coalesce((settings->'speed'->>'seller_min')::int, 5) into v_sm from companies where id = v_company;
  return query
  with x as (
    select c.assigned_to, c.first_touch_at,
           case when c.first_touch_at is not null
                then extract(epoch from c.first_touch_at - c.assigned_at) / 60 end as mins
      from customers c
     where c.company_id = v_company and c.assigned_at is not null
       and c.assigned_at >= (p_from::timestamp at time zone 'Europe/Istanbul')
       and c.assigned_at < ((p_to + 1)::timestamp at time zone 'Europe/Istanbul')
  )
  select p.id, p.full_name, count(*)::int, count(x.first_touch_at)::int,
         count(*) filter (where x.first_touch_at is null)::int,
         round(avg(x.mins)::numeric, 1),
         round((percentile_cont(0.5) within group (order by x.mins))::numeric, 1),
         count(*) filter (where x.mins <= v_sm)::int,
         count(*) filter (where x.mins > v_sm or x.first_touch_at is null)::int
    from x join profiles p on p.id = x.assigned_to
   group by p.id, p.full_name
   order by p.full_name;
end $$;
revoke execute on function speed_stats(date, date) from public, anon;
grant execute on function speed_stats(date, date) to authenticated;

-- =====================================================================
-- SATIŞÇININ GÜNLÜK LİSTESİ
-- =====================================================================
create or replace function my_day(p_user uuid default null)
returns table (kind text, customer_id bigint, customer_name text, phone text, at timestamptz, detail text, amount numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_company uuid := current_company_id();
  v_end timestamptz := (((now() at time zone 'Europe/Istanbul')::date + 1)::timestamp at time zone 'Europe/Istanbul');
  v_start timestamptz := (((now() at time zone 'Europe/Istanbul')::date)::timestamp at time zone 'Europe/Istanbul');
begin
  if v_user <> auth.uid() and current_user_role() not in ('admin','yonetici') then
    raise exception 'Yetkisiz';
  end if;
  return query
  -- 1) Yeni gelen, henüz aranmamış
  select 'yeni'::text, c.id, c.full_name, c.phone, c.assigned_at, coalesce(c.sector, ''), null::numeric
    from customers c
   where c.company_id = v_company and c.assigned_to = v_user and c.is_active
     and c.assigned_at is not null and c.first_touch_at is null
  union all
  -- 2) Takip: son görüşmede verilen "sonraki arama" tarihi bugün ya da geçmiş
  select case when f.next_followup_at < v_start then 'gecikmis' else 'takip' end, c.id, c.full_name, c.phone,
         f.next_followup_at, coalesce(left(f.note, 120), ''), null
    from customers c
    join lateral (select i.next_followup_at, i.note, i.created_at from interactions i
                   where i.customer_id = c.id and i.user_id is not null
                   order by i.created_at desc limit 1) f on true
   where c.company_id = v_company and c.assigned_to = v_user and c.is_active
     and f.next_followup_at is not null and f.next_followup_at < v_end
     and f.next_followup_at > now() - interval '30 days'
     and not exists (select 1 from sales s where s.customer_id = c.id and s.is_active and s.created_at > f.created_at)
  union all
  -- 3) Beklenen satış: bugün ya da geçmiş, hâlâ bekliyor
  select 'beklenen', c.id, c.full_name, c.phone, e.expected_at, coalesce(e.note, ''), e.amount
    from expected_sales e join customers c on c.id = e.customer_id
   where e.company_id = v_company and e.seller_id = v_user and e.status in ('bekliyor','ertelendi')
     and e.expected_at < v_end and e.expected_at > now() - interval '30 days'
  union all
  -- 4) Bugünkü toplantılar
  select 'toplanti', c.id, c.full_name, c.phone, m.scheduled_at, coalesce(m.title, ''), null
    from meetings m join customers c on c.id = m.customer_id
   where m.company_id = v_company and m.seller_id = v_user and m.status in ('planlandi','ertelendi')
     and m.scheduled_at >= v_start and m.scheduled_at < v_end
  union all
  -- 5) Kendi datasından gelen, geri dönülmemiş cevapsız aramalar (son 3 gün)
  select 'cevapsiz', c.id, c.full_name, c.phone, max(cl.started_at), count(*)::text || ' cevapsız arama', null
    from call_logs cl join customers c on c.id = cl.customer_id
   where cl.company_id = v_company and c.assigned_to = v_user and cl.direction in ('missed','rejected')
     and cl.started_at > now() - interval '3 days'
     and not exists (select 1 from call_logs x where x.company_id = v_company and x.phone_norm = cl.phone_norm
                       and x.started_at > cl.started_at and (x.direction = 'out' or (x.direction = 'in' and x.duration_sec > 0)))
   group by c.id, c.full_name, c.phone;
end $$;
revoke execute on function my_day(uuid) from public, anon;
grant execute on function my_day(uuid) to authenticated;

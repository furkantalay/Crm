-- Arama raporu: gün × satışçı (yalnız admin/yönetici)
create or replace function call_report(p_from date, p_to date)
returns table (day date, user_id uuid, full_name text, out_calls int, answered int, in_calls int, missed int,
               talk_seconds int, avg_seconds int, first_call timestamptz, last_call timestamptz, customers int)
language plpgsql stable security definer set search_path = public as $$
begin
  if current_user_role() not in ('admin','yonetici') then raise exception 'Yetkisiz'; end if;
  return query
  select (c.started_at at time zone 'Europe/Istanbul')::date, c.user_id, p.full_name,
         count(*) filter (where c.direction = 'out')::int,
         count(*) filter (where c.direction = 'out' and c.duration_sec > 0)::int,
         count(*) filter (where c.direction = 'in')::int,
         count(*) filter (where c.direction in ('missed','rejected'))::int,
         coalesce(sum(c.duration_sec), 0)::int,
         coalesce((avg(c.duration_sec) filter (where c.duration_sec > 0))::int, 0),
         min(c.started_at), max(c.started_at),
         count(distinct c.customer_id)::int
    from call_logs c join profiles p on p.id = c.user_id
   where c.company_id = current_company_id()
     and c.started_at >= (p_from::timestamp at time zone 'Europe/Istanbul')
     and c.started_at < ((p_to + 1)::timestamp at time zone 'Europe/Istanbul')
   group by 1, 2, 3
   order by 1 desc, 3;
end $$;
revoke execute on function call_report(date, date) from public, anon;
grant execute on function call_report(date, date) to authenticated;

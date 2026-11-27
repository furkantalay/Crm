-- =====================================================================
-- YAPAY ZEKÂ: data puanı (1-100) + not geçmişi özeti / sonraki adım
--  * Puanlar ayrı tabloda tutulur (customers'ı ve denetim kaydını şişirmesin)
--  * Claude'a ad/telefon/e-posta GÖNDERİLMEZ; yalnızca sektör, şehir, notlar, reklam, geçmiş istatistik
--  * Edge function "ai": cron (x-sync-token) ile toplu puanlar, kullanıcı (JWT) ile tek data özetler
-- =====================================================================

create table if not exists customer_ai (
  customer_id   bigint primary key references customers(id),
  company_id    uuid not null references companies(id),
  score         smallint,
  label         text,            -- sıcak | ılık | soğuk
  grp           text,            -- sektör grubu
  reason        text,
  next_step     text,
  summary       text,
  scored_at     timestamptz,
  summarized_at timestamptz,
  summarized_by uuid references profiles(id)
);
create index if not exists customer_ai_company_score on customer_ai (company_id, score desc);
alter table customer_ai enable row level security;
create policy customer_ai_read on customer_ai for select to authenticated
  using (company_id = (select current_company_id()) and exists (select 1 from customers c where c.id = customer_id));

insert into sync_control (name) values ('ai') on conflict do nothing;

-- Tek data için modele gidecek özellikler (kişisel bilgi yok)
create or replace function ai_features(p_ids bigint[]) returns jsonb
language sql stable security definer set search_path = public as $$
  with comp as (select distinct company_id from customers where id = any(p_ids)),
  hist as (
    select lower(trim(c.sector)) s, count(*) n,
           count(*) filter (where exists (select 1 from sales x where x.customer_id = c.id and x.is_active)) sold
      from customers c where c.company_id in (select company_id from comp)
       and c.created_at > now() - interval '365 days' and coalesce(c.sector, '') <> ''
     group by 1
  ),
  overall as (select coalesce(sum(n), 0) n, coalesce(sum(sold), 0) sold from hist)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'sektor', c.sector,
    'sehir', c.city,
    'data_turu', dt.label,
    'durum', st.label,
    'basvuru', to_char(coalesce(c.applied_at, c.created_at) at time zone 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI'),
    'gun_once', (now()::date - coalesce(c.applied_at, c.created_at)::date),
    'basvuru_sayisi', (select count(*) from funnel_rows f where f.company_id = c.company_id and f.phone_norm = c.phone_norm),
    'reklam', nullif(concat_ws(' / ', c.extra->'ad'->>'campaign', c.extra->'ad'->>'adset', c.extra->'ad'->>'ad_name'), ''),
    'satin_aldi_mi', exists (select 1 from sales x where x.customer_id = c.id and x.is_active),
    'aramalar', (select jsonb_build_object('giden', count(*) filter (where direction = 'out'),
                        'cevaplanan', count(*) filter (where duration_sec > 0),
                        'toplam_dk', coalesce(sum(duration_sec), 0) / 60)
                   from call_logs cl where cl.company_id = c.company_id and cl.phone_norm = c.phone_norm),
    'sektor_gecmisi', (select jsonb_build_object('data', h.n, 'satis', h.sold) from hist h where h.s = lower(trim(c.sector))),
    'genel_donusum_yuzde', (select round(100.0 * sold / nullif(n, 0), 1) from overall),
    'notlar', coalesce((select jsonb_agg(jsonb_build_object(
                  't', to_char(i.created_at at time zone 'Europe/Istanbul', 'YYYY-MM-DD'),
                  'kanal', i.channel, 'durum', l.label, 'not', left(i.note, 400)) order by i.created_at desc)
                from (select * from interactions i2 where i2.customer_id = c.id and coalesce(i2.note, '') <> ''
                      order by i2.created_at desc limit 12) i
                left join lookups l on l.id = i.status_id), '[]'::jsonb),
    'son_not', left(c.last_note, 400)
  )), '[]'::jsonb)
  from customers c
  left join lookups dt on dt.id = c.data_type_id
  left join lookups st on st.id = c.status_id
  where c.id = any(p_ids);
$$;
revoke execute on function ai_features(bigint[]) from public, anon, authenticated;

-- Puanlanacak sıradaki datalar: son 30 günün aktif dataları; yeni olanlar önce,
-- sonra son puandan beri yeni hareket olanlar (en fazla 12 saatte bir yeniden)
create or replace function ai_score_queue(p_limit int) returns bigint[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from (
    select c.id from customers c left join customer_ai a on a.customer_id = c.id
     where c.is_active and c.created_at > now() - interval '30 days'
       and (a.scored_at is null or (c.last_action_at > a.scored_at and a.scored_at < now() - interval '12 hours'))
     order by (a.scored_at is null) desc, c.created_at desc
     limit p_limit) t;
$$;
revoke execute on function ai_score_queue(int) from public, anon, authenticated;

create or replace function ai_save(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare e jsonb; n int := 0;
begin
  for e in select * from jsonb_array_elements(p_rows) loop
    insert into customer_ai (customer_id, company_id, score, label, grp, reason, next_step, summary, scored_at, summarized_at, summarized_by)
    select c.id, c.company_id,
           least(100, greatest(1, (e->>'score')::int)), e->>'label', e->>'group', e->>'reason', e->>'next',
           e->>'summary', now(),
           case when e ? 'summary' then now() end, nullif(e->>'by', '')::uuid
      from customers c where c.id = (e->>'id')::bigint
    on conflict (customer_id) do update set
      score = excluded.score, label = excluded.label, grp = coalesce(excluded.grp, customer_ai.grp),
      reason = excluded.reason, next_step = excluded.next_step, scored_at = now(),
      summary = coalesce(excluded.summary, customer_ai.summary),
      summarized_at = coalesce(excluded.summarized_at, customer_ai.summarized_at),
      summarized_by = coalesce(excluded.summarized_by, customer_ai.summarized_by);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function ai_save(jsonb) from public, anon, authenticated;

-- Liste görünümüne puan sütunu (sona eklenir)
create or replace view v_customer_list with (security_invoker = true) as
 SELECT c.id, c.company_id, c.full_name, c.phone, c.sector, c.city, c.assigned_to,
    sp.full_name AS seller_name, c.assigned_by, ap.full_name AS assigner_name,
    c.data_type_id, dt.label AS data_type, c.status_id, st.label AS status, st.is_won AS status_is_won,
    c.last_note, c.applied_at, c.last_action_at, c.created_at, c.is_active,
    c.applied_at > (now() - '30 days'::interval) AND NOT (EXISTS ( SELECT 1 FROM interactions i
          WHERE i.customer_id = c.id AND i.user_id IS NOT NULL
            AND (COALESCE(i.channel, ''::text) <> ALL (ARRAY['Excel'::text, 'Mükerrer Data'::text])))) AS is_priority,
    ai.score AS ai_score, ai.label AS ai_label
   FROM customers c
     LEFT JOIN profiles sp ON sp.id = c.assigned_to
     LEFT JOIN profiles ap ON ap.id = c.assigned_by
     LEFT JOIN lookups dt ON dt.id = c.data_type_id
     LEFT JOIN lookups st ON st.id = c.status_id
     LEFT JOIN customer_ai ai ON ai.customer_id = c.id;

-- Her 2 dakikada bir sıradaki 20 datayı puanla (sıra boşsa hiç çağrılmaz)
select cron.schedule('ai-score', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://unlcqrfaawhqzkgwzdbu.supabase.co/functions/v1/ai',
    headers := jsonb_build_object('Content-Type','application/json','x-sync-token',(select token from public.sync_control where name='ai')),
    body := '{"action":"score"}'::jsonb, timeout_milliseconds := 110000)
  where cardinality(public.ai_score_queue(1)) > 0
$$);

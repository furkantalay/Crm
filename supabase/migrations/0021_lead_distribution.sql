-- =====================================================================
-- OTOMATİK DATA DAĞITIMI (funnel'dan gelen yeni datalar)
--  * Yalnız "dağıtıma açık" satışçılar alır (profiles.receives_leads).
--  * O an CRM'de olan (son 5 dk sinyal) satışçılar önceliklidir; kimse yoksa herkes sıraya girer.
--  * Ağırlık: son 180 günün satış oranı / ekip ortalaması, %70–%130 arasında sınırlı.
--  * Seçim: bugün aldığı data ÷ ağırlık en düşük olan (adil sıra).
-- =====================================================================

alter table profiles add column if not exists receives_leads boolean not null default false;

update profiles set receives_leads = true
 where company_id = (select id from companies where slug = 'dijitalbiradam')
   and role = 'satisci' and is_active
   and upper(full_name) in ('AYNUR', 'ŞEVVAL', 'İREM', 'ZEYNEP');

-- Satışçı bazında ağırlık ve bugünkü durum (yönetici ekranı da bunu kullanır)
create or replace function lead_distribution_state(p_company uuid)
returns table (user_id uuid, full_name text, receives_leads boolean, online boolean,
               leads_180 int, sales_180 int, conv numeric, weight numeric, today_count int)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.id, p.full_name, p.receives_leads,
           exists (select 1 from presence_pings x where x.user_id = p.id and x.at > now() - interval '5 minutes') as online,
           (select count(*)::int from customers c where c.assigned_to = p.id and c.applied_at > now() - interval '180 days') as leads_180,
           (select count(distinct s.customer_id)::int from sales s join customers c on c.id = s.customer_id
             where c.assigned_to = p.id and s.is_active and c.applied_at > now() - interval '180 days') as sales_180,
           (select count(*)::int from customers c where c.assigned_to = p.id and c.extra->>'auto_assigned' = 'true'
             and c.created_at >= (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')) as today_count
      from profiles p
     where p.company_id = p_company and p.is_active and p.role = 'satisci'
  ),
  r as (select b.*, case when b.leads_180 >= 50 then b.sales_180::numeric / b.leads_180 end as conv from base b),
  avg_ as (select avg(conv) a from r where receives_leads and conv is not null)
  select r.id, r.full_name, r.receives_leads, r.online, r.leads_180, r.sales_180, round(r.conv * 100, 1),
         round(least(1.3, greatest(0.7, coalesce(r.conv / nullif((select a from avg_), 0), 1))), 2),
         r.today_count
    from r order by r.full_name
$$;
revoke execute on function lead_distribution_state(uuid) from public, anon, authenticated;

create or replace function pick_lead_owner(p_company uuid) returns uuid
language sql stable security definer set search_path = public as $$
  with s as (select * from lead_distribution_state(p_company) where receives_leads),
  pool as (select * from s where online or not exists (select 1 from s where online))
  select user_id from pool order by (today_count + 1) / weight, random() limit 1
$$;
revoke execute on function pick_lead_owner(uuid) from public, anon, authenticated;

-- Yönetici ekranı için
drop function if exists lead_distribution_view();
create function lead_distribution_view()
returns table (user_id uuid, full_name text, receives_leads boolean, online boolean,
               leads_180 int, sales_180 int, conv numeric, weight numeric, today_count int)
language plpgsql stable security definer set search_path = public as $$
begin
  if current_user_role() not in ('admin','yonetici') then raise exception 'Yetkisiz'; end if;
  return query select * from lead_distribution_state(current_company_id());
end $$;
revoke execute on function lead_distribution_view() from public, anon;
grant execute on function lead_distribution_view() to authenticated;

-- funnel_ingest: atanmamış yeni data otomatik dağıtılır, satışçıya bildirim gider
-- p_rows: [{sheet, row, cells:[...]}]
create or replace function funnel_ingest(p_company uuid, p_rows jsonb, p_source text default 'canli')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_sheet text; v_row int; v_cells jsonb; v_phone text; v_norm text; v_agent text;
  v_existing funnel_rows%rowtype; v_is_new boolean; v_cust bigint; v_seller uuid; v_when timestamptz;
  v_auto boolean; v_type uuid; v_status uuid; v_auto_pick boolean := false;
  n_rows int := 0; n_new int := 0; n_created int := 0; n_dup int := 0; n_assigned int := 0;
begin
  select coalesce((settings->>'funnel_auto_create')::boolean, false) into v_auto from companies where id = p_company;
  select id into v_type from lookups where company_id = p_company and category = 'data_type' and label = 'Form' limit 1;
  select id into v_status from lookups where company_id = p_company and category = 'contact_status' and label = 'Yeni' limit 1;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_sheet := left(coalesce(r->>'sheet', 'TÜM DATA'), 100);
    v_row   := (r->>'row')::int;
    v_cells := coalesce(r->'cells', '[]'::jsonb);
    if v_row is null or jsonb_typeof(v_cells) <> 'array' then continue; end if;
    n_rows := n_rows + 1;

    v_norm := null; v_agent := null;
    if upper(v_sheet) = 'TÜM DATA' then
      v_phone := trim(coalesce(v_cells->>4, ''));
      v_norm  := nullif(right(regexp_replace(v_phone, '\D', '', 'g'), 10), '');
      if length(v_norm) < 10 then v_norm := null; end if;
      v_agent := nullif(trim(coalesce(v_cells->>0, '')), '');
    end if;

    select * into v_existing from funnel_rows where company_id = p_company and sheet = v_sheet and row_no = v_row;
    v_is_new := not found;

    if v_is_new then
      insert into funnel_rows (company_id, sheet, row_no, cells, phone_norm, agent, source)
      values (p_company, v_sheet, v_row, v_cells, v_norm, v_agent, p_source);
      n_new := n_new + 1;
    elsif v_existing.cells is distinct from v_cells then
      update funnel_rows set cells = v_cells, phone_norm = v_norm, agent = v_agent, updated_at = now()
       where id = v_existing.id;
    end if;

    -- CRM'e aktarım yalnız canlı gelen, telefonu olan satırlar için ve ayar açıksa
    continue when p_source <> 'canli' or not v_auto or v_norm is null;

    v_seller := null;
    if v_agent is not null then
      select id into v_seller from profiles
       where company_id = p_company and is_active
         and (lower(full_name) = lower(v_agent) or lower(username) = lower(v_agent)
              or upper(translate(full_name,'iı','İI')) = upper(translate(v_agent,'iı','İI')))
       limit 1;
    end if;

    if v_is_new then
      v_when := coalesce(funnel_parse_date(v_cells->>5), now());
      v_auto_pick := false;
      select id into v_cust from customers where company_id = p_company and phone_norm = v_norm
       order by is_active desc, applied_at desc nulls last limit 1;
      if v_cust is not null then
        -- tekrar başvuru: başvuru tarihi yenilenir (0007 kuralı)
        insert into interactions (company_id, customer_id, user_id, channel, note, created_at)
        values (p_company, v_cust, null, 'Mükerrer Data',
                'Tekrar başvuru (funnel)' || coalesce(': ' || nullif(v_cells->>8, ''), ''), v_when);
        n_dup := n_dup + 1;
        -- datanın sahibi varsa haber ver
        insert into notifications (company_id, user_id, customer_id, title, body, link)
        select p_company, cu.assigned_to, cu.id, '🔁 Tekrar başvurdu: ' || cu.full_name,
               'Funnel formunu yeniden doldurdu', '/datalar/' || cu.id
          from customers cu where cu.id = v_cust and cu.assigned_to is not null;
      else
        if v_seller is null then
          v_seller := pick_lead_owner(p_company);
          v_auto_pick := v_seller is not null;
        end if;
        insert into customers (company_id, full_name, phone, email, city, sector, data_type_id, status_id,
                               assigned_to, applied_at, last_action_at, extra)
        values (p_company, coalesce(nullif(trim(v_cells->>1), ''), 'İsimsiz'), v_phone,
                nullif(trim(v_cells->>3), ''), nullif(trim(v_cells->>6), ''), nullif(trim(v_cells->>8), ''),
                v_type, v_status, v_seller, v_when, v_when,
                jsonb_strip_nulls(jsonb_build_object('funnel_row', v_row, 'problem', nullif(trim(v_cells->>7), ''),
                                                    'auto_assigned', case when v_auto_pick then true end)))
        returning id into v_cust;
        insert into interactions (company_id, customer_id, user_id, channel, note)
        values (p_company, v_cust, null, 'Funnel',
                'Funnel formundan otomatik eklendi' || case when v_auto_pick then ' ve otomatik dağıtıldı' else '' end);
        if v_seller is not null then
          insert into notifications (company_id, user_id, customer_id, title, body, link)
          values (p_company, v_seller, v_cust, '🆕 Yeni data: ' || coalesce(nullif(trim(v_cells->>1), ''), 'İsimsiz'),
                  concat_ws(' · ', nullif(trim(v_cells->>8), ''), nullif(trim(v_cells->>6), ''), v_phone),
                  '/datalar/' || v_cust);
        end if;
        n_created := n_created + 1;
      end if;
      update funnel_rows set customer_id = v_cust where company_id = p_company and sheet = v_sheet and row_no = v_row;
    elsif v_seller is not null and v_existing.customer_id is not null
          and v_agent is distinct from v_existing.agent then
      -- sayfada satışçı sonradan yazıldıysa ve data hâlâ atanmamışsa ata
      update customers set assigned_to = v_seller where id = v_existing.customer_id and assigned_to is null;
      if found then n_assigned := n_assigned + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('rows', n_rows, 'new_rows', n_new, 'created', n_created, 'duplicates', n_dup, 'assigned', n_assigned);
end $$;
revoke execute on function funnel_ingest(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function funnel_ingest(uuid, jsonb, text) to service_role;

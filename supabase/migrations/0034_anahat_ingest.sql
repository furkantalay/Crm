-- =====================================================================
-- "ANA HAT DATA" sayfası (SELEN ŞAHİN dosyası) → CRM
-- funnel_ingest artık sayfaya göre sütun eşlemesi yapar:
--   TÜM DATA      : A satışçı, B ad, D e-posta, E telefon, F tarih, G şehir, H not, I sektör, J-S reklam
--   ANA HAT DATA  : A satışçı, B ad (ANAHAT = isim alınmamış), C telefon, D not, E sektör, F tarih
-- Data oluşturma yine companies.settings.funnel_auto_create ile açılır (geçiş günü).
-- =====================================================================
create or replace function funnel_ingest(p_company uuid, p_rows jsonb, p_source text default 'canli')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_sheet text; v_row int; v_cells jsonb; v_phone text; v_norm text; v_agent text;
  v_existing funnel_rows%rowtype; v_is_new boolean; v_cust bigint; v_seller uuid; v_when timestamptz;
  v_auto boolean; v_type_form uuid; v_type_anahat uuid; v_type uuid; v_status uuid; v_auto_pick boolean := false;
  v_anahat boolean; v_name text; v_email text; v_city text; v_sector text; v_note text; v_date text;
  v_channel text; v_src text; v_extra jsonb;
  n_rows int := 0; n_new int := 0; n_created int := 0; n_dup int := 0; n_assigned int := 0;
begin
  select coalesce((settings->>'funnel_auto_create')::boolean, false) into v_auto from companies where id = p_company;
  select id into v_type_form   from lookups where company_id = p_company and category = 'data_type' and label = 'Form' limit 1;
  select id into v_type_anahat from lookups where company_id = p_company and category = 'data_type' and label = 'Anahat' limit 1;
  select id into v_status from lookups where company_id = p_company and category = 'contact_status' and label = 'Yeni' limit 1;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_sheet := left(coalesce(r->>'sheet', 'TÜM DATA'), 100);
    v_row   := (r->>'row')::int;
    v_cells := coalesce(r->'cells', '[]'::jsonb);
    if v_row is null or jsonb_typeof(v_cells) <> 'array' then continue; end if;
    n_rows := n_rows + 1;

    v_anahat := upper(v_sheet) = 'ANA HAT DATA';
    v_norm := null; v_agent := null; v_phone := null;
    if upper(v_sheet) = 'TÜM DATA' or v_anahat then
      v_phone := trim(coalesce(v_cells->>(case when v_anahat then 2 else 4 end), ''));
      v_norm  := nullif(right(regexp_replace(v_phone, '\D', '', 'g'), 10), '');
      if length(v_norm) < 10 then v_norm := null; end if;
      v_agent := nullif(trim(coalesce(v_cells->>0, '')), '');
    end if;
    if v_anahat then
      v_name := nullif(trim(v_cells->>1), '');
      if upper(coalesce(v_name, '')) in ('ANAHAT', 'ANA HAT') then v_name := null; end if;
      v_email := null; v_city := null;
      v_note := nullif(trim(v_cells->>3), ''); v_sector := nullif(trim(v_cells->>4), ''); v_date := v_cells->>5;
      v_type := coalesce(v_type_anahat, v_type_form); v_channel := 'Ana Hat'; v_src := 'WhatsApp ana hat';
      v_extra := jsonb_strip_nulls(jsonb_build_object('anahat_row', v_row, 'problem', v_note));
    else
      v_name := nullif(trim(v_cells->>1), ''); v_email := nullif(trim(v_cells->>3), '');
      v_city := nullif(trim(v_cells->>6), ''); v_note := nullif(trim(v_cells->>7), '');
      v_sector := nullif(trim(v_cells->>8), ''); v_date := v_cells->>5;
      v_type := v_type_form; v_channel := 'Funnel'; v_src := 'funnel';
      v_extra := jsonb_strip_nulls(jsonb_build_object('funnel_row', v_row, 'problem', v_note,
                   'ad', nullif(jsonb_strip_nulls(jsonb_build_object(
                     'source', nullif(trim(v_cells->>9), ''), 'medium', nullif(trim(v_cells->>10), ''),
                     'campaign', nullif(trim(v_cells->>11), ''), 'ad_name', nullif(trim(v_cells->>12), ''),
                     'adset', nullif(trim(v_cells->>13), ''), 'campaign_id', nullif(trim(v_cells->>14), ''),
                     'adset_id', nullif(trim(v_cells->>15), ''), 'ad_id', nullif(trim(v_cells->>16), ''),
                     'fbclid', nullif(trim(v_cells->>17), ''), 'landing_page', nullif(trim(v_cells->>18), ''))), '{}'::jsonb)));
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

    continue when p_source <> 'canli' or not v_auto or v_norm is null;

    v_seller := null;
    if v_agent is not null then
      select id into v_seller from profiles
       where company_id = p_company and is_active
         and (lower(full_name) = lower(v_agent) or lower(username) = lower(v_agent)
              or upper(translate(full_name,'iı','İI')) = upper(translate(v_agent,'iı','İI')))
       limit 1;
    end if;

    -- Ana hatta telefon sonradan yazılabilir: satır önceden vardı ama henüz dataya dönüşmediyse yeni say
    if v_is_new or (v_existing.customer_id is null and v_existing.phone_norm is null) then
      v_when := coalesce(funnel_parse_date(v_date), now());
      v_auto_pick := false;
      select id into v_cust from customers where company_id = p_company and phone_norm = v_norm
       order by is_active desc, applied_at desc nulls last limit 1;
      if v_cust is not null then
        insert into interactions (company_id, customer_id, user_id, channel, note, created_at)
        values (p_company, v_cust, null, 'Mükerrer Data',
                'Tekrar başvuru (' || v_src || ')' || coalesce(': ' || coalesce(v_note, v_sector), ''), v_when);
        n_dup := n_dup + 1;
        insert into notifications (company_id, user_id, customer_id, title, body, link)
        select p_company, cu.assigned_to, cu.id, '🔁 Tekrar başvurdu: ' || cu.full_name,
               case when v_anahat then 'Ana hattan yeniden yazdı/aradı' else 'Funnel formunu yeniden doldurdu' end
                 || coalesce(' · ' || v_note, ''),
               '/datalar/' || cu.id
          from customers cu where cu.id = v_cust and cu.assigned_to is not null;
      else
        if v_seller is null then
          v_seller := pick_lead_owner(p_company);
          v_auto_pick := v_seller is not null;
        end if;
        insert into customers (company_id, full_name, phone, email, city, sector, data_type_id, status_id,
                               assigned_to, applied_at, last_action_at, last_note, extra)
        values (p_company, coalesce(v_name, case when v_anahat then 'İsimsiz (Ana Hat)' else 'İsimsiz' end), v_phone,
                v_email, v_city, v_sector, v_type, v_status, v_seller, v_when, v_when,
                case when v_anahat then v_note end,
                v_extra || case when v_auto_pick then '{"auto_assigned": true}'::jsonb else '{}'::jsonb end)
        returning id into v_cust;
        insert into interactions (company_id, customer_id, user_id, channel, note)
        values (p_company, v_cust, null, v_channel,
                case when v_anahat then 'Ana hattan otomatik eklendi' || coalesce(': ' || v_note, '')
                     else 'Funnel formundan otomatik eklendi' end
                || case when v_auto_pick then ' (otomatik dağıtıldı)' else '' end);
        if v_seller is not null then
          insert into notifications (company_id, user_id, customer_id, title, body, link)
          values (p_company, v_seller, v_cust,
                  '🆕 Yeni data' || case when v_anahat then ' (ana hat)' else '' end || ': '
                    || coalesce(v_name, 'İsimsiz'),
                  concat_ws(' · ', v_note, v_sector, v_city, v_phone), '/datalar/' || v_cust);
        end if;
        n_created := n_created + 1;
      end if;
      update funnel_rows set customer_id = v_cust where company_id = p_company and sheet = v_sheet and row_no = v_row;
    elsif v_seller is not null and v_existing.customer_id is not null
          and v_agent is distinct from v_existing.agent then
      update customers set assigned_to = v_seller where id = v_existing.customer_id and assigned_to is null;
      if found then n_assigned := n_assigned + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('rows', n_rows, 'new_rows', n_new, 'created', n_created, 'duplicates', n_dup, 'assigned', n_assigned);
end $$;
revoke execute on function funnel_ingest(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function funnel_ingest(uuid, jsonb, text) to service_role;

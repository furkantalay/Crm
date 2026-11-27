-- Funnel satırlarındaki reklam kaynağı sütunları (J–S) yeni dataya customers.extra.ad olarak işlenir
-- J utm_source · K utm_medium · L utm_campaign · M utm_content (reklam adı) · N utm_term (set adı)
-- O campaign_id · P adset_id · Q ad_id · R fbclid · S landing_page
do $$
declare d text := pg_get_functiondef('funnel_ingest(uuid,jsonb,text)'::regprocedure);
begin
  d := replace(d, $x$'auto_assigned', case when v_auto_pick then true end)))$x$,
    $x$'auto_assigned', case when v_auto_pick then true end,
                                                    'ad', nullif(jsonb_strip_nulls(jsonb_build_object(
                                                      'source', nullif(trim(v_cells->>9), ''), 'medium', nullif(trim(v_cells->>10), ''),
                                                      'campaign', nullif(trim(v_cells->>11), ''), 'ad_name', nullif(trim(v_cells->>12), ''),
                                                      'adset', nullif(trim(v_cells->>13), ''), 'campaign_id', nullif(trim(v_cells->>14), ''),
                                                      'adset_id', nullif(trim(v_cells->>15), ''), 'ad_id', nullif(trim(v_cells->>16), ''),
                                                      'fbclid', nullif(trim(v_cells->>17), ''), 'landing_page', nullif(trim(v_cells->>18), ''))), '{}'::jsonb))))$x$);
  if position('''ad'', nullif' in d) = 0 then raise exception 'değiştirilemedi'; end if;
  execute d;
end $$;
create index if not exists customers_ad_id on customers ((extra->'ad'->>'ad_id')) where extra ? 'ad';

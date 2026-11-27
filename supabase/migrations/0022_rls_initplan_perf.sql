-- RLS hızlandırma: yetki fonksiyonlarını (select ...) içine alarak satır başına değil sorgu başına bir kez çalıştır.
-- Panel sayaçları 3,3 sn'den ~3 ms'ye indi (zaman aşımı yüzünden "-" görünüyordu).
-- Yeni politika yazarken de aynı kalıbı kullanın: (select current_company_id()), (select is_staff()), (select auth.uid())
do $$
declare p record; q text; w text; sql text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := p.qual; w := p.with_check;
    if q is not null then
      q := regexp_replace(q, '(?<!select )(current_company_id\(\)|current_user_role\(\)|is_staff\(\)|auth\.uid\(\))', '(select \1)', 'g');
    end if;
    if w is not null then
      w := regexp_replace(w, '(?<!select )(current_company_id\(\)|current_user_role\(\)|is_staff\(\)|auth\.uid\(\))', '(select \1)', 'g');
    end if;
    if q is distinct from p.qual or w is distinct from p.with_check then
      sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
      if q is not null then sql := sql || ' using (' || q || ')'; end if;
      if w is not null then sql := sql || ' with check (' || w || ')'; end if;
      execute sql;
    end if;
  end loop;
end $$;

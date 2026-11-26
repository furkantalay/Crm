-- Telefon uygulaması yardımcıları

-- Uygulama giden aramalarda numaranın kendisini değil SHA-256 özetini (son 10 hane) sorar;
-- yalnız CRM'de kayıtlı olanların özetleri döner. Kayıtlı olmayan numara telefondan hiç çıkmaz.
create or replace function match_phone_hashes(p_hashes text[])
returns text[] language sql stable security definer set search_path = public, extensions as $$
  select coalesce(array_agg(distinct h), '{}')
    from (select encode(extensions.digest(cu.phone_norm, 'sha256'), 'hex') as h
            from customers cu
           where cu.company_id = current_company_id() and length(cu.phone_norm) = 10) x
   where h = any (p_hashes[1:1000])
$$;
revoke execute on function match_phone_hashes(text[]) from public, anon;
grant execute on function match_phone_hashes(text[]) to authenticated;

create or replace function app_whoami()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('full_name', full_name, 'role', role) from profiles where id = auth.uid()
$$;
revoke execute on function app_whoami() from public, anon;
grant execute on function app_whoami() to authenticated;

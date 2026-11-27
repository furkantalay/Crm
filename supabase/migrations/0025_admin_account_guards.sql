-- Admin hesabını yöneticiye karşı koru (yalnız ekranda değil, veritabanında da)
create or replace function public.create_password_setup_token(target_user uuid, valid_hours integer default 24)
returns text language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare raw text; v_target_role user_role;
begin
  if current_user_role() not in ('admin', 'yonetici') or not manager_can('users') then
    raise exception 'Yetkiniz yok.';
  end if;
  select role into v_target_role from profiles where id = target_user and company_id = current_company_id();
  if not found then raise exception 'Kullanıcı bulunamadı.'; end if;
  -- yönetici, admin hesabına şifre bağlantısı üretemez (hesap ele geçirmeyi önler)
  if v_target_role = 'admin' and current_user_role() <> 'admin' then
    raise exception 'Admin hesabı için şifre bağlantısını yalnız admin oluşturabilir.';
  end if;
  raw := encode(gen_random_bytes(24), 'hex');
  insert into password_setup_tokens (user_id, token_hash, created_by, expires_at)
  values (target_user, encode(digest(raw, 'sha256'), 'hex'), auth.uid(), now() + make_interval(hours => least(valid_hours, 72)));
  return raw;
end $function$;

-- yönetici admin kaydını değiştiremez / pasife alamaz ve kimseyi admin yapamaz
drop policy if exists profiles_write on profiles;
create policy profiles_write on profiles for all
  using (company_id = (select current_company_id())
         and ((select current_user_role()) = 'admin'
              or ((select current_user_role()) = 'yonetici' and role <> 'admin')))
  with check (company_id = (select current_company_id())
         and ((select current_user_role()) = 'admin'
              or ((select current_user_role()) = 'yonetici' and role <> 'admin')));

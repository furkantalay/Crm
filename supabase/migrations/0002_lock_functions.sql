-- Tetikleyici fonksiyonları API'den hiç çağrılamasın (tetikleyiciler yine çalışır)
revoke execute on function log_change(), touch_customer_on_interaction(), block_delete() from public, anon, authenticated;
-- Yetki fonksiyonları: sadece giriş yapmış kullanıcı (RLS için gerekli; sadece kendi şirket/rolünü döner)
revoke execute on function current_company_id(), current_user_role(), is_staff() from public, anon;
grant execute on function current_company_id(), current_user_role(), is_staff() to authenticated;

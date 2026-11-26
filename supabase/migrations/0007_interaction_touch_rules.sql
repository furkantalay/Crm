-- Görüşme eklenince müşteriyi güncelle:
--  * Kullanıcı notu: son not, durum ve son işlem güncellenir
--  * Sistem notu (user_id boş, ör. Excel aktarımı): sadece son işlem
--  * Mükerrer başvuru: başvuru tarihi yenilenir, data listede tekrar üste çıkar
create or replace function touch_customer_on_interaction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.channel = 'Mükerrer Data' then
    update customers set applied_at = new.created_at, last_action_at = new.created_at where id = new.customer_id;
  elsif new.user_id is null then
    update customers set last_action_at = greatest(coalesce(last_action_at, new.created_at), new.created_at) where id = new.customer_id;
  else
    update customers
       set last_note      = coalesce(new.note, last_note),
           status_id      = coalesce(new.status_id, status_id),
           last_action_at = new.created_at
     where id = new.customer_id;
  end if;
  return new;
end $$;
revoke execute on function touch_customer_on_interaction() from public, anon, authenticated;

-- Satış girilince memnuniyet araması otomatik oluşsun (sorumlu: satışı yapan)
create or replace function create_satisfaction_for_sale() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from satisfaction_calls where sale_id = new.id) then
    insert into satisfaction_calls (company_id, customer_id, sale_id, sold_by, responsible_id)
    values (new.company_id, new.customer_id, new.id, new.seller_id, new.seller_id);
  end if;
  return new;
end $$;
revoke execute on function create_satisfaction_for_sale() from public, anon, authenticated;
create trigger trg_sale_satisfaction after insert on sales
  for each row execute function create_satisfaction_for_sale();

-- (0008) Excel kanalı da sistem notu sayılır: kullanıcı adına eklense bile son notu ezmez
create or replace function touch_customer_on_interaction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.channel = 'Mükerrer Data' then
    update customers set applied_at = new.created_at, last_action_at = new.created_at where id = new.customer_id;
  elsif new.user_id is null or new.channel = 'Excel' then
    update customers set last_action_at = greatest(coalesce(last_action_at, new.created_at), new.created_at) where id = new.customer_id;
  else
    update customers
       set last_note      = coalesce(new.note, last_note),
           status_id      = coalesce(new.status_id, status_id),
           last_action_at = new.created_at
     where id = new.customer_id;
  end if;
  return new;
end $$;
revoke execute on function touch_customer_on_interaction() from public, anon, authenticated;

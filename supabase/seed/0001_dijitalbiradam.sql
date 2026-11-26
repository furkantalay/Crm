-- Dijital Bir Adam şirketi + eski CRM'deki listeler
insert into companies (name, slug, default_logout_minutes, plan, settings)
values ('Dijital Bir Adam', 'dijitalbiradam', 30, 'pro',
        '{"manager_backup_download_allowed": true}'::jsonb)
on conflict (slug) do nothing;

with c as (select id from companies where slug = 'dijitalbiradam')
insert into lookups (company_id, category, label, is_won, sort_order)
select c.id, v.cat::lookup_category, v.label, v.won, v.ord from c, (values
  ('data_type','Yeni Data',false,1), ('data_type','Anahat',false,2), ('data_type','Eski Data',false,3),
  ('data_type','Form',false,4), ('data_type','Birebir Satış',false,5),
  ('contact_status','Yeni',false,1), ('contact_status','Mesaj Atıldı',false,2), ('contact_status','Arandı',false,3),
  ('contact_status','Ulaşılamadı',false,4), ('contact_status','Toplantı',false,5), ('contact_status','Olumlu',false,6),
  ('contact_status','Olumsuz',false,7), ('contact_status','Satış',true,8),
  ('sale_source','İyzico',false,1), ('sale_source','Havale/EFT',false,2), ('sale_source','PayTR',false,3),
  ('sale_source','Diğer',false,4),
  ('payment_method','Tek Çekim',false,1), ('payment_method','Taksitli',false,2), ('payment_method','Havale/EFT',false,3),
  ('bank','Ziraat Bankası',false,1), ('bank','Kuveyt Türk',false,2)
) as v(cat, label, won, ord)
on conflict do nothing;

with c as (select id from companies where slug = 'dijitalbiradam')
insert into products (company_id, name, kind, includes, sort_order)
select c.id, v.name, v.kind, v.inc, v.ord from c, (values
  ('Profesyonel Meta Reklamcılığı', 'program', null::text[], 1),
  ('Sıfırdan Instagram Pazarlaması', 'program', null, 2),
  ('Dijital Pazarlama & Geo', 'program', null, 3),
  ('İşletmeler İçin Uygulamalı Yapay Zeka Eğitimi', 'program', null, 4),
  ('Meta Reklamcılığı + GEO', 'package', array['Profesyonel Meta Reklamcılığı','Dijital Pazarlama & Geo'], 1),
  ('Meta Reklamcılığı + Sıfırdan Instagram', 'package', array['Profesyonel Meta Reklamcılığı','Sıfırdan Instagram Pazarlaması'], 2),
  ('3''lü paket', 'package', array['Profesyonel Meta Reklamcılığı','Sıfırdan Instagram Pazarlaması','Dijital Pazarlama & Geo'], 3),
  ('Meta + Yapay Zeka', 'package', array['Profesyonel Meta Reklamcılığı','İşletmeler İçin Uygulamalı Yapay Zeka Eğitimi'], 4),
  ('Meta, geo, yz', 'package', array['Profesyonel Meta Reklamcılığı','Dijital Pazarlama & Geo','İşletmeler İçin Uygulamalı Yapay Zeka Eğitimi'], 5)
) as v(name, kind, inc, ord)
on conflict do nothing;

select (select count(*) from companies) companies,
       (select count(*) from lookups)   lookups,
       (select count(*) from products)  products;

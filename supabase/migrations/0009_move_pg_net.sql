-- pg_net eklentisi public şemada durmasın (Supabase güvenlik önerisi)
drop extension if exists pg_net;
create extension pg_net schema extensions;

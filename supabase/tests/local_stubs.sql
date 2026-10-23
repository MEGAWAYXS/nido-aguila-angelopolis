-- Simulación MÍNIMA del entorno de Supabase para probar el esquema y las
-- políticas RLS en un PostgreSQL local (sin Docker). NO ejecutar en Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;

-- Supabase concede por defecto privilegios de tabla a anon y authenticated;
-- se replican para comprobar que la migración los revoca y que RLS protege.
grant usage on schema public to anon, authenticated;
-- (sin privilegios por defecto: la migración debe concederlos explícitamente)

alter default privileges in schema public grant execute on functions to anon, authenticated;

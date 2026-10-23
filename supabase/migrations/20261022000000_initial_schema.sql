-- =====================================================================
-- Nido Águila Angelópolis · Esquema inicial
-- Ejecutar en Supabase (SQL Editor o `supabase db push`).
-- Principios:
--   * RLS activado en TODAS las tablas de public. Sin políticas para anon.
--   * Un usuario autenticado sin fila en public.profiles NO ve nada.
--   * Roles preparados: admin, coach, assistant, viewer.
--   * Tablas de tutores creadas pero SIN políticas (acceso de familias desactivado).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'coach', 'assistant', 'viewer');
create type public.category_status as enum ('active', 'archived');
create type public.session_type as enum ('training', 'match');
create type public.session_status as enum ('scheduled', 'done', 'cancelled');
create type public.attendance_status as enum ('present', 'absent', 'sick', 'justified');
create type public.eligibility_decision as enum ('eligible', 'not_eligible');
create type public.call_up_status as enum ('called', 'not_called');

-- ---------------------------------------------------------------------
-- Personal y roles
-- ---------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'viewer',
  display_name text not null default '',
  -- Cuenta compartida de la v1: los cambios no se atribuyen a una persona.
  is_shared_account boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Funciones de autorización. SECURITY DEFINER para poder leer profiles sin
-- recursión de RLS; search_path vacío para evitar secuestro de funciones.
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = auth.uid() and p.active
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.current_app_role() is not null $$;

create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() in ('admin', 'coach', 'assistant'), false) $$;

create or replace function public.can_manage()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() in ('admin', 'coach'), false) $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() = 'admin', false) $$;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

create sequence public.player_folio_seq start 1;

create or replace function public.next_player_folio()
returns text language sql volatile set search_path = ''
as $$ select 'NAA-' || lpad(nextval('public.player_folio_seq')::text, 4, '0') $$;

-- ---------------------------------------------------------------------
-- Módulo 1: Categorías
-- ---------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  season text not null check (length(trim(season)) > 0),
  description text,
  coach_name text,
  -- Para cuando existan usuarios individuales.
  coach_user_id uuid references public.profiles (user_id) on delete set null,
  status public.category_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Módulo 2: Jugadores
-- ---------------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default public.next_player_folio(),
  full_name text not null check (length(trim(full_name)) > 0),
  nickname text,
  jersey_number smallint check (jersey_number between 0 and 999),
  birth_date date not null check (birth_date > date '1990-01-01'),
  weight_kg numeric(5, 2) check (weight_kg > 0 and weight_kg < 200),
  height_cm numeric(5, 1) check (height_cm > 50 and height_cm < 250),
  category_id uuid not null references public.categories (id),
  position text,
  dominant_foot text check (dominant_foot in ('right', 'left', 'both')),
  nationality text,
  photo_path text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index players_category_idx on public.players (category_id);
create trigger players_touch before update on public.players
  for each row execute function public.touch_updated_at();

create table public.player_category_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  from_category_id uuid references public.categories (id),
  to_category_id uuid not null references public.categories (id),
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid(),
  reason text
);
create index pch_player_idx on public.player_category_history (player_id);

-- El motivo del cambio se pasa con: select set_config('app.category_change_reason', '...', true)
create or replace function public.log_category_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.player_category_history (player_id, to_category_id, reason)
    values (new.id, new.category_id, 'Alta');
  elsif new.category_id is distinct from old.category_id then
    insert into public.player_category_history (player_id, from_category_id, to_category_id, reason)
    values (new.id, old.category_id, new.category_id, nullif(current_setting('app.category_change_reason', true), ''));
  end if;
  return new;
end $$;
create trigger players_category_history after insert or update of category_id on public.players
  for each row execute function public.log_category_change();

-- Cambio de categoría con motivo. SECURITY INVOKER: se aplican las políticas RLS del usuario.
create or replace function public.change_player_category(p_player uuid, p_category uuid, p_reason text default null)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  perform set_config('app.category_change_reason', coalesce(p_reason, ''), true);
  update public.players set category_id = p_category where id = p_player;
  if not found then
    raise exception 'Jugador no encontrado o sin permiso' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Módulo 6: Calendario (sesiones de entrenamiento y partidos)
-- ---------------------------------------------------------------------
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id),
  date date not null,
  start_time time not null,
  end_time time,
  type public.session_type not null default 'training',
  location text,
  coach_name text,
  status public.session_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);
create index sessions_category_date_idx on public.training_sessions (category_id, date);
create trigger sessions_touch before update on public.training_sessions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Módulo 3: Asistencia (un registro por jugador y sesión)
-- ---------------------------------------------------------------------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  status public.attendance_status not null,
  reason text,
  justification_approved boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (session_id, player_id)
);
create index attendance_player_idx on public.attendance (player_id);
create trigger attendance_touch before update on public.attendance
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Módulo 4: Reglas de faltas, excepciones y convocatorias
-- ---------------------------------------------------------------------
create table public.absence_rules (
  id uuid primary key default gen_random_uuid(),
  category_id uuid unique references public.categories (id) on delete cascade, -- null = global
  yellow_from smallint not null default 1 check (yellow_from >= 1),
  red_from smallint not null default 3,
  count_sick boolean not null default false,
  count_justified boolean not null default false,
  updated_at timestamptz not null default now(),
  check (red_from > yellow_from)
);
-- Solo una regla global.
create unique index absence_rules_single_global on public.absence_rules ((category_id is null)) where category_id is null;
insert into public.absence_rules (category_id, yellow_from, red_from) values (null, 1, 3);

create table public.eligibility_exceptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  decision public.eligibility_decision not null,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  revoked boolean not null default false,
  revoked_at timestamptz,
  revoked_by uuid
);
create index exceptions_week_idx on public.eligibility_exceptions (week_start);

create table public.call_ups (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  status public.call_up_status not null,
  note text,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid default auth.uid(),
  unique (player_id, week_start)
);

-- ---------------------------------------------------------------------
-- Futuro portal de familias (NO activado: RLS sin políticas = sin acceso)
-- ---------------------------------------------------------------------
create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.player_guardians (
  player_id uuid not null references public.players (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  relationship text,
  -- Interruptor por jugador para el futuro portal; hoy no lo lee ninguna política.
  portal_access boolean not null default false,
  primary key (player_id, guardian_id)
);

-- ---------------------------------------------------------------------
-- Bitácora de cambios
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor uuid default auth.uid(),
  at timestamptz not null default now()
);

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', null),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories', 'players', 'training_sessions', 'attendance', 'absence_rules', 'eligibility_exceptions', 'call_ups']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- =====================================================================
-- Seguridad: RLS
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.players enable row level security;
alter table public.player_category_history enable row level security;
alter table public.training_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.absence_rules enable row level security;
alter table public.eligibility_exceptions enable row level security;
alter table public.call_ups enable row level security;
alter table public.guardians enable row level security;
alter table public.player_guardians enable row level security;
alter table public.audit_log enable row level security;

-- Privilegios explícitos (no dependen de "Automatically expose new tables"):
-- authenticated puede intentar operar y RLS decide fila por fila.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Defensa en profundidad: el rol anónimo no tiene ningún privilegio.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.current_app_role(), public.is_staff(), public.can_write(),
  public.can_manage(), public.is_admin(), public.next_player_folio(),
  public.change_player_category(uuid, uuid, text) to authenticated;
grant usage on sequence public.player_folio_seq to authenticated;

-- Perfiles: cada quien ve el suyo; el administrador ve y gestiona todos.
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Datos deportivos: lectura para todo el personal activo.
create policy categories_select on public.categories for select to authenticated using (public.is_staff());
create policy categories_insert on public.categories for insert to authenticated with check (public.can_manage());
create policy categories_update on public.categories for update to authenticated using (public.can_manage()) with check (public.can_manage());
create policy categories_delete on public.categories for delete to authenticated using (public.is_admin());

create policy players_select on public.players for select to authenticated using (public.is_staff());
create policy players_insert on public.players for insert to authenticated with check (public.can_write());
create policy players_update on public.players for update to authenticated using (public.can_write()) with check (public.can_write());
create policy players_delete on public.players for delete to authenticated using (public.is_admin());

create policy pch_select on public.player_category_history for select to authenticated using (public.is_staff());
-- Las inserciones las hace el trigger (security definer); no hay política de escritura directa.

create policy sessions_select on public.training_sessions for select to authenticated using (public.is_staff());
create policy sessions_insert on public.training_sessions for insert to authenticated with check (public.can_write());
create policy sessions_update on public.training_sessions for update to authenticated using (public.can_write()) with check (public.can_write());
create policy sessions_delete on public.training_sessions for delete to authenticated using (public.can_manage());

create policy attendance_select on public.attendance for select to authenticated using (public.is_staff());
create policy attendance_insert on public.attendance for insert to authenticated with check (public.can_write());
create policy attendance_update on public.attendance for update to authenticated using (public.can_write()) with check (public.can_write());
create policy attendance_delete on public.attendance for delete to authenticated using (public.can_manage());

create policy rules_select on public.absence_rules for select to authenticated using (public.is_staff());
create policy rules_insert on public.absence_rules for insert to authenticated with check (public.can_manage());
create policy rules_update on public.absence_rules for update to authenticated using (public.can_manage()) with check (public.can_manage());
create policy rules_delete on public.absence_rules for delete to authenticated using (public.can_manage() and category_id is not null);

-- Excepciones: se revocan, no se borran (historial).
create policy exceptions_select on public.eligibility_exceptions for select to authenticated using (public.is_staff());
create policy exceptions_insert on public.eligibility_exceptions for insert to authenticated with check (public.can_manage());
create policy exceptions_update on public.eligibility_exceptions for update to authenticated using (public.can_manage()) with check (public.can_manage());

create policy callups_select on public.call_ups for select to authenticated using (public.is_staff());
create policy callups_insert on public.call_ups for insert to authenticated with check (public.can_manage());
create policy callups_update on public.call_ups for update to authenticated using (public.can_manage()) with check (public.can_manage());

create policy audit_select on public.audit_log for select to authenticated using (public.is_admin());

-- guardians / player_guardians: sin políticas a propósito.

-- =====================================================================
-- Almacenamiento privado de fotografías
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

create policy player_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and public.is_staff());
create policy player_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and public.can_write());
create policy player_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and public.can_write())
  with check (bucket_id = 'player-photos' and public.can_write());
create policy player_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and public.can_write());

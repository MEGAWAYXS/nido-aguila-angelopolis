-- Pruebas de acceso no autorizado y permisos por rol.
-- Uso local: scripts/test-db-local.sh  (crea una BD temporal con stubs de Supabase)
-- Cada bloque lanza una excepción si el resultado no es el esperado.
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Datos de prueba (ficticios) como superusuario.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@prueba.invalid'),
  ('00000000-0000-0000-0000-00000000000c', 'compartida@prueba.invalid'),
  ('00000000-0000-0000-0000-00000000000e', 'consulta@prueba.invalid'),
  ('00000000-0000-0000-0000-0000000000ff', 'sinperfil@prueba.invalid');
insert into public.profiles (user_id, role, display_name, is_shared_account) values
  ('00000000-0000-0000-0000-00000000000a', 'admin', 'Admin', false),
  ('00000000-0000-0000-0000-00000000000c', 'coach', 'Cuenta compartida', true),
  ('00000000-0000-0000-0000-00000000000e', 'viewer', 'Consulta', false);
insert into public.categories (id, name, season) values ('11111111-1111-1111-1111-111111111111', 'Sub-12', '2026-27');
insert into public.players (id, full_name, birth_date, category_id) values
  ('22222222-2222-2222-2222-222222222222', 'Jugador Ficticio', '2014-03-14', '11111111-1111-1111-1111-111111111111');
insert into public.training_sessions (id, category_id, date, start_time, status) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '2026-10-19', '17:00', 'done');
insert into public.guardians (full_name) values ('Tutor Ficticio');

-- ===== 1. Anónimo: no lee ni escribe nada =====
set role anon;
set request.jwt.claim.sub = '';
do $$
declare t text; ok boolean;
begin
  foreach t in array array['profiles','categories','players','player_category_history','training_sessions','attendance','absence_rules','eligibility_exceptions','call_ups','guardians','player_guardians','audit_log']
  loop
    ok := false;
    begin
      execute format('select count(*) from public.%I', t);
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception 'FALLO: anon puede leer %', t; end if;
  end loop;
  begin
    insert into public.categories (name, season) values ('X', 'Y');
    raise exception 'FALLO: anon pudo insertar categoría';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from storage.objects where bucket_id = 'player-photos') <> 0 then raise exception 'FALLO'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('player-photos', 'x.jpg');
    raise exception 'FALLO: anon pudo subir foto';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 1: anon sin acceso a tablas ni a fotos';
end $$;
reset role;

-- ===== 2. Autenticado SIN perfil: no ve nada ni escribe =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ff';
do $$
begin
  if (select count(*) from public.players) <> 0 then raise exception 'FALLO: usuario sin perfil ve jugadores'; end if;
  if (select count(*) from public.categories) <> 0 then raise exception 'FALLO: usuario sin perfil ve categorías'; end if;
  if (select count(*) from public.profiles) <> 0 then raise exception 'FALLO: usuario sin perfil ve perfiles'; end if;
  begin
    insert into public.categories (name, season) values ('X', 'Y');
    raise exception 'FALLO: usuario sin perfil insertó';
  exception when insufficient_privilege then null;
  end;
  update public.players set full_name = 'Hackeado';
  begin
    insert into storage.objects (bucket_id, name) values ('player-photos', 'x.jpg');
    raise exception 'FALLO: usuario sin perfil subió foto';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-0000000000ff', 'admin');
    raise exception 'FALLO: usuario se auto-asignó admin';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 2: autenticado sin perfil bloqueado (incluida auto-asignación de rol)';
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.players where full_name = 'Hackeado') then raise exception 'FALLO: update sin perfil tuvo efecto'; end if;
end $$;

-- ===== 3. Cuenta compartida (coach): gestiona datos deportivos =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$
declare cat2 uuid;
begin
  if (select count(*) from public.players) <> 1 then raise exception 'FALLO: coach no ve jugadores'; end if;
  insert into public.categories (name, season) values ('Sub-14', '2026-27') returning id into cat2;
  insert into public.attendance (session_id, player_id, status) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'absent');
  -- Duplicado rechazado por la restricción única.
  begin
    insert into public.attendance (session_id, player_id, status) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'present');
    raise exception 'FALLO: se permitió un duplicado de asistencia';
  exception when unique_violation then null;
  end;
  insert into public.attendance (session_id, player_id, status) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'present')
    on conflict (session_id, player_id) do update set status = excluded.status;
  perform public.change_player_category('22222222-2222-2222-2222-222222222222', cat2, 'Cambio de prueba');
  if (select count(*) from public.player_category_history where reason = 'Cambio de prueba') <> 1 then raise exception 'FALLO: historial de categoría'; end if;
  insert into public.eligibility_exceptions (player_id, week_start, decision, reason) values ('22222222-2222-2222-2222-222222222222', '2026-10-19', 'eligible', 'Prueba');
  insert into public.call_ups (player_id, week_start, status) values ('22222222-2222-2222-2222-222222222222', '2026-10-19', 'called');
  update public.absence_rules set red_from = 4 where category_id is null;
  -- No puede gestionar perfiles, ni leer la bitácora, ni ver tutores.
  update public.profiles set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000c';
  if (select count(*) from public.audit_log) <> 0 then raise exception 'FALLO: coach lee bitácora'; end if;
  if (select count(*) from public.guardians) <> 0 then raise exception 'FALLO: coach ve tutores'; end if;
  delete from public.players;
  insert into storage.objects (bucket_id, name) values ('player-photos', '22222222/foto.jpg');
  raise notice 'OK 3: cuenta compartida opera y no escala privilegios';
end $$;
reset role;
do $$ begin
  if (select role from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c') <> 'coach' then raise exception 'FALLO: coach se elevó a admin'; end if;
  if (select count(*) from public.players) <> 1 then raise exception 'FALLO: coach borró jugadores'; end if;
  if (select status from public.attendance limit 1) <> 'present' then raise exception 'FALLO: upsert de asistencia'; end if;
  if (select count(*) from public.audit_log where table_name = 'attendance') < 2 then raise exception 'FALLO: bitácora no registra'; end if;
end $$;

-- ===== 4. Consulta (viewer): solo lectura =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$
begin
  if (select count(*) from public.players) <> 1 then raise exception 'FALLO: viewer no lee'; end if;
  begin
    insert into public.attendance (session_id, player_id, status) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'sick')
      on conflict (session_id, player_id) do update set status = excluded.status;
    raise exception 'FALLO: viewer escribió asistencia';
  exception when insufficient_privilege then null;
  end;
  update public.players set full_name = 'Cambio viewer';
  raise notice 'OK 4: viewer solo lectura';
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.players where full_name = 'Cambio viewer') then raise exception 'FALLO: viewer modificó jugador'; end if;
end $$;

-- ===== 5. Admin: gestiona perfiles y lee bitácora =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
begin
  if (select count(*) from public.profiles) <> 3 then raise exception 'FALLO: admin no ve perfiles'; end if;
  if (select count(*) from public.audit_log) = 0 then raise exception 'FALLO: admin no lee bitácora'; end if;
  -- Ni el admin ve tutores: el portal de familias no está activado.
  if (select count(*) from public.guardians) <> 0 then raise exception 'FALLO: guardians accesible'; end if;
  raise notice 'OK 5: admin gestiona perfiles; tutores siguen cerrados';
end $$;
reset role;

-- ===== 6. Restricciones de integridad =====
do $$
begin
  begin
    insert into public.absence_rules (category_id, yellow_from, red_from) values (null, 1, 3);
    raise exception 'FALLO: segunda regla global';
  exception when unique_violation then null;
  end;
  begin
    insert into public.absence_rules (category_id, yellow_from, red_from) values ('11111111-1111-1111-1111-111111111111', 3, 2);
    raise exception 'FALLO: umbral rojo <= amarillo';
  exception when check_violation then null;
  end;
  begin
    insert into public.call_ups (player_id, week_start, status) values ('22222222-2222-2222-2222-222222222222', '2026-10-21', 'called');
    raise exception 'FALLO: semana que no empieza en lunes';
  exception when check_violation then null;
  end;
  if (select public from storage.buckets where id = 'player-photos') then raise exception 'FALLO: bucket público'; end if;
  raise notice 'OK 6: restricciones (regla global única, umbrales, lunes, bucket privado)';
end $$;

-- ===== 7. Eliminación definitiva de jugadores =====
insert into public.players (id, full_name, birth_date, category_id, photo_path) values
  ('44444444-4444-4444-4444-444444444444', 'Jugador A Eliminar', '2014-05-05', '11111111-1111-1111-1111-111111111111', '44444444/foto.jpg');
insert into public.attendance (session_id, player_id, status) values ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'absent');
insert into public.eligibility_exceptions (player_id, week_start, decision, reason) values ('44444444-4444-4444-4444-444444444444', '2026-10-19', 'eligible', 'Prueba');
insert into public.call_ups (player_id, week_start, status) values ('44444444-4444-4444-4444-444444444444', '2026-10-19', 'called');

set role anon;
set request.jwt.claim.sub = '';
do $$ begin
  begin
    perform public.delete_player('44444444-4444-4444-4444-444444444444');
    raise exception 'FALLO: anon pudo eliminar';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  begin
    perform public.delete_player('44444444-4444-4444-4444-444444444444');
    raise exception 'FALLO: viewer pudo eliminar';
  exception when insufficient_privilege then null;
  end;
  -- El borrado directo sigue reservado a admin (coach/viewer no borran por la tabla).
  delete from public.players where id = '44444444-4444-4444-4444-444444444444';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$
declare v_photo text;
begin
  delete from public.players where id = '44444444-4444-4444-4444-444444444444';
  if not exists (select 1 from public.players where id = '44444444-4444-4444-4444-444444444444') then
    raise exception 'FALLO: coach borró directamente por la tabla';
  end if;
  v_photo := public.delete_player('44444444-4444-4444-4444-444444444444');
  if v_photo is distinct from '44444444/foto.jpg' then raise exception 'FALLO: no devolvió la foto (%)', v_photo; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.players where id = '44444444-4444-4444-4444-444444444444') then raise exception 'FALLO: el jugador sigue existiendo'; end if;
  if exists (select 1 from public.attendance where player_id = '44444444-4444-4444-4444-444444444444') then raise exception 'FALLO: quedaron asistencias'; end if;
  if exists (select 1 from public.call_ups where player_id = '44444444-4444-4444-4444-444444444444') then raise exception 'FALLO: quedaron convocatorias'; end if;
  if exists (select 1 from public.eligibility_exceptions where player_id = '44444444-4444-4444-4444-444444444444') then raise exception 'FALLO: quedaron excepciones'; end if;
  if (select count(*) from public.audit_log where (record_id = '44444444-4444-4444-4444-444444444444' or new_data::text like '%Jugador A Eliminar%' or old_data::text like '%Jugador A Eliminar%' or new_data ->> 'player_id' = '44444444-4444-4444-4444-444444444444' or old_data ->> 'player_id' = '44444444-4444-4444-4444-444444444444') and action <> 'DELETE_DEFINITIVO') <> 0 then
    raise exception 'FALLO: la bitácora conserva datos del jugador eliminado';
  end if;
  if (select count(*) from public.audit_log where action = 'DELETE_DEFINITIVO' and record_id = '44444444-4444-4444-4444-444444444444' and new_data ? 'folio' and not (new_data ? 'full_name')) <> 1 then
    raise exception 'FALLO: falta el registro mínimo de eliminación';
  end if;
  raise notice 'OK 7: eliminar jugador solo coordinación; borra todo y deja un registro sin datos personales';
end $$;

select 'TODAS LAS PRUEBAS RLS PASARON' as resultado;

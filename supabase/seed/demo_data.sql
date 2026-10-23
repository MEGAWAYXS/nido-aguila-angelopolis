-- =====================================================================
-- DATOS FICTICIOS DE DEMOSTRACIÓN
-- Ningún nombre corresponde a un jugador real. Las categorías se marcan
-- con "[DEMO]" en la descripción; para borrarlo todo: remove_demo_data.sql
-- Las fechas se calculan a partir de hoy (hora de Ciudad de México).
-- Ejecutar una sola vez (SQL Editor de Supabase o psql).
-- =====================================================================
do $$
declare
  hoy date := (now() at time zone 'America/Mexico_City')::date;
  lunes date := hoy - (extract(isodow from hoy)::int - 1);
  yr int := extract(year from hoy)::int;
  temporada text := yr || '–' || (yr + 1);
  cat_names text[] := array['Sub-8', 'Sub-10', 'Sub-12', 'Sub-14', 'Sub-17'];
  cat_ages int[] := array[8, 10, 12, 14, 17];
  cat_coach text[] := array['Entrenador A (demo)', 'Entrenador B (demo)', 'Entrenador C (demo)', 'Entrenador D (demo)', 'Entrenador E (demo)'];
  cat_time time[] := array['16:00', '16:00', '17:30', '17:30', '19:00']::time[];
  first_names text[] := array['Santiago', 'Emiliano', 'Diego', 'Iker', 'Leonardo', 'Mateo', 'Sebastián', 'Gael', 'Rodrigo', 'Andrés',
    'Tomás', 'Bruno', 'Valentina', 'Regina', 'Ximena', 'Daniel', 'Julián', 'Renata', 'Axel', 'Camila', 'Nicolás', 'Sofía', 'Hugo', 'Emilio', 'Lucas'];
  last_names text[] := array['Ruiz', 'Torres', 'Castañeda', 'Mendoza', 'Vega', 'Herrera', 'Lara', 'Navarro', 'Pineda', 'Molina',
    'Aguirre', 'Salas', 'Ríos', 'Fuentes', 'Ortega', 'Cruz', 'Ramos', 'Delgado'];
  positions text[] := array['Portero', 'Defensa central', 'Defensa central', 'Extremo', 'Medio', 'Delantero', 'Medio', 'Extremo', 'Lateral', 'Medio ofensivo'];
  jerseys int[] := array[1, 4, 5, 7, 8, 9, 10, 11, 14, 17];
  cat_id uuid;
  cat_ids uuid[] := '{}';
  p_id uuid;
  s record;
  p record;
  c int;
  i int;
  w int;
  d int;
  n int := 100;
  r double precision;
  st public.attendance_status;
  why text;
  fname text;
  week date;
  faltas int;
begin
  if exists (select 1 from public.categories where description like '[DEMO]%') then
    raise exception 'Los datos de demostración ya están cargados. Ejecuta remove_demo_data.sql antes de volver a cargarlos.';
  end if;
  perform setseed(0.42);

  -- Categorías y jugadores
  for c in 1..5 loop
    insert into public.categories (name, season, description, coach_name)
    values (cat_names[c], temporada, '[DEMO] Datos ficticios de demostración', cat_coach[c])
    returning id into cat_id;
    cat_ids := cat_ids || cat_id;

    for i in 1..10 loop
      n := n + 1;
      if c = 3 then
        -- Sub-12: los mismos nombres que en el diseño.
        fname := (array['Santiago Ruiz Ortega', 'Emiliano Torres Cruz', 'Diego Castañeda Ramos', 'Iker Mendoza Ríos', 'Leonardo Vega Salas',
                        'Mateo Herrera Fuentes', 'Sebastián Lara Delgado', 'Gael Navarro Aguirre', 'Rodrigo Pineda Molina', 'Andrés Molina Vega'])[i];
      elsif c = 5 and i = 3 then
        fname := 'Bruno Salas Herrera';
      else
        fname := first_names[1 + ((c * 7 + i * 3) % array_length(first_names, 1))] || ' '
              || last_names[1 + ((c * 5 + i * 7) % array_length(last_names, 1))] || ' '
              || last_names[1 + ((c * 3 + i * 11) % array_length(last_names, 1))];
      end if;

      insert into public.players (folio, full_name, nickname, jersey_number, birth_date, weight_kg, height_cm, category_id,
                                  position, dominant_foot, nationality, notes, active)
      values (
        'NAA-' || lpad(n::text, 4, '0'),
        fname,
        case when c = 3 and i = 4 then 'Iker' end,
        jerseys[i],
        case when c = 3 and i = 4 then make_date(yr - 12, 3, 14)
             else make_date(yr - cat_ages[c] - (i % 2), 1 + (i * 5 + c) % 12, 1 + (i * 7 + c * 3) % 28) end,
        round((18 + cat_ages[c] * 2.3 + (i % 7))::numeric, 1),
        round((80 + cat_ages[c] * 6 + (i % 9) * 1.5)::numeric, 1),
        cat_id,
        positions[i],
        case when i % 4 = 0 then 'left' else 'right' end,
        'Mexicana',
        case when i = 4 then '[Observaciones del entrenador]' end,
        not (c = 5 and i = 10)
      );
    end loop;
  end loop;

  -- Sesiones: 3 semanas anteriores, la actual y la siguiente.
  -- Lun, mar, jue y vie entrenamiento; sáb partido. El viernes de esta semana se cancela.
  for c in 1..5 loop
    for w in -3..1 loop
      foreach d in array array[0, 1, 3, 4] loop
        insert into public.training_sessions (category_id, date, start_time, end_time, type, location, coach_name, status, notes)
        values (cat_ids[c], lunes + w * 7 + d, cat_time[c], cat_time[c] + interval '90 minutes', 'training', 'Cancha 2', cat_coach[c],
          case when w = 0 and d = 4 then 'cancelled'
               when lunes + w * 7 + d <= hoy then 'done' else 'scheduled' end::public.session_status,
          case when w = 0 and d = 4 then 'Cancelada por lluvia' end);
      end loop;
      insert into public.training_sessions (category_id, date, start_time, type, location, coach_name, status)
      values (cat_ids[c], lunes + w * 7 + 5, '10:00', 'match', 'Campo visitante', cat_coach[c],
        case when lunes + w * 7 + 5 <= hoy then 'done' else 'scheduled' end::public.session_status);
    end loop;
  end loop;

  -- Asistencias de las sesiones ya realizadas (hoy quedan algunas pendientes).
  for s in select ts.id, ts.date, ts.category_id from public.training_sessions ts
           where ts.category_id = any (cat_ids) and ts.status = 'done' loop
    for p in select pl.id from public.players pl where pl.category_id = s.category_id and pl.active loop
      r := random();
      continue when s.date = hoy and r < 0.3;
      continue when s.date < hoy and r < 0.02;
      why := null;
      if r > 0.95 then st := 'absent';
      elsif r > 0.91 then st := 'sick'; why := 'Aviso de la familia';
      elsif r > 0.87 then st := 'justified'; why := 'Compromiso escolar';
      else st := 'present';
      end if;
      insert into public.attendance (session_id, player_id, status, reason) values (s.id, p.id, st, why);
    end loop;
  end loop;

  -- Casos del diseño en la semana actual (Sub-12 y Sub-17).
  for p in select pl.id, pl.full_name from public.players pl
           where pl.category_id = any (cat_ids)
             and pl.full_name in ('Gael Navarro Aguirre', 'Sebastián Lara Delgado', 'Iker Mendoza Ríos', 'Diego Castañeda Ramos', 'Bruno Salas Herrera') loop
    for s in select ts.id, ts.date from public.training_sessions ts
             join public.players pl on pl.category_id = ts.category_id
             where pl.id = p.id and ts.date between lunes and hoy and ts.status = 'done' and ts.type = 'training' order by ts.date loop
      st := 'present'; why := null;
      if p.full_name in ('Gael Navarro Aguirre', 'Sebastián Lara Delgado') then st := 'absent';
      elsif p.full_name = 'Iker Mendoza Ríos' then
        if s.date = lunes then st := 'absent'; elsif s.date = hoy then st := 'sick'; why := 'Fiebre, aviso de la familia'; end if;
      elsif p.full_name = 'Diego Castañeda Ramos' then
        if s.date = lunes then st := 'absent'; elsif s.date = hoy then st := 'justified'; why := 'Examen escolar'; end if;
      elsif p.full_name = 'Bruno Salas Herrera' then
        if s.date in (lunes, lunes + 1) then st := 'absent'; end if;
      end if;
      insert into public.attendance (session_id, player_id, status, reason) values (s.id, p.id, st, why)
      on conflict (session_id, player_id) do update set status = excluded.status, reason = excluded.reason, justification_approved = false;
    end loop;
  end loop;

  -- Excepción autorizada (con historial) para Sebastián Lara esta semana.
  insert into public.eligibility_exceptions (player_id, week_start, decision, reason)
  select id, lunes, 'eligible', 'Lesión acreditada con certificado médico (demo)'
  from public.players where full_name = 'Sebastián Lara Delgado' and category_id = any (cat_ids);

  -- Convocatorias oficiales confirmadas de las semanas anteriores (regla: 3+ faltas = desconvocado).
  for w in -3..-1 loop
    week := lunes + w * 7;
    for p in select pl.id from public.players pl where pl.category_id = any (cat_ids) and pl.active loop
      select count(*) into faltas
      from public.attendance a join public.training_sessions ts on ts.id = a.session_id
      where a.player_id = p.id and ts.date between week and week + 6 and ts.status <> 'cancelled'
        and a.status = 'absent' and not a.justification_approved;
      insert into public.call_ups (player_id, week_start, status, note, confirmed_at)
      values (p.id, week, case when faltas >= 3 then 'not_called' else 'called' end::public.call_up_status,
              case when faltas >= 3 then 'Faltas acumuladas' end, (week + 5)::timestamptz);
    end loop;
  end loop;

  -- Los folios nuevos creados desde la app continúan después de los de la demo.
  perform setval('public.player_folio_seq', greatest(n, (select last_value from public.player_folio_seq)));

  raise notice 'Demo cargada: 5 categorías, 50 jugadores, semana del %', lunes;
end $$;

select c.name as categoria, count(distinct p.id) as jugadores, count(distinct ts.id) as sesiones
from public.categories c
left join public.players p on p.category_id = c.id
left join public.training_sessions ts on ts.category_id = c.id
where c.description like '[DEMO]%'
group by c.name order by c.name;

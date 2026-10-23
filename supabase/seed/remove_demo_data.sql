-- Borra TODOS los datos ficticios de demostración (categorías marcadas con "[DEMO]")
-- y lo que depende de ellas: jugadores, sesiones, asistencias, excepciones,
-- convocatorias, historial de categoría y sus fotos registradas. No toca datos reales.
begin;

create temporary table demo_cats on commit drop as
  select id from public.categories where description like '[DEMO]%';
create temporary table demo_players on commit drop as
  select id from public.players where category_id in (select id from demo_cats);

-- Jugadores (en cascada: asistencias, excepciones, convocatorias e historial).
delete from public.players where id in (select id from demo_players);
delete from public.training_sessions where category_id in (select id from demo_cats);
delete from public.categories where id in (select id from demo_cats);
-- La bitácora conserva copias: también se limpian.
delete from public.audit_log
where record_id in (select id::text from demo_players union all select id::text from demo_cats)
   or new_data ->> 'player_id' in (select id::text from demo_players)
   or old_data ->> 'player_id' in (select id::text from demo_players)
   or new_data ->> 'category_id' in (select id::text from demo_cats)
   or old_data ->> 'category_id' in (select id::text from demo_cats);

commit;

select count(*) as categorias_demo_restantes from public.categories where description like '[DEMO]%';

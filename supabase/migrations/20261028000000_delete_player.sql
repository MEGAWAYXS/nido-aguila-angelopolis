-- Eliminación definitiva de un jugador desde la app.
-- La política de borrado directo de players sigue siendo solo para admin; esta
-- función permite a coordinación (admin y coach) eliminar un jugador completo:
--   * borra el jugador y, en cascada, asistencias, excepciones, convocatorias e historial;
--   * borra de la bitácora las copias de sus datos y deja un único registro sin datos
--     personales (solo el folio) de que se eliminó;
--   * devuelve la ruta de su foto para que la app la borre del almacenamiento.
create or replace function public.delete_player(p_player uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_photo text;
  v_folio text;
begin
  if not public.can_manage() then
    raise exception 'No tienes permiso para eliminar jugadores' using errcode = '42501';
  end if;
  select photo_path, folio into v_photo, v_folio from public.players where id = p_player;
  if not found then
    raise exception 'Jugador no encontrado' using errcode = 'P0002';
  end if;
  delete from public.players where id = p_player;
  delete from public.audit_log
  where record_id = p_player::text
     or new_data ->> 'player_id' = p_player::text
     or old_data ->> 'player_id' = p_player::text;
  insert into public.audit_log (table_name, record_id, action, new_data)
  values ('players', p_player::text, 'DELETE_DEFINITIVO', jsonb_build_object('folio', v_folio));
  return v_photo;
end $$;

revoke execute on function public.delete_player(uuid) from public, anon;
grant execute on function public.delete_player(uuid) to authenticated;

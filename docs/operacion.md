# Operación: privacidad, respaldo, recuperación y eliminación

## Datos que se guardan (mínimos)

Por jugador: folio, nombre, nombre deportivo opcional, camiseta, fecha de nacimiento, peso, estatura, categoría, posición, pie dominante, nacionalidad opcional, fotografía, observaciones deportivas y estado. **No** se guardan domicilio, CURP, datos médicos detallados ni datos de contacto de familias. Los motivos de ausencia deben ser breves (por ejemplo "enfermedad"), sin diagnósticos.

- Las fotografías están en el bucket privado `player-photos`. Se muestran con URLs firmadas que caducan en 1 hora. Al subir una foto nueva se borra la anterior.
- **Nunca** subas al repositorio respaldos, exportaciones CSV ni fotos reales. `.gitignore` ya excluye `*.csv`, `*.dump` y `backups/`.
- En pruebas usa siempre datos ficticios (modo demostración o un proyecto Supabase separado).

## Respaldo (semanal mientras se use el plan gratuito)

El plan gratuito de Supabase **no incluye respaldos automáticos**. Desde un equipo de confianza:

1. Base de datos (Settings › Database › Connection string, modo *Session*):
   ```bash
   pg_dump "postgresql://postgres.PROYECTO:CONTRASEÑA@HOST:5432/postgres" --schema=public --format=custom --file=backups/nido-AAAA-MM-DD.dump
   ```
2. Fotografías: descárgalas desde Storage › player-photos, o con la CLI de Supabase (`supabase storage cp -r ss:///player-photos backups/fotos-AAAA-MM-DD --experimental`).
3. Guarda la carpeta `backups/` cifrada (por ejemplo, una unidad cifrada con acceso restringido). Conserva las últimas 8 semanas y borra las más antiguas.

Con el plan Pro hay respaldos diarios automáticos (7 días). Aun así, conviene un respaldo mensual propio.

## Recuperación

1. Crea un proyecto nuevo (o usa el existente si solo hubo pérdida de datos).
2. Si es un proyecto nuevo, ejecuta la migración de `supabase/migrations/`.
3. Restaura los datos:
   ```bash
   pg_restore --data-only --disable-triggers --dbname "CADENA-DE-CONEXIÓN" backups/nido-AAAA-MM-DD.dump
   ```
4. Vuelve a subir las fotos al bucket `player-photos` con las mismas rutas.
5. Recrea los usuarios en Authentication y sus filas en `profiles`; los `user_id` cambian en un proyecto nuevo.
6. Actualiza las variables `VITE_SUPABASE_*` en GitHub si cambió el proyecto y vuelve a ejecutar el workflow.

## Eliminación de información

- **Baja deportiva:** archiva al jugador (estado inactivo). Conserva su historial de asistencias.
- **Eliminación definitiva** (por ejemplo, a petición de la familia). La hace un administrador en el SQL Editor:
  ```sql
  -- 1. Borrar fotos del jugador desde Storage › player-photos › <id-del-jugador>/
  -- 2. Borrar el registro; asistencias, excepciones, convocatorias e historial se eliminan en cascada.
  delete from public.players where id = 'ID-DEL-JUGADOR';
  -- 3. La bitácora conserva copias de los datos: elimínalas también.
  delete from public.audit_log where record_id = 'ID-DEL-JUGADOR' or new_data->>'player_id' = 'ID-DEL-JUGADOR' or old_data->>'player_id' = 'ID-DEL-JUGADOR';
  ```
  Los respaldos anteriores aún contendrán esos datos hasta que caduquen (máximo 8 semanas con la política anterior).
- **Fin de temporada:** archiva las categorías. Revisa una vez al año si conviene eliminar jugadores que dejaron la academia hace más de N años (definir N con la dirección).

## Cuenta compartida

- Cambia la contraseña cuando salga alguien del personal (Authentication › Users › usuario › *Reset password*, o desde el panel).
- Para cortar el acceso de inmediato: `update public.profiles set active = false where user_id = '...'`. Las políticas dejan de dar acceso aunque la sesión siga abierta.
- La bitácora `audit_log` registra qué cambió y cuándo, pero con una cuenta compartida no indica **quién**.

## Antes de cargar datos reales

- [ ] Migración aplicada y `npm run check:rls` sin fallos.
- [ ] Registro de nuevos usuarios desactivado.
- [ ] Cuenta compartida con perfil `coach` y una cuenta `admin` personal.
- [ ] Probado desde dos dispositivos: un cambio en uno aparece en el otro al recargar.
- [ ] Primer respaldo manual realizado.
- [ ] Aviso de privacidad para las familias, según la normativa aplicable (en México, LFPDPPP, con atención especial a datos de menores).

-- La fecha de nacimiento pasa a ser opcional para poder importar bases de
-- jugadores incompletas desde Excel. La validación de rango se mantiene
-- (un valor nulo la cumple).
alter table public.players alter column birth_date drop not null;

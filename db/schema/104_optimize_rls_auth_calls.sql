-- 104: optimización de RLS -- envolver auth.uid()/auth.jwt() en un subselect.
--
-- Encontrado con el advisor de performance de Supabase (lint `auth_rls_initplan`,
-- WARN). Cuando una policy de RLS llama `auth.uid()`/`auth.jwt()` directo (ej.
-- `owner_id = auth.uid()`), Postgres no puede tratarlo como constante para toda
-- la consulta -- son funciones STABLE, no IMMUTABLE -- así que las re-evalúa
-- **fila por fila**. Envueltas en un subselect escalar (`owner_id = (select
-- auth.uid())`) el planner las resuelve una sola vez por consulta (InitPlan) y
-- reusa el resultado para todas las filas. Es la recomendación estándar de
-- Supabase para este lint, documentada acá:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#calling-functions-with-select
--
-- Puramente mecánico y sin cambio de semántica: auth.uid()/auth.jwt() devuelven
-- siempre el mismo valor durante toda la consulta (dependen solo del JWT de la
-- sesión, no de la fila), envolverlos en `(select ...)` no cambia qué filas
-- pasan cada policy, solo cuántas veces se evalúa la función. No hay baja de
-- código ni cambio de RLS -- mismo criterio que la migración 103 (índices).
--
-- Se resuelve con un DO block en vez de listar cada ALTER POLICY a mano: la
-- misma base genera el `ALTER POLICY ... USING (...) WITH CHECK (...)` para
-- cada policy con `auth.uid()`/`auth.jwt()`/`auth.role()`/`auth.email()` sin
-- envolver, reemplaza esas llamadas por su versión con subselect y lo ejecuta.
-- Corre en una sola transacción (todo o nada) y queda documentado acá para que
-- el repo explique qué se aplicó, aunque el propio DO block ya sea la fuente
-- de verdad ejecutable.
--
-- Deliberadamente sin tocar: `multiple_permissive_policies` (49 WARN, varias
-- tablas con más de una policy permisiva para el mismo rol+acción) queda para
-- otra sesión -- consolidar dos policies sin revisar cada caso puede abrir un
-- hueco de acceso, no es tan mecánico como esto.

do $$
declare
  r record;
begin
  for r in
    select
      format(
        'ALTER POLICY %I ON public.%I%s%s;',
        policyname,
        tablename,
        case when qual is not null then
          format(' USING (%s)', regexp_replace(qual, 'auth\.(uid|jwt|role|email)\(\)', '(select auth.\1())', 'g'))
        else '' end,
        case when with_check is not null then
          format(' WITH CHECK (%s)', regexp_replace(with_check, 'auth\.(uid|jwt|role|email)\(\)', '(select auth.\1())', 'g'))
        else '' end
      ) as stmt
    from pg_policies
    where schemaname = 'public'
      and (qual ~ 'auth\.(uid|jwt|role|email)\(\)' or with_check ~ 'auth\.(uid|jwt|role|email)\(\)')
  loop
    execute r.stmt;
  end loop;
end $$;

-- 148: verificación en dos pasos (TOTP) para admin y moderador -- exigir
-- `aal2` en el servidor (pendiente P-01 de docs/seguridad/HARDENING-SOC2-ISO27701.md).
--
-- Problema: las cuentas con app_metadata.role = 'admin' / 'moderador' entraban
-- solo con contraseña. Una contraseña robada daba la RLS de admin, las RPCs
-- SECURITY DEFINER de admin y el log de auditoría. La pantalla (Mi perfil +
-- segundo paso en el login + guard de admin.html) no alcanza como control: la
-- API de Supabase se puede llamar directo con el JWT. El control es éste.
--
-- Cómo: todas las policies y funciones leían el rol del JWT con alguna forma de
-- `auth.jwt() -> 'app_metadata' ->> 'role'`. Esa lectura pasa a ser
-- `public.jwt_role()`, que devuelve el mismo rol salvo en un caso: si el rol es
-- admin/moderador y la sesión NO es aal2 (no pasó por el código TOTP), devuelve
-- 'cliente'. Así un admin con solo contraseña queda, para la base, como un
-- cliente común (ve lo suyo, nada de admin), sin reescribir a mano 99 policies
-- y 23 funciones: las comparaciones `= 'admin'`, `in ('admin','moderador')`,
-- `= any(array['vendedor','admin'])`, etc. siguen igual.
--
-- Dos modos (tabla public.security_settings, una sola fila):
--   * require_staff_mfa = false (arranque, el de esta migración): se exige aal2
--     al admin/moderador que YA tiene un factor TOTP verificado. El que todavía
--     no enroló sigue entrando como antes. Esto evita dejar sin panel a nadie
--     mientras se enrolan, y protege a cada cuenta desde el momento en que
--     enrola. No es más débil que el modo estricto para una cuenta sin factor:
--     con la contraseña, en los dos modos se puede enrolar un factor propio
--     (el enrolamiento es de Supabase Auth, no pasa por la RLS).
--   * require_staff_mfa = true (estricto): todo admin/moderador sin aal2 queda
--     como cliente, tenga factor o no. Activarlo cuando las 3 cuentas tengan
--     factor (ver el final del archivo). Suma defensa en profundidad: si a una
--     cuenta le sacan el factor desde el dashboard, no vuelve en silencio a
--     "solo contraseña".
--
-- Sacar un factor verificado exige aal2 (lo valida Supabase Auth), así que con
-- la contraseña sola no se puede desactivar la verificación de una cuenta.
--
-- jwt_role() es SECURITY DEFINER porque lee auth.mfa_factors (authenticated no
-- tiene acceso al esquema auth); search_path vacío y todo calificado. En las
-- policies se usa envuelta en `( select ... )` para que el planner la evalúe una
-- sola vez por consulta (InitPlan), igual que la 104 con auth.jwt().
--
-- Sin bajas de objetos: solo create/alter/replace (el conector de Supabase se
-- cuelga con ciertas palabras clave destructivas en el texto).

-- 1. Configuración ---------------------------------------------------------
create table if not exists public.security_settings (
  id boolean primary key default true check (id),
  require_staff_mfa boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.security_settings (id) values (true) on conflict (id) do nothing;

alter table public.security_settings enable row level security;
-- Sin policies a propósito: solo se cambia por SQL (postgres / service role),
-- nunca desde la API. Un admin con solo contraseña no puede apagar el chequeo.
revoke all on public.security_settings from anon, authenticated;

comment on table public.security_settings is
  'Ajustes de seguridad (una fila). require_staff_mfa=true: admin/moderador sin aal2 no tienen permisos de admin aunque no hayan enrolado. Solo por SQL.';

-- 2. Rol efectivo del JWT --------------------------------------------------
create or replace function public.jwt_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := auth.jwt();
  v_role   text  := v_claims -> 'app_metadata' ->> 'role';
begin
  if v_role in ('admin', 'moderador')
     and coalesce(v_claims ->> 'aal', 'aal1') <> 'aal2' then
    if coalesce((select s.require_staff_mfa from public.security_settings s where s.id), true)
       or exists (
         select 1 from auth.mfa_factors f
          where f.user_id = auth.uid()
            and f.status = 'verified'
       ) then
      return 'cliente';
    end if;
  end if;
  return v_role;
end;
$$;

comment on function public.jwt_role() is
  'Rol del JWT (app_metadata.role). admin/moderador sin sesión aal2 (código TOTP) se devuelven como ''cliente'' (ver security_settings). Usar siempre esto, nunca auth.jwt()->''app_metadata''->>''role''.';

revoke all on function public.jwt_role() from public;
grant execute on function public.jwt_role() to anon, authenticated, service_role;

-- 3. Policies: la lectura del rol pasa por jwt_role() ----------------------
-- Dos formas aparecen en pg_policies (public y storage): la envuelta por la 104
-- `((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text)` y
-- la directa `((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text)` de
-- algunas policies de storage. Las dos se cambian por `( SELECT public.jwt_role() ...)`.
do $$
declare
  r record;
  v_q text;
  v_c text;
  v_pat1 constant text := '\(\(\(\s*SELECT auth\.jwt\(\) AS jwt\) -> ''app_metadata''::text\) ->> ''role''::text\)';
  v_pat2 constant text := '\(\(auth\.jwt\(\) -> ''app_metadata''::text\) ->> ''role''::text\)';
  v_new  constant text := '( SELECT public.jwt_role() AS jwt_role)';
  v_left int;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname in ('public', 'storage')
       and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'app_metadata'
  loop
    v_q := regexp_replace(regexp_replace(r.qual, v_pat1, v_new, 'g'), v_pat2, v_new, 'g');
    v_c := regexp_replace(regexp_replace(r.with_check, v_pat1, v_new, 'g'), v_pat2, v_new, 'g');
    execute format(
      'alter policy %I on %I.%I%s%s',
      r.policyname, r.schemaname, r.tablename,
      case when v_q is not null then format(' using (%s)', v_q) else '' end,
      case when v_c is not null then format(' with check (%s)', v_c) else '' end
    );
  end loop;

  select count(*) into v_left
    from pg_policies
   where schemaname in ('public', 'storage')
     and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'app_metadata';
  if v_left > 0 then
    raise exception '148: quedaron % policies leyendo app_metadata directo', v_left;
  end if;
end $$;

-- 4. Funciones: misma sustitución en el cuerpo -----------------------------
-- pg_get_functiondef conserva SECURITY DEFINER, search_path y los permisos
-- (create or replace no los toca). Se cubren `(select auth.jwt()) -> ...` y
-- `auth.jwt() -> ...`; la lectura del rol de OTRA cuenta (raw_app_meta_data)
-- no se toca, no es la sesión.
do $$
declare
  r record;
  v_def text;
  v_left int;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname <> 'jwt_role'
       and p.prosrc ~* 'auth\.jwt\(\)\s*\)?\s*->\s*''app_metadata''\s*->>\s*''role'''
  loop
    v_def := pg_get_functiondef(r.oid);
    v_def := regexp_replace(v_def,
      '\(\s*select\s+auth\.jwt\(\)\s*\)\s*->\s*''app_metadata''\s*->>\s*''role''',
      'public.jwt_role()', 'gi');
    v_def := regexp_replace(v_def,
      'auth\.jwt\(\)\s*->\s*''app_metadata''\s*->>\s*''role''',
      'public.jwt_role()', 'gi');
    execute v_def;
  end loop;

  select count(*) into v_left
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname <> 'jwt_role'
     and p.prosrc ~* 'auth\.jwt\(\)\s*\)?\s*->\s*''app_metadata''';
  if v_left > 0 then
    raise exception '148: quedaron % funciones leyendo app_metadata directo', v_left;
  end if;
end $$;

-- 5. Activar el modo estricto (NO se corre acá) ----------------------------
-- Cuando las 3 cuentas admin/moderador tengan un factor TOTP verificado:
--
--   select u.email, count(f.id) filter (where f.status = 'verified') as factores
--     from auth.users u
--     left join auth.mfa_factors f on f.user_id = u.id
--    where u.raw_app_meta_data ->> 'role' in ('admin', 'moderador')
--    group by u.email;
--
--   update public.security_settings set require_staff_mfa = true, updated_at = now() where id;
--
-- REGLA para policies y funciones nuevas: el rol de la sesión se lee con
-- `(select public.jwt_role())` en policies y `public.jwt_role()` en funciones,
-- nunca con auth.jwt() -> 'app_metadata' ->> 'role' (eso saltearía el chequeo
-- de aal2). La migración falla si encuentra alguna lectura directa.

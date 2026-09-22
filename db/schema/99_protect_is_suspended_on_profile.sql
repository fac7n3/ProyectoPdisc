-- Auditoría de seguridad de "Mi perfil" (2026-09-22), cuarto sector al azar:
-- `profiles_update_own` (with check: auth.uid() = id, sin restricción de
-- columna) deja que cualquier cuenta actualice cualquier columna de su
-- propia fila en `profiles`. La columna `role` ya está protegida por el
-- trigger `prevent_role_update_on_profile` (24_fix_role_approval_trigger_block.sql)
-- -- pero `is_suspended` (34_admin_moderation.sql, "suspender repartidor"),
-- que usa la misma tabla, no tenía ninguna protección: un usuario podía
-- mandar directo
--   supabase.from('profiles').update({ is_suspended: false }).eq('id', auth.uid())
-- y des-suspenderse a sí mismo, sin pasar por `admin_set_repartidor_suspended`
-- (el único camino pensado para tocar esa columna). No es hipotético: se
-- confirmó contra la base real que `claim_delivery`/`update_delivery_status`
-- (`34_admin_moderation.sql`/`38_notifications.sql`) siguen con EXECUTE
-- otorgado a `authenticated` -- son las únicas RPCs que de verdad usan
-- `is_suspended` como gate, y siguen vivas aunque el frontend de repartidor
-- se haya sacado (ver "Pendientes activos" de CLAUDE.md, 2026-09-16): sin
-- este fix, la suspensión de un repartidor era una defensa de cartón.
--
-- Fix: mismo patrón que ya usa el proyecto para `role` -- el trigger ahora
-- también corta cualquier cambio directo de `is_suspended`, salvo que la
-- transacción haya seteado la bandera `app.role_change_authorized` (mismo
-- flag que ya usan approve_seller_request/approve_delivery_request). Y
-- `admin_set_repartidor_suspended` pasa a setear esa bandera antes de tocar
-- la columna -- si no, su propio UPDATE (que sí corre con los privilegios
-- del admin real, vía el chequeo de rol de la función) quedaría bloqueado
-- por el mismo trigger que ahora lo protege.

create or replace function public.prevent_role_update_on_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.role is distinct from new.role or old.is_suspended is distinct from new.is_suspended)
     and coalesce(current_setting('app.role_change_authorized', true), '') != 'true' then
    raise exception 'No está permitido modificar el rol ni la suspensión del usuario directamente por seguridad.';
  end if;

  return new;
end;
$$;

create or replace function public.admin_set_repartidor_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede suspender repartidores.';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id and role = 'repartidor') then
    raise exception 'El usuario no es un repartidor.';
  end if;

  perform set_config('app.role_change_authorized', 'true', true);
  update public.profiles
  set is_suspended = p_suspended
  where id = p_user_id;
end;
$$;

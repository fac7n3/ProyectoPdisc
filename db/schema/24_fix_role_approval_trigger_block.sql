-- CRÍTICO (A113-239) — prevent_role_update_on_profile bloqueaba también las
-- aprobaciones legítimas del admin, no solo los intentos de un cliente de
-- cambiarse el rol a sí mismo.
--
-- El trigger chequeaba `auth.role() IN ('authenticated', 'anon')` — esa
-- función lee `request.jwt.claim.role` (GUC de sesión que setea PostgREST
-- según el JWT), que vale 'authenticated' para CUALQUIER llamada de un
-- usuario logueado, incluida una a un RPC `SECURITY DEFINER` como
-- `approve_seller_request` (SECURITY DEFINER cambia el rol de Postgres
-- efectivo para permisos, pero no esa GUC de sesión). Resultado: ese RPC
-- nunca pudo actualizar `profiles.role` — confirmado contra la base real
-- (`BEGIN;...ROLLBACK;`) intentando aprobar la única solicitud pendiente
-- real ("Test Bakery"): fallaba con la misma excepción que se supone
-- protege de un cliente auto-modificándose.
--
-- Fix: en vez de mirar la GUC de sesión (no distingue quién ejecuta el
-- UPDATE), el trigger chequea una bandera de transacción explícita
-- (`app.role_change_authorized`) que las funciones de aprobación setean
-- justo antes de tocar `profiles.role` con `set_config(..., true)` — el
-- `true` final es `is_local`, así que se resetea sola al terminar la
-- transacción/llamada, no puede "quedar prendida" para otra request. Un
-- cliente normal no tiene forma de setear esa GUC (no hay ningún RPC de
-- `set_config` expuesto), así que la protección contra que se cambie el
-- rol directo sigue intacta.

create or replace function public.prevent_role_update_on_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.role is distinct from new.role then
    if coalesce(current_setting('app.role_change_authorized', true), '') != 'true' then
      raise exception 'No está permitido modificar el rol del usuario directamente por seguridad.';
    end if;
  end if;

  return new;
end;
$$;

-- Re-crear approve_seller_request con la bandera seteada antes del update.
create or replace function public.approve_seller_request(req_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_store_id uuid;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede aprobar solicitudes de vendedor.';
  end if;

  select * into v_req
  from public.seller_requests
  where id = req_id and status = 'pending';

  if not found then
    raise exception 'Request not found or not pending';
  end if;

  insert into public.stores (owner_id, cuit, name, address, phone, status)
  values (v_req.user_id, v_req.cuit, v_req.shop_name, v_req.address, v_req.phone, 'approved')
  returning id into v_store_id;

  update public.seller_requests
  set status = 'approved', updated_at = now()
  where id = req_id;

  perform set_config('app.role_change_authorized', 'true', true);
  update public.profiles
  set role = 'vendedor'
  where id = v_req.user_id;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', 'vendedor')
  where id = v_req.user_id;
end;
$$;

revoke execute on function public.approve_seller_request(uuid) from public;
revoke execute on function public.approve_seller_request(uuid) from anon;
grant execute on function public.approve_seller_request(uuid) to authenticated;

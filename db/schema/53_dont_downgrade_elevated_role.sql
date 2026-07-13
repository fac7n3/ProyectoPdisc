-- Bug crítico encontrado en producción (2026-07-13): aprobar una solicitud de
-- vendedor/repartidor para una cuenta que YA es admin/moderador (app_metadata.role
-- en el JWT) la degradaba silenciosamente. Pasó de verdad: la cuenta de admin
-- del usuario se registró como vendedor para probar el flujo de vender.js, se
-- aprobó la solicitud, y approve_seller_request pisó raw_app_meta_data.role de
-- 'admin' a 'vendedor' sin ningún chequeo -- el selector "Cambiar de rol" de
-- perfil.html (F12-17) dejó de aparecer porque el JWT ya no tenía 'admin'.
--
-- Causa raíz: approve_seller_request (migración 24) y approve_delivery_request
-- (migración 25) hacen
--   raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || jsonb_build_object('role', 'vendedor'/'repartidor')
-- sin mirar qué rol tenía la cuenta antes -- un simple `||` de jsonb sobrescribe
-- la clave 'role' sea cual sea su valor anterior, incluido 'admin'/'moderador'.
--
-- Fix: agregar una condición al WHERE de ese UPDATE puntual (no toca el resto
-- de la función) -- si `raw_app_meta_data ->> 'role'` ya es 'admin' o
-- 'moderador', el UPDATE simplemente no afecta esa fila y el rol elevado queda
-- intacto. profiles.role SÍ se sigue actualizando siempre a 'vendedor'/
-- 'repartidor' (eso es un hecho real -- la cuenta ahora también tiene una
-- tienda/hace envíos), solo se protege específicamente el campo que la RLS y
-- el gate de admin.html usan de verdad (F12-17).
--
-- Verificado con BEGIN;...ROLLBACK; (2 casos cada función): cuenta admin
-- aprobada como vendedor/repartidor -> JWT sigue 'admin', profiles.role pasa a
-- 'vendedor'/'repartidor', la tienda/solicitud se aprueba normal; cuenta común
-- (sin rol elevado) aprobada -> JWT y profiles.role pasan a 'vendedor' los dos,
-- sin cambios de comportamiento (no hay regresión).

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
  where id = v_req.user_id
    and coalesce(raw_app_meta_data ->> 'role', 'cliente') not in ('admin', 'moderador');
end;
$$;

create or replace function public.approve_delivery_request(req_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede aprobar solicitudes de repartidor.';
  end if;

  select * into v_req
  from public.delivery_requests
  where id = req_id and status = 'pending';

  if not found then
    raise exception 'Solicitud no encontrada o ya no está pendiente.';
  end if;

  update public.delivery_requests
  set status = 'approved', updated_at = now()
  where id = req_id;

  perform set_config('app.role_change_authorized', 'true', true);
  update public.profiles
  set role = 'repartidor'
  where id = v_req.user_id;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', 'repartidor')
  where id = v_req.user_id
    and coalesce(raw_app_meta_data ->> 'role', 'cliente') not in ('admin', 'moderador');
end;
$$;

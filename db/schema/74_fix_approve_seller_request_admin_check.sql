-- Parche de seguridad: approve_seller_request() no verificaba el rol del
-- que llama. Es SECURITY DEFINER (corre con privilegios elevados) y crea una
-- tienda 'approved' + sube el rol del usuario a 'vendedor' -- cualquier
-- usuario autenticado podía invocar el RPC directamente
-- (`supabase.rpc('approve_seller_request', { req_id })`) con el id de
-- CUALQUIER solicitud pendiente y auto-aprobarse como vendedor, saltando por
-- completo la "aprobación manual del admin" que es una decisión de producto
-- ya definida (ver CLAUDE.md, sección "Decisiones de producto"). El resto de
-- las funciones RPC admin_* sí tenían este chequeo (admin_set_product_active,
-- admin_set_repartidor_suspended, approve_delivery_request) -- a esta se le
-- pasó por alto desde que se creó y ninguna migración posterior (60, 71) lo
-- notó porque solo tocaban otras columnas de la misma función.
--
-- Detectado con el advisor de seguridad de Supabase (categoría
-- authenticated_security_definer_function_executable) al auditar todas las
-- funciones SECURITY DEFINER expuestas por RPC.

create or replace function public.approve_seller_request(req_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req record;
  v_store_id uuid;
  v_category_slug text;
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

  v_category_slug := coalesce(v_req.category_slugs[1], v_req.category_slug);

  insert into public.stores (owner_id, cuit, name, address, phone, status, category_slug)
  values (v_req.user_id, v_req.cuit, v_req.shop_name, v_req.address, v_req.phone, 'approved', v_category_slug)
  returning id into v_store_id;

  update public.seller_requests
  set status = 'approved', updated_at = now()
  where id = req_id;

  update public.profiles
  set role = 'vendedor'
  where id = v_req.user_id;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', 'vendedor')
  where id = v_req.user_id;

end;
$function$;

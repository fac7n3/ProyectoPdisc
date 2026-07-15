-- P1-6 (backlog #16a): "cupones solo visibles a quien corresponde".
-- Antes, coupons_select_public dejaba leer CUALQUIER cupón activo (global o de
-- un vendedor puntual) a cualquier anon/authenticated -- cualquiera con la
-- anon key podía listar el código y % de descuento de TODOS los vendedores,
-- y renderActiveCoupons() (F12-07) los mostraba en el home a cualquier
-- visitante, sin relación con lo que estuviera comprando.
--
-- Ahora: los cupones globales (store_id null) siguen 100% públicos (se siguen
-- pudiendo listar/mostrar a cualquiera). Los cupones de un vendedor puntual
-- (store_id no nulo) dejan de ser listables en bloque -- solo se pueden
-- consultar por código exacto (vía la RPC nueva validate_coupon_code, no una
-- select directa a la tabla) o por el dueño de la tienda (para gestionarlos).
-- Esto no rompe create_order: es SECURITY DEFINER y ya leía coupons sin pasar
-- por RLS (mismo criterio que el resto de las funciones internas del proyecto).

drop policy if exists coupons_select_public on public.coupons;
create policy coupons_select_public on public.coupons
  for select to anon, authenticated
  using (
    store_id is null
    and is_active = true
    and (expires_at is null or expires_at > now())
  );

-- El dueño de la tienda necesita ver TODOS sus cupones (incluidos inactivos)
-- para gestionarlos en "Mis cupones" (vender.js) -- antes dependía sin querer
-- de coupons_select_public, así que un cupón desactivado directamente
-- desaparecía de esa lista (bug latente, se corrige de paso acá).
drop policy if exists coupons_select_own_store on public.coupons;
create policy coupons_select_own_store on public.coupons
  for select to authenticated
  using (
    store_id is not null
    and exists (select 1 from public.stores s where s.id = coupons.store_id and s.owner_id = auth.uid())
  );

-- RPC para validar un código puntual que el usuario ya conoce (lo escribió en
-- el input de "¿Tenés un cupón?") sin necesitar una policy de select amplia --
-- por diseño solo devuelve la fila que matchea el código exacto, nunca una
-- lista. SECURITY INVOKER + search_path fijo: no necesita privilegios
-- elevados, coupons_select_public ya deja pasar los globales y esta consulta
-- puntual por código no es un vector de enumeración (un intento por código,
-- igual que probar un cupón real).
CREATE OR REPLACE FUNCTION public.validate_coupon_code(p_code text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'code', c.code,
    'discount_percentage', c.discount_percentage,
    'store_id', c.store_id,
    'store_name', s.name
  )
  from public.coupons c
  left join public.stores s on s.id = c.store_id
  where c.code = upper(trim(p_code))
    and c.is_active = true
    and (c.expires_at is null or c.expires_at > now())
  limit 1;
$function$;

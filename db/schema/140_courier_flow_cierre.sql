-- Segunda mitad de la 139 (2026-10-22). Se aplica DESPUÉS de publicar el
-- frontend nuevo del panel de repartidor: con el viejo todavía en producción,
-- rompería "Marcar en camino" (que no mandaba foto).
--
-- A partir de acá, "en camino" solo se marca con courier_mark_picked_up (foto +
-- confirmación del comercio con los 4 dígitos del número de pedido).
-- update_delivery_status queda solo para "entregado".

create or replace function public.update_delivery_status(p_delivery_id uuid, p_new_status text, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_delivery record;
  v_order_status text;
  v_code text;
begin
  if p_new_status = 'picked_up' then
    raise exception 'Para salir en camino usá "Retiré el pedido": el comercio confirma el retiro y se saca la foto de los productos.';
  end if;
  if p_new_status <> 'delivered' then
    raise exception 'Estado inválido.';
  end if;

  if (select is_suspended from public.profiles where id = v_uid) then
    raise exception 'Tu cuenta de repartidor está suspendida.';
  end if;

  select id, order_id, repartidor_id, status into v_delivery
  from public.deliveries where id = p_delivery_id for update;

  if not found then
    raise exception 'La entrega no existe.';
  end if;

  if v_delivery.repartidor_id != v_uid then
    raise exception 'No sos el repartidor asignado a esta entrega.';
  end if;

  select status into v_order_status from public.orders where id = v_delivery.order_id;

  if v_delivery.status = 'cancelled' or v_order_status = 'cancelled' then
    raise exception 'Este pedido fue cancelado. No lo retires ni lo marques en camino.';
  end if;

  if v_delivery.status != 'picked_up' then
    raise exception 'Solo se puede marcar "entregado" desde "en camino".';
  end if;

  select code into v_code from public.order_pickup_codes where order_id = v_delivery.order_id;
  if v_code is not null and v_code is distinct from trim(coalesce(p_code, '')) then
    raise exception 'El código no coincide. Pedíselo al comprador.';
  end if;

  update public.deliveries
     set status = 'delivered', delivered_at = now(), problem_at = null
   where id = p_delivery_id;

  update public.orders set status = 'completed' where id = v_delivery.order_id;

  return jsonb_build_object('delivery_id', p_delivery_id, 'status', 'delivered');
end;
$$;

revoke all on function public.update_delivery_status(uuid, text, text) from public, anon;
grant execute on function public.update_delivery_status(uuid, text, text) to authenticated;

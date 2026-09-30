-- 2026-09-30: segunda mitad de la 115. Se aplica DESPUÉS de publicar el
-- frontend nuevo: con el viejo todavía en producción, rompería los botones
-- "Listo para retirar" / "Marcar entregado" / "Cancelar" (que hacían un
-- UPDATE directo) y el "Marcar entregado" del repartidor (que no mandaba código).
--
-- 1. Nadie cambia orders.status a mano por la API: todo pasa por
--    advance_order_status / cancel_order / accept_order_revocation (que
--    validan quién puede, desde qué estado, y piden el código de retiro).
--    Hasta ahora el dueño o un empleado podía poner cualquier estado
--    (ej. "completed" a un pedido sin pagar) con un update directo; el
--    privilegio de columna era el único grant de UPDATE sobre orders.
--    Los RPC son SECURITY DEFINER (dueño postgres): no necesitan el grant.
revoke update (status) on public.orders from authenticated;

-- 2. El repartidor entrega solo con el código de retiro del comprador.
create or replace function public.update_delivery_status(p_delivery_id uuid, p_new_status text, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_delivery record;
  v_code text;
begin
  if p_new_status not in ('picked_up', 'delivered') then
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

  if p_new_status = 'picked_up' and v_delivery.status != 'assigned' then
    raise exception 'Solo se puede marcar "en camino" desde "asignado".';
  end if;

  if p_new_status = 'delivered' and v_delivery.status != 'picked_up' then
    raise exception 'Solo se puede marcar "entregado" desde "en camino".';
  end if;

  if p_new_status = 'delivered' then
    select code into v_code from public.order_pickup_codes where order_id = v_delivery.order_id;
    if v_code is not null and v_code is distinct from trim(coalesce(p_code, '')) then
      raise exception 'El código no coincide. Pedíselo al comprador.';
    end if;
  end if;

  update public.deliveries
     set status = p_new_status,
         delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end
   where id = p_delivery_id;

  update public.orders
     set status = case p_new_status when 'picked_up' then 'shipped' else 'completed' end
   where id = v_delivery.order_id;

  return jsonb_build_object('delivery_id', p_delivery_id, 'status', p_new_status);
end;
$$;

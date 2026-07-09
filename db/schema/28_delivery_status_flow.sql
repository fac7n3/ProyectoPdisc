-- F3-03 (A113-183) — Flujo de estados de deliveries, sincronizado con la orden.
--
-- Transiciones válidas (solo hacia adelante, una por una):
--   assigned -> picked_up  ("en camino", el repartidor retiró el pedido)
--   picked_up -> delivered ("entregado")
-- El repartidor asignado a la entrega es el único que puede avanzarla.
-- 'cancelled' queda en el CHECK constraint (modelo futuro) pero
-- deliberadamente sin wireear todavía: qué pasa con el pedido al cancelar
-- una entrega (¿vuelve a estar disponible para otro repartidor? ¿interviene
-- el vendedor o el admin?) es una decisión de producto que no estaba en el
-- alcance de esta tarea — no inventar ese flujo ahora.

create or replace function public.update_delivery_status(p_delivery_id uuid, p_new_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_delivery record;
  v_next_order_status text;
begin
  if p_new_status not in ('picked_up', 'delivered') then
    raise exception 'Estado inválido.';
  end if;

  select id, order_id, repartidor_id, status into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

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

  update public.deliveries
  set status = p_new_status,
      delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end
  where id = p_delivery_id;

  v_next_order_status := case p_new_status
    when 'picked_up' then 'shipped'
    when 'delivered' then 'completed'
  end;

  update public.orders
  set status = v_next_order_status
  where id = v_delivery.order_id;

  return jsonb_build_object('delivery_id', p_delivery_id, 'status', p_new_status);
end;
$$;

revoke execute on function public.update_delivery_status(uuid, text) from public;
revoke execute on function public.update_delivery_status(uuid, text) from anon;
grant execute on function public.update_delivery_status(uuid, text) to authenticated;

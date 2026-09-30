-- 2026-09-30, a pedido del usuario: el vendedor confirma a mano el pago de un
-- pedido por transferencia, desde la tarjeta del pedido.
--
-- confirm_transfer_payment (22/38) solo sirve si el comprador subió un
-- comprobante (recibe p_proof_id). Desde el paso "Transferí" del carrito
-- (2026-09-23) el comprador avisa por WhatsApp y casi nunca sube comprobante:
-- al 2026-09-30 los 2 pedidos por transferencia pendientes no tenían ninguno,
-- así que el vendedor no tenía forma de marcarlos pagados.
--
-- Mismas reglas que confirm_transfer_payment: solo el dueño del comercio o un
-- admin (no empleados: es confirmar plata recibida), solo pedidos por
-- transferencia todavía pendientes de pago y no cancelados. Si había
-- comprobantes sin revisar, quedan confirmados junto con el pedido para que
-- no sigan contando como pendientes en el panel de admin.

create or replace function public.seller_confirm_transfer_payment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_order record;
begin
  if v_uid is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  v_is_admin := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin';

  select o.id, o.store_id, o.client_id, o.status, o.payment_status, o.payment_method into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  if not v_is_admin and not exists (
    select 1 from public.stores where id = v_order.store_id and owner_id = v_uid
  ) then
    raise exception 'Solo el dueño del comercio puede confirmar pagos.';
  end if;

  if v_order.payment_method is distinct from 'transferencia' then
    raise exception 'Este pedido no se paga por transferencia.';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Este pedido está cancelado.';
  end if;

  if v_order.payment_status != 'pending' then
    raise exception 'Este pedido ya no está pendiente de pago.';
  end if;

  update public.payment_proofs
     set status = 'confirmed', confirmed_by = v_uid
   where order_id = v_order.id and status = 'pending';

  update public.orders set payment_status = 'paid', status = 'paid' where id = v_order.id;

  perform public.create_notification(v_order.client_id, 'order_paid', jsonb_build_object('order_id', v_order.id));

  return jsonb_build_object('order_id', v_order.id, 'confirmed', true);
end;
$$;

revoke all on function public.seller_confirm_transfer_payment(uuid) from public, anon;
grant execute on function public.seller_confirm_transfer_payment(uuid) to authenticated;

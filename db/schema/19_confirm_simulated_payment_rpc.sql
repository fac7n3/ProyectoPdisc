-- F2-03 (A113-175) — Método de pago Simulado.
--
-- RPC separado de create_order a propósito: crear la orden y "pagarla" son
-- pasos distintos (igual que en un checkout real con pasarela), así el
-- frontend puede orquestarlos detrás de una interfaz PaymentProvider común
-- (js/payment-providers.js) sin que create_order necesite saber nada de
-- métodos de pago específicos. Los próximos providers (F2-04 transferencia,
-- F2-07 MercadoPago) van a tener su propio RPC/flujo, no tocan este.
--
-- Solo marca como pagada una orden que sea:
--   - del cliente que la llama (auth.uid() = orders.client_id)
--   - con payment_method = 'simulado' (nunca 'transferencia'/'mercadopago' —
--     esos requieren confirmación del vendedor o de la pasarela, F2-04/F2-07)
--   - todavía pending (idempotente: si ya está 'paid', no hace nada y lo
--     informa así en vez de lanzar error, para que un doble-click del
--     frontend no rompa nada)

create or replace function public.confirm_simulated_payment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := auth.uid();
  v_order record;
  v_payment_id text;
begin
  if v_client is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  select id, client_id, payment_method, payment_status, status
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'La orden no existe.';
  end if;

  if v_order.client_id != v_client then
    raise exception 'Esta orden no te pertenece.';
  end if;

  if v_order.payment_method != 'simulado' then
    raise exception 'Esta orden no usa el método de pago simulado.';
  end if;

  if v_order.payment_status = 'paid' then
    return jsonb_build_object('order_id', p_order_id, 'already_paid', true, 'payment_status', 'paid');
  end if;

  if v_order.payment_status != 'pending' then
    raise exception 'Esta orden no está pendiente de pago.';
  end if;

  v_payment_id := 'SIMULADO-' || substr(p_order_id::text, 1, 8) || '-' || floor(extract(epoch from now()))::bigint;

  update public.orders
  set payment_status = 'paid',
      status = 'paid',
      payment_id = v_payment_id
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'already_paid', false,
    'payment_status', 'paid',
    'payment_id', v_payment_id
  );
end;
$$;

-- Solo usuarios autenticados (nunca anon) pueden confirmar su propio pago simulado.
revoke execute on function public.confirm_simulated_payment(uuid) from public;
revoke execute on function public.confirm_simulated_payment(uuid) from anon;
grant execute on function public.confirm_simulated_payment(uuid) to authenticated;

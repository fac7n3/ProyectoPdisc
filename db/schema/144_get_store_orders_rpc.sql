-- 144 — Pedidos del panel de vendedor en UNA consulta (get_store_orders).
--
-- Antes, cada cambio de Realtime volvía a pedir 50 pedidos con `order_items ->
-- products`, `payment_proofs` y `deliveries` embebidos, más `profiles` y el RPC
-- get_order_delivery_states: 4 pedidos, y el embed de `products` arrastra la cadena
-- de policies de esa tabla (el plan tiene +500 subplanes, ~50 ms solo en
-- planificar). Esta función devuelve todo junto, con la forma que el panel ya
-- espera, y con `p_order_ids` trae solo los pedidos que cambiaron.
--
-- Copia la regla de visibilidad de `orders_select_merged` con el helper
-- `_can_manage_order` (dueño, empleado del comercio o admin): si esa regla
-- cambia, hay que cambiar esta función también (igual que get_product_detail).
-- Aditiva: el cliente cae a las consultas de siempre si la función no existe.

create or replace function public.get_store_orders(
  p_store_id uuid,
  p_order_ids uuid[] default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_store_id is null or not public._can_manage_order(p_store_id) then
    raise exception 'No podés ver los pedidos de este comercio.';
  end if;

  return coalesce((
    select jsonb_agg(x.j order by x.created_at desc)
    from (
      select
        o.created_at,
        jsonb_build_object(
          'id', o.id,
          'order_number', o.order_number,
          'client_id', o.client_id,
          'status', o.status,
          'payment_status', o.payment_status,
          'payment_method', o.payment_method,
          'delivery_method', o.delivery_method,
          'shipping_address', o.shipping_address,
          'delivery_fee', o.delivery_fee,
          'total_price', o.total_price,
          'courier_ready_at', o.courier_ready_at,
          'created_at', o.created_at,
          'payment_due_at', o.payment_due_at,
          'transfer_notified_at', o.transfer_notified_at,
          'cancel_reason', o.cancel_reason,
          'cancelled_by', o.cancelled_by,
          'revocation_requested_at', o.revocation_requested_at,
          'revocation_resolved_at', o.revocation_resolved_at,
          'buyer_name', p.full_name,
          'buyer_phone', p.phone,
          'order_items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'quantity', i.quantity,
              'price', i.price,
              'title', i.title,
              'selected_options', i.selected_options,
              'products', case when pr.id is null then null
                else jsonb_build_object('title', pr.title, 'image_url', pr.image_url) end
            ) order by i.created_at, i.id)
            from public.order_items i
            left join public.products pr on pr.id = i.product_id
            where i.order_id = o.id
          ), '[]'::jsonb),
          'payment_proofs', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', pp.id, 'status', pp.status, 'receipt_url', pp.receipt_url, 'created_at', pp.created_at
            ) order by pp.created_at desc)
            from public.payment_proofs pp where pp.order_id = o.id
          ), '[]'::jsonb),
          'deliveries', coalesce((
            select jsonb_agg(jsonb_build_object('id', d.id, 'status', d.status))
            from public.deliveries d where d.order_id = o.id
          ), '[]'::jsonb),
          'delivery_state', (
            select jsonb_build_object(
              'order_id', d.order_id,
              'status', d.status,
              'pickup_confirmed_at', d.pickup_confirmed_at,
              'picked_up_at', d.picked_up_at,
              'heads_up_at', d.heads_up_at,
              'delay_minutes', d.delay_minutes,
              'problem_at', d.problem_at,
              'problem_note', d.problem_note,
              'feedback_condition', f.condition
            )
            from public.deliveries d
            left join public.delivery_feedback f on f.order_id = d.order_id
            where d.order_id = o.id
            limit 1
          )
        ) as j
      from public.orders o
      left join public.profiles p on p.id = o.client_id
      where o.store_id = p_store_id
        and (p_order_ids is null or o.id = any (p_order_ids))
      order by o.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_store_orders(uuid, uuid[], integer) from public, anon;
grant execute on function public.get_store_orders(uuid, uuid[], integer) to authenticated;

-- Para el `order by created_at desc limit 50` de cada comercio.
create index if not exists idx_orders_store_created on public.orders (store_id, created_at desc);

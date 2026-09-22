-- Auditoría de seguridad por áreas (2026-09-22): "simulado" es, por diseño de
-- producto, un método de pago **solo para pruebas internas** (ver CLAUDE.md,
-- "Decisiones de producto") -- el checkout real (js/carrito.js) sacó la
-- opción de la UI hace tiempo (P1-1) y solo manda 'mercadopago' o
-- 'transferencia'. Pero ni `create_order` ni `confirm_simulated_payment`
-- tenían ningún chequeo de rol: cualquier usuario autenticado podía llamar
-- al RPC directo (saltándose la UI) con `p_payment_method: 'simulado'` sobre
-- un carrito con productos reales, y después `confirm_simulated_payment`
-- sobre esa orden -- marcándola pagada sin pagar un peso, contra un comercio
-- real (gogo, facu.cells). No es hipotético: se confirmó contra la base real
-- que `authenticated` tiene EXECUTE en las dos funciones y que ninguna de
-- las dos valida el rol de quien llama.
--
-- Fix: las dos funciones ahora exigen rol admin para usar/confirmar un pago
-- simulado -- mismo chequeo que ya usan admin_set_product_active/
-- add_store_staff. No rompe nada real: el checkout nunca manda 'simulado'
-- (paymentMethod arranca en 'mercadopago' y solo cambia a 'transferencia'),
-- así que el único uso legítimo que queda es un admin probando el flujo a
-- mano.

create or replace function public.create_order(cart_payload jsonb, coupon_code text DEFAULT NULL::text, p_delivery_method text DEFAULT 'pickup'::text, p_payment_method text DEFAULT 'simulado'::text, p_shipping_address text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client uuid := auth.uid();
  v_item jsonb;
  v_prod_uuid uuid;
  v_qty integer;
  v_coupon_discount_pct integer;
  v_coupon_store_id uuid;
  v_store_discount_pct integer;
  v_store_id uuid;
  v_store_delivery_fee integer;
  v_store_free_shipping_threshold integer;
  v_subtotal numeric;
  v_delivery_fee integer;
  v_total integer;
  v_order_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_prod record;
  v_owner_id uuid;
begin
  if v_client is null then
    raise exception 'Debés iniciar sesión para comprar.';
  end if;

  if p_delivery_method not in ('pickup', 'delivery') then
    raise exception 'Método de envío inválido.';
  end if;

  if p_payment_method not in ('simulado', 'mercadopago', 'transferencia') then
    raise exception 'Método de pago inválido.';
  end if;

  if p_payment_method = 'simulado'
     and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'El pago simulado es solo para pruebas internas.';
  end if;

  if p_delivery_method = 'delivery' and coalesce(trim(p_shipping_address), '') = '' then
    raise exception 'Ingresá una dirección de envío.';
  end if;

  if cart_payload is null or jsonb_typeof(cart_payload) != 'array' or jsonb_array_length(cart_payload) = 0 then
    raise exception 'El carrito está vacío.';
  end if;

  if coupon_code is not null and trim(coupon_code) <> '' then
    select discount_percentage, store_id into v_coupon_discount_pct, v_coupon_store_id
    from public.coupons
    where code = upper(trim(coupon_code)) and is_active = true
      and (expires_at is null or expires_at > now());

    if v_coupon_discount_pct is null then
      raise exception 'Cupón inválido o expirado.';
    end if;
  end if;

  create temporary table if not exists _order_cart_items (
    store_id uuid not null,
    product_id uuid not null,
    title text not null,
    qty integer not null,
    price integer not null
  ) on commit drop;
  truncate _order_cart_items;

  for v_item in select * from jsonb_array_elements(cart_payload)
  loop
    begin
      v_prod_uuid := (v_item->>'id')::uuid;
    exception when others then
      raise exception 'Producto inválido en el carrito.';
    end;

    v_qty := coalesce((v_item->>'qty')::integer, 0);
    if v_qty <= 0 or v_qty > 99 then
      raise exception 'Cantidad inválida para un producto del carrito.';
    end if;

    select id, store_id, title, price, stock into v_prod
    from public.products
    where id = v_prod_uuid and is_active = true
    for update;

    if not found then
      raise exception 'Un producto del carrito ya no está disponible.';
    end if;

    insert into _order_cart_items (store_id, product_id, title, qty, price)
    values (v_prod.store_id, v_prod.id, v_prod.title, v_qty, v_prod.price);
  end loop;

  if exists (
    select 1
    from (
      select product_id, sum(qty) as total_qty
      from _order_cart_items
      group by product_id
    ) agg
    join public.products p on p.id = agg.product_id
    where p.stock < agg.total_qty
  ) then
    raise exception 'No hay stock suficiente para uno o más productos del carrito.';
  end if;

  for v_store_id in select distinct store_id from _order_cart_items
  loop
    select sum(price * qty) into v_subtotal
    from _order_cart_items where store_id = v_store_id;

    select delivery_fee, free_shipping_threshold into v_store_delivery_fee, v_store_free_shipping_threshold
    from public.stores where id = v_store_id;

    v_store_discount_pct := case
      when v_coupon_discount_pct is not null and (v_coupon_store_id is null or v_coupon_store_id = v_store_id)
      then v_coupon_discount_pct
      else 0
    end;

    if p_delivery_method = 'delivery' then
      v_delivery_fee := case
        when v_subtotal * (1 - v_store_discount_pct / 100.0) >= v_store_free_shipping_threshold then 0
        else v_store_delivery_fee
      end;
    else
      v_delivery_fee := 0;
    end if;

    v_total := round(v_subtotal * (1 - v_store_discount_pct / 100.0))::integer + v_delivery_fee;

    insert into public.orders (
      client_id, store_id, status, shipping_address, total_price,
      delivery_method, payment_method, payment_status, delivery_fee
    )
    values (
      v_client, v_store_id, 'pending', p_shipping_address, v_total,
      p_delivery_method, p_payment_method, 'pending', v_delivery_fee
    )
    returning id into v_order_id;

    insert into public.order_items (order_id, product_id, quantity, price, title)
    select v_order_id, product_id, qty, price, title
    from _order_cart_items
    where store_id = v_store_id;

    update public.products p
    set stock = p.stock - agg.qty
    from (
      select product_id, sum(qty) as qty
      from _order_cart_items
      where store_id = v_store_id
      group by product_id
    ) agg
    where p.id = agg.product_id;

    select owner_id into v_owner_id from public.stores where id = v_store_id;
    perform public.create_notification(v_owner_id, 'order_created', jsonb_build_object('order_id', v_order_id, 'total_price', v_total));

    v_result := v_result || jsonb_build_object(
      'order_id', v_order_id,
      'store_id', v_store_id,
      'total_price', v_total,
      'delivery_fee', v_delivery_fee,
      'discount_percentage', v_store_discount_pct,
      'items', (
        select jsonb_agg(jsonb_build_object(
          'product_id', product_id, 'title', title, 'qty', qty, 'price', price
        ))
        from _order_cart_items
        where store_id = v_store_id
      )
    );
  end loop;

  return jsonb_build_object('orders', v_result);
end;
$function$;

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
  v_owner_id uuid;
begin
  if v_client is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'El pago simulado es solo para pruebas internas.';
  end if;

  select id, client_id, store_id, payment_method, payment_status, status
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

  select owner_id into v_owner_id from public.stores where id = v_order.store_id;
  perform public.create_notification(v_owner_id, 'order_paid', jsonb_build_object('order_id', p_order_id));

  return jsonb_build_object(
    'order_id', p_order_id,
    'already_paid', false,
    'payment_status', 'paid',
    'payment_id', v_payment_id
  );
end;
$$;

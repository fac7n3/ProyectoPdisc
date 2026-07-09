-- F2-05 (A113-177) — calcular delivery_fee real dentro de create_order.
--
-- Hasta acá create_order() dejaba delivery_fee en null (comentado como
-- pendiente de esta tarea, ver 18_create_order_rpc.sql). Política unificada
-- de envío: gratis en 'pickup'; en 'delivery', $350 por tienda salvo que el
-- subtotal de esa tienda (ya con el cupón aplicado) supere $5000, en cuyo
-- caso es gratis. Los mismos números viven espejados en
-- js/carrito.js (FREE_SHIPPING_THRESHOLD/FLAT_SHIPPING_FEE) para que el
-- resumen del carrito coincida con lo que efectivamente se cobra acá.
--
-- CREATE OR REPLACE reemplaza la función completa (incluye todo lo de
-- 18_create_order_rpc.sql) — Postgres no permite "parchear" solo un bloque
-- de una función.

create or replace function public.create_order(
  cart_payload jsonb,
  coupon_code text default null,
  p_delivery_method text default 'pickup',
  p_payment_method text default 'simulado',
  p_shipping_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_client uuid := auth.uid();
  v_item jsonb;
  v_prod_uuid uuid;
  v_qty integer;
  v_discount_pct integer := 0;
  v_store_id uuid;
  v_subtotal numeric;
  v_delivery_fee integer;
  v_total integer;
  v_order_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_prod record;
  c_free_shipping_threshold constant integer := 5000;
  c_flat_shipping_fee constant integer := 350;
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

  if p_delivery_method = 'delivery' and coalesce(trim(p_shipping_address), '') = '' then
    raise exception 'Ingresá una dirección de envío.';
  end if;

  if cart_payload is null or jsonb_typeof(cart_payload) != 'array' or jsonb_array_length(cart_payload) = 0 then
    raise exception 'El carrito está vacío.';
  end if;

  if coupon_code is not null and trim(coupon_code) <> '' then
    select discount_percentage into v_discount_pct
    from public.coupons
    where code = upper(trim(coupon_code)) and is_active = true
      and (expires_at is null or expires_at > now());

    if v_discount_pct is null then
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

    if p_delivery_method = 'delivery' then
      v_delivery_fee := case
        when v_subtotal * (1 - v_discount_pct / 100.0) >= c_free_shipping_threshold then 0
        else c_flat_shipping_fee
      end;
    else
      v_delivery_fee := 0;
    end if;

    v_total := round(v_subtotal * (1 - v_discount_pct / 100.0))::integer + v_delivery_fee;

    insert into public.orders (
      client_id, store_id, status, shipping_address, total_price,
      delivery_method, payment_method, payment_status, delivery_fee
    )
    values (
      v_client, v_store_id, 'pending', p_shipping_address, v_total,
      p_delivery_method, p_payment_method, 'pending', v_delivery_fee
    )
    returning id into v_order_id;

    insert into public.order_items (order_id, product_id, quantity, price)
    select v_order_id, product_id, qty, price
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

    v_result := v_result || jsonb_build_object(
      'order_id', v_order_id,
      'store_id', v_store_id,
      'total_price', v_total,
      'delivery_fee', v_delivery_fee,
      'items', (
        select jsonb_agg(jsonb_build_object(
          'product_id', product_id, 'title', title, 'qty', qty, 'price', price
        ))
        from _order_cart_items
        where store_id = v_store_id
      )
    );
  end loop;

  return jsonb_build_object(
    'orders', v_result,
    'discount_percentage', v_discount_pct
  );
end;
$fn$;

revoke execute on function public.create_order(jsonb, text, text, text, text) from public;
revoke execute on function public.create_order(jsonb, text, text, text, text) from anon;
grant execute on function public.create_order(jsonb, text, text, text, text) to authenticated;

-- F2-01 (A113-173) — RPC create_order (SECURITY DEFINER, transaccional).
--
-- Reemplaza el flujo actual donde el frontend solo valida precios
-- (validate_cart_prices) y nunca llega a crear una orden real. Este RPC:
--   1. Vuelve a leer store_id/title/price/stock de products en el momento
--      del checkout (NUNCA confía en el precio que manda el cliente — a
--      diferencia de validate_cart_prices, ni siquiera lo recibe).
--   2. Bloquea las filas de products con `for update` para serializar contra
--      checkouts concurrentes sobre el mismo stock.
--   3. Divide el carrito en **una orden por tienda** (D-multitienda: orders
--      tiene `store_id not null`, un carrito puede mezclar productos de
--      varios comercios).
--   4. Aplica el cupón (mismo % a cada orden generada).
--   5. Descuenta stock y guarda delivery_method/payment_method.
--   6. Al ser una función plpgsql, todo el cuerpo corre en una sola
--      transacción implícita: si `raise exception` corta la ejecución en
--      cualquier punto, Postgres revierte todo lo hecho hasta ahí — no hace
--      falta (ni se puede) un BEGIN/COMMIT manual dentro de la función.
--
-- delivery_fee queda sin calcular a propósito (columna nullable) — la
-- política de envío unificada es F2-05. payment_status/status quedan en
-- 'pending' — marcarlas como pagadas es F2-03 (simulado) / F2-04 (transferencia).

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
as $$
declare
  v_client uuid := auth.uid();
  v_item jsonb;
  v_prod_uuid uuid;
  v_qty integer;
  v_discount_pct integer := 0;
  v_store_id uuid;
  v_subtotal numeric;
  v_total integer;
  v_order_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_prod record;
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

  -- Tabla temporal para acumular el carrito ya revalidado server-side.
  -- IF NOT EXISTS + TRUNCATE en vez de solo CREATE: ON COMMIT DROP la borra
  -- al terminar la transacción de este RPC, pero si por pooling de conexión
  -- llegara a sobrevivir, esto la deja limpia igual.
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

    -- `for update` bloquea la fila hasta el fin de la transacción: si dos
    -- checkouts piden el mismo producto a la vez, el segundo espera a que
    -- el primero termine (commit o rollback) antes de leer el stock.
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

  -- Validar stock consolidado (por si el mismo producto aparece más de una vez)
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

  -- Una orden por tienda: un carrito puede mezclar productos de varios comercios.
  for v_store_id in select distinct store_id from _order_cart_items
  loop
    select sum(price * qty) into v_subtotal
    from _order_cart_items where store_id = v_store_id;

    v_total := round(v_subtotal * (1 - v_discount_pct / 100.0))::integer;

    insert into public.orders (
      client_id, store_id, status, shipping_address, total_price,
      delivery_method, payment_method, payment_status
    )
    values (
      v_client, v_store_id, 'pending', p_shipping_address, v_total,
      p_delivery_method, p_payment_method, 'pending'
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
$$;

-- Solo usuarios autenticados pueden crear órdenes (no anon, no público).
revoke execute on function public.create_order(jsonb, text, text, text, text) from public;
revoke execute on function public.create_order(jsonb, text, text, text, text) from anon;
grant execute on function public.create_order(jsonb, text, text, text, text) to authenticated;

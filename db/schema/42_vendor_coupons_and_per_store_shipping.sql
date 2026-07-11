-- F12-03 (cupones propios por vendedor) + F12-04 (envío configurable por comercio).
-- Pedido explícito del usuario. Antes: coupons era 100% admin/global, y el envío
-- ($350 / gratis desde $5000) era una constante hardcodeada dentro de create_order,
-- igual para las 14 tiendas. Ahora cada comercio puede tener su propio cupón y su
-- propia política de envío; el default (350/5000) se preserva para las tiendas
-- existentes -- ningún vendedor ve cambiar sus precios sin tocar nada.

alter table public.coupons add column if not exists store_id uuid references public.stores(id) on delete cascade;

-- Un cupón de vendedor (store_id no nulo) lo administra solo el dueño de esa
-- tienda. Los cupones globales (store_id null) siguen siendo admin-only vía
-- la policy coupons_all_admin ya existente (no se toca).
drop policy if exists coupons_insert_own_store on public.coupons;
create policy coupons_insert_own_store on public.coupons for insert to authenticated
  with check (
    store_id is not null
    and exists (select 1 from public.stores s where s.id = coupons.store_id and s.owner_id = auth.uid())
  );

drop policy if exists coupons_update_own_store on public.coupons;
create policy coupons_update_own_store on public.coupons for update to authenticated
  using (
    store_id is not null
    and exists (select 1 from public.stores s where s.id = coupons.store_id and s.owner_id = auth.uid())
  )
  with check (
    store_id is not null
    and exists (select 1 from public.stores s where s.id = coupons.store_id and s.owner_id = auth.uid())
  );

drop policy if exists coupons_delete_own_store on public.coupons;
create policy coupons_delete_own_store on public.coupons for delete to authenticated
  using (
    store_id is not null
    and exists (select 1 from public.stores s where s.id = coupons.store_id and s.owner_id = auth.uid())
  );

alter table public.stores add column if not exists delivery_fee integer not null default 350;
alter table public.stores add column if not exists free_shipping_threshold integer not null default 5000;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stores_delivery_fee_check') then
    alter table public.stores add constraint stores_delivery_fee_check check (delivery_fee >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_free_shipping_threshold_check') then
    alter table public.stores add constraint stores_free_shipping_threshold_check check (free_shipping_threshold >= 0);
  end if;
end $$;

-- create_order (migraciones 18/20) reescrita: el descuento y el envío ahora
-- se calculan por tienda dentro del mismo loop, en vez de una constante y un
-- porcentaje únicos para todo el carrito. Un cupón de vendedor solo descuenta
-- su propia tienda -- si el carrito tiene productos de otro comercio, ese
-- comercio no se ve afectado por un cupón que no es suyo.
CREATE OR REPLACE FUNCTION public.create_order(cart_payload jsonb, coupon_code text DEFAULT NULL::text, p_delivery_method text DEFAULT 'pickup'::text, p_payment_method text DEFAULT 'simulado'::text, p_shipping_address text DEFAULT NULL::text)
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

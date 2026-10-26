-- 2026-10-26, a pedido del usuario: se saca el envío gratis ("por ahora no vamos
-- a hacer nada con eso"). Un pedido con envío a domicilio paga siempre el
-- `stores.delivery_fee` de su comercio, sin importar cuánto compre.
--
-- Esta función es la copia exacta de la que está viva en producción (leída con
-- pg_get_functiondef: el archivo 115 ya no coincide), salvo que no lee
-- `free_shipping_threshold` ni lo compara.
--
-- La columna `stores.free_shipping_threshold` NO se borra: el frontend viejo
-- (con la pestaña abierta o en caché) la sigue pidiendo en sus `select` y, sin
-- la columna, esas consultas fallarían enteras. Con la función ya sin mirarla
-- queda como dato muerto; se puede borrar más adelante, cuando ya no quede
-- nadie con el frontend anterior.
--
-- Orden de publicación: primero el frontend (carrito mostrando el envío
-- siempre), después esta migración. Al revés, el carrito prometería envío
-- gratis y se cobraría el envío.

create or replace function public.create_order(cart_payload jsonb, coupon_code text default null::text, p_delivery_method text default 'pickup'::text, p_payment_method text default 'simulado'::text, p_shipping_address text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_client uuid := auth.uid(); v_item jsonb; v_prod_uuid uuid; v_qty integer; v_coupon_discount_pct integer; v_coupon_store_id uuid;
  v_store_discount_pct integer; v_store_id uuid; v_store_delivery_fee integer; v_subtotal numeric;
  v_delivery_fee integer; v_total integer; v_order_id uuid; v_order_number bigint; v_due_at timestamptz; v_result jsonb := '[]'::jsonb;
  v_prod record; v_opt_ids uuid[]; v_group_count integer; v_chosen_groups integer; v_options_snapshot jsonb;
begin
  if v_client is null then raise exception 'Debés iniciar sesión para comprar.'; end if;
  if p_delivery_method not in ('pickup', 'delivery') then raise exception 'Método de envío inválido.'; end if;
  if p_payment_method not in ('simulado', 'mercadopago', 'transferencia', 'efectivo') then raise exception 'Método de pago inválido.'; end if;
  if p_payment_method = 'simulado' and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then raise exception 'El pago simulado es solo para pruebas internas.'; end if;
  if p_delivery_method = 'delivery' and coalesce(trim(p_shipping_address), '') = '' then raise exception 'Ingresá una dirección de envío.'; end if;
  if p_delivery_method = 'delivery' and p_payment_method = 'efectivo' then raise exception 'El pago en efectivo es solo para retiro en el local. Con envío a domicilio elegí Mercado Pago o transferencia.'; end if;
  if cart_payload is null or jsonb_typeof(cart_payload) != 'array' or jsonb_array_length(cart_payload) = 0 then raise exception 'El carrito está vacío.'; end if;
  if coupon_code is not null and trim(coupon_code) <> '' then
    select discount_percentage, store_id into v_coupon_discount_pct, v_coupon_store_id from public.coupons
    where code = upper(trim(coupon_code)) and is_active = true and (expires_at is null or expires_at > now());
    if v_coupon_discount_pct is null then raise exception 'Cupón inválido o expirado.'; end if;
  end if;
  v_due_at := case p_payment_method when 'transferencia' then now() + interval '72 hours' when 'mercadopago' then now() + interval '24 hours' else null end;
  create temporary table if not exists _order_cart_items (store_id uuid not null, product_id uuid not null, title text not null, qty integer not null, price integer not null, selected_options jsonb) on commit drop;
  truncate _order_cart_items;
  for v_item in select * from jsonb_array_elements(cart_payload) loop
    begin v_prod_uuid := (v_item->>'id')::uuid; exception when others then raise exception 'Producto inválido en el carrito.'; end;
    v_qty := coalesce((v_item->>'qty')::integer, 0);
    if v_qty <= 0 or v_qty > 99 then raise exception 'Cantidad inválida para un producto del carrito.'; end if;
    select id, store_id, title, price, stock into v_prod from public.products where id = v_prod_uuid and is_active = true for update;
    if not found then raise exception 'Un producto del carrito ya no está disponible.'; end if;
    begin
      select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_opt_ids
      from jsonb_array_elements_text(case when jsonb_typeof(v_item->'options') = 'array' then v_item->'options' else '[]'::jsonb end) x;
    exception when others then raise exception 'Opción inválida para "%".', v_prod.title; end;
    select count(*) into v_group_count from public.product_options where product_id = v_prod.id;
    select count(distinct po.id), jsonb_agg(jsonb_build_object('option', po.name, 'value', pov.value) order by po.position, po.name)
      into v_chosen_groups, v_options_snapshot
    from public.product_option_values pov join public.product_options po on po.id = pov.option_id
    where pov.id = any(v_opt_ids) and po.product_id = v_prod.id and pov.is_available = true;
    if v_group_count > 0 and coalesce(v_chosen_groups, 0) <> v_group_count then raise exception 'Elegí una opción de cada tipo para "%".', v_prod.title; end if;
    if coalesce(array_length(v_opt_ids, 1), 0) <> v_group_count then raise exception 'La selección de opciones de "%" no es válida.', v_prod.title; end if;
    insert into _order_cart_items (store_id, product_id, title, qty, price, selected_options)
    values (v_prod.store_id, v_prod.id, v_prod.title, v_qty, v_prod.price, case when v_group_count > 0 then v_options_snapshot else null end);
  end loop;
  if exists (select 1 from (select product_id, sum(qty) as total_qty from _order_cart_items group by product_id) agg
             join public.products p on p.id = agg.product_id where p.stock < agg.total_qty) then
    raise exception 'No hay stock suficiente para uno o más productos del carrito.';
  end if;
  for v_store_id in select distinct store_id from _order_cart_items loop
    select sum(price * qty) into v_subtotal from _order_cart_items where store_id = v_store_id;
    select delivery_fee into v_store_delivery_fee from public.stores where id = v_store_id;
    v_store_discount_pct := case when v_coupon_discount_pct is not null and (v_coupon_store_id is null or v_coupon_store_id = v_store_id) then v_coupon_discount_pct else 0 end;
    if p_delivery_method = 'delivery' then v_delivery_fee := v_store_delivery_fee; else v_delivery_fee := 0; end if;
    v_total := round(v_subtotal * (1 - v_store_discount_pct / 100.0))::integer + v_delivery_fee;
    insert into public.orders (client_id, store_id, status, shipping_address, total_price, delivery_method, payment_method, payment_status, delivery_fee, payment_due_at)
    values (v_client, v_store_id, 'pending', p_shipping_address, v_total, p_delivery_method, p_payment_method, 'pending', v_delivery_fee, v_due_at)
    returning id, order_number into v_order_id, v_order_number;
    insert into public.order_items (order_id, product_id, quantity, price, title, selected_options)
    select v_order_id, product_id, qty, price, title, selected_options from _order_cart_items where store_id = v_store_id;
    update public.products p set stock = p.stock - agg.qty
    from (select product_id, sum(qty) as qty from _order_cart_items where store_id = v_store_id group by product_id) agg
    where p.id = agg.product_id;
    v_result := v_result || jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'store_id', v_store_id,
      'total_price', v_total, 'delivery_fee', v_delivery_fee, 'discount_percentage', v_store_discount_pct, 'payment_due_at', v_due_at,
      'items', (select jsonb_agg(jsonb_build_object('product_id', product_id, 'title', title, 'qty', qty, 'price', price, 'selected_options', selected_options))
                from _order_cart_items where store_id = v_store_id));
  end loop;
  return jsonb_build_object('orders', v_result);
end;
$function$;

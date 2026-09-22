-- Opciones de producto (color, sabor, talle, …) — a pedido del usuario, 2026-09-22.
--
-- El caso: un comercio vende la misma prenda en varios colores, o el mismo
-- budín en varios sabores. Hasta ahora la única salida era cargar un producto
-- por color, con su foto, su precio y su stock repetidos.
--
-- Tres decisiones de producto, confirmadas con el usuario antes de escribir
-- esto, que explican por qué el modelo es tan chico:
--
--  1. **El stock sigue siendo del producto**, no de cada opción. El vendedor
--     no tiene que llevar la cuenta color por color; si se le acaba uno lo
--     marca `is_available = false` y al cliente le aparece deshabilitado.
--     Por eso acá NO hay tabla de "variantes" ni combinaciones: una remera con
--     3 colores y 4 talles son 7 filas de valores, no 12 de combinaciones.
--  2. **Un producto puede tener varios grupos a la vez** (Color + Talle), y el
--     cliente elige uno de cada uno. De ahí que sean dos tablas y no un array.
--  3. **La opción no cambia el precio.** Si algún día cambia, el lugar es una
--     columna en product_option_values + el cálculo de create_order y de
--     js/cart-totals.js, que hoy fija la aritmética contra este mismo RPC.

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- Dos grupos con el mismo nombre en un producto ("Color" y "Color") harían
  -- imposible saber cuál eligió el cliente al leer el pedido.
  unique (product_id, name)
);

create index if not exists product_options_product_id_idx on public.product_options(product_id);

create table if not exists public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.product_options(id) on delete cascade,
  value text not null check (length(trim(value)) between 1 and 40),
  -- "Lo tengo pero se me acabó": sigue visible, tachado y no elegible. Sacarlo
  -- de la lista es la otra opción y también vale; esto evita perder la carga.
  is_available boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (option_id, value)
);

create index if not exists product_option_values_option_id_idx on public.product_option_values(option_id);

alter table public.product_options enable row level security;
alter table public.product_option_values enable row level security;

-- ── RLS ──
-- Lectura: la misma que ya decide si el producto se ve o no. No se repite el
-- criterio (activo + tienda aprobada + dueño + empleado + admin): se delega en
-- las policies de `products`, que es donde vive y donde se mantiene. Si mañana
-- cambia quién ve un producto, estas dos siguen el cambio solas.
drop policy if exists product_options_select on public.product_options;
create policy product_options_select on public.product_options
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_options.product_id));

drop policy if exists product_option_values_select on public.product_option_values;
create policy product_option_values_select on public.product_option_values
  for select to anon, authenticated
  using (exists (
    select 1 from public.product_options po
    join public.products p on p.id = po.product_id
    where po.id = product_option_values.option_id
  ));

-- Escritura: dueño del producto (con rol vendedor/admin) o empleado del
-- comercio -- mismo par de condiciones que products_update_seller +
-- products_update_staff.
create or replace function public.can_write_product(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.products p
    where p.id = p_product_id
      and (
        (p.seller_id = auth.uid()
          and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') in ('vendedor', 'admin'))
        or exists (select 1 from public.store_staff ss where ss.store_id = p.store_id and ss.user_id = auth.uid())
      )
  );
$$;

drop policy if exists product_options_write on public.product_options;
create policy product_options_write on public.product_options
  for all to authenticated
  using (public.can_write_product(product_id))
  with check (public.can_write_product(product_id));

drop policy if exists product_option_values_write on public.product_option_values;
create policy product_option_values_write on public.product_option_values
  for all to authenticated
  using (exists (select 1 from public.product_options po where po.id = option_id and public.can_write_product(po.product_id)))
  with check (exists (select 1 from public.product_options po where po.id = option_id and public.can_write_product(po.product_id)));

grant select on public.product_options, public.product_option_values to anon, authenticated;
grant insert, update, delete on public.product_options, public.product_option_values to authenticated;

-- ── Lo que eligió el cliente, guardado en el pedido ──
-- Texto, no foreign keys: el vendedor puede renombrar "Rojo" a "Bordó" o
-- borrar el grupo entero, y un pedido de hace tres meses tiene que seguir
-- diciendo qué fue lo que se despachó. Mismo criterio que `order_items.title`.
alter table public.order_items
  add column if not exists selected_options jsonb;

comment on column public.order_items.selected_options is
  'Snapshot de las opciones elegidas: [{"option":"Color","value":"Rojo"}]. NULL en pedidos sin opciones o anteriores a esta migración.';

-- ── create_order: validar la elección del cliente del lado del servidor ──
--
-- El carrito ahora manda, por ítem, `options`: un array de **ids** de
-- product_option_values. IDs y no texto a propósito -- si viajara el texto, el
-- cliente podría inventar "Color: el que quiera" y el vendedor recibiría un
-- pedido de algo que no vende. El nombre legible lo arma esta función leyendo
-- la base, igual que ya hace con el precio.
--
-- Se valida, para cada ítem, que la selección:
--   * cubra TODOS los grupos de opciones de ese producto (uno por grupo);
--   * use solo valores que pertenecen a ese producto (no de otro);
--   * use solo valores marcados como disponibles.
-- La comparación de cantidades (`= v_group_count` en los dos lados) es la que
-- cierra los dos huecos sutiles: mandar dos valores del mismo grupo, y mandar
-- ids de relleno además de los correctos.
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
as $function$
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
  v_opt_ids uuid[];
  v_group_count integer;
  v_chosen_groups integer;
  v_options_snapshot jsonb;
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
    price integer not null,
    selected_options jsonb
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

    -- Opciones elegidas (color/sabor/talle). Los ids llegan como texto.
    begin
      select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_opt_ids
      from jsonb_array_elements_text(
        case when jsonb_typeof(v_item->'options') = 'array' then v_item->'options' else '[]'::jsonb end
      ) x;
    exception when others then
      raise exception 'Opción inválida para "%".', v_prod.title;
    end;

    select count(*) into v_group_count
    from public.product_options where product_id = v_prod.id;

    select count(distinct po.id),
           jsonb_agg(jsonb_build_object('option', po.name, 'value', pov.value) order by po.position, po.name)
      into v_chosen_groups, v_options_snapshot
    from public.product_option_values pov
    join public.product_options po on po.id = pov.option_id
    where pov.id = any(v_opt_ids)
      and po.product_id = v_prod.id
      and pov.is_available = true;

    if v_group_count > 0 and coalesce(v_chosen_groups, 0) <> v_group_count then
      raise exception 'Elegí una opción de cada tipo para "%".', v_prod.title;
    end if;

    -- Sobran ids: o repitió un grupo, o mandó relleno. En los dos casos la
    -- selección no es la que muestra la pantalla, así que no se acepta.
    if coalesce(array_length(v_opt_ids, 1), 0) <> v_group_count then
      raise exception 'La selección de opciones de "%" no es válida.', v_prod.title;
    end if;

    insert into _order_cart_items (store_id, product_id, title, qty, price, selected_options)
    values (v_prod.store_id, v_prod.id, v_prod.title, v_qty, v_prod.price,
            case when v_group_count > 0 then v_options_snapshot else null end);
  end loop;

  -- El stock se mira por PRODUCTO, sumando todas las líneas: dos colores de la
  -- misma remera compiten por el mismo stock (ver el encabezado de esta
  -- migración -- no hay stock por variante a propósito).
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

    insert into public.order_items (order_id, product_id, quantity, price, title, selected_options)
    select v_order_id, product_id, qty, price, title, selected_options
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
          'product_id', product_id, 'title', title, 'qty', qty, 'price', price,
          'selected_options', selected_options
        ))
        from _order_cart_items
        where store_id = v_store_id
      )
    );
  end loop;

  return jsonb_build_object('orders', v_result);
end;
$function$;

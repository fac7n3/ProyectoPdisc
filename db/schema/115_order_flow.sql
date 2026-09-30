-- 2026-09-30, a pedido del usuario: flujo completo del pedido, de la compra a
-- la entrega ("como Mercado Libre"). Lo que resuelve esta migración:
--
--  * Número de pedido corto y correlativo (#BL-1001), el mismo en todas las
--    pantallas. Antes cada pantalla recortaba el uuid a su manera
--    (#BL-ACB34, Orden #ACB34461, Pedido #ACB34461).
--  * Código de retiro de 4 dígitos (order_pickup_codes). Lo ve solo el
--    comprador; el vendedor se lo pide para marcar el pedido entregado. El QR
--    del comprador lleva el mismo código.
--  * Historial del pedido (order_events), para la línea de tiempo.
--  * Notificaciones en UN solo lugar: el trigger orders_after_change avisa en
--    cada cambio de estado, venga de donde venga (vendedor, repartidor,
--    webhook de Mercado Pago, cron de vencimiento). Antes cada función
--    avisaba por su cuenta y los cambios del vendedor no avisaban nada.
--  * Pago en efectivo al retirar o al recibir.
--  * Vencimiento con fecha (payment_due_at) que el comprador ve. No se vence
--    si el comprador avisó que transfirió o subió un comprobante. Recordatorio
--    un día antes.
--  * Funciones nuevas: cancel_order, advance_order_status,
--    notify_transfer_sent, reject_transfer_payment, accept_order_revocation.
--
-- Compatible con el frontend anterior: nada de lo que ya llamaba cambia de
-- firma de forma incompatible. Lo que sí rompería al frontend viejo (sacar el
-- UPDATE directo de orders.status, exigir el código al repartidor) va en la
-- 116, que se aplica recién cuando este frontend está en producción.

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas en orders
-- ---------------------------------------------------------------------------

create sequence if not exists public.orders_order_number_seq start 1001;

alter table public.orders
  add column if not exists order_number bigint,
  add column if not exists payment_due_at timestamptz,
  add column if not exists transfer_notified_at timestamptz,
  add column if not exists payment_reminder_sent_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists cancelled_by text,
  add column if not exists revocation_resolved_at timestamptz;

alter table public.orders drop constraint if exists orders_cancelled_by_check;
alter table public.orders add constraint orders_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('buyer', 'seller', 'admin', 'system'));

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method is null or payment_method in ('simulado', 'mercadopago', 'transferencia', 'efectivo'));

-- Backfill sin tocar updated_at: el panel del repartidor lo usa para medir
-- cuánto hace que un pedido espera.
alter table public.orders disable trigger orders_set_updated_at;

with numbered as (
  select id, 1000 + row_number() over (order by created_at, id) as n
  from public.orders
  where order_number is null
)
update public.orders o set order_number = numbered.n
from numbered where o.id = numbered.id;

update public.orders
   set payment_due_at = created_at + case payment_method
                                       when 'transferencia' then interval '72 hours'
                                       else interval '24 hours'
                                     end
 where payment_due_at is null
   and payment_method in ('transferencia', 'mercadopago');

-- Pedidos que se cancelaron por falta de pago antes de esta migración.
update public.orders
   set cancelled_by = 'system', cancel_reason = 'Venció el plazo para pagar'
 where status = 'cancelled' and payment_status = 'rejected' and cancelled_by is null;

alter table public.orders enable trigger orders_set_updated_at;

select setval('public.orders_order_number_seq',
              greatest((select coalesce(max(order_number), 1000) from public.orders), 1000));
alter table public.orders alter column order_number set default nextval('public.orders_order_number_seq');
alter sequence public.orders_order_number_seq owned by public.orders.order_number;
alter table public.orders alter column order_number set not null;
create unique index if not exists orders_order_number_key on public.orders (order_number);

-- ---------------------------------------------------------------------------
-- 2. Código de retiro: solo lo ve el comprador
-- ---------------------------------------------------------------------------

create table if not exists public.order_pickup_codes (
  order_id uuid primary key references public.orders (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);

alter table public.order_pickup_codes enable row level security;

drop policy if exists order_pickup_codes_select_buyer on public.order_pickup_codes;
create policy order_pickup_codes_select_buyer on public.order_pickup_codes
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_pickup_codes.order_id and o.client_id = (select auth.uid())
  ));

revoke all on public.order_pickup_codes from anon;
revoke insert, update, delete, truncate on public.order_pickup_codes from authenticated;

insert into public.order_pickup_codes (order_id, code)
select id, lpad(floor(random() * 10000)::int::text, 4, '0') from public.orders
on conflict (order_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Historial del pedido
-- ---------------------------------------------------------------------------

create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null,
  note text,
  actor text check (actor is null or actor in ('buyer', 'seller', 'admin', 'courier', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_id_created_at_idx on public.order_events (order_id, created_at);

alter table public.order_events enable row level security;

-- La subconsulta a orders pasa por la RLS de orders: cada uno ve el historial
-- de los pedidos que ya puede ver (comprador, dueño, empleado, admin).
drop policy if exists order_events_select_visible_orders on public.order_events;
create policy order_events_select_visible_orders on public.order_events
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_events.order_id));

revoke all on public.order_events from anon;
revoke insert, update, delete, truncate on public.order_events from authenticated;

-- Historial aproximado de los pedidos que ya existían: el alta y el estado en
-- el que están hoy (con la fecha de su última modificación).
insert into public.order_events (order_id, kind, actor, created_at)
select id, 'created', 'buyer', created_at from public.orders o
where not exists (select 1 from public.order_events e where e.order_id = o.id);

insert into public.order_events (order_id, kind, actor, note, created_at)
select id,
       case
         when status = 'cancelled' and cancelled_by = 'system' then 'expired'
         when status = 'completed' then 'completed'
         else status
       end,
       'system', cancel_reason, updated_at
from public.orders o
where status in ('paid', 'ready_for_pickup', 'shipped', 'completed', 'cancelled')
  and not exists (select 1 from public.order_events e where e.order_id = o.id and e.kind <> 'created');

-- ---------------------------------------------------------------------------
-- 4. Quién hizo el cambio (para el historial y para no avisarle a uno mismo)
-- ---------------------------------------------------------------------------

create or replace function public._order_actor(p_client_id uuid, p_store_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 'system'
    when auth.uid() = p_client_id then 'buyer'
    when exists (select 1 from public.stores s where s.id = p_store_id and s.owner_id = auth.uid())
      or exists (select 1 from public.store_staff ss where ss.store_id = p_store_id and ss.user_id = auth.uid())
      then 'seller'
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'repartidor' then 'courier'
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin' then 'admin'
    else 'system'
  end;
$$;

revoke all on function public._order_actor(uuid, uuid) from public, anon, authenticated;

-- ¿Puede operar el pedido como vendedor? Dueño, empleado o admin.
create or replace function public._can_manage_order(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      or exists (select 1 from public.stores s where s.id = p_store_id and s.owner_id = auth.uid())
      or exists (select 1 from public.store_staff ss where ss.store_id = p_store_id and ss.user_id = auth.uid());
$$;

revoke all on function public._can_manage_order(uuid) from public, anon, authenticated;

-- Confirmar o rechazar plata recibida: solo dueño o admin, no empleados.
create or replace function public._is_store_owner_or_admin(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      or exists (select 1 from public.stores s where s.id = p_store_id and s.owner_id = auth.uid());
$$;

revoke all on function public._is_store_owner_or_admin(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Trigger central: historial + notificaciones
-- ---------------------------------------------------------------------------

create or replace function public.orders_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_actor text := public._order_actor(new.client_id, new.store_id);
  v_payload jsonb;
begin
  select owner_id into v_owner from public.stores where id = new.store_id;
  v_payload := jsonb_build_object(
    'order_id', new.id,
    'order_number', new.order_number,
    'total_price', new.total_price,
    'payment_method', new.payment_method,
    'delivery_method', new.delivery_method
  );

  if tg_op = 'INSERT' then
    insert into public.order_pickup_codes (order_id, code)
    values (new.id, lpad(floor(random() * 10000)::int::text, 4, '0'))
    on conflict (order_id) do nothing;

    insert into public.order_events (order_id, kind, actor) values (new.id, 'created', v_actor);

    -- Mercado Pago se paga en el momento o se abandona: al vendedor se le
    -- avisa recién cuando se acredita (order_paid_seller). Transferencia y
    -- efectivo sí le interesan desde el alta.
    if new.payment_method in ('transferencia', 'efectivo') then
      perform public.create_notification(v_owner, 'order_created', v_payload);
    end if;
    return new;
  end if;

  -- El comprador avisó que transfirió.
  if new.transfer_notified_at is not null and old.transfer_notified_at is null then
    insert into public.order_events (order_id, kind, actor) values (new.id, 'transfer_notified', v_actor);
    perform public.create_notification(v_owner, 'transfer_notified', v_payload);
  end if;

  -- Pago acreditado. En efectivo se cobra al entregar: el aviso es el de
  -- "entregado", no hace falta uno de pago aparte.
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    insert into public.order_events (order_id, kind, actor) values (new.id, 'paid', v_actor);
    if new.payment_method is distinct from 'efectivo' then
      perform public.create_notification(new.client_id, 'order_paid', v_payload);
      if v_actor <> 'seller' then
        perform public.create_notification(v_owner, 'order_paid_seller', v_payload);
      end if;
    end if;
  end if;

  if new.revocation_requested_at is not null and old.revocation_requested_at is null then
    insert into public.order_events (order_id, kind, actor) values (new.id, 'revocation_requested', v_actor);
  end if;

  if new.status is distinct from old.status then
    if new.status = 'ready_for_pickup' then
      insert into public.order_events (order_id, kind, actor) values (new.id, 'ready_for_pickup', v_actor);
      perform public.create_notification(new.client_id, 'order_ready_for_pickup', v_payload);

    elsif new.status = 'shipped' then
      insert into public.order_events (order_id, kind, actor) values (new.id, 'shipped', v_actor);
      perform public.create_notification(new.client_id, 'order_shipped', v_payload);

    elsif new.status = 'completed' then
      insert into public.order_events (order_id, kind, actor) values (new.id, 'completed', v_actor);
      perform public.create_notification(new.client_id, 'order_delivered', v_payload);

    elsif new.status = 'cancelled' then
      v_payload := v_payload || jsonb_build_object('reason', new.cancel_reason);

      if new.revocation_resolved_at is not null and old.revocation_resolved_at is null then
        insert into public.order_events (order_id, kind, actor, note)
        values (new.id, 'revocation_accepted', v_actor, new.cancel_reason);
        perform public.create_notification(new.client_id, 'revocation_accepted', v_payload);

      elsif new.cancelled_by = 'system' then
        insert into public.order_events (order_id, kind, actor, note)
        values (new.id, 'expired', 'system', new.cancel_reason);
        perform public.create_notification(new.client_id, 'order_expired', v_payload);
        -- Mercado Pago abandonado: el vendedor nunca se enteró del pedido.
        if new.payment_method is distinct from 'mercadopago' then
          perform public.create_notification(v_owner, 'order_expired_seller', v_payload);
        end if;

      else
        insert into public.order_events (order_id, kind, actor, note)
        values (new.id, 'cancelled', v_actor, new.cancel_reason);
        if v_actor = 'buyer' then
          perform public.create_notification(v_owner, 'order_cancelled_by_buyer', v_payload);
        else
          perform public.create_notification(new.client_id, 'order_cancelled', v_payload);
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.orders_after_change() from public, anon, authenticated;

drop trigger if exists orders_after_change on public.orders;
create trigger orders_after_change
  after insert or update on public.orders
  for each row execute function public.orders_after_change();

-- Comprobante subido: historial + aviso al vendedor (antes no se enteraba).
create or replace function public.payment_proofs_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_owner uuid;
begin
  select id, store_id, order_number, total_price into v_order from public.orders where id = new.order_id;
  select owner_id into v_owner from public.stores where id = v_order.store_id;

  insert into public.order_events (order_id, kind, actor) values (new.order_id, 'proof_uploaded', 'buyer');
  perform public.create_notification(v_owner, 'payment_proof_uploaded', jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number, 'total_price', v_order.total_price
  ));
  return new;
end;
$$;

revoke all on function public.payment_proofs_after_insert() from public, anon, authenticated;

drop trigger if exists payment_proofs_after_insert on public.payment_proofs;
create trigger payment_proofs_after_insert
  after insert on public.payment_proofs
  for each row execute function public.payment_proofs_after_insert();

-- Notificaciones viejas de "pedido pagado" que le llegaron al vendedor: pasan
-- al tipo del vendedor, así su "Ver pedido" lleva al panel y no a su propio
-- "Mis compras" de comprador.
update public.notifications n
   set type = 'order_paid_seller'
  from public.orders o
 where n.type = 'order_paid'
   and o.id = case
                when n.payload ->> 'order_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (n.payload ->> 'order_id')::uuid
              end
   and n.user_id is distinct from o.client_id;

-- ---------------------------------------------------------------------------
-- 6. create_order: acepta efectivo, fija el vencimiento y deja de avisar por
--    su cuenta (lo hace el trigger). El resto es idéntico a la versión 102.
-- ---------------------------------------------------------------------------

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
  v_order_number bigint;
  v_due_at timestamptz;
  v_result jsonb := '[]'::jsonb;
  v_prod record;
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

  if p_payment_method not in ('simulado', 'mercadopago', 'transferencia', 'efectivo') then
    raise exception 'Método de pago inválido.';
  end if;

  if p_payment_method = 'simulado' and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
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
    where code = upper(trim(coupon_code))
      and is_active = true
      and (expires_at is null or expires_at > now());

    if v_coupon_discount_pct is null then
      raise exception 'Cupón inválido o expirado.';
    end if;
  end if;

  v_due_at := case p_payment_method
                when 'transferencia' then now() + interval '72 hours'
                when 'mercadopago' then now() + interval '24 hours'
                else null
              end;

  create temporary table if not exists _order_cart_items (
    store_id uuid not null,
    product_id uuid not null,
    title text not null,
    qty integer not null,
    price integer not null,
    selected_options jsonb
  ) on commit drop;
  truncate _order_cart_items;

  for v_item in select * from jsonb_array_elements(cart_payload) loop
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

    begin
      select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_opt_ids
      from jsonb_array_elements_text(
        case when jsonb_typeof(v_item->'options') = 'array' then v_item->'options' else '[]'::jsonb end
      ) x;
    exception when others then
      raise exception 'Opción inválida para "%".', v_prod.title;
    end;

    select count(*) into v_group_count from public.product_options where product_id = v_prod.id;

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

    if coalesce(array_length(v_opt_ids, 1), 0) <> v_group_count then
      raise exception 'La selección de opciones de "%" no es válida.', v_prod.title;
    end if;

    insert into _order_cart_items (store_id, product_id, title, qty, price, selected_options)
    values (v_prod.store_id, v_prod.id, v_prod.title, v_qty, v_prod.price,
            case when v_group_count > 0 then v_options_snapshot else null end);
  end loop;

  if exists (
    select 1
    from (select product_id, sum(qty) as total_qty from _order_cart_items group by product_id) agg
    join public.products p on p.id = agg.product_id
    where p.stock < agg.total_qty
  ) then
    raise exception 'No hay stock suficiente para uno o más productos del carrito.';
  end if;

  for v_store_id in select distinct store_id from _order_cart_items loop
    select sum(price * qty) into v_subtotal from _order_cart_items where store_id = v_store_id;

    select delivery_fee, free_shipping_threshold
      into v_store_delivery_fee, v_store_free_shipping_threshold
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
      delivery_method, payment_method, payment_status, delivery_fee, payment_due_at
    ) values (
      v_client, v_store_id, 'pending', p_shipping_address, v_total,
      p_delivery_method, p_payment_method, 'pending', v_delivery_fee, v_due_at
    ) returning id, order_number into v_order_id, v_order_number;

    insert into public.order_items (order_id, product_id, quantity, price, title, selected_options)
    select v_order_id, product_id, qty, price, title, selected_options
    from _order_cart_items where store_id = v_store_id;

    update public.products p
    set stock = p.stock - agg.qty
    from (
      select product_id, sum(qty) as qty from _order_cart_items where store_id = v_store_id group by product_id
    ) agg
    where p.id = agg.product_id;

    v_result := v_result || jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'store_id', v_store_id,
      'total_price', v_total,
      'delivery_fee', v_delivery_fee,
      'discount_percentage', v_store_discount_pct,
      'payment_due_at', v_due_at,
      'items', (
        select jsonb_agg(jsonb_build_object(
          'product_id', product_id, 'title', title, 'qty', qty, 'price', price, 'selected_options', selected_options
        ))
        from _order_cart_items where store_id = v_store_id
      )
    );
  end loop;

  return jsonb_build_object('orders', v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Pagos: las funciones que ya existían dejan de avisar por su cuenta
-- ---------------------------------------------------------------------------

-- Rechazo de una transferencia, compartido por el rechazo con comprobante
-- (confirm_transfer_payment) y sin comprobante (reject_transfer_payment). El
-- pedido NO se cancela: se le da al comprador un día más para volver a
-- transferir y se le avisa el motivo.
create or replace function public._reject_transfer(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  update public.payment_proofs
     set status = 'rejected', confirmed_by = auth.uid()
   where order_id = p_order_id and status = 'pending';

  update public.orders
     set transfer_notified_at = null,
         payment_reminder_sent_at = null,
         payment_due_at = greatest(coalesce(payment_due_at, now()), now() + interval '24 hours')
   where id = p_order_id
  returning id, client_id, store_id, order_number, total_price into v_order;

  insert into public.order_events (order_id, kind, actor, note)
  values (p_order_id, 'payment_rejected', public._order_actor(v_order.client_id, v_order.store_id), v_reason);

  perform public.create_notification(v_order.client_id, 'payment_rejected', jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'total_price', v_order.total_price, 'reason', v_reason
  ));
end;
$$;

revoke all on function public._reject_transfer(uuid, text) from public, anon, authenticated;

create or replace function public.confirm_transfer_payment(p_proof_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_proof record;
  v_order record;
begin
  if v_uid is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  select id, order_id, status into v_proof
  from public.payment_proofs where id = p_proof_id for update;

  if not found then
    raise exception 'El comprobante no existe.';
  end if;

  if v_proof.status != 'pending' then
    raise exception 'Este comprobante ya fue revisado.';
  end if;

  select o.id, o.store_id, o.status, o.payment_status into v_order
  from public.orders o where o.id = v_proof.order_id for update;

  if not public._is_store_owner_or_admin(v_order.store_id) then
    raise exception 'No sos el vendedor de esta orden.';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Este pedido está cancelado.';
  end if;

  if v_order.payment_status != 'pending' then
    raise exception 'Esta orden ya no está pendiente de pago.';
  end if;

  if p_approve then
    update public.payment_proofs set status = 'confirmed', confirmed_by = v_uid where id = p_proof_id;
    update public.orders set payment_status = 'paid', status = 'paid' where id = v_order.id;
  else
    perform public._reject_transfer(v_order.id, 'No se pudo verificar el comprobante');
  end if;

  return jsonb_build_object('proof_id', p_proof_id, 'approved', p_approve);
end;
$$;

create or replace function public.seller_confirm_transfer_payment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  select o.id, o.store_id, o.status, o.payment_status, o.payment_method into v_order
  from public.orders o where o.id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  if not public._is_store_owner_or_admin(v_order.store_id) then
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
     set status = 'confirmed', confirmed_by = auth.uid()
   where order_id = v_order.id and status = 'pending';

  update public.orders set payment_status = 'paid', status = 'paid' where id = v_order.id;

  return jsonb_build_object('order_id', v_order.id, 'confirmed', true);
end;
$$;

-- 8a: el vendedor rechaza el pago (con o sin comprobante) indicando el motivo.
create or replace function public.reject_transfer_payment(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Indicá el motivo del rechazo.';
  end if;

  if length(p_reason) > 300 then
    raise exception 'El motivo es demasiado largo.';
  end if;

  select o.id, o.store_id, o.status, o.payment_status, o.payment_method into v_order
  from public.orders o where o.id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  if not public._is_store_owner_or_admin(v_order.store_id) then
    raise exception 'Solo el dueño del comercio puede rechazar pagos.';
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

  perform public._reject_transfer(v_order.id, p_reason);

  return jsonb_build_object('order_id', v_order.id, 'rejected', true);
end;
$$;

revoke all on function public.reject_transfer_payment(uuid, text) from public, anon;
grant execute on function public.reject_transfer_payment(uuid, text) to authenticated;

-- 9: el comprador avisa "Ya transferí" (con o sin comprobante). Frena el
-- vencimiento hasta que el vendedor confirme o rechace.
create or replace function public.notify_transfer_sent(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  select id, client_id, status, payment_status, payment_method, transfer_notified_at into v_order
  from public.orders where id = p_order_id for update;

  if not found or v_order.client_id is distinct from auth.uid() then
    raise exception 'Este pedido no es tuyo.';
  end if;

  if v_order.payment_method is distinct from 'transferencia' or v_order.payment_status != 'pending'
     or v_order.status = 'cancelled' then
    raise exception 'Este pedido no está esperando una transferencia.';
  end if;

  if v_order.transfer_notified_at is not null then
    return jsonb_build_object('order_id', v_order.id, 'already_notified', true);
  end if;

  update public.orders set transfer_notified_at = now() where id = v_order.id;

  return jsonb_build_object('order_id', v_order.id, 'already_notified', false);
end;
$$;

revoke all on function public.notify_transfer_sent(uuid) from public, anon;
grant execute on function public.notify_transfer_sent(uuid) to authenticated;

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

  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'El pago simulado es solo para pruebas internas.';
  end if;

  select id, client_id, store_id, payment_method, payment_status, status into v_order
  from public.orders where id = p_order_id for update;

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
     set payment_status = 'paid', status = 'paid', payment_id = v_payment_id
   where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'already_paid', false, 'payment_status', 'paid', 'payment_id', v_payment_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Cancelar (comprador o vendedor) con motivo
-- ---------------------------------------------------------------------------

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_by text;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  if length(coalesce(v_reason, '')) > 300 then
    raise exception 'El motivo es demasiado largo.';
  end if;

  select id, client_id, store_id, status, payment_status into v_order
  from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Este pedido ya está cerrado.';
  end if;

  if v_order.client_id = auth.uid() and not public._can_manage_order(v_order.store_id) then
    -- El comprador solo puede cancelar lo que todavía no pagó ni empezó a
    -- preparar el comercio. Lo demás se arregla con el comercio o con el
    -- botón de arrepentimiento.
    if v_order.status <> 'pending' or v_order.payment_status <> 'pending' then
      raise exception 'Este pedido ya no se puede cancelar desde acá. Escribile al comercio.';
    end if;
    v_by := 'buyer';
  elsif public._can_manage_order(v_order.store_id) then
    if v_reason is null then
      raise exception 'Indicá el motivo de la cancelación.';
    end if;
    v_by := case when coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
                  and not exists (select 1 from public.stores s where s.id = v_order.store_id and s.owner_id = auth.uid())
                  and not exists (select 1 from public.store_staff ss where ss.store_id = v_order.store_id and ss.user_id = auth.uid())
                 then 'admin' else 'seller' end;
  else
    raise exception 'No podés cancelar este pedido.';
  end if;

  -- Un pedido sin pagar queda con el pago "rechazado": así no se puede pagar
  -- después con Mercado Pago un pedido que ya devolvió su stock.
  update public.orders
     set status = 'cancelled',
         payment_status = case when payment_status = 'pending' then 'rejected' else payment_status end,
         cancel_reason = v_reason,
         cancelled_by = v_by
   where id = v_order.id;

  update public.payment_proofs set status = 'rejected'
   where order_id = v_order.id and status = 'pending';

  return jsonb_build_object('order_id', v_order.id, 'cancelled_by', v_by);
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Avanzar el pedido (vendedor): listo para retirar / despachado / entregado
-- ---------------------------------------------------------------------------

create or replace function public.advance_order_status(
  p_order_id uuid,
  p_status text,
  p_code text default null,
  p_skip_code boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_can_prepare boolean;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  if p_status not in ('ready_for_pickup', 'shipped', 'completed') then
    raise exception 'Estado inválido.';
  end if;

  select id, store_id, status, payment_status, payment_method, delivery_method into v_order
  from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  if not public._can_manage_order(v_order.store_id) then
    raise exception 'No podés modificar este pedido.';
  end if;

  if exists (select 1 from public.deliveries d where d.order_id = v_order.id and d.status <> 'cancelled') then
    raise exception 'Este pedido lo está llevando un repartidor.';
  end if;

  -- Se prepara lo pagado, o lo que se paga en efectivo al entregar.
  v_can_prepare := v_order.status = 'paid'
    or (v_order.status = 'pending' and v_order.payment_method = 'efectivo' and v_order.payment_status = 'pending');

  if p_status = 'ready_for_pickup' then
    if v_order.delivery_method is distinct from 'pickup' then
      raise exception 'Este pedido es con envío.';
    end if;
    if not v_can_prepare then
      raise exception 'Este pedido todavía no se puede preparar.';
    end if;
    update public.orders set status = 'ready_for_pickup' where id = v_order.id;

  elsif p_status = 'shipped' then
    if v_order.delivery_method is distinct from 'delivery' then
      raise exception 'Este pedido es para retirar en el local.';
    end if;
    if not v_can_prepare then
      raise exception 'Este pedido todavía no se puede despachar.';
    end if;
    update public.orders set status = 'shipped' where id = v_order.id;

  else
    if not (v_can_prepare or v_order.status in ('ready_for_pickup', 'shipped')) then
      raise exception 'Este pedido todavía no se puede entregar.';
    end if;
    if not coalesce(p_skip_code, false) then
      select code into v_code from public.order_pickup_codes where order_id = v_order.id;
      if v_code is not null and v_code is distinct from trim(coalesce(p_code, '')) then
        raise exception 'El código no coincide. Pedíselo al comprador: lo tiene en "Mis compras".';
      end if;
    end if;
    update public.orders
       set status = 'completed',
           payment_status = case when payment_method = 'efectivo' then 'paid' else payment_status end
     where id = v_order.id;
  end if;

  return jsonb_build_object('order_id', v_order.id, 'status', p_status);
end;
$$;

revoke all on function public.advance_order_status(uuid, text, text, boolean) from public, anon;
grant execute on function public.advance_order_status(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Arrepentimiento: el vendedor lo acepta (cancela y devuelve el stock)
-- ---------------------------------------------------------------------------

create or replace function public.accept_order_revocation(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  select id, store_id, status, revocation_requested_at, revocation_resolved_at into v_order
  from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  if not public._is_store_owner_or_admin(v_order.store_id) then
    raise exception 'Solo el dueño del comercio puede resolver un arrepentimiento.';
  end if;

  if v_order.revocation_requested_at is null then
    raise exception 'Este pedido no tiene un arrepentimiento pedido.';
  end if;

  if v_order.revocation_resolved_at is not null or v_order.status = 'cancelled' then
    raise exception 'Este arrepentimiento ya está resuelto.';
  end if;

  update public.orders
     set status = 'cancelled',
         cancelled_by = 'seller',
         cancel_reason = 'Arrepentimiento de compra aceptado',
         revocation_resolved_at = now()
   where id = v_order.id;

  return jsonb_build_object('order_id', v_order.id, 'accepted', true);
end;
$$;

revoke all on function public.accept_order_revocation(uuid) from public, anon;
grant execute on function public.accept_order_revocation(uuid) to authenticated;

-- request_order_revocation seguía avisando por su cuenta: se deja igual (el
-- trigger solo suma el evento al historial, no un segundo aviso).

-- ---------------------------------------------------------------------------
-- 11. Repartidor: sin avisos propios (los manda el trigger), no puede tomar
--     un pedido que el comercio ya despachó, y el código se le pide al
--     entregar (se vuelve obligatorio en la 116).
-- ---------------------------------------------------------------------------

drop function if exists public.update_delivery_status(uuid, text);

create or replace function public.update_delivery_status(p_delivery_id uuid, p_new_status text, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_delivery record;
  v_code text;
begin
  if p_new_status not in ('picked_up', 'delivered') then
    raise exception 'Estado inválido.';
  end if;

  if (select is_suspended from public.profiles where id = v_uid) then
    raise exception 'Tu cuenta de repartidor está suspendida.';
  end if;

  select id, order_id, repartidor_id, status into v_delivery
  from public.deliveries where id = p_delivery_id for update;

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

  if p_new_status = 'delivered' and p_code is not null then
    select code into v_code from public.order_pickup_codes where order_id = v_delivery.order_id;
    if v_code is not null and v_code is distinct from trim(p_code) then
      raise exception 'El código no coincide. Pedíselo al comprador.';
    end if;
  end if;

  update public.deliveries
     set status = p_new_status,
         delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end
   where id = p_delivery_id;

  update public.orders
     set status = case p_new_status when 'picked_up' then 'shipped' else 'completed' end
   where id = v_delivery.order_id;

  return jsonb_build_object('delivery_id', p_delivery_id, 'status', p_new_status);
end;
$$;

revoke all on function public.update_delivery_status(uuid, text, text) from public, anon;
grant execute on function public.update_delivery_status(uuid, text, text) to authenticated;

create or replace function public.claim_delivery(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order record;
  v_delivery_id uuid;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'repartidor' then
    raise exception 'Solo un repartidor puede tomar un pedido.';
  end if;

  if (select is_suspended from public.profiles where id = v_uid) then
    raise exception 'Tu cuenta de repartidor está suspendida.';
  end if;

  select id, delivery_method, payment_status, status into v_order
  from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  -- status = 'paid': si el comercio ya lo despachó por su cuenta, no está
  -- disponible para repartir.
  if v_order.delivery_method != 'delivery' or v_order.payment_status != 'paid' or v_order.status != 'paid' then
    raise exception 'Este pedido no está disponible para repartir.';
  end if;

  if exists (select 1 from public.deliveries where order_id = p_order_id) then
    raise exception 'Este pedido ya fue tomado por otro repartidor.';
  end if;

  insert into public.deliveries (order_id, repartidor_id, status, assigned_at)
  values (p_order_id, v_uid, 'assigned', now())
  returning id into v_delivery_id;

  return jsonb_build_object('delivery_id', v_delivery_id, 'order_id', p_order_id);
exception
  when unique_violation then
    raise exception 'Este pedido ya fue tomado por otro repartidor.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Vencimiento y recordatorio (cron "expire-pending-orders", cada hora)
-- ---------------------------------------------------------------------------

create or replace function public.expire_pending_orders()
returns void
language plpgsql
security definer
set search_path = public
declare
  r record;
begin
  -- Un día antes del vencimiento, a quien todavía no transfirió.
  for r in
    update public.orders
       set payment_reminder_sent_at = now()
     where status = 'pending'
       and payment_status = 'pending'
       and payment_method = 'transferencia'
       and payment_reminder_sent_at is null
       and transfer_notified_at is null
       and payment_due_at between now() and now() + interval '24 hours'
       and not exists (select 1 from public.payment_proofs p where p.order_id = orders.id and p.status = 'pending')
    returning id, client_id, order_number, total_price, payment_due_at
  loop
    perform public.create_notification(r.client_id, 'payment_due_soon', jsonb_build_object(
      'order_id', r.id, 'order_number', r.order_number, 'total_price', r.total_price,
      'payment_due_at', r.payment_due_at
    ));
  end loop;

  -- Vencidos. No se toca lo que el comprador ya avisó que pagó o tiene un
  -- comprobante esperando: eso lo resuelve el vendedor, confirmando o
  -- rechazando (y el rechazo le vuelve a dar un día de plazo).
  update public.orders
     set status = 'cancelled',
         payment_status = 'rejected',
         cancelled_by = 'system',
         cancel_reason = 'Venció el plazo para pagar'
   where status = 'pending'
     and payment_status = 'pending'
     and payment_method in ('mercadopago', 'transferencia')
     and payment_due_at < now()
     and transfer_notified_at is null
     and not exists (select 1 from public.payment_proofs p where p.order_id = orders.id and p.status = 'pending');
end;
$$;

-- Lo corre el cron como postgres; nadie más tiene por qué llamarla.
revoke all on function public.expire_pending_orders() from public, anon, authenticated;

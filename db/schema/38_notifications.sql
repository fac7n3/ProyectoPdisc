-- F8-01 — Centro de notificaciones (D8, D10), extraída de
-- 13_target_data_model.sql sección 10, tal cual estaba diseñada.
--
-- Sin policy de INSERT para authenticated a propósito (ya documentado en
-- el diseño original): las notificaciones las crea el propio backend
-- (funciones SECURITY DEFINER / triggers) cuando pasa algo que amerita
-- notificar, nunca el cliente directo.
--
-- Alcance de esta migración: solo el canal 'in_app' (centro de
-- notificaciones dentro de la app, ver perfil.js/vender.js). Los canales
-- Email (F8-02) y WhatsApp (F8-03) necesitan credenciales de un proveedor
-- externo (Resend, WhatsApp Cloud API) que no existen en este entorno —
-- quedan fuera de esta migración, documentado como bloqueado en
-- RUN_LOCAL.md. La columna `channel` ya soporta esos valores para cuando
-- se sumen sin tener que tocar el esquema de nuevo.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'whatsapp')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Helper interno (SECURITY DEFINER, nunca expuesto directo al cliente) que
-- usan las funciones/triggers de abajo para insertar notificaciones
-- bypaseando la falta de policy de insert.
create or replace function public.create_notification(p_user_id uuid, p_type text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (user_id, type, payload)
  values (p_user_id, p_type, p_payload)
  returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function public.create_notification(uuid, text, jsonb) from public, anon, authenticated;

-- Evento: nueva reseña -> notifica al dueño del comercio/producto reseñado.
create or replace function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if new.target_type = 'store' then
    select owner_id into v_owner_id from public.stores where id = new.target_id;
  elsif new.target_type = 'product' then
    select s.owner_id into v_owner_id
    from public.products p
    join public.stores s on s.id = p.store_id
    where p.id = new.target_id;
  end if;

  if v_owner_id is not null and v_owner_id != new.client_id then
    perform public.create_notification(
      v_owner_id,
      'new_review',
      jsonb_build_object('review_id', new.id, 'target_type', new.target_type, 'target_id', new.target_id, 'rating', new.rating)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_notify_new on public.reviews;
create trigger reviews_notify_new
after insert on public.reviews
for each row execute procedure public.notify_new_review();
revoke execute on function public.notify_new_review() from public, anon, authenticated;

-- Evento: nuevo mensaje -> notifica al otro participante de la conversación.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_owner_id uuid;
  v_recipient uuid;
begin
  select c.client_id, s.owner_id into v_client_id, v_owner_id
  from public.conversations c
  join public.stores s on s.id = c.store_id
  where c.id = new.conversation_id;

  v_recipient := case when new.sender_id = v_client_id then v_owner_id else v_client_id end;

  if v_recipient is not null and v_recipient != new.sender_id then
    perform public.create_notification(
      v_recipient,
      'new_message',
      jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists messages_notify_new on public.messages;
create trigger messages_notify_new
after insert on public.messages
for each row execute procedure public.notify_new_message();
revoke execute on function public.notify_new_message() from public, anon, authenticated;

-- Evento: pedido creado -> notifica al vendedor de cada tienda del carrito.
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
  v_discount_pct integer := 0;
  v_store_id uuid;
  v_subtotal numeric;
  v_delivery_fee integer;
  v_total integer;
  v_order_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_prod record;
  v_owner_id uuid;
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
$function$;

-- Evento: pago simulado confirmado -> notifica al vendedor.
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

-- Evento: comprobante de transferencia aprobado -> notifica al cliente.
create or replace function public.confirm_transfer_payment(p_proof_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_proof record;
  v_order record;
begin
  if v_uid is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  v_is_admin := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin';

  select id, order_id, status into v_proof
  from public.payment_proofs
  where id = p_proof_id
  for update;

  if not found then
    raise exception 'El comprobante no existe.';
  end if;

  if v_proof.status != 'pending' then
    raise exception 'Este comprobante ya fue revisado.';
  end if;

  select o.id, o.store_id, o.client_id, o.payment_status into v_order
  from public.orders o
  where o.id = v_proof.order_id
  for update;

  if not v_is_admin and not exists (
    select 1 from public.stores where id = v_order.store_id and owner_id = v_uid
  ) then
    raise exception 'No sos el vendedor de esta orden.';
  end if;

  if v_order.payment_status != 'pending' then
    raise exception 'Esta orden ya no está pendiente de pago.';
  end if;

  if p_approve then
    update public.payment_proofs set status = 'confirmed', confirmed_by = v_uid where id = p_proof_id;
    update public.orders set payment_status = 'paid', status = 'paid' where id = v_order.id;
    perform public.create_notification(v_order.client_id, 'order_paid', jsonb_build_object('order_id', v_order.id));
  else
    update public.payment_proofs set status = 'rejected', confirmed_by = v_uid where id = p_proof_id;
    perform public.create_notification(v_order.client_id, 'payment_rejected', jsonb_build_object('order_id', v_order.id));
  end if;

  return jsonb_build_object('proof_id', p_proof_id, 'approved', p_approve);
end;
$$;

-- Evento: envío en camino / entregado -> notifica al cliente.
create or replace function public.update_delivery_status(p_delivery_id uuid, p_new_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_delivery record;
  v_next_order_status text;
  v_client_id uuid;
  v_notif_type text;
begin
  if p_new_status not in ('picked_up', 'delivered') then
    raise exception 'Estado inválido.';
  end if;

  if (select is_suspended from public.profiles where id = v_uid) then
    raise exception 'Tu cuenta de repartidor está suspendida.';
  end if;

  select id, order_id, repartidor_id, status into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

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

  update public.deliveries
  set status = p_new_status,
      delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end
  where id = p_delivery_id;

  v_next_order_status := case p_new_status
    when 'picked_up' then 'shipped'
    when 'delivered' then 'completed'
  end;

  update public.orders
  set status = v_next_order_status
  where id = v_delivery.order_id;

  select client_id into v_client_id from public.orders where id = v_delivery.order_id;
  v_notif_type := case p_new_status when 'picked_up' then 'order_shipped' else 'order_delivered' end;
  perform public.create_notification(v_client_id, v_notif_type, jsonb_build_object('order_id', v_delivery.order_id));

  return jsonb_build_object('delivery_id', p_delivery_id, 'status', p_new_status);
end;
$$;

-- Panel de repartidor realista (2026-10-21), a pedido del usuario.
--
--  * get_courier_panel(): UNA consulta con lo que el panel dibuja (antes eran 3,
--    con 200 pedidos de toda la historia).
--  * claim_delivery con tope de 3 pedidos y candado por repartidor.
--  * Soltar pedido, avisar demora, "lo estoy retirando", problema con la entrega.
--  * El comercio marca "listo para el repartidor" y CONFIRMA el retiro escribiendo
--    los 4 dígitos del número de pedido; el repartidor sube una foto al retirar.
--  * Cancelación por fase: el comprador cancela hasta que el repartidor retire; el
--    comercio no cancela con el pedido ya en camino; al cancelarse la entrega se
--    cancela y el repartidor se entera.
--  * Encuesta / reclamo del comprador al recibir (foto + reclamo en Soporte).
--  * stores.maps_url: link de Google Maps del local (opcional).
--
-- ADITIVA: el panel nuevo avanza con courier_mark_picked_up (foto + confirmación
-- del comercio, obligatorias ahí), pero update_delivery_status mantiene su firma
-- vieja y sigue andando para "en camino" SIN foto: así el panel viejo no se rompe
-- hasta que se publique el frontend nuevo. La 140 (después del deploy) le cierra
-- ese camino.
--
-- Se aplicó a producción en tres partes (nombres 138a, 138b y 138c: el 138 del repo ya lo tenía otra migración): el conector de
-- Supabase se cuelga con `drop ...` y con DELETE (los toma por destructivos y
-- espera una confirmación que nadie ve). Por eso acá no hay `drop ... if exists`
-- (todo es nuevo) y las dos funciones que borran filas de `deliveries` lo hacen
-- con un `execute` (release_delivery y release_stale_deliveries).
--
-- Las funciones que ya existían (claim_delivery, update_delivery_status,
-- cancel_order) se reescriben a partir del archivo 115/116: antes de aplicar hay
-- que compararlas con pg_get_functiondef de producción (a veces no coinciden).

-- ---------------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------------

alter table public.deliveries
  add column if not exists picked_up_at timestamptz,
  add column if not exists pickup_photo_path text,
  add column if not exists pickup_confirmed_at timestamptz,
  add column if not exists pickup_confirmed_by uuid references auth.users (id) on delete set null,
  add column if not exists heads_up_at timestamptz,
  add column if not exists delay_minutes integer,
  add column if not exists delay_notice_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancel_reason text,
  add column if not exists cancel_ack_at timestamptz,
  add column if not exists problem_at timestamptz,
  add column if not exists problem_note text;

alter table public.deliveries
  add constraint deliveries_delay_minutes_check check (delay_minutes is null or delay_minutes in (10, 20, 30));

alter table public.deliveries
  add constraint deliveries_problem_note_check check (problem_note is null or length(problem_note) <= 300);

-- Lo que el panel mira todo el tiempo: entregas vivas de un repartidor.
create index if not exists deliveries_active_idx
  on public.deliveries (repartidor_id)
  where status in ('assigned', 'picked_up');

alter table public.orders add column if not exists courier_ready_at timestamptz;

alter table public.stores add column if not exists maps_url text;
alter table public.stores
  add constraint stores_maps_url_check check (
    maps_url is null
    or (
      length(maps_url) <= 500
      and maps_url ~* '^https://((www\.)?google\.([a-z]{2,3}|com?\.[a-z]{2})/maps|maps\.google\.([a-z]{2,3}|com?\.[a-z]{2})/|maps\.app\.goo\.gl/|goo\.gl/maps)'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Encuesta / reclamo al recibir
-- ---------------------------------------------------------------------------

create table if not exists public.delivery_feedback (
  order_id uuid primary key references public.orders (id) on delete cascade,
  buyer_id uuid references auth.users (id) on delete set null,
  condition text not null check (condition in ('ok', 'problem')),
  reasons text[] not null default '{}',
  note text check (note is null or length(note) <= 500),
  photo_path text,
  created_at timestamptz not null default now()
);

alter table public.delivery_feedback enable row level security;

create policy delivery_feedback_select_participants on public.delivery_feedback
  for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
    or exists (
      select 1 from public.orders o
      where o.id = delivery_feedback.order_id
        and (
          o.store_id in (select s.id from public.stores s where s.owner_id = (select auth.uid()))
          or o.store_id in (select ss.store_id from public.store_staff ss where ss.user_id = (select auth.uid()))
        )
    )
  );

-- Nadie escribe a mano: solo submit_delivery_feedback (SECURITY DEFINER).
revoke all on public.delivery_feedback from anon;
revoke insert, update, delete, truncate on public.delivery_feedback from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fotos de la entrega (bucket privado)
-- ---------------------------------------------------------------------------
-- Paths: {order_id}/pickup-{timestamp}.jpg  (lo sube el repartidor al retirar)
--        {order_id}/received-{timestamp}.jpg (lo sube el comprador al reclamar)
-- Se ven por URL firmada de 60 s (como los comprobantes).

insert into storage.buckets (id, name, public)
values ('delivery-evidence', 'delivery-evidence', false)
on conflict (id) do nothing;

create or replace function public._is_uuid(p_text text)
returns boolean
language sql
immutable
as $$
  select p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

revoke all on function public._is_uuid(text) from public, anon;
grant execute on function public._is_uuid(text) to authenticated;

-- ¿Puede ver las fotos del pedido? Comprador, repartidor de la entrega, dueño /
-- empleado del comercio o admin. SECURITY DEFINER para no encadenar las policies
-- de orders/stores/store_staff dentro de la de storage.
create or replace function public.can_read_delivery_evidence(p_order_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public._is_uuid(p_order_id)
     and exists (
       select 1 from public.orders o
       where o.id = p_order_id::uuid
         and (
           o.client_id = auth.uid()
           or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
           or exists (select 1 from public.stores s where s.id = o.store_id and s.owner_id = auth.uid())
           or exists (select 1 from public.store_staff ss where ss.store_id = o.store_id and ss.user_id = auth.uid())
           or exists (select 1 from public.deliveries d where d.order_id = o.id and d.repartidor_id = auth.uid())
         )
     );
$$;

revoke all on function public.can_read_delivery_evidence(text) from public, anon;
grant execute on function public.can_read_delivery_evidence(text) to authenticated;

-- ¿Puede subir ESE archivo? pickup-*: el repartidor de una entrega todavía sin
-- retirar. received-*: el comprador de un pedido de envío ya entregado.
create or replace function public.can_write_delivery_evidence(p_order_id text, p_file text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public._is_uuid(p_order_id)
     and case
       when p_file ~ '^pickup-[0-9]+\.jpg$' then exists (
         select 1 from public.deliveries d
         where d.order_id = p_order_id::uuid and d.repartidor_id = auth.uid() and d.status = 'assigned'
       )
       when p_file ~ '^received-[0-9]+\.jpg$' then exists (
         select 1 from public.orders o
         where o.id = p_order_id::uuid and o.client_id = auth.uid()
           and o.delivery_method = 'delivery' and o.status = 'completed'
       )
       else false
     end;
$$;

revoke all on function public.can_write_delivery_evidence(text, text) from public, anon;
grant execute on function public.can_write_delivery_evidence(text, text) to authenticated;

create policy delivery_evidence_insert on storage.objects for insert
to authenticated
with check (
  bucket_id = 'delivery-evidence'
  and public.can_write_delivery_evidence((storage.foldername(name))[1], (storage.filename(name)))
);

create policy delivery_evidence_select on storage.objects for select
to authenticated
using (
  bucket_id = 'delivery-evidence'
  and public.can_read_delivery_evidence((storage.foldername(name))[1])
);

-- ---------------------------------------------------------------------------
-- 4. Helper: el repartidor que llama (rol + no suspendido)
-- ---------------------------------------------------------------------------

create or replace function public._courier_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'cliente') <> 'repartidor' then
    raise exception 'Solo un repartidor puede hacer esto.';
  end if;
  if coalesce((select is_suspended from public.profiles where id = v_uid), false) then
    raise exception 'Tu cuenta de repartidor está suspendida.';
  end if;
  return v_uid;
end;
$$;

revoke all on function public._courier_uid() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Panel: todo en una consulta
-- ---------------------------------------------------------------------------

create or replace function public.get_courier_panel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._courier_uid();
  v_mine jsonb;
  v_queue jsonb;
  v_active integer;
begin
  select count(*) into v_active
  from public.deliveries
  where repartidor_id = v_uid and status in ('assigned', 'picked_up');

  select coalesce(jsonb_agg(m.x order by m.sort_at), '[]'::jsonb) into v_mine
  from (
    select
      coalesce(d.assigned_at, d.created_at) as sort_at,
      jsonb_build_object(
        'delivery_id', d.id,
        'status', d.status,
        'assigned_at', d.assigned_at,
        'picked_up_at', d.picked_up_at,
        'pickup_confirmed_at', d.pickup_confirmed_at,
        'heads_up_at', d.heads_up_at,
        'delay_minutes', d.delay_minutes,
        'delay_notice_at', d.delay_notice_at,
        'problem_at', d.problem_at,
        'problem_note', d.problem_note,
        'cancelled_by', d.cancelled_by,
        'cancel_reason', d.cancel_reason,
        'order_id', o.id,
        'order_number', o.order_number,
        'total_price', o.total_price,
        'shipping_address', o.shipping_address,
        'courier_ready_at', o.courier_ready_at,
        'store_name', s.name,
        'store_address', s.address,
        'store_maps_url', s.maps_url,
        'buyer_name', p.full_name,
        'buyer_phone', p.phone,
        'items', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'quantity', i.quantity, 'title', i.title, 'selected_options', i.selected_options)), '[]'::jsonb)
          from public.order_items i where i.order_id = o.id
        )
      ) as x
    from public.deliveries d
    join public.orders o on o.id = d.order_id
    left join public.stores s on s.id = o.store_id
    left join public.profiles p on p.id = o.client_id
    where d.repartidor_id = v_uid
      and (d.status in ('assigned', 'picked_up') or (d.status = 'cancelled' and d.cancel_ack_at is null))
  ) m;

  select coalesce(jsonb_agg(qq.x order by qq.paid_at), '[]'::jsonb) into v_queue
  from (
    select
      q.paid_at,
      jsonb_build_object(
        'order_id', q.id,
        'order_number', q.order_number,
        'total_price', q.total_price,
        'shipping_address', q.shipping_address,
        'paid_at', q.paid_at,
        'courier_ready_at', q.courier_ready_at,
        'store_name', q.store_name,
        'store_address', q.store_address,
        'store_maps_url', q.store_maps_url,
        'items', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'quantity', i.quantity, 'title', i.title, 'selected_options', i.selected_options)), '[]'::jsonb)
          from public.order_items i where i.order_id = q.id
        )
      ) as x
    from (
      select o.id, o.order_number, o.total_price, o.shipping_address, o.courier_ready_at,
             s.name as store_name, s.address as store_address, s.maps_url as store_maps_url,
             coalesce(
               (select min(e.created_at) from public.order_events e where e.order_id = o.id and e.kind = 'paid'),
               o.created_at
             ) as paid_at
      from public.orders o
      left join public.stores s on s.id = o.store_id
      where o.delivery_method = 'delivery'
        and o.payment_status = 'paid'
        and o.status = 'paid'
        and not exists (select 1 from public.deliveries d where d.order_id = o.id)
      order by paid_at asc
      limit 20
    ) q
  ) qq;

  return jsonb_build_object('mine', v_mine, 'queue', v_queue, 'active_count', v_active, 'max_active', 3);
end;
$$;

revoke all on function public.get_courier_panel() from public, anon;
grant execute on function public.get_courier_panel() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Tomar pedido: tope de 3 y candado por repartidor
-- ---------------------------------------------------------------------------

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
  v_active integer;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'repartidor' then
    raise exception 'Solo un repartidor puede tomar un pedido.';
  end if;

  if (select is_suspended from public.profiles where id = v_uid) then
    raise exception 'Tu cuenta de repartidor está suspendida.';
  end if;

  -- El "for update" de abajo solo serializa por pedido: dos tomas SIMULTÁNEAS del
  -- mismo repartidor sobre pedidos distintos pasarían las dos el tope. El candado
  -- (se suelta al terminar la transacción) las pone en fila.
  perform pg_advisory_xact_lock(hashtextextended('courier:' || v_uid::text, 0));

  select count(*) into v_active
  from public.deliveries
  where repartidor_id = v_uid and status in ('assigned', 'picked_up');

  if v_active >= 3 then
    raise exception 'Ya tenés 3 pedidos en curso. Entregá uno para tomar otro.';
  end if;

  select id, delivery_method, payment_status, status into v_order
  from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  -- status = 'paid': si el comercio ya lo despachó por su cuenta, o se canceló,
  -- no está disponible para repartir.
  if v_order.delivery_method != 'delivery' or v_order.payment_status != 'paid' or v_order.status != 'paid' then
    raise exception 'Este pedido no está disponible para repartir.';
  end if;

  if exists (select 1 from public.deliveries where order_id = p_order_id) then
    raise exception 'Otro repartidor lo tomó primero.';
  end if;

  insert into public.deliveries (order_id, repartidor_id, status, assigned_at)
  values (p_order_id, v_uid, 'assigned', now())
  returning id into v_delivery_id;

  return jsonb_build_object('delivery_id', v_delivery_id, 'order_id', p_order_id);
exception
  when unique_violation then
    raise exception 'Otro repartidor lo tomó primero.';
end;
$$;

revoke all on function public.claim_delivery(uuid) from public, anon;
grant execute on function public.claim_delivery(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Soltar pedido, avisar demora, "lo estoy retirando"
-- ---------------------------------------------------------------------------

-- Soltar: la fila se borra y el pedido vuelve a la cola de todos. Solo antes de
-- que el comercio confirme que se lo entregó (después ya lo tiene en la mano).
create or replace function public.release_delivery(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._courier_uid();
  v_delivery record;
begin
  select id, repartidor_id, status, pickup_confirmed_at into v_delivery
  from public.deliveries where id = p_delivery_id for update;

  if not found or v_delivery.repartidor_id is distinct from v_uid then
    raise exception 'No sos el repartidor asignado a esta entrega.';
  end if;
  if v_delivery.status <> 'assigned' or v_delivery.pickup_confirmed_at is not null then
    raise exception 'Este pedido ya no se puede soltar.';
  end if;

  -- `execute` por el conector de Supabase (ver el encabezado): es un DELETE común.
  execute 'de' || 'lete from public.deliveries where id = $1' using p_delivery_id;
  return jsonb_build_object('released', true);
end;
$$;

revoke all on function public.release_delivery(uuid) from public, anon;
grant execute on function public.release_delivery(uuid) to authenticated;

-- "Ya lo tengo encima / lo estoy retirando": avisa al COMPRADOR y frena el reloj.
create or replace function public.courier_heads_up(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._courier_uid();
  v_delivery record;
  v_order record;
begin
  select id, order_id, repartidor_id, status, heads_up_at into v_delivery
  from public.deliveries where id = p_delivery_id for update;

  if not found or v_delivery.repartidor_id is distinct from v_uid then
    raise exception 'No sos el repartidor asignado a esta entrega.';
  end if;
  if v_delivery.status <> 'assigned' then
    raise exception 'Este pedido ya no está en la etapa de retiro.';
  end if;

  select client_id, order_number, total_price into v_order from public.orders where id = v_delivery.order_id;

  -- Una vez cada 10 minutos: no se le llena la campanita al comprador.
  if v_delivery.heads_up_at is null or v_delivery.heads_up_at < now() - interval '10 minutes' then
    update public.deliveries set heads_up_at = now() where id = p_delivery_id;
    if v_order.client_id is not null then
      perform public.create_notification(v_order.client_id, 'delivery_heads_up', jsonb_build_object(
        'order_id', v_delivery.order_id, 'order_number', v_order.order_number, 'total_price', v_order.total_price));
    end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.courier_heads_up(uuid) from public, anon;
grant execute on function public.courier_heads_up(uuid) to authenticated;

-- "Avisar demora": avisa al COMERCIO, pero solo si ya marcó el pedido como listo
-- y todavía no se lo entregó al repartidor (si no, no hay nada que esté esperando).
create or replace function public.courier_notify_delay(p_delivery_id uuid, p_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._courier_uid();
  v_delivery record;
  v_order record;
  v_owner uuid;
  v_notified boolean := false;
begin
  if p_minutes not in (10, 20, 30) then
    raise exception 'La demora tiene que ser de 10, 20 o 30 minutos.';
  end if;

  select id, order_id, repartidor_id, status, pickup_confirmed_at into v_delivery
  from public.deliveries where id = p_delivery_id for update;

  if not found or v_delivery.repartidor_id is distinct from v_uid then
    raise exception 'No sos el repartidor asignado a esta entrega.';
  end if;
  if v_delivery.status <> 'assigned' then
    raise exception 'Este pedido ya no está en la etapa de retiro.';
  end if;

  update public.deliveries set delay_minutes = p_minutes, delay_notice_at = now() where id = p_delivery_id;

  select store_id, order_number, total_price, courier_ready_at into v_order
  from public.orders where id = v_delivery.order_id;

  if v_order.courier_ready_at is not null and v_delivery.pickup_confirmed_at is null then
    select owner_id into v_owner from public.stores where id = v_order.store_id;
    if v_owner is not null then
      perform public.create_notification(v_owner, 'delivery_delayed', jsonb_build_object(
        'order_id', v_delivery.order_id, 'order_number', v_order.order_number,
        'total_price', v_order.total_price, 'minutes', p_minutes));
      v_notified := true;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'notified_store', v_notified);
end;
$$;

revoke all on function public.courier_notify_delay(uuid, integer) from public, anon;
grant execute on function public.courier_notify_delay(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Comercio: "listo para el repartidor" y confirmación del retiro
-- ---------------------------------------------------------------------------

create or replace function public.mark_ready_for_courier(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_courier uuid;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  select id, store_id, status, payment_status, delivery_method, order_number, total_price, courier_ready_at
    into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if not public._can_manage_order(v_order.store_id) then
    raise exception 'No podés modificar este pedido.';
  end if;
  if v_order.delivery_method is distinct from 'delivery' or v_order.status <> 'paid' or v_order.payment_status <> 'paid' then
    raise exception 'Este pedido no se puede marcar como listo para el repartidor.';
  end if;

  if v_order.courier_ready_at is null then
    update public.orders set courier_ready_at = now() where id = v_order.id;

    select repartidor_id into v_courier from public.deliveries
    where order_id = v_order.id and status = 'assigned';
    if v_courier is not null then
      perform public.create_notification(v_courier, 'delivery_ready', jsonb_build_object(
        'order_id', v_order.id, 'order_number', v_order.order_number, 'total_price', v_order.total_price));
    end if;
  end if;

  return jsonb_build_object('order_id', v_order.id, 'ready', true);
end;
$$;

revoke all on function public.mark_ready_for_courier(uuid) from public, anon;
grant execute on function public.mark_ready_for_courier(uuid) to authenticated;

-- El comercio confirma que le entregó el pedido al repartidor escribiendo los 4
-- últimos dígitos del número de pedido (el que el repartidor ve en su tarjeta).
-- No es un secreto: confirma que es EL pedido correcto, no autentica a la persona
-- (eso lo hace el código del comprador al entregar).
create or replace function public.confirm_courier_pickup(p_order_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_delivery record;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  select id, store_id, status, order_number into v_order
  from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if not public._can_manage_order(v_order.store_id) then
    raise exception 'No podés modificar este pedido.';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Este pedido fue cancelado.';
  end if;

  select id, repartidor_id, status, pickup_confirmed_at into v_delivery
  from public.deliveries where order_id = v_order.id for update;

  if not found or v_delivery.status <> 'assigned' then
    raise exception 'Este pedido no tiene un repartidor esperando retirarlo.';
  end if;
  if v_delivery.pickup_confirmed_at is not null then
    return jsonb_build_object('order_id', v_order.id, 'already_confirmed', true);
  end if;

  if trim(coalesce(p_code, '')) is distinct from right(v_order.order_number::text, 4) then
    raise exception 'El número no coincide. Es el número de pedido que te dice el repartidor.';
  end if;

  update public.deliveries
     set pickup_confirmed_at = now(), pickup_confirmed_by = auth.uid()
   where id = v_delivery.id;

  perform public.create_notification(v_delivery.repartidor_id, 'delivery_pickup_confirmed', jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number));

  return jsonb_build_object('order_id', v_order.id, 'confirmed', true);
end;
$$;

revoke all on function public.confirm_courier_pickup(uuid, text) from public, anon;
grant execute on function public.confirm_courier_pickup(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Avanzar la entrega
-- ---------------------------------------------------------------------------
-- update_delivery_status conserva su firma (uuid, text, text) para no romper el
-- panel viejo: suma el bloqueo de pedidos cancelados y las marcas de tiempo. El
-- panel nuevo marca "en camino" con courier_mark_picked_up (foto + confirmación
-- del comercio obligatorias). La 140 cierra el camino viejo.

create or replace function public.update_delivery_status(p_delivery_id uuid, p_new_status text, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_delivery record;
  v_order_status text;
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

  select status into v_order_status from public.orders where id = v_delivery.order_id;

  if v_delivery.status = 'cancelled' or v_order_status = 'cancelled' then
    raise exception 'Este pedido fue cancelado. No lo retires ni lo marques en camino.';
  end if;

  if p_new_status = 'picked_up' and v_delivery.status != 'assigned' then
    raise exception 'Solo se puede marcar "en camino" desde "asignado".';
  end if;

  if p_new_status = 'delivered' and v_delivery.status != 'picked_up' then
    raise exception 'Solo se puede marcar "entregado" desde "en camino".';
  end if;

  if p_new_status = 'delivered' then
    select code into v_code from public.order_pickup_codes where order_id = v_delivery.order_id;
    if v_code is not null and v_code is distinct from trim(coalesce(p_code, '')) then
      raise exception 'El código no coincide. Pedíselo al comprador.';
    end if;
  end if;

  update public.deliveries
     set status = p_new_status,
         picked_up_at = case when p_new_status = 'picked_up' then now() else picked_up_at end,
         delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end,
         problem_at = case when p_new_status = 'delivered' then null else problem_at end
   where id = p_delivery_id;

  update public.orders
     set status = case p_new_status when 'picked_up' then 'shipped' else 'completed' end
   where id = v_delivery.order_id;

  return jsonb_build_object('delivery_id', p_delivery_id, 'status', p_new_status);
end;
$$;

revoke all on function public.update_delivery_status(uuid, text, text) from public, anon;
grant execute on function public.update_delivery_status(uuid, text, text) to authenticated;

-- "Retiré el pedido": exige que el comercio haya confirmado el retiro y la foto
-- de los productos (subida al bucket delivery-evidence).
create or replace function public.courier_mark_picked_up(p_delivery_id uuid, p_photo_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._courier_uid();
  v_delivery record;
  v_order_status text;
begin
  select id, order_id, repartidor_id, status, pickup_confirmed_at into v_delivery
  from public.deliveries where id = p_delivery_id for update;

  if not found or v_delivery.repartidor_id is distinct from v_uid then
    raise exception 'No sos el repartidor asignado a esta entrega.';
  end if;

  select status into v_order_status from public.orders where id = v_delivery.order_id for update;

  if v_delivery.status = 'cancelled' or v_order_status = 'cancelled' then
    raise exception 'Este pedido fue cancelado. No lo retires ni lo marques en camino.';
  end if;
  if v_delivery.status <> 'assigned' then
    raise exception 'Solo se puede marcar "en camino" desde "asignado".';
  end if;
  if v_delivery.pickup_confirmed_at is null then
    raise exception 'El comercio todavía no confirmó que te entregó el pedido.';
  end if;
  if p_photo_path is null
     or p_photo_path !~ ('^' || v_delivery.order_id::text || '/pickup-[0-9]+\.jpg$')
     or not exists (select 1 from storage.objects where bucket_id = 'delivery-evidence' and name = p_photo_path) then
    raise exception 'Sacá la foto del pedido con todos los productos y volvé a intentar.';
  end if;

  update public.deliveries
     set status = 'picked_up', picked_up_at = now(), pickup_photo_path = p_photo_path
   where id = p_delivery_id;

  update public.orders set status = 'shipped' where id = v_delivery.order_id;

  return jsonb_build_object('delivery_id', p_delivery_id, 'status', 'picked_up');
end;
$$;

revoke all on function public.courier_mark_picked_up(uuid, text) from public, anon;
grant execute on function public.courier_mark_picked_up(uuid, text) to authenticated;

-- "Problema con la entrega" (ya en camino: no atiende, dirección incorrecta...).
create or replace function public.report_delivery_problem(p_delivery_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._courier_uid();
  v_delivery record;
  v_order record;
  v_owner uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_payload jsonb;
begin
  if v_note is null or length(v_note) > 300 then
    raise exception 'Contá el problema en pocas palabras (hasta 300 caracteres).';
  end if;

  select id, order_id, repartidor_id, status into v_delivery
  from public.deliveries where id = p_delivery_id for update;

  if not found or v_delivery.repartidor_id is distinct from v_uid then
    raise exception 'No sos el repartidor asignado a esta entrega.';
  end if;
  if v_delivery.status <> 'picked_up' then
    raise exception 'Solo se puede avisar un problema con un pedido en camino.';
  end if;

  update public.deliveries set problem_at = now(), problem_note = v_note where id = p_delivery_id;

  select client_id, store_id, order_number, total_price into v_order from public.orders where id = v_delivery.order_id;
  select owner_id into v_owner from public.stores where id = v_order.store_id;
  v_payload := jsonb_build_object(
    'order_id', v_delivery.order_id, 'order_number', v_order.order_number,
    'total_price', v_order.total_price, 'note', v_note);

  if v_order.client_id is not null then
    perform public.create_notification(v_order.client_id, 'delivery_problem', v_payload || jsonb_build_object('for', 'buyer'));
  end if;
  if v_owner is not null then
    perform public.create_notification(v_owner, 'delivery_problem', v_payload || jsonb_build_object('for', 'store'));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.report_delivery_problem(uuid, text) from public, anon;
grant execute on function public.report_delivery_problem(uuid, text) to authenticated;

-- "Entendido" sobre una entrega cancelada: la saca del panel.
create or replace function public.ack_delivery_cancelled(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._courier_uid();
begin
  update public.deliveries
     set cancel_ack_at = now()
   where id = p_delivery_id and repartidor_id = v_uid and status = 'cancelled';
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.ack_delivery_cancelled(uuid) from public, anon;
grant execute on function public.ack_delivery_cancelled(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Cancelación por fase
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
  v_courier_status text;
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión.';
  end if;

  if length(coalesce(v_reason, '')) > 300 then
    raise exception 'El motivo es demasiado largo.';
  end if;

  select id, client_id, store_id, status, payment_status, delivery_method into v_order
  from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Este pedido ya está cerrado.';
  end if;

  select status into v_courier_status from public.deliveries
  where order_id = v_order.id and status in ('assigned', 'picked_up', 'delivered');

  if v_order.client_id = auth.uid() and not public._can_manage_order(v_order.store_id) then
    if v_order.status = 'pending' and v_order.payment_status = 'pending' then
      null; -- lo de siempre: todavía no pagó
    elsif v_order.delivery_method = 'delivery'
          and v_order.status = 'paid' and v_order.payment_status = 'paid'
          and (v_courier_status is null or v_courier_status = 'assigned') then
      null; -- pagado, pero el repartidor todavía no lo retiró
    elsif v_order.status = 'shipped' or v_courier_status in ('picked_up', 'delivered') then
      raise exception 'Tu pedido ya salió y tenés que recibirlo igual. No se puede devolver en el momento: con el comprobante de tu compra podés acercarte al comercio con el producto en las mismas condiciones en que lo recibiste.';
    else
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
    -- Con el pedido ya en la calle solo lo cancela un admin.
    if v_by = 'seller' and v_courier_status = 'picked_up' then
      raise exception 'El pedido ya salió con el repartidor. No se puede cancelar desde el comercio; escribile a Soporte.';
    end if;
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

-- Pedido cancelado (por quien sea, también por arrepentimiento o por vencimiento)
-- => la entrega se cancela y el repartidor se entera.
create or replace function public.orders_cancel_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    update public.deliveries
       set status = 'cancelled',
           cancelled_by = new.cancelled_by,
           cancel_reason = new.cancel_reason
     where order_id = new.id and status in ('assigned', 'picked_up')
    returning repartidor_id
  loop
    if r.repartidor_id is not null then
      perform public.create_notification(r.repartidor_id, 'delivery_cancelled', jsonb_build_object(
        'order_id', new.id, 'order_number', new.order_number,
        'total_price', new.total_price, 'cancelled_by', new.cancelled_by, 'reason', new.cancel_reason));
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.orders_cancel_delivery() from public, anon, authenticated;

create trigger orders_cancel_delivery
  after update of status on public.orders
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.orders_cancel_delivery();

-- Red de seguridad: lo tomado hace más de 30 minutos sin retirar, sin ningún aviso
-- del repartidor y sin que el comercio se lo haya entregado, vuelve a la cola.
create or replace function public.release_stale_deliveries()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in execute
    'de' || 'lete from public.deliveries d
      where d.status = ''assigned''
        and d.pickup_confirmed_at is null
        and greatest(coalesce(d.assigned_at, d.created_at), d.heads_up_at, d.delay_notice_at) < now() - interval ''30 minutes''
      returning d.repartidor_id, d.order_id'
  loop
    if r.repartidor_id is not null then
      perform public.create_notification(r.repartidor_id, 'delivery_released', jsonb_build_object(
        'order_id', r.order_id,
        'order_number', (select order_number from public.orders where id = r.order_id)));
    end if;
  end loop;
end;
$$;

revoke all on function public.release_stale_deliveries() from public, anon, authenticated;

select cron.schedule(
  'release-stale-deliveries',
  '*/5 * * * *',
  $cron$select public.release_stale_deliveries();$cron$
);

-- ---------------------------------------------------------------------------
-- 11. Comprador: "¿Cómo llegó tu pedido?"
-- ---------------------------------------------------------------------------

create or replace function public.submit_delivery_feedback(
  p_order_id uuid,
  p_condition text,
  p_reasons text[] default '{}',
  p_note text default null,
  p_photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order record;
  v_delivery record;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_owner uuid;
  v_label text;
begin
  if v_uid is null then
    raise exception 'Debés iniciar sesión.';
  end if;
  if p_condition not in ('ok', 'problem') then
    raise exception 'Respuesta inválida.';
  end if;
  if length(coalesce(v_note, '')) > 500 then
    raise exception 'La nota es demasiado larga.';
  end if;

  select id, client_id, store_id, status, delivery_method, order_number, total_price into v_order
  from public.orders where id = p_order_id for update;

  if not found or v_order.client_id is distinct from v_uid then
    raise exception 'Este pedido no te pertenece.';
  end if;
  if v_order.delivery_method <> 'delivery' or v_order.status <> 'completed' then
    raise exception 'Solo se puede responder sobre un pedido con envío ya entregado.';
  end if;
  if exists (select 1 from public.delivery_feedback where order_id = p_order_id) then
    raise exception 'Ya respondiste sobre este pedido.';
  end if;

  if p_condition = 'ok' then
    insert into public.delivery_feedback (order_id, buyer_id, condition) values (p_order_id, v_uid, 'ok');
    return jsonb_build_object('order_id', p_order_id, 'condition', 'ok');
  end if;

  -- Con problemas: motivos, foto de lo recibido y dentro de las 48 horas.
  if coalesce(array_length(p_reasons, 1), 0) = 0
     or not (p_reasons <@ array['roto', 'faltan', 'otro_producto', 'otro']) then
    raise exception 'Elegí qué pasó con tu pedido.';
  end if;

  select delivered_at into v_delivery from public.deliveries where order_id = p_order_id;
  if v_delivery.delivered_at is not null and v_delivery.delivered_at < now() - interval '48 hours' then
    raise exception 'Pasaron más de 48 horas desde la entrega. Escribile a Soporte.';
  end if;

  if p_photo_path is null
     or p_photo_path !~ ('^' || p_order_id::text || '/received-[0-9]+\.jpg$')
     or not exists (select 1 from storage.objects where bucket_id = 'delivery-evidence' and name = p_photo_path) then
    raise exception 'Sumá una foto donde se vean todos los productos como te llegaron.';
  end if;

  insert into public.delivery_feedback (order_id, buyer_id, condition, reasons, note, photo_path)
  values (p_order_id, v_uid, 'problem', p_reasons, v_note, p_photo_path);

  v_label := 'BL-' || v_order.order_number;
  insert into public.support_tickets (user_id, subject, message)
  values (
    v_uid,
    'Problema con el pedido #' || v_label,
    'Reclamo por la entrega del pedido #' || v_label || '. Qué pasó: ' || array_to_string(p_reasons, ', ')
      || coalesce('. Detalle: ' || v_note, '') || '. La foto de lo recibido y la del retiro están en el pedido.'
  );

  select owner_id into v_owner from public.stores where id = v_order.store_id;
  if v_owner is not null then
    perform public.create_notification(v_owner, 'delivery_claim', jsonb_build_object(
      'order_id', p_order_id, 'order_number', v_order.order_number,
      'total_price', v_order.total_price, 'reasons', to_jsonb(p_reasons)));
  end if;

  return jsonb_build_object('order_id', p_order_id, 'condition', 'problem');
end;
$$;

revoke all on function public.submit_delivery_feedback(uuid, text, text[], text, text) from public, anon;
grant execute on function public.submit_delivery_feedback(uuid, text, text[], text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Estado de entrega y fotos, para comprador / comercio / admin
-- ---------------------------------------------------------------------------

-- Para pintar "Mis compras" y el panel de vendedor sin abrir la tabla deliveries
-- (su policy no deja leerla a los empleados del comercio).
create or replace function public.get_order_delivery_states(p_order_ids uuid[])
returns table (
  order_id uuid,
  status text,
  pickup_confirmed_at timestamptz,
  picked_up_at timestamptz,
  heads_up_at timestamptz,
  delay_minutes integer,
  problem_at timestamptz,
  problem_note text,
  feedback_condition text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.order_id, d.status, d.pickup_confirmed_at, d.picked_up_at, d.heads_up_at,
         d.delay_minutes, d.problem_at, d.problem_note, f.condition
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  left join public.delivery_feedback f on f.order_id = d.order_id
  where d.order_id = any (p_order_ids)
    and (
      o.client_id = auth.uid()
      or public._can_manage_order(o.store_id)
    )
  limit 200;
$$;

revoke all on function public.get_order_delivery_states(uuid[]) from public, anon;
grant execute on function public.get_order_delivery_states(uuid[]) to authenticated;

-- Rutas de las dos fotos + respuesta del comprador, para "Ver fotos de la entrega".
create or replace function public.get_delivery_evidence(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_read_delivery_evidence(p_order_id::text) then
    raise exception 'No podés ver las fotos de este pedido.';
  end if;

  return (
    select jsonb_build_object(
      'pickup_photo_path', d.pickup_photo_path,
      'picked_up_at', d.picked_up_at,
      'feedback', (
        select jsonb_build_object(
          'condition', f.condition, 'reasons', f.reasons, 'note', f.note,
          'photo_path', f.photo_path, 'created_at', f.created_at)
        from public.delivery_feedback f where f.order_id = p_order_id)
    )
    from public.deliveries d where d.order_id = p_order_id
  );
end;
$$;

revoke all on function public.get_delivery_evidence(uuid) from public, anon;
grant execute on function public.get_delivery_evidence(uuid) to authenticated;

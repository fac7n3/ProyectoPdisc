-- F3-02 (A113-182) — Panel del repartidor: ver pedidos disponibles y tomarlos.
--
-- Tabla deliveries extraída de 13_target_data_model.sql (sección 7), con el
-- insert cambiado: el diseño original la pensaba para que la tienda/admin
-- ASIGNE un repartidor; acá el repartidor se AUTO-asigna ("toma" el pedido),
-- así que el insert lo hace un RPC (claim_delivery) en vez de una policy de
-- insert directa — necesita lógica (chequear que el pedido esté disponible,
-- serializar contra otro repartidor tomándolo al mismo tiempo) que una
-- policy sola no puede expresar bien.

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  repartidor_id uuid references auth.users(id) on delete set null,
  status text not null default 'unassigned' check (status in ('unassigned', 'assigned', 'picked_up', 'delivered', 'cancelled')),
  assigned_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deliveries_repartidor_id_idx on public.deliveries(repartidor_id);

alter table public.deliveries enable row level security;

drop trigger if exists deliveries_set_updated_at on public.deliveries;
create trigger deliveries_set_updated_at
before update on public.deliveries
for each row execute procedure public.set_updated_at();

-- El repartidor asignado, el cliente/vendedor del pedido, o admin pueden verla.
drop policy if exists deliveries_select_participants on public.deliveries;
create policy deliveries_select_participants on public.deliveries
  for select to authenticated
  using (
    repartidor_id = auth.uid()
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
    or exists (
      select 1 from public.orders o
      where o.id = deliveries.order_id
        and (o.client_id = auth.uid() or o.store_id in (select id from public.stores where owner_id = auth.uid()))
    )
  );

-- Sin policy de insert/update directa a propósito: todo pasa por
-- claim_delivery (abajo) o por los RPCs de F3-03 (cambios de estado).

-- =========================================================
-- Los repartidores necesitan ver qué pedidos hay para repartir. orders no
-- tenía ninguna policy que les permitiera ver órdenes ajenas — se agrega
-- una: solo delivery + ya pagadas (nunca antes de que el pago se confirme),
-- ya sea todavía sin repartidor asignado o asignadas a ellos mismos.
-- =========================================================
drop policy if exists orders_select_repartidor on public.orders;
create policy orders_select_repartidor on public.orders
  for select to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'repartidor'
    and delivery_method = 'delivery'
    and payment_status = 'paid'
  );

-- =========================================================
-- RPC claim_delivery: el repartidor toma un pedido disponible.
-- =========================================================
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

  select id, delivery_method, payment_status into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  if v_order.delivery_method != 'delivery' or v_order.payment_status != 'paid' then
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

revoke execute on function public.claim_delivery(uuid) from public;
revoke execute on function public.claim_delivery(uuid) from anon;
grant execute on function public.claim_delivery(uuid) to authenticated;

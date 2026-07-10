-- F6-04 (A113-?) — Moderación desde el panel de admin: suspender productos
-- (individualmente, sin importar quién sea el dueño), que suspender un
-- comercio oculte de verdad sus productos, y suspender/reactivar cuentas
-- de repartidor ya aprobadas.
--
-- Contexto (auditado antes de escribir esta migración): `stores_update_own`
-- ya permite a un admin actualizar cualquier fila de `stores` directo desde
-- el cliente (RLS ya lo permitía) — no hace falta RPC para suspender un
-- comercio en sí. Pero `products_update_seller`/`products_update_own_seller_or_admin`
-- exigen `seller_id = auth.uid()` siempre, sin excepción para admin — así que
-- SÍ hace falta una RPC para que el admin pueda desactivar el producto de
-- OTRO vendedor. Y `products_select_public_active` solo miraba
-- `products.is_active`, nunca el estado del comercio dueño — o sea que
-- suspender un comercio no ocultaba sus productos en home/búsqueda/detalle.

-- 1) Suspender un comercio ahora sí oculta sus productos en las vistas
--    públicas (home/search/producto), sin tocar el `is_active` que cada
--    vendedor ya eligió por su cuenta — así que al reactivar el comercio,
--    sus productos vuelven a aparecer exactamente como estaban antes de la
--    suspensión, sin necesidad de guardar/restaurar ningún estado.
drop policy if exists products_select_public_active on public.products;
create policy products_select_public_active on public.products
  for select to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.stores s
      where s.id = products.store_id and s.status = 'approved'
    )
  );

-- 2) RPC para que el admin pueda suspender/reactivar un producto puntual
--    de cualquier vendedor (moderación de un ítem específico, no todo el
--    comercio).
create or replace function public.admin_set_product_active(p_product_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede moderar productos de otros vendedores.';
  end if;

  update public.products
  set is_active = p_is_active
  where id = p_product_id;

  if not found then
    raise exception 'El producto no existe.';
  end if;
end;
$$;
revoke execute on function public.admin_set_product_active(uuid, boolean) from public, anon;

-- 3) Gestión de repartidores ya aprobados: suspender bloquea que tomen
--    pedidos nuevos y que avancen los que ya tenían asignados (defensa en
--    profundidad — no libera automáticamente sus entregas en curso, eso
--    queda a criterio del admin/soporte manualmente, fuera de alcance acá).
alter table public.profiles add column if not exists is_suspended boolean not null default false;

-- Admin necesita listar profiles (repartidores) más allá de la suya propia;
-- profiles_select_own (auth.uid() = id) no alcanzaba para esto.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

create or replace function public.admin_set_repartidor_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede suspender repartidores.';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id and role = 'repartidor') then
    raise exception 'El usuario no es un repartidor.';
  end if;

  update public.profiles
  set is_suspended = p_suspended
  where id = p_user_id;
end;
$$;
revoke execute on function public.admin_set_repartidor_suspended(uuid, boolean) from public, anon;

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

  return jsonb_build_object('delivery_id', p_delivery_id, 'status', p_new_status);
end;
$$;

-- 4) F6-02: CRUD de categorías — insert/update admin ya existían
--    (03_ecommerce_schema.sql); faltaba delete (hoy bloqueado para todos,
--    RLS habilitada sin policy de DELETE). ON DELETE SET NULL en
--    products.category_id hace que borrar una categoría en uso sea seguro
--    (los productos quedan sin rubro, no se rompen).
drop policy if exists categories_delete_admin on public.categories;
create policy categories_delete_admin on public.categories
  for delete to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- F12-16 (A113-256) — Multi-usuario por comercio. Antes solo la cuenta que
-- creó la tienda (stores.owner_id) podía operar el dashboard. Diseño elegido
-- (decisión delegada explícitamente por el usuario): el empleado tiene
-- PARIDAD con el dueño para el día a día operativo -- productos y pedidos
-- (agregar/editar productos, marcar pedidos listos/entregados, confirmar
-- comprobantes de transferencia) -- pero NO puede tocar el perfil del
-- comercio (dirección, envío) ni los cupones (decisiones de negocio/
-- financieras) ni gestionar a otros empleados (evita que un empleado se
-- agregue soporte propio o saque al dueño). Todas las policies nuevas son
-- ADITIVAS (se suman con OR a las que ya existían para el dueño) -- nunca
-- se tocó una policy existente, así que el acceso del dueño no cambia en
-- absoluto.

create table if not exists public.store_staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (store_id, user_id)
);

create index if not exists store_staff_user_id_idx on public.store_staff(user_id);

alter table public.store_staff enable row level security;

drop policy if exists store_staff_select on public.store_staff;
create policy store_staff_select on public.store_staff
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.stores s where s.id = store_staff.store_id and s.owner_id = auth.uid())
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  );

-- Solo el dueño agrega/quita empleados de su propia tienda -- nunca un empleado a sí mismo o a otros.
drop policy if exists store_staff_delete_owner on public.store_staff;
create policy store_staff_delete_owner on public.store_staff
  for delete to authenticated
  using (exists (select 1 from public.stores s where s.id = store_staff.store_id and s.owner_id = auth.uid()));

-- El alta es solo vía RPC (add_store_staff) para poder buscar el email sin
-- exponer una policy de "buscar cualquier profile por email" a vendedores.

create or replace function public.add_store_staff(p_store_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not exists (select 1 from public.stores where id = p_store_id and owner_id = auth.uid()) then
    raise exception 'Solo el dueño del comercio puede agregar empleados.';
  end if;

  select id into v_user_id from public.profiles where lower(email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception 'No encontramos ninguna cuenta con ese email. Esa persona tiene que registrarse primero en Baradero Local.';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'Ya sos el dueño de este comercio.';
  end if;

  insert into public.store_staff (store_id, user_id) values (p_store_id, v_user_id)
  on conflict (store_id, user_id) do nothing;
end;
$$;
revoke execute on function public.add_store_staff(uuid, text) from public, anon;
grant execute on function public.add_store_staff(uuid, text) to authenticated;

-- === Paridad operativa: productos ===
drop policy if exists products_select_staff on public.products;
create policy products_select_staff on public.products
  for select to authenticated
  using (exists (select 1 from public.store_staff ss where ss.store_id = products.store_id and ss.user_id = auth.uid()));

drop policy if exists products_insert_staff on public.products;
create policy products_insert_staff on public.products
  for insert to authenticated
  with check (exists (select 1 from public.store_staff ss where ss.store_id = products.store_id and ss.user_id = auth.uid()));

drop policy if exists products_update_staff on public.products;
create policy products_update_staff on public.products
  for update to authenticated
  using (exists (select 1 from public.store_staff ss where ss.store_id = products.store_id and ss.user_id = auth.uid()))
  with check (exists (select 1 from public.store_staff ss where ss.store_id = products.store_id and ss.user_id = auth.uid()));

drop policy if exists products_delete_staff on public.products;
create policy products_delete_staff on public.products
  for delete to authenticated
  using (exists (select 1 from public.store_staff ss where ss.store_id = products.store_id and ss.user_id = auth.uid()));

-- === Paridad operativa: pedidos ===
drop policy if exists orders_select_staff on public.orders;
create policy orders_select_staff on public.orders
  for select to authenticated
  using (exists (select 1 from public.store_staff ss where ss.store_id = orders.store_id and ss.user_id = auth.uid()));

drop policy if exists orders_update_staff on public.orders;
create policy orders_update_staff on public.orders
  for update to authenticated
  using (exists (select 1 from public.store_staff ss where ss.store_id = orders.store_id and ss.user_id = auth.uid()));

drop policy if exists order_items_select_staff on public.order_items;
create policy order_items_select_staff on public.order_items
  for select to authenticated
  using (
    order_id in (
      select o.id from public.orders o
      join public.store_staff ss on ss.store_id = o.store_id
      where ss.user_id = auth.uid()
    )
  );

-- === Paridad operativa: comprobantes de transferencia ===
drop policy if exists payment_proofs_select_staff on public.payment_proofs;
create policy payment_proofs_select_staff on public.payment_proofs
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      join public.store_staff ss on ss.store_id = o.store_id
      where o.id = payment_proofs.order_id and ss.user_id = auth.uid()
    )
  );

drop policy if exists payment_proofs_update_staff on public.payment_proofs;
create policy payment_proofs_update_staff on public.payment_proofs
  for update to authenticated
  using (
    exists (
      select 1 from public.orders o
      join public.store_staff ss on ss.store_id = o.store_id
      where o.id = payment_proofs.order_id and ss.user_id = auth.uid()
    )
  );

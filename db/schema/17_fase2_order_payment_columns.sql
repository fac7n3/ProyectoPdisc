-- F2-01 (A113-173) — arranca Fase 2 (checkout/órdenes/pagos).
--
-- Extrae de 13_target_data_model.sql SOLO las piezas que Fase 2 necesita ya
-- (columnas de orders para método de entrega/pago + payment_proofs). El resto
-- de 13_target_data_model.sql (product_variants, product_images, stores
-- description/zone/hours, deliveries, reviews, conversations/messages,
-- notifications, favorites) sigue sin aplicar a propósito — son de Fases
-- 3/4/5/7/8, que todavía no arrancaron (ver nota en ese archivo y en
-- docs/ROADMAP.md sección 5). Aplicar cada bloque cuando arranque su fase.

-- =========================================================
-- 1. orders — método de entrega/pago (D2, D4)
-- =========================================================
alter table public.orders
  add column if not exists delivery_method text check (delivery_method is null or delivery_method in ('pickup', 'delivery')),
  add column if not exists payment_method text check (payment_method is null or payment_method in ('simulado', 'mercadopago', 'transferencia')),
  add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'rejected')),
  add column if not exists delivery_fee integer check (delivery_fee is null or delivery_fee >= 0);

-- =========================================================
-- 2. payment_proofs — transferencia con comprobante (D2, D3) — usado en F2-04
-- =========================================================
create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  receipt_url text not null,
  confirmed_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_proofs_order_id_idx on public.payment_proofs(order_id);

alter table public.payment_proofs enable row level security;

drop trigger if exists payment_proofs_set_updated_at on public.payment_proofs;
create trigger payment_proofs_set_updated_at
before update on public.payment_proofs
for each row execute procedure public.set_updated_at();

-- El cliente dueño de la orden, el vendedor de la tienda y el admin pueden verlo
drop policy if exists payment_proofs_select_participants on public.payment_proofs;
create policy payment_proofs_select_participants on public.payment_proofs
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = payment_proofs.order_id
        and (
          o.client_id = auth.uid()
          or o.store_id in (select id from public.stores where owner_id = auth.uid())
          or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
        )
    )
  );

-- Solo el cliente dueño de la orden sube el comprobante
drop policy if exists payment_proofs_insert_client on public.payment_proofs;
create policy payment_proofs_insert_client on public.payment_proofs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = payment_proofs.order_id and o.client_id = auth.uid()
    )
  );

-- Solo el vendedor de la tienda o el admin confirman/rechazan
drop policy if exists payment_proofs_update_store_or_admin on public.payment_proofs;
create policy payment_proofs_update_store_or_admin on public.payment_proofs
  for update to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = payment_proofs.order_id
        and (
          o.store_id in (select id from public.stores where owner_id = auth.uid())
          or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
        )
    )
  );

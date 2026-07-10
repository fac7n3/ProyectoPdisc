-- F5-03 (A113-193) — Variantes de producto (talle/color/peso) con stock propio.
-- Extraída de 13_target_data_model.sql (sección 1) al arrancar esta tarea.
--
-- Alcance a propósito acotado: esta tabla y su CRUD (vender.js) + display
-- informativo (producto.js) NO integran variantes al carrito/checkout —
-- eso significaría rediseñar el modelo de `cart-utils.js`/`carrito.js`/
-- `create_order`/`order_items` para llevar un `variant_id` en cada línea
-- (hoy solo referencian `product_id`), un cambio de fondo al núcleo de
-- compra ya construido en Fase 2. El vendedor puede cargar variantes con
-- su propio stock y mostrarlas como referencia; comprar "por variante" de
-- verdad queda pendiente de una tarea futura (no está en el alcance de
-- F5-03 tal como está redactada en el roadmap: "con stock por variante",
-- no "con checkout por variante").

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (char_length(name) >= 1),
  price integer not null check (price > 0),
  stock integer not null default 0 check (stock >= 0),
  sku text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_variants_product_id_idx on public.product_variants(product_id);

alter table public.product_variants enable row level security;

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute procedure public.set_updated_at();

drop policy if exists product_variants_select_public on public.product_variants;
create policy product_variants_select_public on public.product_variants
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and (p.is_active = true or p.seller_id = auth.uid())
    )
  );

drop policy if exists product_variants_write_owner on public.product_variants;
create policy product_variants_write_owner on public.product_variants
  for all to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and (p.seller_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and (p.seller_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
    )
  );

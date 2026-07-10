-- F5-04 (A113-194) — Varias fotos por producto.
-- Extraída de 13_target_data_model.sql (sección 2) al arrancar esta tarea.
-- Storage: el bucket 'products' ya existe (público) con policies de upload
-- para vendedor/admin desde 03_ecommerce_schema.sql — no hace falta tocar
-- storage acá, solo la tabla que referencia las URLs subidas.

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_id_idx on public.product_images(product_id);

alter table public.product_images enable row level security;

-- Visible si el producto padre está activo, o siempre para su dueño/admin
drop policy if exists product_images_select_public on public.product_images;
create policy product_images_select_public on public.product_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and (p.is_active = true or p.seller_id = auth.uid())
    )
  );

drop policy if exists product_images_write_owner on public.product_images;
create policy product_images_write_owner on public.product_images
  for all to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and (p.seller_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and (p.seller_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
    )
  );

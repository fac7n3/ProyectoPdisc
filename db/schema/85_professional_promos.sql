-- Fotos promocionales del directorio "Contratar": el profesional/técnico ya
-- publicado (fila propia en `professionals`) las carga desde su propio mini
-- panel (js/vender.js, "professional-panel-view" -- hasta ahora esa vista
-- solo mostraba un texto fijo de "escribinos por Soporte para cambiar algo").
-- Se muestran en su tarjeta de contratar.html al desplegarla, debajo de
-- Llamar/WhatsApp.
--
-- Tabla aparte de `professionals.photo_url` (esa es una sola, el avatar/logo
-- de la tarjeta) porque acá son varias por profesional -- mismo criterio que
-- `product_images` para productos.

create table if not exists public.professional_promos (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists professional_promos_professional_id_idx on public.professional_promos(professional_id);

alter table public.professional_promos enable row level security;

-- Lectura pública, pero solo de profesionales activos -- mismo criterio que
-- professionals_select_public (77_professionals.sql).
drop policy if exists professional_promos_select_public on public.professional_promos;
create policy professional_promos_select_public on public.professional_promos
  for select to anon, authenticated
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.is_active = true
  ));

-- El dueño del profesional gestiona sus propias fotos (insert/update/delete).
drop policy if exists professional_promos_all_own on public.professional_promos;
create policy professional_promos_all_own on public.professional_promos
  for all to authenticated
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.owner_id = auth.uid()
  ));

drop policy if exists professional_promos_all_admin on public.professional_promos;
create policy professional_promos_all_admin on public.professional_promos
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- Bucket público, mismo patrón por carpeta {uid}/ que professional-photos
-- (78_professionals_extras.sql).
insert into storage.buckets (id, name, public)
values ('professional-promos', 'professional-promos', true)
on conflict (id) do nothing;

drop policy if exists professional_promos_read_public on storage.objects;
create policy professional_promos_read_public on storage.objects for select
to anon, authenticated
using (bucket_id = 'professional-promos');

drop policy if exists professional_promos_insert_own on storage.objects;
create policy professional_promos_insert_own on storage.objects for insert
to authenticated
with check (
  bucket_id = 'professional-promos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists professional_promos_delete_own on storage.objects;
create policy professional_promos_delete_own on storage.objects for delete
to authenticated
using (
  bucket_id = 'professional-promos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

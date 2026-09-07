-- Vista de comercio (vendedor/cliente) — logo del comercio, arriba del
-- título del header. Solo el dueño lo puede subir/cambiar, y solo desde esa
-- misma vista (comercio.js, buildStoreHeader).
--
-- Sin policy nueva sobre `stores`: stores_update_own (03_ecommerce_schema.sql)
-- ya cubre cualquier columna de la fila del dueño (mismo criterio que
-- header_bg_color/header_text_color en la migración 70).
--
-- Bucket público (el logo se ve en la vista del comercio, que es pública) con
-- el mismo criterio que "avatars" (migración 61): cada usuario solo puede
-- escribir dentro de su propia carpeta {uid}/ -- se valida contra
-- auth.uid(), no contra el id de la tienda, porque storage no sabe qué tienda
-- es dueño cada usuario.

alter table public.stores add column if not exists logo_url text;

comment on column public.stores.logo_url is
  'Logo del comercio (bucket store-logos), mostrado arriba del título en la vista de comercio. NULL = sin logo cargado.';

insert into storage.buckets (id, name, public)
values ('store-logos', 'store-logos', true)
on conflict (id) do nothing;

drop policy if exists store_logos_read_public on storage.objects;
create policy store_logos_read_public on storage.objects for select
to anon, authenticated
using (bucket_id = 'store-logos');

drop policy if exists store_logos_insert_own on storage.objects;
create policy store_logos_insert_own on storage.objects for insert
to authenticated
with check (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists store_logos_update_own on storage.objects;
create policy store_logos_update_own on storage.objects for update
to authenticated
using (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists store_logos_delete_own on storage.objects;
create policy store_logos_delete_own on storage.objects for delete
to authenticated
using (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

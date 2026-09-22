-- Auditoría de seguridad del panel de vendedor (2026-09-22), quinto sector al
-- azar: la policy de INSERT del bucket público `products` solo chequeaba
-- `role in ('vendedor', 'admin')` -- a diferencia de CUALQUIER otro bucket
-- del proyecto (professional-photos, professional-promos, avatars,
-- store-logos, support-attachments...), que siempre exigen que el primer
-- segmento del path sea el propio `auth.uid()` (o, acá, el id de un
-- producto que la cuenta puede escribir). Sin ese chequeo, cualquier cuenta
-- vendedor -- alcanza con tener UN comercio aprobado -- podía subir lo que
-- quisiera a `products/{cualquier_product_id}/archivo`, incluido el
-- product_id de un producto ajeno (los ids de producto no son secretos:
-- están en la URL pública de cada producto). El bucket es público, así que
-- esa subida queda servida con URL pública bajo el propio dominio del
-- proyecto -- hosting de archivos arbitrarios sin relación con Baradero
-- Local, con el sitio como anfitrión involuntario.
--
-- No era un defacement directo de la ficha de otro vendedor: la vista de
-- producto arma la galería desde `product_images`/`products.image_url` (la
-- tabla), nunca listando el storage -- y el bucket ni siquiera tiene policy
-- de SELECT en storage.objects para listar (mismo gotcha ya documentado en
-- CLAUDE.md sobre las fotos huérfanas). El impacto real es "hosting público
-- no autorizado bajo el dominio del proyecto", no inyección visible.
--
-- Fix: la carpeta de destino tiene que ser el id de un producto que la
-- cuenta puede escribir de verdad -- dueño (seller_id) o empleado del
-- comercio (store_staff), mismo criterio que products_insert_staff /
-- products_update_seller (03/49). Funciona sin cambiar el flujo real: en
-- vender.js, persistProductImages() siempre sube las fotos DESPUÉS de que
-- el producto ya existe (la fila se inserta primero, después se suben las
-- imágenes con ese id ya real).

drop policy if exists "Authenticated users can upload product images" on storage.objects;
create policy "Authenticated users can upload product images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'products'
    and (
      coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
      or exists (
        select 1 from public.products p
        where p.id::text = (storage.foldername(name))[1]
          and (
            p.seller_id = auth.uid()
            or exists (
              select 1 from public.store_staff ss
              where ss.store_id = p.store_id and ss.user_id = auth.uid()
            )
          )
      )
    )
  );

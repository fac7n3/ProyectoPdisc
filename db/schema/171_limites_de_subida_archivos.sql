-- 171 — Límites de subida de archivos en los buckets públicos (auditoría de seguridad 2026-11-17).
--
-- Qué había: 9 de los 12 buckets no tenían tope de tamaño y ninguno restringía el
-- tipo de archivo, y cualquier cuenta con sesión podía subir lo que quisiera al
-- bucket `stores` (la policy solo pedía `bucket_id = 'stores'`). Los archivos se
-- sirven desde el dominio de Supabase (no el del sitio), así que no es un XSS,
-- pero alcanza para llenar el almacenamiento del plan Free o alojar contenido
-- ajeno bajo nuestro proyecto.
--
-- Qué hace:
--   1) Tope de tamaño y lista de tipos permitidos en cada bucket público que usa
--      el sitio. Sin `image/svg+xml` ni HTML a propósito (el SVG puede llevar
--      scripts). El cliente ya comprime toda foto a WebP (`js/image-compress.js`),
--      así que los topes de fotos quedan muy por encima de lo normal.
--      `products` y `professional-promos` guardan fotos y videos en el mismo bucket:
--      el tope es el de los videos (30 MB, el mismo de `MAX_VIDEO_BYTES`).
--   2) Se saca la policy que dejaba subir a `stores`: el bucket está vacío y ningún
--      código lo usa (los logos van a `store-logos`).
--
-- Los archivos que ya estaban subidos se revisaron antes: todos cumplen (tipos
-- jpeg/png/webp/mp4/pdf, el más pesado es un video de 27,9 MB). Los topes no
-- tocan lo ya guardado, solo las subidas nuevas.
--
-- Fuera de alcance (pendiente): los buckets privados (`payment-proofs`,
-- `delivery-evidence`, `support-attachments`, `professional-inquiry-attachments`)
-- también carecen de tope; admiten PDF o adjuntos y hay que ver qué acepta cada
-- pantalla antes de limitarlos.
--
-- Aplicar en dos partes (el conector pide confirmación en pantalla con DROP):
--   171a: sección 1 (no lleva drop).  171b: sección 2.

-- 1) Tope y tipos por bucket -------------------------------------------------
update storage.buckets set
  file_size_limit = 2 * 1024 * 1024,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
where id in ('avatars', 'store-logos');

update storage.buckets set
  file_size_limit = 5 * 1024 * 1024,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
where id in ('professional-photos', 'home-promos', 'store-banners', 'stores');

update storage.buckets set
  file_size_limit = 30 * 1024 * 1024,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
                             'video/mp4', 'video/webm', 'video/quicktime']
where id in ('products', 'professional-promos');

-- 2) El bucket viejo `stores` ya no admite subidas -----------------------------
drop policy if exists "Authenticated users can upload store logos" on storage.objects;

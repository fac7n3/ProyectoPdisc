-- Vista de comercio: banner (imagen ancha) arriba del header. Lo carga el
-- dueño desde el lápiz de personalización de comercio.js.
--
-- Sin policy nueva sobre `stores`: stores_update_own ya cubre cualquier
-- columna de la fila del dueño (mismo criterio que logo_url, migración 74).
-- La imagen se sube al bucket público existente `store-logos`, dentro de la
-- carpeta {uid}/ del dueño (las policies de la migración 74 ya lo permiten),
-- así que no hace falta bucket ni policy de storage nuevos.

alter table public.stores add column if not exists banner_url text;

comment on column public.stores.banner_url is
  'Banner del comercio (bucket store-logos), mostrado arriba del header en la vista de comercio. NULL = sin banner.';

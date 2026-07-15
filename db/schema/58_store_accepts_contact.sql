-- P1-12 (backlog): el vendedor puede desactivar el botón "Contactar al
-- vendedor" (producto.js/comercio.js, F7-02) si no quiere recibir mensajes.
-- default true: ninguna tienda existente pierde el botón de golpe al aplicar
-- esta migración.
--
-- Sin RLS nueva: stores_select_public (03_ecommerce_schema.sql) ya deja leer
-- cualquier columna de una tienda approved a anon/authenticated, y
-- stores_update_own ya permite al dueño (o admin) actualizar su propia fila
-- -- accepts_contact es una columna más ahí adentro, no necesita una policy
-- propia.

alter table public.stores
  add column if not exists accepts_contact boolean not null default true;

-- Vista de comercio (vendedor/cliente) — el vendedor puede elegir un color de
-- fondo y de letra para el header de su tienda (título + barra de datos).
-- NULL en cualquiera de las dos = usa el color por defecto de la página
-- (no se guarda el hex del default, así un cambio de paleta futuro no deja
-- valores "por defecto" desactualizados pisando el nuevo default).
--
-- Sin policy nueva: stores_update_own (03_ecommerce_schema.sql) ya es a nivel
-- de fila (owner_id = auth.uid()), no de columna, así que cubre estas dos
-- columnas nuevas sin cambios. Un empleado (store_staff) no tiene policy de
-- update sobre stores en absoluto -- a propósito (F12-16): el perfil del
-- comercio es decisión del dueño, no paridad operativa.

alter table public.stores
  add column if not exists header_bg_color text,
  add column if not exists header_text_color text;

comment on column public.stores.header_bg_color is
  'Color de fondo del header de la tienda (hex, ej. "#284175"). NULL = color por defecto de la página.';
comment on column public.stores.header_text_color is
  'Color de letra del header de la tienda (hex). NULL = color de texto por defecto.';

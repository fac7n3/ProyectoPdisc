-- P2-10: permitir elegir más de un rubro al registrarse como vendedor (antes
-- category_slug era una columna de un solo valor, <select> simple en
-- vender.js). Se agrega category_slugs (array) sin tocar la columna vieja --
-- approve_seller_request (05_admin_seller.sql) nunca copiaba category_slug a
-- stores, así que no hay nada más en el esquema que dependa de ella.
alter table public.seller_requests
  add column if not exists category_slugs text[];

-- Backfill: solicitudes existentes con un solo rubro pasan a un array de 1.
update public.seller_requests
  set category_slugs = array[category_slug]
  where category_slugs is null and category_slug is not null;

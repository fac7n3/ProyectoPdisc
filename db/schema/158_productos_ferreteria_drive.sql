-- 158_productos_ferreteria_drive.sql (2026-11-04)
--
-- Productos armados con las 5 fotos de la carpeta "Ferretería" del Drive de la cuenta (subidas el
-- 2026-10-13 y nunca importadas). Solo datos, sin cambios de esquema. Mismo criterio que la 125/129/134/141:
-- nombre y descripción salen de lo que se ve en cada foto (nada de datos que no se vean).
--
-- Contexto: el 2026-11-04 se borraron los productos con imágenes genéricas y el comercio Ferretería El Clavo
-- (archivo 157) porque se creyó que el Drive no tenía carpeta de Ferretería: sí la tenía. Acá se recrea el
-- comercio (mismo dueño de las cuentas de seed, sin logo ni banner: los de antes eran mockups armados por
-- Claude) y se le cargan los productos con las fotos reales.
--
-- ORDEN: aplicar DESPUES de que el deploy con public/img/productos/*.webp esté en producción; si no, los
-- productos salen con la imagen rota.
--
-- Ningún comercio de prueba tiene alias bancario (no se inventa uno): products_require_transfer_alias
-- (migración 107) se apaga mientras corre y se prende de nuevo al final. Idempotente: un producto no se
-- inserta si el comercio ya tiene uno con el mismo título, y el comercio no se crea si ya existe.
--
-- Fotos descartadas: ninguna (las 5 muestran lo que dice el nombre y no traen marcas de agua de otros sitios).

insert into public.stores (owner_id, name, status, category_slug, description, zone, address, hours, contact_method)
select '636d615e-1ac4-402d-9c24-a06c422db893'::uuid, 'Ferretería El Clavo', 'approved', 'ferreteria',
       'Herramientas manuales y eléctricas para el hogar y el taller. Retiro en el local o envío dentro de Baradero.',
       'Baradero', 'San Martín 120',
       to_jsonb('Lunes a viernes de 8:00 a 12:30 y de 16:00 a 20:00. Sábados de 8:00 a 13:00.'::text), 'none'
where not exists (select 1 from public.stores where name = 'Ferretería El Clavo');

-- Solo inserta (nunca borra): un producto que ya existe con ese título en el comercio no se toca.
create function pg_temp.bl_upsert_product(p_store uuid, p_cat text, p_title text, p_desc text, p_price int,
  p_stock int, p_url text) returns void language plpgsql as $$
declare pid uuid;
begin
  if p_store is null then return; end if;
  if exists (select 1 from public.products where store_id = p_store and title = p_title) then return; end if;
  insert into public.products (seller_id, store_id, title, description, price, stock, image_url, category_id, is_active)
  select s.owner_id, s.id, p_title, p_desc, p_price, p_stock, p_url,
         (select id from public.categories where slug = p_cat), true
    from public.stores s where s.id = p_store
  returning id into pid;
  insert into public.product_images (product_id, url, position) values (pid, p_url, 0);
end $$;

alter table public.products disable trigger products_require_transfer_alias;

select pg_temp.bl_upsert_product((select id from public.stores where name = 'Ferretería El Clavo'), 'ferreteria',
  'Martillo de Uña con Mango de Goma',
  'Martillo de uña curva con cabeza de acero pulido y cabo metálico con empuñadura de goma antideslizante. Para clavar y sacar clavos.',
  9800, 25, '/img/productos/martillo-de-una-mango-de-goma.webp');

select pg_temp.bl_upsert_product((select id from public.stores where name = 'Ferretería El Clavo'), 'ferreteria',
  'Pinza de Presión con Mordaza Curva',
  'Pinza de presión (mordaza) de acero niquelado con mordazas curvas dentadas, tornillo de ajuste y palanca de cierre. Sujeta la pieza sin que se suelte.',
  8900, 20, '/img/productos/pinza-de-presion-mordaza-curva.webp');

select pg_temp.bl_upsert_product((select id from public.stores where name = 'Ferretería El Clavo'), 'ferreteria',
  'Llave Ajustable 200 mm Cromo Vanadio',
  'Llave ajustable de 200 mm (8 pulgadas) en acero cromo vanadio, con escala grabada en la mordaza y tornillo sin fin para regular la apertura.',
  7900, 30, '/img/productos/llave-ajustable-200mm-cromo-vanadio.webp');

select pg_temp.bl_upsert_product((select id from public.stores where name = 'Ferretería El Clavo'), 'ferreteria',
  'Set de Destornilladores de Precisión x11',
  'Set de 11 destornilladores de precisión con cuerpo metálico estriado y cabeza giratoria, con puntas planas y Phillips, en estuche rígido. Ideal para anteojos, relojes y electrónica.',
  6500, 40, '/img/productos/set-destornilladores-de-precision-x11.webp');

select pg_temp.bl_upsert_product((select id from public.stores where name = 'Ferretería El Clavo'), 'ferreteria',
  'Taladro Inalámbrico Black+Decker 20V con Set de Herramientas',
  'Taladro atornillador inalámbrico Black+Decker de 20 V con batería de litio, acompañado de un set de herramientas: martillo, llaves combinadas y ajustables, pinzas, destornilladores, nivel, cinta métrica, puntas y mechas.',
  89900, 8, '/img/productos/taladro-inalambrico-black-decker-20v-con-set.webp');

alter table public.products enable trigger products_require_transfer_alias;

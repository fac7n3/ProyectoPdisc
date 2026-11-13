-- Las 5 publicidades del banner grande del inicio (mosaic_g, posiciones 1 a 5; ver la 162).
-- Cada una lleva a la página del comercio (product_id null). Los "% OFF" son el mayor
-- descuento real de las ofertas vigentes de los productos que muestra la imagen
-- (compare_at_price/price, al 2026-11-12). Orden de publicación: merge a main,
-- deploy listo (sirve las imágenes) y recién después esta migración.
-- home_promos_guard solo deja asignar comercio a un admin logueado: se apaga mientras corre.
alter table public.home_promos disable trigger home_promos_guard;

update public.home_promos set
  store_id = (select id from public.stores where name = 'Super Baradero' and status = 'approved'),
  product_id = null, image_url = '/img/promos/promo-grande-1-super-baradero.webp', title = 'Súper ofertas, hasta 16% OFF', is_active = true, updated_at = now()
where slot = 'mosaic_g' and position = 1 and exists (select 1 from public.stores where name = 'Super Baradero' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Mimos y Paseos' and status = 'approved'),
  product_id = null, image_url = '/img/promos/promo-grande-2-mimos-y-paseos.webp', title = 'Mascotas, hasta 15% OFF', is_active = true, updated_at = now()
where slot = 'mosaic_g' and position = 2 and exists (select 1 from public.stores where name = 'Mimos y Paseos' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Papelería Arcoíris' and status = 'approved'),
  product_id = null, image_url = '/img/promos/promo-grande-3-papeleria-arcoiris.webp', title = 'Útiles, hasta 16% OFF', is_active = true, updated_at = now()
where slot = 'mosaic_g' and position = 3 and exists (select 1 from public.stores where name = 'Papelería Arcoíris' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Forrajería El Granero' and status = 'approved'),
  product_id = null, image_url = '/img/promos/promo-grande-4-forrajeria-el-granero.webp', title = 'Alimento y arena, hasta 11% OFF', is_active = true, updated_at = now()
where slot = 'mosaic_g' and position = 4 and exists (select 1 from public.stores where name = 'Forrajería El Granero' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Bazar La Casita' and status = 'approved'),
  product_id = null, image_url = '/img/promos/promo-grande-5-bazar-la-casita.webp', title = 'Limpieza del hogar, hasta 15% OFF', is_active = true, updated_at = now()
where slot = 'mosaic_g' and position = 5 and exists (select 1 from public.stores where name = 'Bazar La Casita' and status = 'approved');

alter table public.home_promos enable trigger home_promos_guard;

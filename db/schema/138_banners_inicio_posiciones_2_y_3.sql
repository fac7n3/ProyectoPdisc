-- Publicidades 2 y 3 de cada uno de los 6 espacios de banners del inicio
-- (home_promos con `position` 2 y 3, migración 137): 12 banners nuevos de 12
-- comercios, con las imágenes de `public/img/promos/`.
--
-- Cada banner dice solo lo que la base respalda: "Desde $X" es el precio más
-- bajo real de ese rubro en el comercio, y los "% OFF" salen de
-- compare_at_price/price de productos con oferta vigente (al armarlos:
-- Santa Julia + Speed 15%, Combo Arcor 14%, Skyy Infusions 12%).
--
--   a  grande 16:9      pos 2  La Espiga        pos 3  Perfumería Lavanda
--   b  chico 16:9       pos 2  La Moda          pos 3  Boutique Amapola
--   c  chico 16:9       pos 2  Panadería El Sol pos 3  Farmacia Central
--   d  franja 5:1       pos 2  Bebidas La Esq.  pos 3  Kiosco El Paso
--   e  4:1              pos 2  PetShop Huellitas pos 3 Dulce Tentación
--   f  4:1              pos 2  Cervecería       pos 3  Super Baradero
--
-- Orden de publicación: primero el merge a `main` (el deploy de Vercel sirve
-- las imágenes), recién después esta migración; si no, el banner apunta a un
-- archivo que todavía no existe.
--
-- home_promos_guard solo deja asignar comercio a un admin logueado: se apaga
-- mientras corre, igual que en la 134.
alter table public.home_promos disable trigger home_promos_guard;

update public.home_promos set
  store_id = (select id from public.stores where name = 'Panadería y Confitería La Espiga' and status = 'approved'),
  product_id = (select p.id from public.products p join public.stores s on s.id = p.store_id where s.name = 'Panadería y Confitería La Espiga' and p.title = 'Torta de cumpleaños' limit 1),
  image_url = '/img/promos/promo-la-espiga-tortas.webp', title = 'Tortas desde $15.000', is_active = true, updated_at = now()
where slot = 'mosaic_a' and position = 2 and exists (select 1 from public.stores where name = 'Panadería y Confitería La Espiga' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Perfumería Lavanda' and status = 'approved'),
  product_id = (select p.id from public.products p join public.stores s on s.id = p.store_id where s.name = 'Perfumería Lavanda' and p.title = 'Perfume Ciel eau de parfum 80 ml' limit 1),
  image_url = '/img/promos/promo-perfumeria-lavanda.webp', title = 'Colonias desde $9.800', is_active = true, updated_at = now()
where slot = 'mosaic_a' and position = 3 and exists (select 1 from public.stores where name = 'Perfumería Lavanda' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Indumentaria La Moda' and status = 'approved'),
  product_id = (select p.id from public.products p join public.stores s on s.id = p.store_id where s.name = 'Indumentaria La Moda' and p.title = 'Campera de friza gris con capucha' limit 1),
  image_url = '/img/promos/promo-indumentaria-la-moda.webp', title = 'Camperas desde $40.000', is_active = true, updated_at = now()
where slot = 'mosaic_b' and position = 2 and exists (select 1 from public.stores where name = 'Indumentaria La Moda' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Boutique Amapola' and status = 'approved'),
  product_id = (select p.id from public.products p join public.stores s on s.id = p.store_id where s.name = 'Boutique Amapola' and p.title = 'Musculosa fruncida negra' limit 1),
  image_url = '/img/promos/promo-boutique-amapola.webp', title = 'Remeras y tops desde $12.000', is_active = true, updated_at = now()
where slot = 'mosaic_b' and position = 3 and exists (select 1 from public.stores where name = 'Boutique Amapola' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Panadería El Sol' and status = 'approved'),
  product_id = (select p.id from public.products p join public.stores s on s.id = p.store_id where s.name = 'Panadería El Sol' and p.title = 'Docena de Medialunas' limit 1),
  image_url = '/img/promos/promo-panaderia-el-sol.webp', title = 'Docena de medialunas desde $4.800', is_active = true, updated_at = now()
where slot = 'mosaic_c' and position = 2 and exists (select 1 from public.stores where name = 'Panadería El Sol' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Farmacia Central' and status = 'approved'),
  product_id = (select p.id from public.products p join public.stores s on s.id = p.store_id where s.name = 'Farmacia Central' and p.title = 'Jabón de tocador Dove 90 g' limit 1),
  image_url = '/img/promos/promo-farmacia-central.webp', title = 'Cuidado personal desde $1.300', is_active = true, updated_at = now()
where slot = 'mosaic_c' and position = 3 and exists (select 1 from public.stores where name = 'Farmacia Central' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Bebidas La Esquina' and status = 'approved'),
  product_id = (select p.id from public.products p join public.stores s on s.id = p.store_id where s.name = 'Bebidas La Esquina' and p.title = 'Combo Santa Julia blanco x2 + Speed x2' limit 1),
  image_url = '/img/promos/promo-bebidas-combo-santa-julia.webp', title = '15% OFF en el combo Santa Julia + Speed', is_active = true, updated_at = now()
where slot = 'mosaic_d' and position = 2 and exists (select 1 from public.stores where name = 'Bebidas La Esquina' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Kiosco El Paso' and status = 'approved'),
  product_id = null,
  image_url = '/img/promos/promo-kiosco-alfajores.webp', title = 'Alfajores desde $800', is_active = true, updated_at = now()
where slot = 'mosaic_d' and position = 3 and exists (select 1 from public.stores where name = 'Kiosco El Paso' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'PetShop Huellitas' and status = 'approved'),
  product_id = null,
  image_url = '/img/promos/promo-petshop-huellitas.webp', title = 'Todo para tu mascota desde $2.500', is_active = true, updated_at = now()
where slot = 'mosaic_e' and position = 2 and exists (select 1 from public.stores where name = 'PetShop Huellitas' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Golosinas Dulce Tentación' and status = 'approved'),
  product_id = (select p.id from public.products p join public.stores s on s.id = p.store_id where s.name = 'Golosinas Dulce Tentación' and p.title = 'Combo Arcor x3 cajas de bombones' limit 1),
  image_url = '/img/promos/promo-dulce-tentacion-arcor.webp', title = 'Combo Arcor con 14% OFF', is_active = true, updated_at = now()
where slot = 'mosaic_e' and position = 3 and exists (select 1 from public.stores where name = 'Golosinas Dulce Tentación' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Cervecería El Barril' and status = 'approved'),
  product_id = (select p.id from public.products p join public.stores s on s.id = p.store_id where s.name = 'Cervecería El Barril' and p.title = 'Skyy Infusions' limit 1),
  image_url = '/img/promos/promo-cerveceria-skyy.webp', title = 'Skyy Infusions con 12% OFF', is_active = true, updated_at = now()
where slot = 'mosaic_f' and position = 2 and exists (select 1 from public.stores where name = 'Cervecería El Barril' and status = 'approved');

update public.home_promos set
  store_id = (select id from public.stores where name = 'Super Baradero' and status = 'approved'),
  product_id = (select p.id from public.products p join public.stores s on s.id = p.store_id where s.name = 'Super Baradero' and p.title = 'Galletitas Rumba' limit 1),
  image_url = '/img/promos/promo-super-baradero-galletitas.webp', title = 'Galletitas, aguas y gaseosas desde $1.400', is_active = true, updated_at = now()
where slot = 'mosaic_f' and position = 3 and exists (select 1 from public.stores where name = 'Super Baradero' and status = 'approved');

alter table public.home_promos enable trigger home_promos_guard;

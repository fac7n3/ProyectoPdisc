-- 134_productos_kiosco_bebidas_drive.sql (2026-10-20)
--
-- Productos armados con las fotos NUEVAS de las carpetas "Kiosco" y "Bebidas" del Drive de la
-- cuenta (se cargaron el 2026-10-19/20). Solo datos, sin cambios de esquema. Mismo criterio que
-- la 125/129: nombre, descripción y opciones salen de lo que se ve en cada foto, no del nombre del
-- archivo; cuando una foto muestra variantes (sabores, tipos) van como opciones del producto y
-- las fotos del mismo producto van todas en product_images (la primera es la principal).
--
-- ORDEN: aplicar DESPUES de que el deploy con public/img/productos/*.webp, public/img/promos/*.webp
-- y public/img/comercios/*.webp esté en producción; si no, productos, banners y logos salen rotos.
--
-- Comercios (6, cada uno con su rubro; las cosas de kiosco también se venden en el súper y el
-- almacén, y las bebidas en el kiosco, como en un barrio real):
--   * Bebidas La Esquina, Kiosco El Paso, Super Baradero, Almacén Don José: de seed (owner = la
--     cuenta admin de los seed). Se les completa rubro (category_slug estaba en NULL) y se les
--     suma el banner de la cabecera; al súper y al almacén también un logo.
--   * Cervecería El Barril y Golosinas Dulce Tentación: cuentas de prueba NUEVAS
--     (proyectopdisc+cerveceria@gmail.com / proyectopdisc+golosinas@gmail.com), creadas aparte
--     (auth.users + auth.identities, rol vendedor con la bandera app.role_change_authorized);
--     acá se las busca por email. Sin la cuenta, no se inserta su comercio ni sus productos.
-- Ofertas: 16 productos con precio tachado (compare_at_price) y fecha de fin (offer_expires_at).
-- Cupones por comercio y los 6 espacios de banners del inicio (home_promos): al final.
--
-- Ningún comercio de prueba tiene alias bancario (no se inventa uno): products_require_transfer_alias
-- (migración 107) se apaga mientras corre y se prende de nuevo al final. Idempotente: un producto
-- no se inserta si el comercio ya tiene uno con el mismo título.
--
-- Fotos del Drive sin usar a propósito: "surtidos felfort" (sello rojo de otro sitio arriba a la
-- derecha) y las que repiten otra foto idéntica ("gaseosa fanta" de Kiosco = la de Bebidas;
-- "agua saborizada levite" de Kiosco = la de Bebidas). Quedaron sin subir las que el conector de
-- Drive no puede bajar a disco (archivos chicos, devuelve el contenido en línea).


insert into public.stores (owner_id, name, status, category_slug, description, zone, hours, contact_method)
select u.id, 'Cervecería El Barril', 'approved', 'bebidas', 'Cervezas, tragos y vodkas para la juntada: botellas, latas y packs. Venta a mayores de 18 años.', 'Baradero', to_jsonb('Lunes a domingo de 10:00 a 23:00'::text), 'none'
from auth.users u
where u.email = 'proyectopdisc+cerveceria@gmail.com' and not exists (select 1 from public.stores s where s.owner_id = u.id);


insert into public.stores (owner_id, name, status, category_slug, description, zone, hours, contact_method)
select u.id, 'Golosinas Dulce Tentación', 'approved', 'kiosco', 'Golosinas, gomitas, chocolates y boxes para regalar. Armamos combos a pedido.', 'Baradero', to_jsonb('Lunes a sábado de 9:00 a 13:00 y de 16:30 a 21:30'::text), 'none'
from auth.users u
where u.email = 'proyectopdisc+golosinas@gmail.com' and not exists (select 1 from public.stores s where s.owner_id = u.id);


-- Rubro, logo y banner de la cabecera de cada comercio (solo si estaban vacíos).
update public.stores set category_slug = coalesce(category_slug, 'bebidas'), banner_url = coalesce(banner_url, '/img/comercios/banner-bebidas-la-esquina.webp') where id = '75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid;
update public.stores set category_slug = coalesce(category_slug, 'kiosco'), banner_url = coalesce(banner_url, '/img/comercios/banner-kiosco-el-paso.webp') where id = '341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid;
update public.stores set category_slug = coalesce(category_slug, 'supermercado'), banner_url = coalesce(banner_url, '/img/comercios/banner-super-baradero.webp'), logo_url = coalesce(logo_url, '/img/comercios/logo-super-baradero.webp') where id = '6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid;
update public.stores set category_slug = coalesce(category_slug, 'almacen'), banner_url = coalesce(banner_url, '/img/comercios/banner-almacen-don-jose.webp'), logo_url = coalesce(logo_url, '/img/comercios/logo-almacen-don-jose.webp') where id = '52c0a082-e18b-41ee-abd4-d881e4c8bc57'::uuid;
update public.stores set category_slug = coalesce(category_slug, 'bebidas'), banner_url = coalesce(banner_url, '/img/comercios/banner-cerveceria-el-barril.webp'), logo_url = coalesce(logo_url, '/img/comercios/logo-cerveceria-el-barril.webp') where id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1);
update public.stores set category_slug = coalesce(category_slug, 'kiosco'), banner_url = coalesce(banner_url, '/img/comercios/banner-golosinas-dulce-tentacion.webp'), logo_url = coalesce(logo_url, '/img/comercios/logo-golosinas-dulce-tentacion.webp') where id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1);

create function pg_temp.bl_add_options(p_product uuid, p_opts jsonb) returns void language plpgsql as $$
declare g jsonb; v text; gi int := 0; vi int; oid uuid;
begin
  if exists (select 1 from public.product_options where product_id = p_product) then return; end if;
  for g in select * from jsonb_array_elements(p_opts) loop
    insert into public.product_options (product_id, name, position) values (p_product, g->>'name', gi) returning id into oid;
    vi := 0;
    for v in select * from jsonb_array_elements_text(g->'values') loop
      insert into public.product_option_values (option_id, value, position) values (oid, v, vi);
      vi := vi + 1;
    end loop;
    gi := gi + 1;
  end loop;
end $$;

-- Solo inserta (nunca borra): un producto que ya existe con ese título en el comercio no se toca.
create function pg_temp.bl_upsert_product(p_store uuid, p_cat text, p_title text, p_desc text, p_price int,
  p_stock int, p_urls text[], p_opts jsonb, p_compare int, p_until date) returns void language plpgsql as $$
declare pid uuid;
begin
  if p_store is null then return; end if;
  if exists (select 1 from public.products where store_id = p_store and title = p_title) then return; end if;
  insert into public.products (seller_id, store_id, title, description, price, stock, image_url, category_id, is_active,
                               compare_at_price, offer_expires_at)
  select s.owner_id, s.id, p_title, p_desc, p_price, p_stock, p_urls[1],
         (select id from public.categories where slug = p_cat), true, p_compare, p_until
    from public.stores s where s.id = p_store
  returning id into pid;
  insert into public.product_images (product_id, url, position)
  select pid, u, o - 1 from unnest(p_urls) with ordinality as t(u, o);
  perform pg_temp.bl_add_options(pid, p_opts);
end $$;

alter table public.products disable trigger products_require_transfer_alias;


-- Bebidas La Esquina
select pg_temp.bl_upsert_product('75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid, 'bebidas', 'Agua saborizada Brío', 'Agua saborizada Brío en botella familiar, bien fría. Elegí el sabor: naranja o pomelo.', 1900, 90, '{/img/productos/agua-saborizada-brio-naranja.webp,/img/productos/agua-saborizada-brio-pomelo.webp}'::text[], '[{"name": "Sabor", "values": ["Naranja", "Pomelo"]}]'::jsonb, 2300, '2026-11-08'::date);
select pg_temp.bl_upsert_product('75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid, 'bebidas', 'Aquarius Naranja', 'Bebida sabor naranja en botella familiar (en la foto, dos botellas).', 2700, 60, '{/img/productos/aquarius-naranja.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid, 'bebidas', 'Gaseosa Cunnington 1,5 L', 'Gaseosas Cunnington de 1,5 L en tres sabores: pomelo clásico, naranja clásica y lima limón.', 2400, 80, '{/img/productos/cunnington-pomelo-naranja-lima-limon.webp}'::text[], '[{"name": "Sabor", "values": ["Pomelo clásico", "Naranja clásica", "Lima limón"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid, 'bebidas', 'Cunnington Indian Tonic', 'Agua tónica Cunnington en botella, ideal para tragos.', 2300, 50, '{/img/productos/cunnington-tonica.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid, 'bebidas', 'Sprite botella individual', 'Sprite lima-limón en botella individual.', 2100, 100, '{/img/productos/sprite-botella-individual.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid, 'bebidas', 'Sprite en lata', 'Sprite lima-limón en lata, lista para llevar.', 1500, 120, '{/img/productos/sprite-lata.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid, 'bebidas', 'Speed Unlimited energizante lata 473 ml', 'Bebida energizante Speed Unlimited, lata de 473 ml.', 2200, 70, '{/img/productos/speed-unlimited-lata.webp}'::text[], '[]'::jsonb, 2600, '2026-10-31'::date);
select pg_temp.bl_upsert_product('75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid, 'bebidas', 'Vino tinto Toro 1 litro', 'Vino tinto Toro en envase brik de 1 litro. Venta a mayores de 18 años.', 2900, 60, '{/img/productos/vino-tinto-toro-brik.webp}'::text[], '[]'::jsonb, 3400, '2026-11-15'::date);
select pg_temp.bl_upsert_product('75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid, 'bebidas', 'Combo Santa Julia blanco x2 + Speed x2', 'Dos botellas de vino blanco Santa Julia y dos latas de Speed Unlimited, como en la foto. Venta a mayores de 18 años.', 19800, 15, '{/img/productos/santa-julia-blanco-y-speed.webp}'::text[], '[]'::jsonb, 23400, '2026-11-08'::date);

-- Cervecería El Barril
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1), 'bebidas', 'Cerveza Brahma botella', 'Brahma Chopp en botella, bien fría. Venta a mayores de 18 años.', 2400, 120, '{/img/productos/cerveza-brahma-botella.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1), 'bebidas', 'Cerveza Brahma lata', 'Brahma Chopp en lata. Venta a mayores de 18 años.', 1700, 200, '{/img/productos/cerveza-brahma-lata.webp}'::text[], '[]'::jsonb, 1950, '2026-10-31'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1), 'bebidas', 'Cerveza Budweiser botella', 'Budweiser en botella. Venta a mayores de 18 años.', 2300, 90, '{/img/productos/cerveza-budweiser-botella.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1), 'bebidas', 'Cerveza Corona botella', 'Corona en botella, "la cerveza más fina". Va muy bien con una rodaja de limón. Venta a mayores de 18 años.', 2900, 80, '{/img/productos/cerveza-corona-botella.webp}'::text[], '[]'::jsonb, 3300, '2026-11-08'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1), 'bebidas', 'Pack de latas Heineken', 'Pack cerrado de latas Heineken, ideal para juntadas y eventos. Venta a mayores de 18 años.', 48000, 20, '{/img/productos/pack-latas-heineken.webp}'::text[], '[]'::jsonb, 54000, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1), 'bebidas', 'Dr. Lemon XL con vodka', 'Dr. Lemon XL en botella grande: con vodka y pomelo, con vodka o con limón. Venta a mayores de 18 años.', 5200, 40, '{/img/productos/dr-lemon-xl-con-vodka.webp}'::text[], '[{"name": "Variedad", "values": ["Con vodka y pomelo", "Con vodka", "Con limón"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1), 'bebidas', 'Skyy Vodka clásico', 'Vodka Skyy clásico, destilado en San Francisco. Venta a mayores de 18 años.', 15500, 25, '{/img/productos/skyy-vodka-clasico.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1), 'bebidas', 'Skyy Infusions', 'Vodka Skyy Infusions saborizado: Blood Orange (naranja sanguínea) o Apricot (damasco). Venta a mayores de 18 años.', 14900, 30, '{/img/productos/skyy-infusions-blood-orange.webp,/img/productos/skyy-infusions-apricot.webp}'::text[], '[{"name": "Sabor", "values": ["Blood Orange", "Apricot"]}]'::jsonb, 16900, '2026-11-15'::date);

-- Kiosco El Paso
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'kiosco', 'Chicle Bazooka (caja)', 'Caja de chicles Bazooka. Sabor menta o tutti frutti.', 5400, 30, '{/img/productos/bazooka-menta.webp,/img/productos/bazooka-tutti-frutti.webp}'::text[], '[{"name": "Sabor", "values": ["Menta", "Tutti frutti"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'kiosco', 'Chicles Topline Extreme ácidos', 'Chicles sin azúcar Topline Extreme, de sabor ácido y frutal.', 700, 150, '{/img/productos/chicles-topline-extreme.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'kiosco', 'Chicles Topline Seven menta explosiva', 'Chicles sin azúcar Topline Seven, sabor menta explosiva (7 unidades de 2 g).', 1100, 100, '{/img/productos/topline-seven-menta-explosiva.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'kiosco', 'Bubbaloo caja 300 g', 'Caja de Bubbaloo, el chicle con relleno líquido, de 300 g. Elegí el sabor.', 6800, 25, '{/img/productos/bubbaloo-cajas.webp}'::text[], '[{"name": "Sabor", "values": ["Tutti frutti", "Menta", "Uva", "Frutilla"]}]'::jsonb, 7800, '2026-10-31'::date);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'kiosco', 'Alfajor Bon o Bon negro', 'Alfajor Bon o Bon de chocolate negro, relleno de crema de maní.', 1100, 100, '{/img/productos/alfajor-bon-o-bon-negro.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'kiosco', 'Alfajor Mantecol', 'Alfajor Mantecol relleno de dulce de maní.', 1300, 80, '{/img/productos/alfajor-mantecol.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'kiosco', 'Alfajor Rasta chocolate negro', 'Alfajor Rasta de chocolate negro, el de la bolsita amarilla y verde.', 1200, 80, '{/img/productos/alfajor-rasta-chocolate-negro.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'kiosco', 'Mini torta Picnic', 'Mini torta Picnic con relleno cremoso y cobertura de chocolate.', 1000, 90, '{/img/productos/minitorta-picnic.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'kiosco', 'Mini torta Rapsodia', 'Mini torta Rapsodia, alfajor con cobertura y relleno cremoso.', 1100, 90, '{/img/productos/minitorta-rapsodia.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'kiosco', 'Mentitas D.R.F.', 'Cajita de mentitas D.R.F. (sin T.A.C.C.). Elegí el sabor: menta, cherry, dulce de leche, frutal o sandía.', 900, 200, '{/img/productos/mentitas-drf-menta.webp,/img/productos/mentitas-drf-cherry.webp,/img/productos/mentitas-drf-dulce-de-leche.webp,/img/productos/mentitas-drf-surtidas.webp}'::text[], '[{"name": "Sabor", "values": ["Menta", "Cherry", "Dulce de leche", "Frutal", "Sandía"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'bebidas', 'Coca-Cola en botella de vidrio', 'Coca-Cola Sabor Original en botellita de vidrio, bien fría.', 2000, 100, '{/img/productos/coca-cola-vidrio.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'bebidas', 'Coca-Cola botella individual', 'Coca-Cola Sabor Original en botella individual.', 2300, 100, '{/img/productos/coca-cola-botella-individual.webp}'::text[], '[]'::jsonb, 2600, '2026-10-31'::date);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'bebidas', 'Dr. Lemon lata', 'Gaseosa Dr. Lemon sabor limón, en lata.', 1600, 100, '{/img/productos/dr-lemon-lata.webp}'::text[], '[]'::jsonb, null, null);

-- Golosinas Dulce Tentación
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Gomitas Mogul Extreme', 'Gomitas ácidas Mogul Extreme de 100 g: ladrillos de frutilla, tubitos mix frutal o sandía.', 1900, 80, '{/img/productos/mogul-extreme-ladrillos-tubitos.webp,/img/productos/mogul-extreme-sandia.webp}'::text[], '[{"name": "Variedad", "values": ["Ladrillos de frutilla", "Tubitos mix frutal", "Sandía ácida"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Gomitas Mogul Moras', 'Gomitas Mogul con forma de moras, bolsa de 100 g.', 1700, 80, '{/img/productos/mogul-moras.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Gomitas Mogul Cola', 'Gomitas Mogul con forma de botellitas de cola.', 1700, 80, '{/img/productos/mogul-cola.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Gomitas Mogul Ositos', 'Ositos de goma Mogul de colores y sabores frutales.', 1700, 80, '{/img/productos/mogul-ositos.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Gomitas Baby Doll', 'Gomitas Baby Doll en bolsa: manzana, naranja, uva y cereza.', 1800, 70, '{/img/productos/gomitas-baby-doll.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Gomitas Misky Fantasía', 'Gomitas azucaradas Misky Fantasía, bolsa grande para compartir.', 2400, 60, '{/img/productos/misky-fantasia.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Bluper Mega-16 tutti frutti', 'Bolsa de Bluper Mega-16 sabor tutti frutti, con caramelos masticables en rollitos.', 2600, 50, '{/img/productos/bluper-mega-16-tutti-frutti.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Pastillitas D.R.F.', 'Pastillitas D.R.F. en rollitos, de menta y otros sabores, en caja exhibidora.', 3800, 40, '{/img/productos/pastillitas-drf.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Rocklets 40 g', 'Rocklets de Arcor: chocolate con lentejas de colores. Elegí: clásicos, con pasta de maní o picantes.', 1200, 150, '{/img/productos/rocklets-40g.webp,/img/productos/rocklets-pasta-de-mani.webp,/img/productos/rocklets-picantes.webp}'::text[], '[{"name": "Variedad", "values": ["Clásicos", "Pasta de maní", "Picantes"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Mini Rocklets', 'Mini Rocklets: el mismo chocolate con lentejas de colores en tamaño chico.', 800, 150, '{/img/productos/mini-rocklets.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Box de gomitas surtidas', 'Box armado con gomitas surtidas: anillos, ositos, moras, tiritas ácidas y más. Para regalar o compartir.', 6500, 20, '{/img/productos/box-gomitas-surtidas.webp}'::text[], '[]'::jsonb, 7500, '2026-11-08'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Box de golosinas y chocolates', 'Box armado con chocolates, alfajores, Rocklets, Cofler, Bon o Bon y golosinas surtidas.', 11900, 15, '{/img/productos/box-golosinas-y-chocolates.webp}'::text[], '[]'::jsonb, 13900, '2026-11-08'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Combo de chocolates surtidos', 'Combo de chocolates: Milka, Cofler, KitKat, Ferrero Rocher, Bon o Bon, Guolis y más.', 14500, 15, '{/img/productos/combo-chocolates-surtidos.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), 'kiosco', 'Combo Arcor x3 cajas de bombones', 'Tres cajas de Arcor: El Kiosco en Casa, Selección (bombones) y Bon o Bon surtido.', 24900, 10, '{/img/productos/cajas-bombones-arcor.webp}'::text[], '[]'::jsonb, 28900, '2026-11-30'::date);

-- Super Baradero
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Coca-Cola Sabor Original botella grande', 'Coca-Cola Sabor Original en botella grande para toda la mesa.', 3500, 120, '{/img/productos/coca-cola-botella-grande.webp}'::text[], '[]'::jsonb, 3900, '2026-10-31'::date);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Fanta Naranja botella', 'Fanta sabor naranja en botella grande.', 3200, 100, '{/img/productos/fanta-naranja-botella.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Sprite botella grande', 'Sprite lima-limón en botella grande.', 3300, 100, '{/img/productos/sprite-botella-grande.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Sprite retornable', 'Sprite lima-limón en botella retornable.', 2600, 80, '{/img/productos/sprite-retornable.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Manaos Pomelo', 'Gaseosa Manaos sabor pomelo blanco en botella grande.', 2100, 100, '{/img/productos/manaos-pomelo.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Agua saborizada Levite', 'Agua saborizada Levite de 1,5 L, de Villa del Sur. Elegí el sabor: naranja, manzana o pera.', 2000, 100, '{/img/productos/agua-saborizada-levite.webp}'::text[], '[{"name": "Sabor", "values": ["Naranja", "Manzana", "Pera"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Agua mineral Villavicencio', 'Agua mineral Villavicencio sin gas en botella.', 1500, 150, '{/img/productos/agua-villavicencio.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Pack Cunnington cola sin azúcar x3', 'Pack de tres botellas de Cunnington cola sin azúcar, listo para llevar.', 11800, 25, '{/img/productos/pack-cunnington-cola-sin-azucar.webp}'::text[], '[]'::jsonb, 13600, '2026-11-15'::date);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Pack Sprite', 'Pack de botellas de Sprite lima-limón, envuelto y listo para llevar.', 13500, 25, '{/img/productos/pack-sprite.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Galletitas Rumba', 'Galletitas Rumba de Bagley con relleno y cobertura de chocolate.', 1400, 100, '{/img/productos/galletitas-rumba.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'supermercado', 'Caramelos Sugus', 'Caramelos masticables Sugus de colores y sabores frutales.', 1800, 90, '{/img/productos/caramelos-sugus.webp}'::text[], '[]'::jsonb, null, null);

-- Almacén Don José
select pg_temp.bl_upsert_product('52c0a082-e18b-41ee-abd4-d881e4c8bc57'::uuid, 'almacen', 'Bizcochos Don Satur', 'Bizcochos Don Satur: de grasa, negrito (bolsa de 200 g) o dulces. Elegí el tipo.', 1800, 120, '{/img/productos/bizcochos-de-grasa-don-satur.webp,/img/productos/bizcocho-negrito-don-satur.webp,/img/productos/bizcochos-dulces-don-satur.webp}'::text[], '[{"name": "Tipo", "values": ["De grasa", "Negrito", "Dulces"]}]'::jsonb, 2100, '2026-11-08'::date);
select pg_temp.bl_upsert_product('52c0a082-e18b-41ee-abd4-d881e4c8bc57'::uuid, 'almacen', 'Mentitas Ambrosoli', 'Mentitas Ambrosoli en bolsita: pastillas de menta para el aliento.', 900, 150, '{/img/productos/mentitas-ambrosoli.webp}'::text[], '[]'::jsonb, null, null);

alter table public.products enable trigger products_require_transfer_alias;

-- Cupones por comercio (porcentaje, vencen el 30/11/2026).
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'ELPASO10', 10, true, timestamptz '2026-11-30 23:59:59-03', '341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid where '341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid is not null on conflict (code) do nothing;
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'DULCE15', 15, true, timestamptz '2026-11-30 23:59:59-03', (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1) where (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1) is not null on conflict (code) do nothing;
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'BARRIL10', 10, true, timestamptz '2026-11-30 23:59:59-03', (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1) where (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1) is not null on conflict (code) do nothing;
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'LAESQUINA5', 5, true, timestamptz '2026-11-30 23:59:59-03', '75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid where '75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid is not null on conflict (code) do nothing;
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'SUPERBARADERO5', 5, true, timestamptz '2026-11-30 23:59:59-03', '6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid where '6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid is not null on conflict (code) do nothing;

-- Banners del inicio: cada espacio pasa a la promo de un comercio (la imagen ya trae su texto).
-- home_promos_guard solo deja asignar comercio a un admin logueado: se apaga mientras corre.
alter table public.home_promos disable trigger home_promos_guard;
update public.home_promos set store_id = '75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid, product_id = (select id from public.products where store_id = '75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid and title = 'Agua saborizada Brío' limit 1), image_url = '/img/promos/promo-bebidas-la-esquina.webp', title = 'Hasta 17% OFF en bebidas y combos', is_active = true, updated_at = now() where slot = 'mosaic_a' and '75816d1f-25c3-4c8a-8f98-7cf5001653da'::uuid is not null;
update public.home_promos set store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1), product_id = (select id from public.products where store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1) and title = 'Pack de latas Heineken' limit 1), image_url = '/img/promos/promo-cerveceria-el-barril.webp', title = 'Pack Heineken con 11% OFF', is_active = true, updated_at = now() where slot = 'mosaic_b' and (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+cerveceria@gmail.com' limit 1) is not null;
update public.home_promos set store_id = '341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, product_id = null, image_url = '/img/promos/promo-kiosco-el-paso.webp', title = 'Cupón ELPASO10: 10% en todo el kiosco', is_active = true, updated_at = now() where slot = 'mosaic_c' and '341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid is not null;
update public.home_promos set store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1), product_id = (select id from public.products where store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1) and title = 'Box de gomitas surtidas' limit 1), image_url = '/img/promos/promo-golosinas-dulce-tentacion.webp', title = 'Armá tu box desde $6.500', is_active = true, updated_at = now() where slot = 'mosaic_d' and (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+golosinas@gmail.com' limit 1) is not null;
update public.home_promos set store_id = '6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, product_id = (select id from public.products where store_id = '6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid and title = 'Pack Cunnington cola sin azúcar x3' limit 1), image_url = '/img/promos/promo-super-baradero.webp', title = 'Packs de gaseosas con descuento', is_active = true, updated_at = now() where slot = 'mosaic_e' and '6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid is not null;
update public.home_promos set store_id = '52c0a082-e18b-41ee-abd4-d881e4c8bc57'::uuid, product_id = (select id from public.products where store_id = '52c0a082-e18b-41ee-abd4-d881e4c8bc57'::uuid and title = 'Bizcochos Don Satur' limit 1), image_url = '/img/promos/promo-almacen-don-jose.webp', title = 'Bizcochos Don Satur: 14% OFF', is_active = true, updated_at = now() where slot = 'mosaic_f' and '52c0a082-e18b-41ee-abd4-d881e4c8bc57'::uuid is not null;
alter table public.home_promos enable trigger home_promos_guard;

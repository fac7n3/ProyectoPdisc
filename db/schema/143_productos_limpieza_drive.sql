-- 143_productos_limpieza_drive.sql (2026-10-25)
--
-- Productos armados con las fotos NUEVAS de la carpeta "Limpieza" del Drive de la cuenta
-- (cargadas el 2026-10-25). Solo datos, sin cambios de esquema. Mismo criterio que la 125/129/134/141/142:
-- nombre, descripción y opciones salen de lo que se ve en cada foto; cuando una foto muestra
-- variantes (colores, fragancias, marcas) van como opciones y todas las fotos del mismo producto
-- van en product_images (la primera es la principal).
--
-- ORDEN: aplicar DESPUES de que el deploy con public/img/productos/*.webp, public/img/promos/*.webp
-- y public/img/comercios/*.webp esté en producción; si no, productos, banners y logos salen rotos.
--
-- Comercios (mezclando rubros, como en un barrio real):
--   * Casa Limpia Baradero y Bazar La Casita: cuentas de prueba NUEVAS
--     (proyectopdisc+casalimpia@gmail.com / proyectopdisc+lacasita@gmail.com), creadas aparte
--     (auth.users + auth.identities, rol vendedor con la bandera app.role_change_authorized); acá se
--     las busca por email. Sin la cuenta, no se inserta su comercio ni sus productos.
--   * Todo Limpio S.A., Perfumería Lavanda, Farmacia Central, Super Baradero y Almacén Don José (seed):
--     suman escobas, jabones, algodón, hisopos, cepillos, rollos de cocina y detergente para la ropa.
-- Ofertas: 8 productos con precio tachado (compare_at_price) y fecha de fin (offer_expires_at).
-- Cupones por comercio y 2 banners del inicio (home_promos): al final. Los banners reemplazan la
-- publicidad 3 del espacio d (Kiosco El Paso sigue en el espacio c) y la 3 del espacio c (Farmacia
-- Central sigue con sus productos y su página).
--
-- Ningún comercio de prueba tiene alias bancario (no se inventa uno): products_require_transfer_alias
-- (migración 107) se apaga mientras corre y se prende de nuevo al final. Idempotente: un producto
-- no se inserta si el comercio ya tiene uno con el mismo título.
--
-- Fotos del Drive sin usar a propósito: los cestos de ropa (marca de agua "Decor djfj") y el kit de
-- baño negro (números de otro sitio sobre la foto). Quedaron sin subir las fotos chicas (menos de
-- ~37 KB) que el conector de Drive no puede bajar a disco.


insert into public.stores (owner_id, name, status, category_slug, description, zone, hours, contact_method)
select u.id, 'Casa Limpia Baradero', 'approved', 'limpieza', 'Cif, Magistral, desodorantes de piso, detergentes y todo para dejar la casa impecable. Atendemos de lunes a sábado en Baradero.', 'Baradero', to_jsonb('Lunes a sábado de 8:30 a 13:00 y de 16:30 a 20:30'::text), 'none'
from auth.users u
where u.email = 'proyectopdisc+casalimpia@gmail.com' and not exists (select 1 from public.stores s where s.owner_id = u.id);

insert into public.stores (owner_id, name, status, category_slug, description, zone, hours, contact_method)
select u.id, 'Bazar La Casita', 'approved', 'limpieza', 'Escobas, mopas, esponjas, paños, tachos y artículos para el baño y la cocina. Aspiradoras y robots para la casa.', 'Baradero', to_jsonb('Lunes a sábado de 9:00 a 13:00 y de 17:00 a 20:30'::text), 'none'
from auth.users u
where u.email = 'proyectopdisc+lacasita@gmail.com' and not exists (select 1 from public.stores s where s.owner_id = u.id);

-- Rubro, logo y banner de la cabecera de cada comercio nuevo (solo si estaban vacíos).
update public.stores set category_slug = coalesce(category_slug, 'limpieza'), banner_url = coalesce(banner_url, '/img/comercios/banner-casa-limpia-baradero.webp'), logo_url = coalesce(logo_url, '/img/comercios/logo-casa-limpia-baradero.webp') where id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1);
update public.stores set category_slug = coalesce(category_slug, 'limpieza'), banner_url = coalesce(banner_url, '/img/comercios/banner-bazar-la-casita.webp'), logo_url = coalesce(logo_url, '/img/comercios/logo-bazar-la-casita.webp') where id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1);
update public.stores set category_slug = coalesce(category_slug, 'limpieza'), banner_url = coalesce(banner_url, '/img/comercios/banner-todo-limpio.webp') where id = '081c95b5-decb-404b-9394-50c72244b76e'::uuid;

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


-- Casa Limpia Baradero
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Cif Crema Multiuso Original 450 ml', 'Limpiador cremoso Cif Multiuso Original de 450 ml, para sacar la suciedad difícil de cocina y baño.', 4900, 60, '{/img/productos/cif-crema-multiuso-original.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Cif Ultra Brillo Multisuperficies', 'Limpiador Cif Ultra Brillo multisuperficies: gatillo con aroma y repuesto económico en doypack.', 5800, 40, '{/img/productos/cif-ultra-brillo-multisuperficies.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Cif Expert Vidrios y Multiuso repuesto 900 ml', 'Repuesto económico Cif Expert para vidrios y superficies, x3 poder de limpieza, doypack de 900 ml.', 4200, 50, '{/img/productos/cif-expert-limpiavidrios-repuesto.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Cif Expert Antigrasa gatillo y repuesto', 'Cif Expert antigrasa x3 poder desengrasante: gatillo de 450 ml y repuesto económico para cocinas y hornallas.', 6100, 40, '{/img/productos/cif-expert-antigrasa.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Combo Cif Profesional para la cocina', 'Línea Cif Professional para cocinas grandes: bidones de 5 L y limpiador en crema de 2 L. Elegí el producto.', 9900, 20, '{/img/productos/combo-cif-cocina-bidones.webp}'::text[], '[{"name": "Producto", "values": ["Detergente neutro 5 L", "Pisos lavanda 5 L", "Antigrasa en fragancia 5 L", "Limpiador en crema 2 L"]}]'::jsonb, 11500, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Detergente en polvo Cif Profesional 2,4 kg', 'Detergente en polvo Cif de limpieza profesional, bolsa de 2,4 kg, para superficies muy sucias.', 8900, 30, '{/img/productos/detergente-polvo-cif-profesional.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Detergente Magistral Ultra Desengrasante 500 ml', 'Lavavajillas Magistral de 500 ml con x5 poder antigrasa. Elegí la variedad.', 2900, 80, '{/img/productos/magistral-variedades.webp,/img/productos/magistral-limon.webp}'::text[], '[{"name": "Variedad", "values": ["Limón", "Aloe", "Multiuso power"]}]'::jsonb, 3400, '2026-11-08'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Desodorante de piso Poett', 'Limpiador desodorante de pisos Poett en botella con tapa de rosca. Elegí el color.', 2600, 100, '{/img/productos/desodorante-piso-poett.webp}'::text[], '[{"name": "Color", "values": ["Verde oscuro", "Violeta oscuro", "Violeta", "Rojo", "Amarillo", "Verde", "Celeste"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Limpiador de pisos Héroe', 'Limpiador desengrasante aromatizante de pisos Héroe en botella. Elegí la fragancia.', 2300, 100, '{/img/productos/limpiador-pisos-heroe.webp}'::text[], '[{"name": "Fragancia", "values": ["Floral rosa", "Verde", "Azul marina"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Desodorante de piso concentrado a granel', 'Desodorante de pisos concentrado, fraccionado en botella con etiqueta. Elegí el aroma.', 2800, 70, '{/img/productos/desodorante-piso-concentrado-granel.webp}'::text[], '[{"name": "Aroma", "values": ["Cocovai", "Chicle", "Algodón", "Deja Vu", "Uva"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Aromatizador de ambientes Glade spray', 'Aromatizador de ambientes Glade en botella con gatillo. Elegí la fragancia.', 4200, 50, '{/img/productos/aromatizador-glade-ambientes.webp}'::text[], '[{"name": "Fragancia", "values": ["Lavanda", "Ropa limpia", "Rosas", "Aqua"]}]'::jsonb, 4900, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), 'limpieza', 'Aromatizantes Glade para pisos x3', 'Tres frascos Glade para aromatizar pisos y ambientes, en verde, violeta y celeste.', 5400, 30, '{/img/productos/aromatizantes-glade-pisos.webp}'::text[], '[]'::jsonb, null, null);

-- Bazar La Casita
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Aspiradora inalámbrica vertical', 'Aspiradora inalámbrica de mano y vertical, con cepillo motorizado y depósito transparente.', 78900, 6, '{/img/productos/aspiradora-inalambrica-vertical.webp}'::text[], '[]'::jsonb, 89900, '2026-11-30'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Robot aspirador con base', 'Robot aspirador blanco con base de carga, para mantener los pisos limpios sin esfuerzo.', 289900, 3, '{/img/productos/robot-aspirador-con-base.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Mopa giratoria con balde', 'Mopa giratoria con mango telescópico y balde con centrifugado. Viene en su caja con cabezal de repuesto.', 24900, 12, '{/img/productos/mopa-giratoria-con-balde.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Tacho de acero inoxidable con pedal', 'Tacho de basura de acero inoxidable con tapa y pedal, apto para baño y cocina.', 11900, 15, '{/img/productos/tacho-acero-inoxidable-pedal.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Tacho blanco con tapa de bambú y canasto', 'Tacho blanco con pedal y tapa de bambú, más canasto de tela a rayas para la ropa.', 28900, 8, '{/img/productos/tacho-blanco-bambu-y-canasto.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Set de baño gris piedra', 'Set de baño de 3 piezas efecto piedra: dispenser de jabón con bomba negra, vaso y jabonera.', 9800, 15, '{/img/productos/set-bano-gris-piedra.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Set de paños de cocina tejidos', 'Set de tres paños tejidos en tonos durazno, lila y verde agua, absorbentes, para la cocina.', 5900, 30, '{/img/productos/set-panos-cocina-tejidos.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Paños de microfibra de colores', 'Paños de microfibra suaves y absorbentes, aptos para vidrios y superficies. Colores surtidos.', 2900, 80, '{/img/productos/panos-microfibra-colores.webp}'::text[], '[{"name": "Color", "values": ["Naranja", "Verde", "Violeta"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Set esponja y lana de acero', 'Set de cocina con esponja doble faz verde y amarilla y dos esponjas de acero.', 2600, 60, '{/img/productos/set-esponja-y-lana-de-acero.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Esponjas Scrub Daddy pack x8', 'Pack de 8 esponjas Scrub Daddy con carita sonriente, en colores y texturas surtidas.', 21900, 10, '{/img/productos/scrub-daddy-pack-x8.webp}'::text[], '[]'::jsonb, 25900, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Esponja de acero con mango', 'Esponjas de acero para ollas y sartenes, con mango de plástico para agarrar mejor. Elegí el mango.', 3200, 50, '{/img/productos/esponjas-acero-con-mango.webp}'::text[], '[{"name": "Mango", "values": ["Verde claro", "Rosa"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), 'limpieza', 'Cepillo de lavar con mango', 'Cepillo de cerdas firmes con mango ergonómico para ropa, zapatillas y superficies. Elegí el color.', 2400, 70, '{/img/productos/cepillos-lavar-rosa-azul.webp}'::text[], '[{"name": "Color", "values": ["Rosa", "Celeste"]}]'::jsonb, null, null);

-- Todo Limpio S.A.
select pg_temp.bl_upsert_product('081c95b5-decb-404b-9394-50c72244b76e'::uuid, 'limpieza', 'Escoba abanico de cerda rosa', 'Escoba abanico de cerda rosa con cabezal blanco y mango de madera, para pisos y rincones.', 7200, 25, '{/img/productos/escoba-abanico-cerda-rosa.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('081c95b5-decb-404b-9394-50c72244b76e'::uuid, 'limpieza', 'Escoba de plástico', 'Escoba de plástico con cerda y mango de colores. Elegí el color.', 4800, 60, '{/img/productos/escobas-plastico-colores.webp,/img/productos/escobas-plastico-mango-estampado.webp}'::text[], '[{"name": "Color", "values": ["Naranja", "Verde", "Celeste", "Rosa", "Violeta"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('081c95b5-decb-404b-9394-50c72244b76e'::uuid, 'limpieza', 'Escoba y pala roja', 'Escoba de cerda negra y pala con mango, en rojo, para la limpieza de todos los días.', 9500, 30, '{/img/productos/escoba-y-pala-rojo.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('081c95b5-decb-404b-9394-50c72244b76e'::uuid, 'limpieza', 'Combo pala, escoba y secador de piso blanco', 'Combo blanco de pala con mango, escoba y secador de piso con mango largo.', 14900, 15, '{/img/productos/combo-pala-escoba-secador-blanco.webp}'::text[], '[]'::jsonb, 17500, '2026-11-08'::date);
select pg_temp.bl_upsert_product('081c95b5-decb-404b-9394-50c72244b76e'::uuid, 'limpieza', 'Cabezal de rastrillo de plástico para hojas', 'Cabezales de rastrillo de plástico liviano para juntar hojas y pasto, para colocar en un mango. Elegí el color.', 3900, 40, '{/img/productos/rastrillos-plastico-hojas.webp}'::text[], '[{"name": "Color", "values": ["Celeste", "Naranja"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('081c95b5-decb-404b-9394-50c72244b76e'::uuid, 'limpieza', 'Trapos de piso grises x4', 'Cuatro trapos de piso grises, gruesos y absorbentes.', 3400, 70, '{/img/productos/trapos-de-piso-grises.webp}'::text[], '[]'::jsonb, null, null);

-- Perfumería Lavanda
select pg_temp.bl_upsert_product('4aae6be9-c1da-40c9-ab7b-4b34844f13f9'::uuid, 'perfumeria', 'Jabón en barra Lux Botanicals Rosas Francesas 120 g', 'Jabón con glicerina Lux Botanicals Rosas Francesas, con vitamina C y aceites esenciales, de 120 g.', 1400, 80, '{/img/productos/jabon-barra-lux-rosas-francesas.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('4aae6be9-c1da-40c9-ab7b-4b34844f13f9'::uuid, 'perfumeria', 'Jabón líquido para manos Lux Glicerina 300 ml', 'Jabón líquido para manos Lux con glicerina y aceites hidroflorales, dosificador de 300 ml. Elegí la variedad.', 4200, 50, '{/img/productos/jabon-liquido-lux-manos.webp}'::text[], '[{"name": "Variedad", "values": ["Manzanilla", "Bromelia"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('4aae6be9-c1da-40c9-ab7b-4b34844f13f9'::uuid, 'perfumeria', 'Repuesto jabón líquido Lux Botanicals 220 ml', 'Recarga económica de jabón líquido Lux Botanicals, doypack de 220 ml. Elegí la fragancia.', 2900, 60, '{/img/productos/repuesto-lux-rosas-francesas.webp,/img/productos/repuesto-lux-orquidea-negra.webp}'::text[], '[{"name": "Fragancia", "values": ["Rosas Francesas", "Orquídea Negra"]}]'::jsonb, 3400, '2026-11-15'::date);
select pg_temp.bl_upsert_product('4aae6be9-c1da-40c9-ab7b-4b34844f13f9'::uuid, 'perfumeria', 'Esponjas de ducha con cinta', 'Esponjas de ducha de malla con cinta para colgar. Elegí el color.', 1800, 70, '{/img/productos/esponjas-ducha-flor.webp}'::text[], '[{"name": "Color", "values": ["Rosa", "Verde agua", "Violeta", "Turquesa", "Blanco"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('4aae6be9-c1da-40c9-ab7b-4b34844f13f9'::uuid, 'perfumeria', 'Cepillo de silicona para el baño', 'Cepillos de silicona para masaje y limpieza en la ducha. Elegí el color.', 1900, 60, '{/img/productos/cepillos-silicona-bano.webp}'::text[], '[{"name": "Color", "values": ["Fucsia", "Verde agua", "Celeste", "Rosa"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('4aae6be9-c1da-40c9-ab7b-4b34844f13f9'::uuid, 'perfumeria', 'Discos de algodón Estrella x3 packs', 'Tres paquetes de discos de algodón Estrella de 60 unidades cada uno.', 3600, 50, '{/img/productos/discos-algodon-estrella-x3.webp}'::text[], '[]'::jsonb, null, null);

-- Farmacia Central
select pg_temp.bl_upsert_product('c61d5b9f-1bf8-4b03-96d4-633cfc061b12'::uuid, 'perfumeria', 'Algodón hidrófilo Doncella', 'Algodón hidrófilo Doncella extra suave y absorbente, en paquete.', 2700, 60, '{/img/productos/algodon-hidrofilo-doncella.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('c61d5b9f-1bf8-4b03-96d4-633cfc061b12'::uuid, 'perfumeria', 'Hisopos Estrella x125', 'Hisopos descartables de algodón Estrella, en bolsa con cierre de 125 unidades.', 1500, 100, '{/img/productos/hisopos-estrella-x125.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('c61d5b9f-1bf8-4b03-96d4-633cfc061b12'::uuid, 'perfumeria', 'Cepillos de dientes Colgate', 'Cepillos de dientes Colgate de cerdas suaves y medias. Elegí el tipo.', 1600, 90, '{/img/productos/cepillos-colgate-surtidos.webp}'::text[], '[{"name": "Tipo", "values": ["Adulto", "Carbón activado", "Infantil"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('c61d5b9f-1bf8-4b03-96d4-633cfc061b12'::uuid, 'perfumeria', 'Bálsamo para labios original 7 g', 'Bálsamo hidratante para labios en pote de 7 g, tipo vaselina, para labios suaves.', 1800, 70, '{/img/productos/balsamo-labial-original.webp}'::text[], '[]'::jsonb, null, null);

-- Super Baradero
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'limpieza', 'Limpiador multiuso Fabuloso aroma sandía', 'Limpiador multiuso Fabuloso 2X concentrado, aroma sandía, botella grande.', 3900, 50, '{/img/productos/fabuloso-multiuso-sandia.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'limpieza', 'Detergente en polvo para la ropa', 'Detergente en polvo para lavar la ropa, en bolsa. Elegí la marca.', 6900, 40, '{/img/productos/detergentes-polvo-ropa-surtidos.webp}'::text[], '[{"name": "Marca", "values": ["Ace", "Ariel", "Premio", "Multi Clean"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'limpieza', 'Rollos de cocina Sussex Clásico x3', 'Pack de 3 rollos de cocina Sussex Clásico, 150 paños en total, ahora más blanco.', 3600, 70, '{/img/productos/rollos-cocina-sussex-x3.webp}'::text[], '[]'::jsonb, 4300, '2026-11-30'::date);

-- Almacén Don José
select pg_temp.bl_upsert_product('52c0a082-e18b-41ee-abd4-d881e4c8bc57'::uuid, 'limpieza', 'Rollos de cocina Elegante x3 de 50 paños', 'Pack de 3 rollos de cocina Elegante de 50 paños cada uno.', 3200, 60, '{/img/productos/rollos-cocina-elegante-x3.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('52c0a082-e18b-41ee-abd4-d881e4c8bc57'::uuid, 'limpieza', 'Jabón blanco en pan Seiseme 300 g', 'Jabón de lavar ropa en pan Seiseme de 300 g, eficaz contra las manchas y delicado con las prendas.', 1500, 80, '{/img/productos/jabon-blanco-seiseme.webp}'::text[], '[]'::jsonb, null, null);

alter table public.products enable trigger products_require_transfer_alias;

-- Cupones por comercio (porcentaje, vencen el 30/11/2026).
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'LIMPIO10', 10, true, timestamptz '2026-11-30 23:59:59-03', (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1) where (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1) is not null on conflict (code) do nothing;
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'CASITA5', 5, true, timestamptz '2026-11-30 23:59:59-03', (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1) where (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1) is not null on conflict (code) do nothing;
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'TODOLIMPIO5', 5, true, timestamptz '2026-11-30 23:59:59-03', '081c95b5-decb-404b-9394-50c72244b76e'::uuid where '081c95b5-decb-404b-9394-50c72244b76e'::uuid is not null on conflict (code) do nothing;

-- Banners del inicio. home_promos_guard solo deja asignar comercio a un admin logueado: se apaga mientras corre.
alter table public.home_promos disable trigger home_promos_guard;
update public.home_promos set store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1), product_id = (select p.id from public.products p where p.store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1) and p.title = 'Combo Cif Profesional para la cocina' limit 1), image_url = '/img/promos/promo-casa-limpia-baradero.webp', title = 'Cif y Magistral con hasta 15% OFF', is_active = true, updated_at = now() where slot = 'mosaic_d' and position = 3 and (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+casalimpia@gmail.com' limit 1) is not null;
update public.home_promos set store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1), product_id = (select p.id from public.products p where p.store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1) and p.title = 'Esponjas Scrub Daddy pack x8' limit 1), image_url = '/img/promos/promo-bazar-la-casita.webp', title = 'Esponjas Scrub Daddy con 15% OFF', is_active = true, updated_at = now() where slot = 'mosaic_c' and position = 3 and (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+lacasita@gmail.com' limit 1) is not null;
alter table public.home_promos enable trigger home_promos_guard;

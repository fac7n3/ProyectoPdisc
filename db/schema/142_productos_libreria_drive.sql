-- 142_productos_libreria_drive.sql (2026-10-24)
--
-- Productos armados con las fotos NUEVAS de la carpeta "Librería" del Drive de la cuenta
-- (cargadas el 2026-10-24). Solo datos, sin cambios de esquema. Mismo criterio que la 125/129/134/141:
-- nombre, descripción y opciones salen de lo que se ve en cada foto; cuando una foto muestra
-- variantes (colores, tamaños, diseños) van como opciones y todas las fotos del mismo producto
-- van en product_images (la primera es la principal).
--
-- ORDEN: aplicar DESPUES de que el deploy con public/img/productos/*.webp, public/img/promos/*.webp
-- y public/img/comercios/*.webp esté en producción; si no, productos, banners y logos salen rotos.
--
-- Comercios (mezclando rubros, como en un barrio real):
--   * Librería El Cuaderno y Papelería Arcoíris: cuentas de prueba NUEVAS
--     (proyectopdisc+elcuaderno@gmail.com / proyectopdisc+arcoiris@gmail.com), creadas aparte
--     (auth.users + auth.identities, rol vendedor con la bandera app.role_change_authorized); acá se
--     las busca por email. Sin la cuenta, no se inserta su comercio ni sus productos.
--   * Super Baradero y Kiosco El Paso (seed): suman útiles básicos (cuaderno Éxito, biromes y lápices
--     BIC, gomas, adhesivo), que en un comercio de barrio se venden junto con lo demás.
-- Ofertas: 7 productos con precio tachado (compare_at_price) y fecha de fin (offer_expires_at).
-- Cupones por comercio y 2 banners del inicio (home_promos): al final. Los banners reemplazan la
-- publicidad 2 y 3 del espacio f (Cervecería El Barril sigue en el espacio b y Super Baradero en el e).
--
-- Ningún comercio de prueba tiene alias bancario (no se inventa uno): products_require_transfer_alias
-- (migración 107) se apaga mientras corre y se prende de nuevo al final. Idempotente: un producto
-- no se inserta si el comercio ya tiene uno con el mismo título.
--
-- Fotos del Drive sin usar a propósito: las que traen la marca de otro negocio ("La Central Librería",
-- "Ooh La La!", "COLOR PASTEL", "dvdistribuidora"), el cartel de otra tienda detrás (Office), una marca
-- ajena sobre el cuaderno (Avon) y las lapiceras grabadas con un saludo municipal. Quedaron sin subir
-- las fotos chicas (menos de ~37 KB) que el conector de Drive no puede bajar a disco.


insert into public.stores (owner_id, name, status, category_slug, description, zone, hours, contact_method)
select u.id, 'Librería El Cuaderno', 'approved', 'libreria', 'Cuadernos, carpetas, repuestos, mapas y libretas para toda la escuela. Atendemos de lunes a sábado en Baradero.', 'Baradero', to_jsonb('Lunes a sábado de 8:30 a 12:30 y de 16:30 a 20:30'::text), 'none'
from auth.users u
where u.email = 'proyectopdisc+elcuaderno@gmail.com' and not exists (select 1 from public.stores s where s.owner_id = u.id);

insert into public.stores (owner_id, name, status, category_slug, description, zone, hours, contact_method)
select u.id, 'Papelería Arcoíris', 'approved', 'papeleria', 'Marcadores, resaltadores, lapiceras, lápices, adhesivos, tijeras y todo para dibujar y pintar con color.', 'Baradero', to_jsonb('Lunes a sábado de 9:00 a 13:00 y de 17:00 a 20:30'::text), 'none'
from auth.users u
where u.email = 'proyectopdisc+arcoiris@gmail.com' and not exists (select 1 from public.stores s where s.owner_id = u.id);

-- Rubro, logo y banner de la cabecera de cada comercio nuevo (solo si estaban vacíos).
update public.stores set category_slug = coalesce(category_slug, 'libreria'), banner_url = coalesce(banner_url, '/img/comercios/banner-libreria-el-cuaderno.webp'), logo_url = coalesce(logo_url, '/img/comercios/logo-libreria-el-cuaderno.webp') where id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1);
update public.stores set category_slug = coalesce(category_slug, 'papeleria'), banner_url = coalesce(banner_url, '/img/comercios/banner-papeleria-arcoiris.webp'), logo_url = coalesce(logo_url, '/img/comercios/logo-papeleria-arcoiris.webp') where id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1);

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


-- Librería El Cuaderno
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Carpeta N°3 con anillos tapa dura pastel', 'Carpeta N°3 con tapa dura texturada y anillos metálicos, en tonos pastel. Elegí el color.', 14500, 30, '{/img/productos/carpeta-n3-anillos-lila.webp,/img/productos/carpeta-n3-anillos-rosa.webp,/img/productos/carpetas-n3-anillos-colores-pastel.webp}'::text[], '[{"name": "Color", "values": ["Rosa pastel", "Lila", "Celeste", "Violeta", "Fucsia", "Verde agua"]}]'::jsonb, 16900, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Carpeta N°3 de dos tapas lisa', 'Carpeta N°3 de dos tapas, lisa, con dos perforaciones para sujetar las hojas. Elegí el color.', 6800, 40, '{/img/productos/carpetas-n3-dos-tapas-lisas.webp}'::text[], '[{"name": "Color", "values": ["Azul", "Rojo", "Verde"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Aros metálicos para carpeta', 'Aros metálicos abribles para armar carpetas, cuadernos y agendas a tu medida. Elegí el tamaño.', 1500, 80, '{/img/productos/aros-para-carpetas.webp}'::text[], '[{"name": "Tamaño", "values": ["Chico", "Mediano", "Grande", "Extra grande"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Cuaderno anillado con elástico', 'Cuaderno con espiral, tapa dura con diseño y banda elástica de cierre. Elegí el diseño.', 9800, 35, '{/img/productos/cuadernos-anillados-elastico-disenos.webp}'::text[], '[{"name": "Diseño", "values": ["Conchas azul", "Corazones rosa", "Flores rosa", "Luna y sol negro"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Cuaderno A4 espiral tapa blanda', 'Cuaderno A4 con espiral y tapa blanda con diseños en tonos rosa, verde y violeta. Diseños surtidos.', 8900, 40, '{/img/productos/cuadernos-a4-espiral-tapa-blanda.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Cuaderno Composition Book tapa dura', 'Cuaderno estilo Composition Book con tapa dura jaspeada y etiqueta para el nombre. Elegí el color.', 8500, 30, '{/img/productos/cuaderno-composition-book.webp}'::text[], '[{"name": "Color", "values": ["Negro jaspeado", "Blanco jaspeado"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Cuaderno Éxito espiral de colores', 'Cuaderno Éxito con espiral, tapa de colores lisos y papel de fibra de caña de azúcar. Elegí el color.', 7400, 60, '{/img/productos/cuaderno-exito-espiral-colores.webp}'::text[], '[{"name": "Color", "values": ["Celeste", "Violeta", "Verde claro", "Verde oscuro", "Rosa", "Naranja", "Amarillo", "Rojo", "Azul"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Cuaderno anillado Hogwarts Harry Potter', 'Cuaderno anillado de tapa dura negra con escudo de Hogwarts en dorado. Licencia Harry Potter.', 12900, 20, '{/img/productos/cuaderno-hogwarts-tapa-dura.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Set de 3 cuadernos diseño vitral', 'Set de tres cuadernos de tapa dura con diseños de vitrales y arquitectura, el del frente con banda elástica.', 18900, 15, '{/img/productos/set-3-cuadernos-vitral.webp}'::text[], '[]'::jsonb, 22000, '2026-11-08'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Libretas cosidas medianas con frases', 'Libretas medianas cosidas, con tapas ilustradas de flores y frases. Diseños surtidos.', 4200, 60, '{/img/productos/libretas-cosidas-medianas-frases.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Cuaderno anillado tapa lisa', 'Cuaderno anillado de tapa lisa en colores sobrios. Elegí el color.', 7900, 30, '{/img/productos/cuadernos-anillados-a5-lisos-4-colores.webp}'::text[], '[{"name": "Color", "values": ["Verde", "Bordó", "Gris oscuro", "Crema"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Repuesto Éxito N°3 288 hojas cuadriculadas', 'Repuesto de carpeta Éxito N°3 de 288 hojas cuadriculadas, papel de 100 g/m², con margen reforzado.', 8600, 40, '{/img/productos/repuesto-exito-n3-288-cuadriculadas.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Repuesto Éxito N°3 480 hojas cuadriculadas', 'Repuesto de hojas para carpeta Éxito N°3, 480 hojas cuadriculadas con margen reforzado, papel obra de 100 g/m².', 12800, 40, '{/img/productos/repuesto-exito-n3-480-cuadriculadas.webp}'::text[], '[]'::jsonb, 14900, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Repuesto Éxito N°3 480 hojas rayadas', 'Repuesto de hojas para carpeta Éxito N°3, 480 hojas rayadas, versión tradicional.', 12800, 40, '{/img/productos/repuesto-exito-n3-480-rayadas.webp,/img/productos/repuesto-exito-n3-480-rayadas-pack.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Repuesto Rivadavia N°3 48 hojas rayadas', 'Repuesto Rivadavia N°3 de 48 hojas rayadas, papel blanco mate, hojas súper gruesas.', 3400, 60, '{/img/productos/repuesto-rivadavia-n3-rayadas.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Repuesto Rivadavia A4 96 hojas cuadriculadas', 'Repuesto Rivadavia A4 (210 x 297 mm) de 96 hojas cuadriculadas, papel blanco mate, hojas súper gruesas.', 6900, 40, '{/img/productos/repuesto-rivadavia-a4-cuadriculadas.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Repuesto Gloria N°3 480 hojas rayadas', 'Repuesto Gloria de 480 hojas rayadas (190 x 240 mm), en papel de fibra de caña de azúcar.', 11900, 25, '{/img/productos/repuesto-gloria-n3-rayadas.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Repuesto de dibujo N°5 Éxito blanco', 'Repuesto de hojas de dibujo Éxito N°5, blanco, 8 hojas de 120 g/m² (220 x 320 mm).', 1900, 80, '{/img/productos/repuesto-dibujo-n5-exito-blanco.webp,/img/productos/repuesto-dibujo-n5-exito-blanco-2.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Hojas de color N°5 Luma', 'Repuesto de dibujo de color Luma N°5, 6 hojas de colores surtidos.', 2400, 60, '{/img/productos/hojas-de-color-n5-luma.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Mapa N°3 Argentina político', 'Mapa N°3 de la República Argentina, político, con perforaciones para carpeta. Mundo Cartográfico.', 700, 200, '{/img/productos/mapa-n3-argentina-politico.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Mapa N°3 América político', 'Mapa N°3 de América, político, con perforaciones para carpeta. Mundo Cartográfico.', 700, 200, '{/img/productos/mapa-n3-america-politico.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), 'libreria', 'Mapa N°3 Planisferio político', 'Mapa N°3 del planisferio, político, con perforaciones para carpeta.', 700, 200, '{/img/productos/mapa-n3-planisferio-politico.webp}'::text[], '[]'::jsonb, null, null);

-- Papelería Arcoíris
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Fibras de colores surtidas', 'Fibras escolares de punta fina en una gran variedad de colores lisos y neón.', 9500, 40, '{/img/productos/fibras-de-colores-surtidas.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Marcadores escolares Faber-Castell Fiesta x20', 'Estuche de 20 marcadores escolares Faber-Castell Fiesta, trazo de 0,7 mm.', 8700, 35, '{/img/productos/marcadores-faber-castell-fiesta-x20.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Marcadores triangulares Ezco x24', 'Estuche con asa de 24 marcadores triangulares Ezco de colores, para dibujar con comodidad.', 12900, 25, '{/img/productos/marcadores-triangulares-ezco-x24.webp}'::text[], '[]'::jsonb, 14900, '2026-11-30'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Marcadores Filgo Pinto', 'Caja de marcadores de colores Filgo Pinto.', 6900, 40, '{/img/productos/marcadores-filgo-pinto.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Marcadores microfibra x12', 'Estuche de 12 marcadores de microfibra en colores vivos.', 5400, 50, '{/img/productos/marcadores-microfibra-x12.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Estuche de marcadores doble punta', 'Estuche transparente con una gran cantidad de marcadores doble punta de colores numerados.', 38900, 10, '{/img/productos/marcadores-doble-punta-estuche.webp}'::text[], '[]'::jsonb, 45000, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Resaltadores pastel', 'Resaltadores de punta biselada en colores pastel. Elegí el color.', 1900, 120, '{/img/productos/resaltadores-pastel-colores.webp,/img/productos/resaltadores-pastel-surtido.webp}'::text[], '[{"name": "Color", "values": ["Coral", "Menta", "Celeste", "Turquesa", "Lila", "Beige", "Gris", "Amarillo", "Rosa", "Verde manzana"]}]'::jsonb, 2400, '2026-11-08'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Lapiceras gel Filgo Gel Pop', 'Blister de lapiceras gel Filgo Gel Pop en colores brillantes.', 7500, 40, '{/img/productos/lapiceras-gel-filgo-gel-pop.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Multipack Footy de lapiceras gel x30', 'Estuche con 30 lapiceras gel Footy en una gran variedad de colores.', 18500, 20, '{/img/productos/multipack-footy-gel-x30.webp}'::text[], '[]'::jsonb, 22000, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Biromes de colores surtidas', 'Biromes transparentes con tinta de colores: marrón, violeta, rosa, naranja, celeste y verde.', 5200, 50, '{/img/productos/biromes-de-colores-surtidas.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Lápices de colores Filgo Pinto x12', 'Caja de 12 lápices de colores Filgo Pinto, con diseño de caritas y números.', 5900, 60, '{/img/productos/lapices-colores-filgo-pinto-x12.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Lápices de grafito de colores pastel', 'Lápices de grafito con cuerpo en colores pastel: celeste, lila, rosa y verde agua.', 4300, 50, '{/img/productos/lapices-grafito-pastel.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Plasticola Glitter', 'Adhesivo con brillo Plasticola Glitter de 31 g, no tóxico y lavable. Elegí el color.', 2800, 60, '{/img/productos/plasticola-glitter-colores.webp,/img/productos/plasticola-glitter-plata-oro.webp}'::text[], '[{"name": "Color", "values": ["Verde", "Azul", "Rojo", "Plateado", "Dorado"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Plasticola adhesivo vinílico', 'Adhesivo vinílico blanco Plasticola, lavable, en distintos tamaños. Elegí el tamaño.', 1800, 100, '{/img/productos/plasticola-adhesivo-vinilico.webp}'::text[], '[{"name": "Tamaño", "values": ["Chico", "Mediano", "Grande"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Adhesivo color Señorita 30 g', 'Adhesivo de color Señorita de 30 g. Elegí el color.', 1500, 80, '{/img/productos/adhesivo-color-senorita.webp}'::text[], '[{"name": "Color", "values": ["Azul", "Amarillo", "Verde", "Rojo"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Regla Maped cristal', 'Regla de plástico cristal Maped con números destacados. Elegí el largo.', 2300, 100, '{/img/productos/regla-maped-cristal-15cm.webp,/img/productos/regla-maped-cristal-20cm.webp}'::text[], '[{"name": "Largo", "values": ["15 cm", "20 cm"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Tijera escolar Skycolor', 'Tijera escolar con mango de colores y hojas de acero. Elegí el color.', 2600, 80, '{/img/productos/tijeras-escolares-skycolor.webp}'::text[], '[{"name": "Color", "values": ["Amarillo", "Rojo", "Verde", "Azul"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Tijera escolar Filgo Pinto', 'Tijera escolar Filgo Pinto con mango de colores. Elegí el color.', 3200, 60, '{/img/productos/tijeras-escolares-filgo-pinto.webp}'::text[], '[{"name": "Color", "values": ["Azul", "Rosa", "Naranja", "Verde limón"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Tijeras decorativas corte zig zag', 'Tijeras decorativas con hojas de corte ondulado y en zig zag, para manualidades.', 4800, 40, '{/img/productos/tijeras-decorativas-zig-zag.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Papel glacé lustre Luma x10 hojas', 'Papel glacé lustre Luma, 10 hojas de colores surtidos.', 1900, 100, '{/img/productos/papel-glace-lustre-luma.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), 'papeleria', 'Papel glacé metalizado Luma x10 hojas', 'Papel glacé metalizado Luma, 10 hojas con acabado dorado, celeste y colores surtidos.', 2300, 100, '{/img/productos/papel-glace-metalizado-luma-dorado-celeste.webp,/img/productos/papel-glace-metalizado-luma-rojo.webp}'::text[], '[]'::jsonb, null, null);

-- Super Baradero
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'libreria', 'Cuaderno Éxito N°3 tapa dura', 'Cuaderno Éxito N°3 de tapa dura, papel de fibra de caña de azúcar. Elegí el color.', 5800, 60, '{/img/productos/cuadernos-exito-n3-tapa-dura.webp}'::text[], '[{"name": "Color", "values": ["Azul", "Rojo", "Verde oscuro", "Verde claro", "Naranja", "Celeste", "Amarillo"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'papeleria', 'Birome BIC Cristal punta fina', 'Birome BIC Cristal de escritura fina, transparente. Elegí el color de la tinta.', 700, 200, '{/img/productos/birome-bic-cristal-azul-negro.webp}'::text[], '[{"name": "Color", "values": ["Azul", "Negro"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('6566cfb8-7cfc-42b2-8bdc-d156ca65037e'::uuid, 'papeleria', 'Lápiz de grafito BIC Evolution x4', 'Blister de 4 lápices de grafito BIC Evolution HB N°2, hexagonales, de punta resistente.', 3200, 60, '{/img/productos/lapiz-grafito-bic-evolution-x4.webp}'::text[], '[]'::jsonb, null, null);

-- Kiosco El Paso
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'papeleria', 'Goma de borrar Maped Technic', 'Goma de borrar blanca Maped Technic 300, de buen borrado y sin ensuciar.', 900, 100, '{/img/productos/goma-maped-technic.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'papeleria', 'Gomas de borrar bicolor rosa y azul', 'Gomas de borrar bicolor, mitad rosa y mitad azul, en caja.', 600, 150, '{/img/productos/gomas-borrar-bicolor-rosa-azul.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'papeleria', 'Gomas de borrar blancas Penguin', 'Gomas de borrar plásticas blancas Penguin, con funda azul.', 600, 150, '{/img/productos/gomas-borrar-blancas-penguin.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('341c3e7c-d803-4ed6-b6f7-6793c3602706'::uuid, 'papeleria', 'Adhesivo vinílico Tintoretto', 'Adhesivo vinílico (cola blanca) Tintoretto, lavable, en varios tamaños. Elegí el tamaño.', 1700, 80, '{/img/productos/adhesivo-vinilico-tintoretto.webp}'::text[], '[{"name": "Tamaño", "values": ["Chico", "Mediano", "Grande"]}]'::jsonb, null, null);

alter table public.products enable trigger products_require_transfer_alias;

-- Cupones por comercio (porcentaje, vencen el 30/11/2026).
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'CUADERNO10', 10, true, timestamptz '2026-11-30 23:59:59-03', (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1) where (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1) is not null on conflict (code) do nothing;
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'ARCOIRIS5', 5, true, timestamptz '2026-11-30 23:59:59-03', (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1) where (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1) is not null on conflict (code) do nothing;

-- Banners del inicio. home_promos_guard solo deja asignar comercio a un admin logueado: se apaga mientras corre.
alter table public.home_promos disable trigger home_promos_guard;
update public.home_promos set store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1), product_id = (select p.id from public.products p where p.store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1) and p.title = 'Carpeta N°3 con anillos tapa dura pastel' limit 1), image_url = '/img/promos/promo-libreria-el-cuaderno.webp', title = '14% OFF en carpetas y repuestos', is_active = true, updated_at = now() where slot = 'mosaic_f' and position = 2 and (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elcuaderno@gmail.com' limit 1) is not null;
update public.home_promos set store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1), product_id = (select p.id from public.products p where p.store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1) and p.title = 'Resaltadores pastel' limit 1), image_url = '/img/promos/promo-papeleria-arcoiris.webp', title = 'Resaltadores pastel con 21% OFF', is_active = true, updated_at = now() where slot = 'mosaic_f' and position = 3 and (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+arcoiris@gmail.com' limit 1) is not null;
alter table public.home_promos enable trigger home_promos_guard;

-- 141_productos_forrajeria_drive.sql (2026-10-23)
--
-- Productos armados con las fotos NUEVAS de la carpeta "Forrajería" del Drive de la cuenta
-- (cargadas el 2026-10-23). Solo datos, sin cambios de esquema. Mismo criterio que la 125/129/134:
-- nombre, descripción y opciones salen de lo que se ve en cada foto; cuando una foto muestra
-- variantes (aromas, colores, modelos) van como opciones y todas las fotos del mismo producto
-- van en product_images (la primera es la principal).
--
-- ORDEN: aplicar DESPUES de que el deploy con public/img/productos/*.webp, public/img/promos/*.webp
-- y public/img/comercios/*.webp esté en producción; si no, productos, banners y logos salen rotos.
--
-- Comercios:
--   * PetShop Huellitas (seed): camas, comederos, bebederos y juguetes. Pasa al rubro Forrajería y
--     suma descripción y banner de cabecera (ya tenía logo).
--   * Forrajería El Granero y Mimos y Paseos: cuentas de prueba NUEVAS
--     (proyectopdisc+elgranero@gmail.com / proyectopdisc+mimosypaseos@gmail.com), creadas aparte
--     (auth.users + auth.identities, rol vendedor con la bandera app.role_change_authorized); acá se
--     las busca por email. Sin la cuenta, no se inserta su comercio ni sus productos.
-- Ofertas: 12 productos con precio tachado (compare_at_price) y fecha de fin (offer_expires_at).
-- Cupones por comercio y 3 banners del inicio (home_promos): al final. Los banners reemplazan la
-- publicidad 2 y 3 del espacio e y la 2 del espacio d (PetShop Huellitas pasa a una imagen con sus
-- productos reales); Dulce Tentación (d1) y Bebidas La Esquina (a1) conservan su otra publicidad.
--
-- Ningún comercio de prueba tiene alias bancario (no se inventa uno): products_require_transfer_alias
-- (migración 107) se apaga mientras corre y se prende de nuevo al final. Idempotente: un producto
-- no se inserta si el comercio ya tiene uno con el mismo título.
--
-- Fotos del Drive sin usar a propósito: las que traen el logo de otra tienda ("Paraíso de mascotas",
-- "idepet", "Amigalitos", "Instituto Veterinario") y las capturas de historias de Instagram con
-- stickers y precios ajenos (Excellent gato adulto y las latas de Dog Chow). Quedaron sin subir las
-- fotos chicas (menos de ~40 KB) que el conector de Drive no puede bajar a disco.


insert into public.stores (owner_id, name, status, category_slug, description, zone, hours, contact_method)
select u.id, 'Forrajería El Granero', 'approved', 'forrajeria', 'Alimento balanceado para perros y gatos, arena sanitaria y semillas para aves. Entregas en Baradero.', 'Baradero', to_jsonb('Lunes a sábado de 8:30 a 13:00 y de 16:30 a 20:30'::text), 'none'
from auth.users u
where u.email = 'proyectopdisc+elgranero@gmail.com' and not exists (select 1 from public.stores s where s.owner_id = u.id);

insert into public.stores (owner_id, name, status, category_slug, description, zone, hours, contact_method)
select u.id, 'Mimos y Paseos', 'approved', 'forrajeria', 'Arneses, correas, ropita y juegos para gatos y perros. Todo para pasear y consentir a tu mascota.', 'Baradero', to_jsonb('Lunes a sábado de 9:00 a 13:00 y de 17:00 a 20:30'::text), 'none'
from auth.users u
where u.email = 'proyectopdisc+mimosypaseos@gmail.com' and not exists (select 1 from public.stores s where s.owner_id = u.id);

-- Rubro, descripción, logo y banner de la cabecera de cada comercio (solo si estaban vacíos).
update public.stores set category_slug = coalesce(category_slug, 'forrajeria'), description = coalesce(description, 'Camas, comederos, bebederos y juguetes para perros y gatos.'), banner_url = coalesce(banner_url, '/img/comercios/banner-petshop-huellitas.webp') where id = '51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid;
update public.stores set category_slug = coalesce(category_slug, 'forrajeria'), banner_url = coalesce(banner_url, '/img/comercios/banner-forrajeria-el-granero.webp'), logo_url = coalesce(logo_url, '/img/comercios/logo-forrajeria-el-granero.webp') where id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1);
update public.stores set category_slug = coalesce(category_slug, 'forrajeria'), banner_url = coalesce(banner_url, '/img/comercios/banner-mimos-y-paseos.webp'), logo_url = coalesce(logo_url, '/img/comercios/logo-mimos-y-paseos.webp') where id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1);

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


-- Forrajería El Granero
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Dog Chow Cachorros Gran Comienzo', 'Alimento Purina Dog Chow Gran Comienzo para cachorros de razas medianas y grandes. Sabor carne, pollo, verduras y leche.', 38900, 25, '{/img/productos/dog-chow-cachorros-gran-comienzo.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Excellent Cachorros razas medianas y grandes', 'Alimento super premium Purina Excellent Puppy para cachorros de razas medianas y grandes.', 62000, 15, '{/img/productos/excellent-puppy.webp}'::text[], '[]'::jsonb, 68000, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Excellent Perro Adulto', 'Alimento super premium Purina Excellent Adult para perros adultos. En la foto, junto a una bolsa de galletitas Cookies Advance.', 58500, 15, '{/img/productos/excellent-perro-adulto.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Pedigree Cachorros 1,5 kg', 'Alimento Pedigree para cachorros de 2 a 6 meses, bolsa de 1,5 kg con trocitos de carne.', 9800, 40, '{/img/productos/pedigree-cachorro-bolsa.webp,/img/productos/pedigree-cachorro-mano.webp}'::text[], '[]'::jsonb, 11500, '2026-11-08'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Maintenance Criadores Cachorros 3 kg', 'Alimento Maintenance Criadores para cachorros, sabor carne y pollo, bolsa de 3 kg.', 21500, 20, '{/img/productos/maintenance-criadores-cachorros.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Sabrositos Perro Adulto Mix', 'Alimento Sabrositos mix para perros adultos, con trocitos de colores.', 15900, 30, '{/img/productos/sabrositos-perro-adulto.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Pro Plan Sterilized pollo en salsa (caja de sobres)', 'Caja exhibidora de sobres Purina Pro Plan Sterilized para gatos esterilizados, pollo en salsa.', 14900, 20, '{/img/productos/proplan-sterilized-sobres.webp}'::text[], '[]'::jsonb, 16500, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Royal Canin Veterinary Renal sobre para gatos', 'Alimento húmedo Royal Canin Veterinary Renal para gatos, en sobre. Dieta veterinaria: consultá a tu veterinario.', 3400, 40, '{/img/productos/royal-canin-renal-sobre.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Pipas de girasol para aves Grana-A', 'Pipas de girasol negro con cáscara para aves de jardín, bolsa de 700 g.', 4900, 30, '{/img/productos/pipas-girasol-aves-grana.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Arena sanitaria Alta Gama 3,6 kg', 'Arena higiénica súper absorbente para gatos, bolsa de 3,6 kg. Elegí el aroma.', 7900, 40, '{/img/productos/arena-alta-gama-aromas.webp}'::text[], '[{"name": "Aroma", "values": ["Lavanda", "Floral", "Limón"]}]'::jsonb, 8900, '2026-11-30'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Arena sanitaria aglutinante Tambora lavanda', 'Arena sanitaria aglutinante para gatos, con aroma a lavanda.', 9600, 25, '{/img/productos/arena-sanitaria-tambora-lavanda.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Bentonita aglutinante Efesa Dry Way', 'Granulado mineral sanitario aglutinante para gatos Efesa Dry Way.', 8800, 25, '{/img/productos/arena-bentonita-efesa-dry-way.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), 'forrajeria', 'Bentonita aglutinante Zootec', 'Bentonita aglutinante para gatos Zootec: control de olores de larga duración y extra poder aglutinante.', 7400, 30, '{/img/productos/bentonita-zootec-aglutinante.webp}'::text[], '[]'::jsonb, 8200, '2026-10-31'::date);

-- PetShop Huellitas
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Cama moisés para perros y gatos', 'Cama moisés mullida con borde alto y base rayada, interior color caramelo.', 24500, 12, '{/img/productos/cama-moises-mascotas.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Cama cuadrada celeste', 'Cama cuadrada con almohadón y bordes acolchados, color celeste.', 22900, 12, '{/img/productos/cama-cuadrada-celeste-mascotas.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Camas donut de corderito', 'Camas redondas tipo donut de pelo corderito, suaves y abrigadas. Elegí el color.', 19800, 25, '{/img/productos/camas-donut-corderito.webp}'::text[], '[{"name": "Color", "values": ["Gris oscuro", "Rojo", "Amarillo", "Lila", "Marrón", "Rosa"]}]'::jsonb, 23500, '2026-11-08'::date);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Cama con estampa animal print', 'Cama redonda con interior estampado animal print y borde de colores.', 21500, 10, '{/img/productos/cama-animal-print.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Cama hexagonal acolchada', 'Cama acolchada con borde alto y vivos en contraste. Elegí el color.', 26500, 12, '{/img/productos/camas-hexagonales-mascotas.webp}'::text[], '[{"name": "Color", "values": ["Gris", "Rojo", "Marrón"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Camas suaves de peluche', 'Camas ovaladas de peluche con borde, en varios colores combinados.', 18900, 18, '{/img/productos/camas-suaves-peluche.webp}'::text[], '[]'::jsonb, 21900, '2026-11-15'::date);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Comedero doble elevado de madera', 'Comedero doble elevado de madera con dos cuencos, uno para comida y otro para agua.', 17900, 15, '{/img/productos/comedero-doble-elevado-madera.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Comedero lento para gatos', 'Comedero antivoracidad para gatos, con relieves que hacen comer más despacio.', 6900, 30, '{/img/productos/comedero-lento-gatos.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Comedero lento para perros', 'Comedero antivoracidad con relieves en forma de hueso, para perros que comen muy rápido.', 7900, 30, '{/img/productos/comedero-lento-perros-huesos.webp,/img/productos/comederos-lentos-colores.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Comedero doble elevado de acero', 'Soporte de madera con dos cuencos de acero inoxidable, para comida y agua.', 24900, 10, '{/img/productos/comedero-doble-acero-elevado.webp}'::text[], '[]'::jsonb, 28900, '2026-11-30'::date);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Comederos plásticos grandes', 'Comederos de plástico resistente, tamaño grande, en varios colores.', 3900, 50, '{/img/productos/comederos-plasticos-grandes.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Comederos plásticos chicos', 'Comederos de plástico resistente, tamaño chico, en varios colores.', 2400, 60, '{/img/productos/comederos-plasticos-chicos.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Bebedero automático', 'Bebedero automático con depósito transparente: se va llenando solo. Elegí el color.', 9900, 20, '{/img/productos/bebederos-automaticos-pastel.webp}'::text[], '[{"name": "Color", "values": ["Rosa claro", "Rosa", "Verde agua"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Dispenser automático de comida', 'Dispenser de comida con depósito transparente y plato incluido.', 15900, 15, '{/img/productos/dispenser-comida-automatico.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Set de juguetes para gatos', 'Set de juguetes para gatos: ratoncitos, pelotas de colores y bolitas con plumas.', 6400, 40, '{/img/productos/juguetes-gatos-set.webp}'::text[], '[]'::jsonb, 7500, '2026-11-08'::date);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Set de juguetes para perros', 'Set de juguetes para perros: sogas, huesitos, pelotas y un pollito de goma.', 8900, 30, '{/img/productos/juguetes-perros-set.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Pelotas de tenis con huellitas', 'Pack de tres pelotas de tenis con huellitas estampadas, para jugar y buscar.', 3900, 60, '{/img/productos/pelotas-tenis-huellitas.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product('51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, 'forrajeria', 'Treat Ball Giggle para perros', 'Pelota dispensadora de premios Giggle Tricky Treat Ball: se rellena con snacks y entretiene al perro.', 9400, 20, '{/img/productos/treat-ball-perros.webp}'::text[], '[]'::jsonb, null, null);

-- Mimos y Paseos
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1), 'forrajeria', 'Set arnés y correa para gatos', 'Set de arnés y correa para gatos, en colores lisos, azul cuadrillé o rosa con moño. Elegí el modelo.', 5900, 40, '{/img/productos/set-arnes-correa-gato-colores.webp,/img/productos/set-arnes-correa-gato-azul-cuadrille.webp,/img/productos/set-arnes-correa-gato-rosa-mono.webp}'::text[], '[{"name": "Modelo", "values": ["Colores lisos", "Azul cuadrillé", "Rosa con moño"]}]'::jsonb, 6900, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1), 'forrajeria', 'Arnés con alas para gatos', 'Arnés con correa y alitas de colores para pasear gatos. Elegí el color.', 5400, 30, '{/img/productos/arnes-gato-alas.webp}'::text[], '[{"name": "Color", "values": ["Verde", "Rojo", "Amarillo", "Rosa", "Celeste"]}]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1), 'forrajeria', 'Arnés reforzado K9 para perros', 'Arnés reforzado con franjas reflectivas, asa y letras "Police K9". Elegí el color.', 14900, 20, '{/img/productos/arnes-reforzado-k9-perros.webp}'::text[], '[{"name": "Color", "values": ["Negro", "Azul", "Camuflado", "Rojo"]}]'::jsonb, 17500, '2026-11-30'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1), 'forrajeria', 'Collares y correas de colores', 'Collares y correas de nylon y cuerina en muchos colores, con ojalillos metálicos.', 4500, 60, '{/img/productos/collares-y-correas-colores.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1), 'forrajeria', 'Buzo de lana para gatos', 'Buzito de lana rosa con cuello alto, para abrigar a tu gato en invierno.', 9800, 15, '{/img/productos/buzo-lana-gatos.webp}'::text[], '[]'::jsonb, null, null);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1), 'forrajeria', 'Rascador con cama y casita para gatos', 'Torre rascadora con casita de mimbre, cama en lo alto y postes forrados en soga.', 58000, 6, '{/img/productos/rascador-con-cama-gatos.webp}'::text[], '[]'::jsonb, 66000, '2026-11-15'::date);
select pg_temp.bl_upsert_product((select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1), 'forrajeria', 'Túnel plegable para gatos', 'Túnel plegable de colores para jugar y esconderse, con ventanitas.', 11900, 15, '{/img/productos/tuneles-gatos.webp}'::text[], '[]'::jsonb, null, null);

alter table public.products enable trigger products_require_transfer_alias;

-- Cupones por comercio (porcentaje, vencen el 30/11/2026).
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'GRANERO10', 10, true, timestamptz '2026-11-30 23:59:59-03', (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1) where (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1) is not null on conflict (code) do nothing;
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'HUELLITAS10', 10, true, timestamptz '2026-11-30 23:59:59-03', '51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid where '51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid is not null on conflict (code) do nothing;
insert into public.coupons (code, discount_percentage, is_active, expires_at, store_id) select 'MIMOS5', 5, true, timestamptz '2026-11-30 23:59:59-03', (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1) where (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1) is not null on conflict (code) do nothing;

-- Banners del inicio. home_promos_guard solo deja asignar comercio a un admin logueado: se apaga mientras corre.
alter table public.home_promos disable trigger home_promos_guard;
update public.home_promos set store_id = '51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid, product_id = (select p.id from public.products p where p.store_id = '51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid and p.title = 'Camas donut de corderito' limit 1), image_url = '/img/promos/promo-petshop-huellitas-camas.webp', title = 'Hasta 16% OFF en camas y juguetes', is_active = true, updated_at = now() where slot = 'mosaic_e' and position = 2 and '51dc2b22-88db-4966-ba3b-ba2d86100bcc'::uuid is not null;
update public.home_promos set store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1), product_id = (select p.id from public.products p where p.store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1) and p.title = 'Pedigree Cachorros 1,5 kg' limit 1), image_url = '/img/promos/promo-forrajeria-el-granero.webp', title = 'Pedigree cachorros con 15% OFF', is_active = true, updated_at = now() where slot = 'mosaic_e' and position = 3 and (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+elgranero@gmail.com' limit 1) is not null;
update public.home_promos set store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1), product_id = (select p.id from public.products p where p.store_id = (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1) and p.title = 'Arnés reforzado K9 para perros' limit 1), image_url = '/img/promos/promo-mimos-y-paseos.webp', title = 'Arnés K9 reforzado con 15% OFF', is_active = true, updated_at = now() where slot = 'mosaic_d' and position = 2 and (select s.id from public.stores s join auth.users u on u.id = s.owner_id where u.email = 'proyectopdisc+mimosypaseos@gmail.com' limit 1) is not null;
alter table public.home_promos enable trigger home_promos_guard;

-- Más espacios de banners en el inicio (2026-11-03, a pedido del usuario: "que
-- la página del home sea más larga y entren más banners").
--
-- El inicio tenía 6 espacios (mosaic_a..f, migraciones 108/137). Se suman 6,
-- repartidos entre las secciones de productos:
--   g  franja ancha 5:1   entre "Productos recomendados" y "Comercios cerca tuyo"
--   h  4:1 (izquierda)    entre "Esenciales" y "Ofertas"
--   i  4:1 (derecha)      idem
--   j  franja ancha 5:1   debajo de "Seguí descubriendo"
--   k  4:1 (izquierda)    cierre de la página
--   l  4:1 (derecha)      idem
-- Cada espacio sigue siendo un carrusel de hasta 3 publicidades (position 1 a 3).
-- Sin promo cargada muestra un banner fijo (home.html/home.css); el admin los
-- asigna desde el mismo panel que los seis de antes (js/home-promos-utils.js).
--
-- Solo se amplía el check de `slot` y se siembran las 18 filas vacías: ni
-- policies ni triggers cambian (home_promos_guard y el bucket `home-promos`
-- validan contra las filas de la tabla, no contra una lista fija).

alter table public.home_promos drop constraint if exists home_promos_slot_check;
alter table public.home_promos add constraint home_promos_slot_check
  check (slot in ('mosaic_a', 'mosaic_b', 'mosaic_c', 'mosaic_d', 'mosaic_e', 'mosaic_f',
                  'mosaic_g', 'mosaic_h', 'mosaic_i', 'mosaic_j', 'mosaic_k', 'mosaic_l'));

insert into public.home_promos (slot, position)
select s.slot, p.position
from (values ('mosaic_g'), ('mosaic_h'), ('mosaic_i'), ('mosaic_j'), ('mosaic_k'), ('mosaic_l')) as s(slot)
cross join (values (1), (2), (3)) as p(position)
on conflict (slot, position) do nothing;

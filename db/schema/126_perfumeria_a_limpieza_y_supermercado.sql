-- 126_perfumeria_a_limpieza_y_supermercado.sql (2026-10-07) -- DESHECHA por la 127 el mismo día.
--
-- El usuario confundió "perfumería" con "limpieza": las fotos del Drive con sufijo
-- "perfumeria" van a la categoría Limpieza, y lo de consumo diario que se vende en
-- cualquier súper (pañuelos, protectores, toallitas, jabones, desodorantes,
-- shampoo, acondicionadores y crema para peinar) va a Supermercado.
-- La categoría "Perfumería" (migración 124) queda sin productos y se borra; su
-- ícono sale de CATEGORY_ICONS (js/nav-utils.js).
-- Solo datos. Idempotente: si "perfumeria" ya no existe, no hace nada.
--
-- APLICADA el 2026-10-07 por execute_sql, SIN el delete final: los movimientos de
-- productos y comercios quedaron hechos (32 a Limpieza, 19 a Supermercado). El
-- DELETE de la categoría no se pudo correr: el conector de Supabase pide
-- confirmación para sentencias destructivas y, sin nadie que la aprobara, se cortó
-- a los 60 s (3 intentos, ninguno llegó a la base). Hasta borrarla, "Perfumería"
-- queda como categoría vacía y su ícono sigue en CATEGORY_ICONS.

do $$
declare
  v_perf uuid := (select id from public.categories where slug = 'perfumeria');
  v_limp uuid := (select id from public.categories where slug = 'limpieza');
  v_super uuid := (select id from public.categories where slug = 'supermercado');
begin
  if v_perf is null then return; end if;

  update public.products p set category_id = v_super
   where p.category_id = v_perf
     and (p.store_id = 'c61d5b9f-1bf8-4b03-96d4-633cfc061b12'  -- Farmacia Central: pañuelos, protectores, toallitas, jabones
          or p.title like 'Desodorante %'
          or p.title in ('Acondicionador Elvive Glycolic Gloss 370 ml 2x1', 'Acondicionador Sedal 650 ml',
                         'Shampoo Elvive Kera-Liso 200 ml', 'Crema para peinar Sedal 300 ml'));

  update public.products set category_id = v_limp where category_id = v_perf;

  update public.stores set category_slug = 'supermercado'
   where id = 'c61d5b9f-1bf8-4b03-96d4-633cfc061b12' and category_slug = 'perfumeria';
  update public.stores set category_slug = 'limpieza' where category_slug = 'perfumeria';

  delete from public.categories where id = v_perf;
end $$;

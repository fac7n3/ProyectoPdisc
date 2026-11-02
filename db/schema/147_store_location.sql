-- 147 — Ubicación del comercio (lat/lng) para el comparador de la búsqueda.
--
-- El comparador de precios de search.html muestra, cuando el mismo producto
-- está en varios comercios, una fila con el más barato y otra con el que le
-- queda más cerca a la persona. Para la segunda hace falta saber dónde está
-- cada comercio: hasta ahora solo había `address` (texto libre, cargado en 13
-- de 33) y `maps_url` (ninguno), sin coordenadas.
--
-- Solo agrega columnas (nullable). Las lee cualquiera, igual que el resto de
-- `stores` aprobados; las escribe el dueño por `stores_update_own`. Sin
-- ubicación cargada, el comercio aparece al final de la fila "Más cerca"
-- como "Sin ubicación cargada".
--
-- El dueño la carga en "Perfil de mi comercio" (vender.html): mapa de
-- OpenStreetMap con un pin que se toca o arrastra, "Estoy en mi local: usar mi
-- ubicación", "Buscar mi dirección" o un link largo de Google Maps
-- (js/store-location-map.js). Se guarda aparte del resto del perfil.

alter table public.stores
  add column if not exists lat double precision,
  add column if not exists lng double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stores_location_valid') then
    alter table public.stores
      add constraint stores_location_valid check (
        (lat is null and lng is null)
        or (lat between -90 and 90 and lng between -180 and 180)
      );
  end if;
end $$;

-- 147b (aplicada aparte, mismo día): el check de arriba deja pasar lat sin lng
-- (con lng NULL la condición da NULL y un CHECK con NULL pasa). Este exige
-- los dos o ninguno. Se sumó en vez de reemplazar el otro porque el conector
-- de Supabase se cuelga con un `drop constraint`.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stores_location_pair') then
    alter table public.stores
      add constraint stores_location_pair check ((lat is null) = (lng is null));
  end if;
end $$;

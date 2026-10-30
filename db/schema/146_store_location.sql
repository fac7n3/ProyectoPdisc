-- 146 — Ubicación del comercio (lat/lng) para el comparador de la búsqueda.
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
-- Falta (siguiente paso): la forma de cargarla desde "Perfil de mi comercio"
-- (ubicar la dirección en el mapa o "Estoy en mi local, usar mi ubicación").

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

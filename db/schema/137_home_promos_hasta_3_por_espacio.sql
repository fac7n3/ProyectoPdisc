-- Hasta 3 publicidades por espacio de banner del home (home_promos, migración 108).
--
-- Cada espacio del mosaico pasa de una promo a un carrusel de hasta 3: cada una
-- es una fila COMPLETA y propia (su comercio, su publicación de destino, su
-- título, su imagen y su on/off), así que pueden ser de comercios distintos.
-- El home las va pasando solas; al tocar el banner (imagen ampliada) aparecen
-- las flechas para recorrerlas, y el click lleva a la publicación de la que se
-- está viendo en ese momento.
--
-- Una fila fija por (espacio, posición): 6 espacios x 3 posiciones = 18 filas.
-- Las 6 que ya existen quedan como posición 1 (nada de lo cargado cambia); las
-- 12 nuevas arrancan libres (sin comercio). Igual que en la 108, nadie inserta
-- ni borra: "quitar" una promo es poner store_id en NULL.
alter table public.home_promos
  add column if not exists position smallint not null default 1
  check (position between 1 and 3);

-- Era una fila por espacio (`slot text not null unique` => home_promos_slot_key).
alter table public.home_promos drop constraint if exists home_promos_slot_key;
create unique index if not exists home_promos_slot_position_key
  on public.home_promos (slot, position);

insert into public.home_promos (slot, position)
select s.slot, p.position
from (values ('mosaic_a'), ('mosaic_b'), ('mosaic_c'), ('mosaic_d'), ('mosaic_e'), ('mosaic_f')) as s(slot)
cross join (values (2::smallint), (3::smallint)) as p(position)
on conflict (slot, position) do nothing;

-- Mismo trigger de la 108 con una sola diferencia: la posición tampoco la
-- puede cambiar el dueño (solo el admin asigna espacios).
create or replace function public.home_promos_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_admin boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin';
begin
  if not v_is_admin then
    if new.store_id is distinct from old.store_id
       or new.is_active is distinct from old.is_active
       or new.slot is distinct from old.slot
       or new.position is distinct from old.position then
      raise exception 'Solo un administrador puede asignar el espacio o activarlo.';
    end if;
  end if;

  if new.store_id is distinct from old.store_id then
    if new.image_url is not distinct from old.image_url then new.image_url := null; end if;
    if new.product_id is not distinct from old.product_id then new.product_id := null; end if;
    if new.title is not distinct from old.title then new.title := null; end if;
  end if;

  if new.product_id is not null then
    if new.store_id is null or not exists (
      select 1 from public.products p where p.id = new.product_id and p.store_id = new.store_id
    ) then
      raise exception 'La publicación elegida no es de ese comercio.';
    end if;
  end if;

  return new;
end;
$$;

-- Bucket `home-promos`: antes las imágenes iban en `{slot}/{timestamp}.{ext}` y
-- la policy dejaba subir/borrar al dueño del comercio del espacio. Con varias
-- publicidades por espacio, el dueño de la posición 2 no tiene que poder pisar
-- los archivos de la 1: ahora el path es `{slot}/{posición}/{timestamp}.{ext}` y
-- la policy exige que coincidan espacio Y posición. Los archivos viejos (sin
-- carpeta de posición) son de la posición 1.
drop policy if exists home_promos_insert_admin_or_owner on storage.objects;
create policy home_promos_insert_admin_or_owner on storage.objects for insert
to authenticated
with check (
  bucket_id = 'home-promos'
  and (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
    or exists (
      select 1 from public.home_promos hp
      join public.stores s on s.id = hp.store_id
      where hp.slot = (storage.foldername(name))[1]
        and hp.position::text = coalesce((storage.foldername(name))[2], '1')
        and s.owner_id = (select auth.uid())
    )
  )
);

drop policy if exists home_promos_delete_admin_or_owner on storage.objects;
create policy home_promos_delete_admin_or_owner on storage.objects for delete
to authenticated
using (
  bucket_id = 'home-promos'
  and (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
    or exists (
      select 1 from public.home_promos hp
      join public.stores s on s.id = hp.store_id
      where hp.slot = (storage.foldername(name))[1]
        and hp.position::text = coalesce((storage.foldername(name))[2], '1')
        and s.owner_id = (select auth.uid())
    )
  )
);

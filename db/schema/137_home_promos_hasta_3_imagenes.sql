-- Hasta 3 imágenes por espacio de banner del home (home_promos, migración 108).
--
-- Cada espacio del mosaico puede mostrar hasta 3 imágenes que van pasando
-- solas; al tocar el banner (imagen ampliada) aparecen las flechas para
-- recorrerlas. La primera sigue siendo `image_url` (así nada de lo que ya
-- está cargado cambia); las otras dos son `image_url_2` e `image_url_3`.
-- Las 3 comparten comercio, publicación de destino y título del espacio.
--
-- Aditiva: las dos columnas son nullable, el código viejo las ignora y el
-- código nuevo cae a una sola imagen si todavía no existen.
alter table public.home_promos
  add column if not exists image_url_2 text,
  add column if not exists image_url_3 text;

-- Mismo trigger de la 108, con una sola diferencia: cuando el admin cambia el
-- comercio de un espacio, también se limpian las imágenes 2 y 3 del comercio
-- anterior (salvo que vengan en el mismo update), igual que la imagen 1.
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
       or new.slot is distinct from old.slot then
      raise exception 'Solo un administrador puede asignar el espacio o activarlo.';
    end if;
  end if;

  if new.store_id is distinct from old.store_id then
    if new.image_url is not distinct from old.image_url then new.image_url := null; end if;
    if new.image_url_2 is not distinct from old.image_url_2 then new.image_url_2 := null; end if;
    if new.image_url_3 is not distinct from old.image_url_3 then new.image_url_3 := null; end if;
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

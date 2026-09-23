-- Promociones de comercios en los mosaicos de banners del home.
--
-- Hasta ahora los 6 espacios de banner del home (mosaico de arriba a/b/c +
-- mosaico de abajo d/e/f) eran fijos en el HTML/CSS y solo abrían su imagen
-- ampliada. Ahora cada espacio es una fila de esta tabla:
--   - el ADMIN elige qué comercio ocupa cada espacio (store_id) y puede
--     prenderlo/apagarlo (is_active);
--   - el DUEÑO de ese comercio (o el admin) sube la imagen y elige a qué
--     publicación suya lleva el click (product_id). Sin publicación elegida,
--     el click lleva a la página del comercio.
-- Un espacio sin comercio asignado o sin imagen sigue mostrando el banner
-- fijo de siempre (el home cae al HTML/CSS original).
--
-- Una fila fija por espacio (sembradas abajo): no hay policy de INSERT ni de
-- DELETE para nadie -- "quitar" una promo es poner store_id en NULL.
create table if not exists public.home_promos (
  id uuid primary key default gen_random_uuid(),
  slot text not null unique check (slot in ('mosaic_a', 'mosaic_b', 'mosaic_c', 'mosaic_d', 'mosaic_e', 'mosaic_f')),
  store_id uuid references public.stores(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  image_url text,
  title text check (title is null or char_length(title) <= 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices de FK (mismo criterio que 103_add_missing_fk_indexes.sql).
create index if not exists home_promos_store_id_idx on public.home_promos(store_id);
create index if not exists home_promos_product_id_idx on public.home_promos(product_id);

insert into public.home_promos (slot)
values ('mosaic_a'), ('mosaic_b'), ('mosaic_c'), ('mosaic_d'), ('mosaic_e'), ('mosaic_f')
on conflict (slot) do nothing;

alter table public.home_promos enable row level security;

drop trigger if exists home_promos_set_updated_at on public.home_promos;
create trigger home_promos_set_updated_at
before update on public.home_promos
for each row execute procedure public.set_updated_at();

drop trigger if exists home_promos_audit on public.home_promos;
create trigger home_promos_audit
after insert or update or delete on public.home_promos
for each row execute procedure public.log_admin_action();

-- Lectura pública (el home la lee sin sesión). No hay nada sensible: es lo
-- que igual se muestra en la portada. Una sola policy de SELECT para no
-- volver a abrir `multiple_permissive_policies` (ver 105).
drop policy if exists home_promos_select_public on public.home_promos;
create policy home_promos_select_public on public.home_promos
  for select to anon, authenticated
  using (true);

-- UPDATE: el admin, o el dueño del comercio asignado a ese espacio. Qué
-- columnas puede tocar el dueño lo decide el trigger de abajo (RLS no
-- restringe columnas).
drop policy if exists home_promos_update_admin_or_owner on public.home_promos;
create policy home_promos_update_admin_or_owner on public.home_promos
  for update to authenticated
  using (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
    or exists (select 1 from public.stores s where s.id = home_promos.store_id and s.owner_id = (select auth.uid()))
  )
  with check (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
    or exists (select 1 from public.stores s where s.id = home_promos.store_id and s.owner_id = (select auth.uid()))
  );

-- Reglas que RLS no puede expresar:
--   1. Solo el admin elige el comercio (store_id) y prende/apaga el espacio.
--      El dueño solo cambia imagen, publicación y título de SU espacio.
--   2. La publicación elegida tiene que ser de ese comercio -- si no, un
--      comercio podría mandar el click de "su" banner a un producto ajeno.
--   3. Si el admin cambia el comercio de un espacio, se limpian la imagen, la
--      publicación y el título del anterior (salvo que vengan en el mismo
--      update): no tiene sentido que el comercio nuevo herede la promo del
--      otro.
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

drop trigger if exists home_promos_guard on public.home_promos;
create trigger home_promos_guard
before update on public.home_promos
for each row execute procedure public.home_promos_guard();

-- Bucket público para las imágenes. Paths: `{slot}/{timestamp}.{ext}`: la
-- carpeta es el espacio, así la policy puede chequear que quien sube sea el
-- admin o el dueño del comercio asignado a ESE espacio.
insert into storage.buckets (id, name, public)
values ('home-promos', 'home-promos', true)
on conflict (id) do nothing;

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
        and s.owner_id = (select auth.uid())
    )
  )
);

-- P1-9 (backlog): favoritos con secciones de productos y comercios. El ítem
-- original menciona una 3ra sección "servicios" -- no existe esa feature en
-- la app (sin tabla ni concepto de "servicio" todavía), queda fuera de
-- alcance a propósito.
--
-- Mismo patrón exacto que `favorites` (F4-03, 29_favorites.sql): tabla propia
-- por tipo de favorito en vez de una tabla polimórfica (favorites ya fijó
-- ese precedente para productos, no vale la pena migrarla a polimórfica acá).

create table if not exists public.favorite_stores (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_id, store_id)
);

create index if not exists favorite_stores_client_id_idx on public.favorite_stores(client_id);

alter table public.favorite_stores enable row level security;

drop policy if exists favorite_stores_select_own on public.favorite_stores;
create policy favorite_stores_select_own on public.favorite_stores
  for select to authenticated
  using (client_id = auth.uid());

drop policy if exists favorite_stores_insert_own on public.favorite_stores;
create policy favorite_stores_insert_own on public.favorite_stores
  for insert to authenticated
  with check (client_id = auth.uid());

drop policy if exists favorite_stores_delete_own on public.favorite_stores;
create policy favorite_stores_delete_own on public.favorite_stores
  for delete to authenticated
  using (client_id = auth.uid());

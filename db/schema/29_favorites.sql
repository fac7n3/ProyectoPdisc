-- F4-03 (A113-189) — Favoritos persistentes en DB.
--
-- Extraída de 13_target_data_model.sql (sección 11) al arrancar Fase 4,
-- mismo criterio que las otras piezas de ese archivo (F2-01, etc.): se
-- aplica bloque por bloque cuando arranca la fase que lo necesita, no todo
-- junto de una vez.
--
-- Antes de esto había DOS implementaciones de wishlist sin relación entre
-- sí: cart-utils.js (localStorage 'bl_wishlist', usado en las grillas de
-- home/search/comercio) y product-modal.js (un botón que solo togglea una
-- clase CSS, sin persistir nada — se reseteaba cada vez que se reabría el
-- modal). Esta tabla es la fuente de verdad única para usuarios logueados;
-- los invitados (sin sesión) siguen usando localStorage como fallback (ver
-- js/cart-utils.js).

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists favorites_user_id_idx on public.favorites(user_id);

alter table public.favorites enable row level security;

drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own on public.favorites
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own on public.favorites
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own on public.favorites
  for delete to authenticated
  using (user_id = auth.uid());

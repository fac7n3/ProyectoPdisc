-- Favoritos de SERVICIOS (profesionales/técnicos): tercera sección de
-- "Mis favoritos" en el perfil (junto a Productos y Comercios, P1-9).
--
-- Mismo patrón que `favorite_stores` (59_favorite_stores.sql): una tabla propia
-- por tipo de favorito, RLS solo del dueño. Requiere sesión (sin invitado).

create table if not exists public.favorite_professionals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_id, professional_id)
);

-- El unique ya cubre client_id; este es el índice de la otra FK (borrado en cascada).
create index if not exists favorite_professionals_professional_id_idx
  on public.favorite_professionals(professional_id);

alter table public.favorite_professionals enable row level security;

drop policy if exists favorite_professionals_select_own on public.favorite_professionals;
create policy favorite_professionals_select_own on public.favorite_professionals
  for select to authenticated
  using (client_id = (select auth.uid()));

drop policy if exists favorite_professionals_insert_own on public.favorite_professionals;
create policy favorite_professionals_insert_own on public.favorite_professionals
  for insert to authenticated
  with check (client_id = (select auth.uid()));

drop policy if exists favorite_professionals_delete_own on public.favorite_professionals;
create policy favorite_professionals_delete_own on public.favorite_professionals
  for delete to authenticated
  using (client_id = (select auth.uid()));

revoke all on public.favorite_professionals from anon;

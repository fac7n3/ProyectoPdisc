-- F7-01 (A113-?) — Reseñas y calificaciones de producto o comercio (D8),
-- extraída de 13_target_data_model.sql sección 8, con dos agregados para
-- no tener que volver sobre esta tabla en F7-03 (moderación):
--   - is_hidden: el admin puede ocultar una reseña sin borrarla.
--   - report_reason/reported_at: cualquier usuario puede reportarla (RPC,
--     no requiere ser el autor); el admin decide si la oculta.
--
-- Simplificación a propósito: no se resuelve/muestra el nombre del autor
-- de la reseña (reviews.client_id referencia auth.users, no profiles —
-- no hay ningún otro lugar del proyecto hoy que embeba nombres de cliente
-- desde una FK a auth.users, así que agregar esa resolución acá sería un
-- patrón nuevo fuera del alcance de F7-01). Se muestra "Cliente" genérico.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('product', 'store')),
  target_id uuid not null,
  client_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  is_hidden boolean not null default false,
  report_reason text,
  reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_type, target_id, client_id)
);

create index if not exists reviews_target_idx on public.reviews(target_type, target_id);

alter table public.reviews enable row level security;

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
before update on public.reviews
for each row execute procedure public.set_updated_at();

-- Público ve las no ocultas; el autor siempre ve la propia; admin ve todo.
drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews
  for select to anon, authenticated
  using (
    is_hidden = false
    or client_id = auth.uid()
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  );

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (client_id = auth.uid());

-- El dueño puede editar su reseña; el admin puede ocultarla/moderarla.
drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews
  for update to authenticated
  using (client_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (client_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

drop policy if exists reviews_delete_own_or_admin on public.reviews;
create policy reviews_delete_own_or_admin on public.reviews
  for delete to authenticated
  using (client_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- F7-03: reportar una reseña ajena (no se puede vía UPDATE directo porque
-- reviews_update_own exige ser el autor o admin).
create or replace function public.report_review(p_review_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debés iniciar sesión para reportar una reseña.';
  end if;

  update public.reviews
  set report_reason = coalesce(p_reason, 'Sin motivo especificado'),
      reported_at = now()
  where id = p_review_id;

  if not found then
    raise exception 'La reseña no existe.';
  end if;
end;
$$;
revoke execute on function public.report_review(uuid, text) from public, anon;

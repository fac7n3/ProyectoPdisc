-- Servicios y tarifas de referencia del directorio "Contratar": el
-- profesional/técnico ya publicado lista qué hace y cuánto sale, desde su
-- panel (pages/profesional.html). Se muestran en su tarjeta de
-- contratar.html al desplegarla.
--
-- Tabla aparte y no columnas en `professionals` porque son N por profesional
-- y se reordenan -- mismo criterio que professional_promos (85).

create table if not exists public.professional_services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 100),
  description text,
  -- 'fixed' = precio cerrado, 'from' = "desde $X", 'quote' = a convenir.
  price_type text not null check (price_type in ('fixed', 'from', 'quote')),
  -- Pesos ENTEROS, sin centavos (decisión de producto del proyecto): integer,
  -- no numeric.
  price_pesos integer,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- "A convenir" no lleva número; los otros dos sí, y positivo.
  constraint professional_services_price_check check (
    (price_type = 'quote' and price_pesos is null)
    or (price_type in ('fixed', 'from') and price_pesos is not null and price_pesos > 0)
  )
);

create index if not exists professional_services_professional_id_idx
  on public.professional_services(professional_id, sort_order);

alter table public.professional_services enable row level security;

drop trigger if exists professional_services_set_updated_at on public.professional_services;
create trigger professional_services_set_updated_at
  before update on public.professional_services
  for each row execute procedure public.set_updated_at();

-- Lectura pública solo de servicios activos de profesionales activos -- mismo
-- criterio que professional_promos_select_public (85).
drop policy if exists professional_services_select_public on public.professional_services;
create policy professional_services_select_public on public.professional_services
  for select to anon, authenticated
  using (is_active = true and exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.is_active = true
  ));

-- El dueño gestiona sus propios servicios (insert/update/delete).
drop policy if exists professional_services_all_own on public.professional_services;
create policy professional_services_all_own on public.professional_services
  for all to authenticated
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.owner_id = auth.uid()
  ));

drop policy if exists professional_services_all_admin on public.professional_services;
create policy professional_services_all_admin on public.professional_services
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

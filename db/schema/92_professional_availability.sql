-- Disponibilidad del directorio "Contratar": cuándo atiende el profesional y
-- en qué zonas de Baradero trabaja. Lo carga desde su panel
-- (pages/profesional.html) y la tarjeta de contratar.html lo usa para mostrar
-- los horarios y un chip de "Abierto ahora".

-- "Atiende urgencias las 24 h" es un sí/no del profesional, no una lista:
-- columna, no tabla.
alter table public.professionals add column if not exists serves_24h boolean not null default false;

-- Franjas horarias. Varias filas por día a propósito, para poder decir
-- "9 a 13 y 16 a 20" (el corte del mediodía es la norma acá, no la excepción).
-- day_of_week sigue extract(dow): 0 = domingo .. 6 = sábado.
create table if not exists public.professional_business_hours (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time time not null,
  close_time time not null,
  created_at timestamptz not null default now(),
  -- Sin cruces de medianoche: una franja que termina antes de empezar se
  -- carga como dos.
  constraint professional_business_hours_range_check check (close_time > open_time)
);

create index if not exists professional_business_hours_professional_id_idx
  on public.professional_business_hours(professional_id, day_of_week);

alter table public.professional_business_hours enable row level security;

drop policy if exists professional_business_hours_select_public on public.professional_business_hours;
create policy professional_business_hours_select_public on public.professional_business_hours
  for select to anon, authenticated
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.is_active = true
  ));

drop policy if exists professional_business_hours_all_own on public.professional_business_hours;
create policy professional_business_hours_all_own on public.professional_business_hours
  for all to authenticated
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.owner_id = auth.uid()
  ));

drop policy if exists professional_business_hours_all_admin on public.professional_business_hours;
create policy professional_business_hours_all_admin on public.professional_business_hours
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- Zonas de cobertura. El CHECK es solo de largo y no una lista fija: los
-- barrios de Baradero se ofrecen desde js/professional-zones.js, así que sumar
-- uno nuevo no tiene que costar una migración.
create table if not exists public.professional_service_areas (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  zone_name text not null check (char_length(zone_name) between 2 and 60),
  created_at timestamptz not null default now(),
  unique (professional_id, zone_name)
);

create index if not exists professional_service_areas_professional_id_idx
  on public.professional_service_areas(professional_id);

alter table public.professional_service_areas enable row level security;

drop policy if exists professional_service_areas_select_public on public.professional_service_areas;
create policy professional_service_areas_select_public on public.professional_service_areas
  for select to anon, authenticated
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.is_active = true
  ));

drop policy if exists professional_service_areas_all_own on public.professional_service_areas;
create policy professional_service_areas_all_own on public.professional_service_areas
  for all to authenticated
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.owner_id = auth.uid()
  ));

drop policy if exists professional_service_areas_all_admin on public.professional_service_areas;
create policy professional_service_areas_all_admin on public.professional_service_areas
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- "Abierto ahora" se calcula en el cliente (js/professional-hours-utils.js),
-- no acá: los horarios ya viajan al navegador para mostrarlos, así que una
-- función SQL equivalente sería la misma regla escrita dos veces.

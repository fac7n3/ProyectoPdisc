-- Números de emergencia y servicios (sección "Servicios" del home, antes "Ayuda").
--
-- Misma lógica que 67_pharmacies.sql: datos cargados por el admin, lectura
-- pública sin sesión. Acá no hace falta separar en dos tablas como las
-- farmacias (ficha fija + turno aparte) porque no hay una rotación diaria
-- que resolver del lado del cliente -- "veterinaria de turno" es, para esta
-- sección, un contacto más que el admin actualiza a mano cuando cambia
-- (igual que ya hace con el resto de los teléfonos).
create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  -- 'emergencias' = policía/bomberos/hospital/ambulancia y similares.
  -- 'veterinarias' = veterinaria de turno o de urgencias.
  category text not null check (category in ('emergencias', 'veterinarias')),
  name text not null,
  phone text not null,
  -- Aclaración opcional debajo del teléfono: "Turno esta semana", "Urgencias
  -- las 24 hs", "Solo emergencias", etc.
  notes text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists emergency_contacts_category_idx on public.emergency_contacts(category, display_order);

alter table public.emergency_contacts enable row level security;

drop trigger if exists emergency_contacts_set_updated_at on public.emergency_contacts;
create trigger emergency_contacts_set_updated_at
before update on public.emergency_contacts
for each row execute procedure public.set_updated_at();

-- Lectura pública, incluido `anon`: es información de utilidad pública,
-- misma decisión que pharmacies_select_public.
drop policy if exists emergency_contacts_select_public on public.emergency_contacts;
create policy emergency_contacts_select_public on public.emergency_contacts
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists emergency_contacts_all_admin on public.emergency_contacts;
create policy emergency_contacts_all_admin on public.emergency_contacts
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

drop trigger if exists emergency_contacts_audit on public.emergency_contacts;
create trigger emergency_contacts_audit
after insert or update or delete on public.emergency_contacts
for each row execute procedure public.log_admin_action();

-- Tabla vacía a propósito: no hay números reales de Baradero para cargar
-- desde acá (mismo criterio que 67_pharmacies.sql). Los carga el admin.

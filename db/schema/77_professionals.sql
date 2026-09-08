-- Directorio de profesionales y técnicos ("Contratar" del home): informativo
-- por WhatsApp/teléfono, sin catálogo ni pedidos -- a diferencia de un
-- comercio, publicarse acá no cambia el rol de la cuenta (sigue siendo
-- 'cliente', sin panel de vendedor).
--
-- Mismo flujo de alta que seller_requests: se registra desde vender.html,
-- queda pendiente, y el admin aprueba o rechaza. A diferencia de
-- approve_seller_request() no hace falta un RPC SECURITY DEFINER para
-- aprobar: no hay que tocar profiles.role ni auth.users, así que el admin ya
-- tiene RLS "for all" de sobra en ambas tablas -- aprobar es un insert en
-- `professionals` + un update en `professional_requests`, dos llamadas
-- comunes desde el cliente (mismo patrón que farmacias/emergency_contacts).

create table if not exists public.professional_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 3 and 100),
  specialty text not null check (char_length(specialty) between 3 and 100),
  description text,
  phone text not null check (char_length(phone) between 6 and 20),
  whatsapp text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.professional_requests enable row level security;

drop trigger if exists professional_requests_set_updated_at on public.professional_requests;
create trigger professional_requests_set_updated_at
before update on public.professional_requests
for each row execute procedure public.set_updated_at();

-- Cada quien crea y ve su propia solicitud (igual que seller_requests_insert_own
-- / seller_requests_select_own).
drop policy if exists professional_requests_insert_own on public.professional_requests;
create policy professional_requests_insert_own on public.professional_requests
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists professional_requests_select_own on public.professional_requests;
create policy professional_requests_select_own on public.professional_requests
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists professional_requests_select_admin on public.professional_requests;
create policy professional_requests_select_admin on public.professional_requests
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- Solo el admin actualiza (aprobar/rechazar) -- igual que seller_requests_update_admin.
drop policy if exists professional_requests_update_admin on public.professional_requests;
create policy professional_requests_update_admin on public.professional_requests
  for update to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- =========================================================
-- professionals -- el directorio público (solo filas aprobadas por el admin)
-- =========================================================
create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 3 and 100),
  specialty text not null check (char_length(specialty) between 3 and 100),
  description text,
  phone text not null check (char_length(phone) between 6 and 20),
  whatsapp text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists professionals_specialty_idx on public.professionals(specialty);

alter table public.professionals enable row level security;

drop trigger if exists professionals_set_updated_at on public.professionals;
create trigger professionals_set_updated_at
before update on public.professionals
for each row execute procedure public.set_updated_at();

-- Lectura pública, incluido `anon`: mismo criterio que pharmacies_select_public
-- / emergency_contacts_select_public -- es información de utilidad pública.
drop policy if exists professionals_select_public on public.professionals;
create policy professionals_select_public on public.professionals
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists professionals_all_admin on public.professionals;
create policy professionals_all_admin on public.professionals
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- =========================================================
-- Auditoría (47_admin_audit_log.sql): log_admin_action() ya se salta las
-- filas cuando quien escribe no es admin, así que el trigger de UPDATE en
-- professional_requests no registra el insert que hace la propia persona al
-- enviar su solicitud -- solo el approve/reject del admin.
-- =========================================================
drop trigger if exists log_admin_action_professional_requests on public.professional_requests;
create trigger log_admin_action_professional_requests
after update on public.professional_requests
for each row execute function public.log_admin_action();

drop trigger if exists log_admin_action_professionals on public.professionals;
create trigger log_admin_action_professionals
after insert or update or delete on public.professionals
for each row execute function public.log_admin_action();

-- A113-171: monitoreo de errores en producción (sin depender de una cuenta
-- externa como Sentry). Los errores no capturados del cliente (window.onerror
-- y unhandledrejection, ver js/error-logger.js) se insertan acá.
-- Consultar con el SQL Editor de Supabase mientras no exista un panel propio
-- (ver F6-04, moderación/auditoría, para una futura vista en el admin).

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text,
  url text,
  user_id uuid references auth.users(id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_created_at_idx on public.error_logs(created_at desc);

alter table public.error_logs enable row level security;

-- Cualquiera (incluso anónimo) puede insertar su propio error: es telemetría
-- de diagnóstico, no datos sensibles del negocio. Sin policy de select para
-- anon/authenticated -> nadie puede leer los errores de otros usuarios.
drop policy if exists error_logs_insert_anyone on public.error_logs;
create policy error_logs_insert_anyone on public.error_logs
  for insert to anon, authenticated
  with check (true);

drop policy if exists error_logs_select_admin on public.error_logs;
create policy error_logs_select_admin on public.error_logs
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

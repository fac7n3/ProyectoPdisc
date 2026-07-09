-- F3-01 (A113-181) — Onboarding del repartidor.
--
-- Mismo patrón que seller_requests/approve_seller_request (D6): el usuario
-- manda una solicitud con sus datos, el admin la aprueba o rechaza. Subir a
-- 'repartidor' es SOLO a través del RPC de aprobación (nunca al signup —
-- ver A113-238, el bug que este mismo patrón evita repetir).

create table if not exists public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) >= 3),
  phone text not null check (char_length(phone) >= 6 and char_length(phone) <= 20),
  vehicle_type text not null check (vehicle_type in ('bicicleta', 'moto', 'auto')),
  vehicle_plate text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_requests_user_id_idx on public.delivery_requests(user_id);

alter table public.delivery_requests enable row level security;

drop trigger if exists delivery_requests_set_updated_at on public.delivery_requests;
create trigger delivery_requests_set_updated_at
before update on public.delivery_requests
for each row execute procedure public.set_updated_at();

drop policy if exists delivery_requests_insert_own on public.delivery_requests;
create policy delivery_requests_insert_own on public.delivery_requests
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists delivery_requests_select_own on public.delivery_requests;
create policy delivery_requests_select_own on public.delivery_requests
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists delivery_requests_select_admin on public.delivery_requests;
create policy delivery_requests_select_admin on public.delivery_requests
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

drop policy if exists delivery_requests_update_admin on public.delivery_requests;
create policy delivery_requests_update_admin on public.delivery_requests
  for update to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- RPC de aprobación (SECURITY DEFINER: escribe profiles + auth.users de OTRO
-- usuario, algo que ninguna policy de RLS le permitiría hacer al admin
-- directamente). Rechazar una solicitud sigue siendo un UPDATE directo desde
-- admin.js vía delivery_requests_update_admin — no hace falta un RPC para
-- eso, mismo criterio que seller_requests/reject.
create or replace function public.approve_delivery_request(req_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede aprobar solicitudes de repartidor.';
  end if;

  select * into v_req
  from public.delivery_requests
  where id = req_id and status = 'pending';

  if not found then
    raise exception 'Solicitud no encontrada o ya no está pendiente.';
  end if;

  update public.delivery_requests
  set status = 'approved', updated_at = now()
  where id = req_id;

  -- Ver 24_fix_role_approval_trigger_block.sql (A113-239): sin esta bandera
  -- explícita, prevent_role_update_on_profile rechaza este UPDATE aunque
  -- venga de un admin real, porque auth.role() (GUC de sesión) sigue dando
  -- 'authenticated' dentro de un SECURITY DEFINER.
  perform set_config('app.role_change_authorized', 'true', true);
  update public.profiles
  set role = 'repartidor'
  where id = v_req.user_id;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', 'repartidor')
  where id = v_req.user_id;
end;
$$;

revoke execute on function public.approve_delivery_request(uuid) from public;
revoke execute on function public.approve_delivery_request(uuid) from anon;
grant execute on function public.approve_delivery_request(uuid) to authenticated;

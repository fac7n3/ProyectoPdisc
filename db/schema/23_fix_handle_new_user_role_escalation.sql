-- CRÍTICO (A113-238) — handle_new_user() confiaba en el account_type que
-- manda el cliente en options.data del signUp, asignando directamente
-- profiles.role = 'vendedor'/'repartidor'/'admin' sin ninguna aprobación.
-- raw_user_meta_data es 100% controlado por el cliente (cualquiera con la
-- anon key pública puede mandar el account_type que quiera) — este bug se
-- arrastraba desde 10_fix_auth_triggers.sql.
--
-- Auditado antes de aplicar: ningún profile existente tiene role != 'cliente'
-- (0 filas), así que no hay que limpiar datos ya escalados.
--
-- Mitigación parcial que ya existía (por eso no era explotable para
-- escrituras): esta función nunca tocó raw_app_meta_data, así que el JWT
-- (auth.jwt() -> 'app_metadata' ->> 'role') seguía devolviendo 'cliente' —
-- todas las policies RLS de escritura sensible y los RPCs SECURITY DEFINER
-- chequean el JWT, no profiles.role. Pero profiles.role SÍ es lo que lee
-- guardPage({requireRole}) (client-side) y vender.js (checkSellerState) —
-- un "admin"/"vendedor" autoasignado vería esas pantallas igual.
--
-- Fix: todo usuario nuevo empieza SIEMPRE en 'cliente'. Subir a
-- vendedor/repartidor/admin es solo vía un RPC de aprobación explícito
-- (approve_seller_request ya existe; el de repartidor es F3-01).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'cliente'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    -- Nunca tocar el role acá: una vez creado, solo lo cambia un RPC de aprobación.
    updated_at = now();

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

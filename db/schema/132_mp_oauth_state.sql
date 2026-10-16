-- A113-274 / pagos con Mercado Pago por tienda: `state` del OAuth + candado en las
-- columnas de vinculación + desvincular desde el panel.
--
-- 1) mp_oauth_states: la vinculación de una cuenta de Mercado Pago ahora arranca en
--    la Edge Function `mp-oauth-start`, que genera un `state` aleatorio de un solo
--    uso (10 minutos) atado al usuario y a la tienda. `mp-oauth-callback` lo exige
--    y saca el store_id de ACÁ, nunca del body. Antes el `state` era el id de la
--    tienda (adivinable) y nada ataba el `code` a quien arrancó la vinculación:
--    OAuth CSRF clásico (un atacante podía dejar la tienda de otro cobrando en su
--    cuenta). RLS sin policies a propósito: solo las funciones (service role).
-- 2) stores.mp_collector_id / mp_split_pilot: `authenticated` tenía UPDATE sobre
--    estas columnas (UPDATE a nivel tabla + policy de dueño), así que un dueño podía
--    poner el mp_collector_id de OTRA tienda: el webhook ve dos tiendas para esa
--    cuenta, no sabe con qué token leer el pago y deja de confirmar las ventas de la
--    víctima. Ahora solo las cambia código del servidor (service role o funciones
--    SECURITY DEFINER), nunca una llamada directa a la API con sesión de usuario.
-- 3) disconnect_store_mp: el dueño desvincula su cuenta (borra las credenciales).

create table if not exists public.mp_oauth_states (
  state text primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.mp_oauth_states enable row level security;
revoke all on public.mp_oauth_states from anon, authenticated;

create or replace function public.stores_protect_mp_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- current_user es el rol de la sesión: 'authenticated'/'anon' cuando llega por la
  -- API con un JWT; el dueño de la función (postgres) dentro de una SECURITY DEFINER;
  -- 'service_role' en las Edge Functions.
  if current_user in ('authenticated', 'anon') and (
       new.mp_collector_id is distinct from old.mp_collector_id
    or new.mp_split_pilot is distinct from old.mp_split_pilot
  ) then
    raise exception 'La cuenta de Mercado Pago solo se cambia vinculándola o desvinculándola desde el panel.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- create or replace (y no drop + create): el conector de Supabase trata un DROP como
-- destructivo y se queda esperando una confirmación que nadie ve (ver CLAUDE.md, migración 131).
create or replace trigger stores_protect_mp_columns
before update on public.stores
for each row execute function public.stores_protect_mp_columns();

create or replace function public.disconnect_store_mp(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.stores
    where id = p_store_id and owner_id = (select auth.uid())
  ) then
    raise exception 'No sos el dueño de este comercio.' using errcode = '42501';
  end if;

  delete from public.store_mp_credentials where store_id = p_store_id;
  update public.stores set mp_collector_id = null where id = p_store_id;
end;
$$;

revoke execute on function public.disconnect_store_mp(uuid) from public, anon;
grant execute on function public.disconnect_store_mp(uuid) to authenticated;

-- F1-02 (A113-158/159): hallazgos de get_advisors (seguridad) y su fix.
--
-- 1) CRÍTICO: approve_seller_request no validaba que quien la llama sea
--    admin. Al ser SECURITY DEFINER y estar expuesta como RPC pública
--    (PostgREST expone toda función de "public" salvo que se revoque el
--    EXECUTE), cualquier usuario autenticado podía llamar
--    supabase.rpc('approve_seller_request', { req_id: '<id pendiente>' })
--    directo y aprobarse a sí mismo (o a cualquiera) como vendedor,
--    saltando por completo la aprobación manual del admin (D6).
-- 2) function_search_path_mutable: 4 funciones sin `search_path` fijo
--    (riesgo de search_path hijacking). handle_new_user lo tenía en la
--    versión original (01) pero se perdió al redefinirla en 10.
-- 3) SECURITY DEFINER callable por anon/authenticated sin necesitarlo:
--    handle_new_user (trigger de auth.users) y rls_auto_enable (event
--    trigger interno de Supabase) no deberían ser invocables como RPC.
-- 4) public_bucket_allows_listing: las policies de SELECT en
--    storage.objects para 'products'/'stores' permiten listar todo el
--    bucket. Como los buckets ya son public=true, el acceso a un objeto
--    por su URL no necesita esa policy — solo habilita listado de más
--    de lo previsto.
--
-- No se toca: error_logs_insert_anyone (WITH CHECK true) — intencional,
-- es telemetría de diagnóstico, cualquiera inserta el suyo, nadie lee el
-- ajeno (select solo admin). validate_cart_prices sigue pública a
-- propósito (RPC de checkout, la llama cualquier cliente).

-- === 1) approve_seller_request: exigir rol admin ===
create or replace function public.approve_seller_request(req_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_store_id uuid;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede aprobar solicitudes de vendedor.';
  end if;

  select * into v_req
  from public.seller_requests
  where id = req_id and status = 'pending';

  if not found then
    raise exception 'Request not found or not pending';
  end if;

  insert into public.stores (owner_id, cuit, name, address, phone, status)
  values (v_req.user_id, v_req.cuit, v_req.shop_name, v_req.address, v_req.phone, 'approved')
  returning id into v_store_id;

  update public.seller_requests
  set status = 'approved', updated_at = now()
  where id = req_id;

  update public.profiles
  set role = 'vendedor'
  where id = v_req.user_id;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', 'vendedor')
  where id = v_req.user_id;
end;
$$;

-- === 2) search_path fijo en las 4 funciones que lo tenían mutable ===
alter function public.set_updated_at() set search_path = public;
alter function public.handle_new_user() set search_path = public;
alter function public.prevent_role_update_on_profile() set search_path = public;
alter function public.update_user_carts_modtime() set search_path = public;

-- === 3) Revocar EXECUTE público de funciones que no son RPCs de verdad ===
-- (siguen funcionando como triggers: el trigger las invoca con privilegios
-- del dueño de la función/tabla, no necesita el grant de EXECUTE de rol)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- approve_seller_request ya se autoprotege (raise exception si no es admin),
-- pero un anon ni logueado nunca puede ser admin -> sacale hasta la chance de intentarlo
revoke execute on function public.approve_seller_request(uuid) from anon;

-- === 4) Storage: sacar las policies de listado público, mantener buckets públicos ===
-- El bucket ya es public=true -> el acceso a un objeto por su URL directa
-- sigue funcionando sin esta policy. Sin ella, ya no se puede listar todo
-- el contenido del bucket vía API.
drop policy if exists "Public Access to products" on storage.objects;
drop policy if exists "Public Access to stores" on storage.objects;

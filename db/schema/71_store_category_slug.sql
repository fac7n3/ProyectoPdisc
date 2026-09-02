-- Vista de comercio (vendedor/cliente) — la tienda necesita mostrar su rubro
-- ("categoría del comercio"), pero `stores` nunca tuvo esa columna: el rubro
-- elegido al registrarse como vendedor vivía solo en
-- seller_requests.category_slug/category_slugs (60_seller_request_multi_category.sql
-- ya lo dejó anotado: approve_seller_request nunca lo copiaba a stores).
--
-- Se toma el primer rubro elegido como "el principal" (mismo criterio que el
-- comentario original de seller_requests.category_slug: "to store the main
-- category") -- category_slugs (array, multi-rubro) tiene prioridad sobre el
-- category_slug viejo (de un solo rubro) si ambos existen.

alter table public.stores
  add column if not exists category_slug text;

comment on column public.stores.category_slug is
  'Rubro principal del comercio (copiado de seller_requests al aprobar). NULL en tiendas aprobadas antes de esta columna sin backfill posible.';

create or replace function public.approve_seller_request(req_id uuid)
returns void
language plpgsql
security definer -- runs as superuser to allow updating profiles and app_metadata
set search_path = public
as $$
declare
  v_req record;
  v_store_id uuid;
  v_category_slug text;
begin
  -- Fetch the request
  select * into v_req
  from public.seller_requests
  where id = req_id and status = 'pending';

  if not found then
    raise exception 'Request not found or not pending';
  end if;

  v_category_slug := coalesce(v_req.category_slugs[1], v_req.category_slug);

  -- 1. Create the store
  insert into public.stores (owner_id, cuit, name, address, phone, status, category_slug)
  values (v_req.user_id, v_req.cuit, v_req.shop_name, v_req.address, v_req.phone, 'approved', v_category_slug)
  returning id into v_store_id;

  -- 2. Update the request status
  update public.seller_requests
  set status = 'approved', updated_at = now()
  where id = req_id;

  -- 3. Update the user's role in profiles
  update public.profiles
  set role = 'vendedor'
  where id = v_req.user_id;

  -- 4. Update the user's app_metadata in auth.users (requires superuser, hence security definer)
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', 'vendedor')
  where id = v_req.user_id;

end;
$$;

-- Backfill: tiendas ya aprobadas antes de esta columna, buscando el rubro en
-- su seller_requests aprobada más reciente (mismo user_id = owner_id).
update public.stores s
set category_slug = coalesce(sr.category_slugs[1], sr.category_slug)
from (
  select distinct on (user_id) user_id, category_slugs, category_slug
  from public.seller_requests
  where status = 'approved'
  order by user_id, updated_at desc
) sr
where s.category_slug is null
  and s.owner_id = sr.user_id
  and coalesce(sr.category_slugs[1], sr.category_slug) is not null;

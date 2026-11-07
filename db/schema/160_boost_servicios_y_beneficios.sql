-- 160: "Impulsá tus ventas" con servicios individuales, planes nuevos y
-- beneficios otorgados por el admin.
--
--   boost_services    catálogo de servicios que se venden por separado (banner
--                     chico/mediano/grande, redes, productos recomendados,
--                     posicionamientos, negocios principales, estadísticas pro).
--                     max_per_store = tope de unidades vigentes por comercio
--                     (null = sin tope). El PRECIO sale de acá, nunca del navegador.
--   boost_plan_items  qué servicios (y cuántos) incluye cada plan.
--   boost_plans       Plan Base / Intermedio / Pro reemplazan a Local / Barrio /
--                     Baradero (esos quedan inactivos: las compras viejas siguen
--                     valiendo y sus ítems están cargados abajo).
--   boost_purchases   ahora una fila es un PLAN (plan_id) o un SERVICIO
--                     (service_id + quantity), comprado (source='purchase') o
--                     regalado por el admin (source='admin', precio 0).
--
-- Beneficio vigente = fila 'active' con starts_at <= now() < ends_at. Los topes
-- por comercio se controlan al crear la compra, al activarla y al otorgar.
-- Precios de planes y servicios: planilla de costos del equipo (2026-11-07).

-- ------------------------------------------------------------- servicios
create table if not exists public.boost_services (
  id            text primary key check (id ~ '^[a-z_]+$'),
  name          text not null,
  kind          text not null check (kind in ('banner', 'social', 'products', 'ranking', 'profile', 'stats')),
  contents      text not null,          -- qué contiene
  purpose       text not null,          -- para qué sirve (resumen)
  price         integer not null check (price > 0),   -- pesos enteros, por unidad
  max_per_store integer check (max_per_store is null or max_per_store > 0),
  slot_note     text,                   -- aclaración sobre los lugares en el sitio (solo informativa)
  duration_days integer not null default 30 check (duration_days > 0),
  is_active     boolean not null default true,
  sort_order    integer not null default 0
);

insert into public.boost_services (id, name, kind, contents, purpose, price, max_per_store, slot_note, sort_order) values
  ('banner_chico',   'Banner chico',   'banner',   '1 fotografía, título y enlace',              'Publicidad sencilla',                 6000, 2,    'Se muestra arriba (5 lugares) o abajo (3 lugares, con contador).', 1),
  ('banner_mediano', 'Banner mediano', 'banner',   '1 fotografía, descripción y enlace',         'Mayor exposición visual',             8000, 1,    null, 2),
  ('banner_grande',  'Banner grande',  'banner',   '5 fotografías y tandas rotativas',           'Publicidad de máxima visibilidad',   17000, 1,    null, 3),
  ('redes_sociales', 'Redes sociales', 'social',   'Imagen, texto y enlaces',                    'Difusión externa',                    8000, null, null, 4),
  ('productos_recomendados', 'Productos recomendados', 'products', 'Imagen, precio y datos del producto', 'Destacar artículos',      6000, 5,    null, 5),
  ('posicionamiento_vendedor', 'Posicionamiento Vendedor', 'ranking', 'Prioridad estándar en búsquedas', 'Mejorar visibilidad',   25000, 1,    null, 6),
  ('posicionamiento_pro', 'Posicionamiento Pro', 'ranking', 'Prioridad superior en búsquedas',   'Mayor exposición en resultados',     35000, 1,    null, 7),
  ('negocios_principales', 'Negocios principales', 'profile', 'Logo, nombre, categoría y perfil', 'Destacar comercios',               18000, 1,    null, 8),
  ('estadisticas_pro', 'Estadísticas Pro', 'stats', 'Estadísticas de vistas en redes y de clicks (perfil y publicaciones)', 'Mejor control sobre las vistas', 25000, 1, null, 9)
on conflict (id) do nothing;

-- --------------------------------------------------------------- planes
-- Los combos viejos se dan de baja (no se borran: hay compras que los usan).
update public.boost_plans set is_active = false where id in ('local', 'barrio', 'baradero');

insert into public.boost_plans (id, name, price, duration_days, sort_order) values
  ('base',       'Plan Base',       20000, 30, 10),
  ('intermedio', 'Plan Intermedio', 71000, 30, 11),
  ('pro',        'Plan Pro',        80000, 30, 12)
on conflict (id) do nothing;

create table if not exists public.boost_plan_items (
  plan_id    text not null references public.boost_plans(id) on delete cascade,
  service_id text not null references public.boost_services(id),
  quantity   integer not null default 1 check (quantity > 0),
  primary key (plan_id, service_id)
);
create index if not exists boost_plan_items_service_id_idx on public.boost_plan_items (service_id);

insert into public.boost_plan_items (plan_id, service_id, quantity) values
  ('base', 'banner_chico', 1), ('base', 'productos_recomendados', 1), ('base', 'redes_sociales', 1),
  ('intermedio', 'banner_mediano', 1), ('intermedio', 'productos_recomendados', 2), ('intermedio', 'redes_sociales', 1),
  ('intermedio', 'posicionamiento_vendedor', 1), ('intermedio', 'negocios_principales', 1),
  ('pro', 'banner_chico', 1), ('pro', 'banner_mediano', 1), ('pro', 'banner_grande', 1), ('pro', 'redes_sociales', 1),
  ('pro', 'productos_recomendados', 1), ('pro', 'posicionamiento_vendedor', 1), ('pro', 'posicionamiento_pro', 1),
  ('pro', 'negocios_principales', 1), ('pro', 'estadisticas_pro', 1),
  -- combos viejos (inactivos), para que sus compras vigentes sigan dando lo mismo
  ('local', 'negocios_principales', 1),
  ('barrio', 'negocios_principales', 1), ('barrio', 'productos_recomendados', 1), ('barrio', 'banner_mediano', 1),
  ('baradero', 'negocios_principales', 1), ('baradero', 'productos_recomendados', 1),
  ('baradero', 'banner_mediano', 1), ('baradero', 'banner_grande', 1)
on conflict (plan_id, service_id) do nothing;

-- RLS: lectura pública (el precio se muestra); escritura solo admin.
alter table public.boost_services enable row level security;
alter table public.boost_plan_items enable row level security;
revoke all on public.boost_services, public.boost_plan_items from anon, authenticated;
grant select on public.boost_services, public.boost_plan_items to anon, authenticated;
grant insert, update, delete on public.boost_services, public.boost_plan_items to authenticated;

do $pol$ begin
  create policy boost_services_select on public.boost_services for select to anon, authenticated using (true);
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy boost_services_admin_write on public.boost_services for all to authenticated
    using ((select public.jwt_role()) = 'admin') with check ((select public.jwt_role()) = 'admin');
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy boost_plan_items_select on public.boost_plan_items for select to anon, authenticated using (true);
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy boost_plan_items_admin_write on public.boost_plan_items for all to authenticated
    using ((select public.jwt_role()) = 'admin') with check ((select public.jwt_role()) = 'admin');
exception when duplicate_object then null; end $pol$;

-- ------------------------------------------------------------- compras
alter table public.boost_purchases alter column plan_id drop not null;
alter table public.boost_purchases add column if not exists service_id text references public.boost_services(id);
alter table public.boost_purchases add column if not exists quantity integer not null default 1 check (quantity > 0);
alter table public.boost_purchases add column if not exists source text not null default 'purchase' check (source in ('purchase', 'admin'));
alter table public.boost_purchases add column if not exists note text;
alter table public.boost_purchases add column if not exists granted_by uuid references auth.users(id) on delete set null;

alter table public.boost_purchases drop constraint if exists boost_purchases_price_check;
alter table public.boost_purchases add constraint boost_purchases_price_check
  check (price >= 0 and (price > 0 or source = 'admin'));
alter table public.boost_purchases drop constraint if exists boost_purchases_one_item;
alter table public.boost_purchases add constraint boost_purchases_one_item
  check ((plan_id is null) <> (service_id is null));

create index if not exists boost_purchases_service_id_idx on public.boost_purchases (service_id);
create index if not exists boost_purchases_granted_by_idx on public.boost_purchases (granted_by);

-- ------------------------------------------------- lo que tiene un comercio
-- Unidades VIGENTES por servicio (planes expandidos + servicios sueltos +
-- regalos del admin). Interna: no se expone directo.
create or replace function public.store_benefit_holdings(p_store_id uuid)
returns table (service_id text, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select x.service_id, sum(x.q)::integer
  from (
    select pi.service_id, pi.quantity * bp.quantity as q
    from public.boost_purchases bp
    join public.boost_plan_items pi on pi.plan_id = bp.plan_id
    where bp.store_id = p_store_id and bp.status = 'active'
      and now() >= bp.starts_at and now() < bp.ends_at
    union all
    select bp.service_id, bp.quantity
    from public.boost_purchases bp
    where bp.store_id = p_store_id and bp.service_id is not null and bp.status = 'active'
      and now() >= bp.starts_at and now() < bp.ends_at
  ) x
  group by x.service_id;
$$;
revoke execute on function public.store_benefit_holdings(uuid) from public, anon, authenticated;

-- ¿Entran p_qty unidades más de este servicio sin pasar el tope del comercio?
create or replace function public.benefit_has_room(p_store_id uuid, p_service_id text, p_qty integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(s.max_per_store is null
         or coalesce((select h.quantity from public.store_benefit_holdings(p_store_id) h
                       where h.service_id = s.id), 0) + p_qty <= s.max_per_store, false)
  from public.boost_services s where s.id = p_service_id;
$$;
revoke execute on function public.benefit_has_room(uuid, text, integer) from public, anon, authenticated;

-- Primer servicio de un plan que ya no entra (o null si entran todos).
create or replace function public.plan_blocked_service(p_store_id uuid, p_plan_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.name
  from public.boost_plan_items pi
  join public.boost_services s on s.id = pi.service_id
  where pi.plan_id = p_plan_id
    and not public.benefit_has_room(p_store_id, pi.service_id, pi.quantity)
  order by s.sort_order
  limit 1;
$$;
revoke execute on function public.plan_blocked_service(uuid, text) from public, anon, authenticated;

-- Lo que tiene el comercio y lo que puede sumar. Dueño o admin.
create or replace function public.get_store_benefits(p_store_id uuid)
returns table (service_id text, held integer, max_per_store integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    (select public.jwt_role()) = 'admin'
    or exists (select 1 from public.stores st where st.id = p_store_id and st.owner_id = (select auth.uid()))
  ) then
    raise exception 'No tenés acceso a este comercio.' using errcode = '42501';
  end if;

  return query
  select s.id, coalesce(h.quantity, 0), s.max_per_store
  from public.boost_services s
  left join public.store_benefit_holdings(p_store_id) h on h.service_id = s.id
  where s.is_active
  order by s.sort_order;
end;
$$;
revoke execute on function public.get_store_benefits(uuid) from public, anon;
grant execute on function public.get_store_benefits(uuid) to authenticated;

-- Beneficios vigentes de todos los comercios aprobados (el inicio ordena con
-- esto). No expone plata ni pagos.
create or replace function public.get_active_benefits()
returns table (store_id uuid, service_id text, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select x.store_id, x.service_id, sum(x.q)::integer
  from (
    select bp.store_id, pi.service_id, pi.quantity * bp.quantity as q
    from public.boost_purchases bp
    join public.boost_plan_items pi on pi.plan_id = bp.plan_id
    where bp.status = 'active' and now() >= bp.starts_at and now() < bp.ends_at
    union all
    select bp.store_id, bp.service_id, bp.quantity
    from public.boost_purchases bp
    where bp.service_id is not null and bp.status = 'active'
      and now() >= bp.starts_at and now() < bp.ends_at
  ) x
  join public.stores s on s.id = x.store_id and s.status = 'approved'
  group by x.store_id, x.service_id;
$$;
revoke execute on function public.get_active_benefits() from public;
grant execute on function public.get_active_benefits() to anon, authenticated, service_role;

-- ------------------------------------------------ comprar un PLAN (cliente)
-- Igual que en la 131, más: el plan no puede pasar los topes por comercio
-- (por ejemplo, si ya compró por separado un banner mediano y el plan trae otro).
create or replace function public.create_boost_purchase(p_store_id uuid, p_plan_id text)
returns table (purchase_id uuid, price integer, plan_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_plan    public.boost_plans%rowtype;
  v_current public.boost_purchases%rowtype;
  v_blocked text;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.owner_id = v_uid and s.status = 'approved'
  ) then
    raise exception 'Solo el dueño de un comercio aprobado puede contratar un combo.' using errcode = '42501';
  end if;

  select * into v_plan from public.boost_plans bp where bp.id = p_plan_id and bp.is_active;
  if not found then
    raise exception 'Ese combo no existe o ya no está disponible.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_store_id::text));

  select * into v_current from public.boost_purchases bp
  where bp.store_id = p_store_id and bp.plan_id is not null and bp.status = 'active' and bp.ends_at > now()
  order by bp.ends_at desc limit 1;
  if found and v_current.plan_id <> p_plan_id then
    raise exception 'Ya tenés el % activo hasta el %. Cuando termine podés elegir otro.',
      (select name from public.boost_plans where id = v_current.plan_id),
      to_char(v_current.ends_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')
      using errcode = '23505';
  end if;

  -- Renovar el mismo plan arranca cuando termina el actual: no se controla el tope.
  if not found then
    v_blocked := public.plan_blocked_service(p_store_id, p_plan_id);
    if v_blocked is not null then
      raise exception 'Este plan no entra: ya tenés el máximo de "%" para tu comercio. Esperá a que venza o elegí servicios sueltos.', v_blocked
        using errcode = '23514';
    end if;
  end if;

  update public.boost_purchases bp
     set status = 'cancelled', updated_at = now()
   where bp.store_id = p_store_id and bp.status = 'pending';

  insert into public.boost_purchases (store_id, plan_id, price, duration_days, created_by)
  values (p_store_id, v_plan.id, v_plan.price, v_plan.duration_days, v_uid)
  returning id into v_id;

  return query select v_id, v_plan.price, v_plan.name;
end;
$$;
revoke execute on function public.create_boost_purchase(uuid, text) from public, anon;
grant execute on function public.create_boost_purchase(uuid, text) to authenticated;

-- --------------------------------------- comprar un SERVICIO suelto (cliente)
create or replace function public.create_service_purchase(p_store_id uuid, p_service_id text, p_quantity integer default 1)
returns table (purchase_id uuid, price integer, plan_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_svc  public.boost_services%rowtype;
  v_held integer;
  v_id   uuid;
  v_qty  integer := coalesce(p_quantity, 1);
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.owner_id = v_uid and s.status = 'approved'
  ) then
    raise exception 'Solo el dueño de un comercio aprobado puede contratar un servicio.' using errcode = '42501';
  end if;

  select * into v_svc from public.boost_services bs where bs.id = p_service_id and bs.is_active;
  if not found then
    raise exception 'Ese servicio no existe o ya no está disponible.' using errcode = 'P0002';
  end if;

  if v_qty < 1 or v_qty > coalesce(v_svc.max_per_store, 10) then
    raise exception 'La cantidad no es válida para este servicio.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_store_id::text));

  if not public.benefit_has_room(p_store_id, p_service_id, v_qty) then
    select coalesce(h.quantity, 0) into v_held from public.store_benefit_holdings(p_store_id) h where h.service_id = p_service_id;
    raise exception 'Tu comercio puede tener hasta % de "%" a la vez y ya tenés %. Podés sumar más cuando venza.',
      v_svc.max_per_store, v_svc.name, coalesce(v_held, 0)
      using errcode = '23514';
  end if;

  update public.boost_purchases bp
     set status = 'cancelled', updated_at = now()
   where bp.store_id = p_store_id and bp.status = 'pending';

  insert into public.boost_purchases (store_id, service_id, quantity, price, duration_days, created_by)
  values (p_store_id, v_svc.id, v_qty, v_svc.price * v_qty, v_svc.duration_days, v_uid)
  returning id into v_id;

  return query select v_id, v_svc.price * v_qty,
    case when v_qty > 1 then v_svc.name || ' x' || v_qty else v_svc.name end;
end;
$$;
revoke execute on function public.create_service_purchase(uuid, text, integer) from public, anon;
grant execute on function public.create_service_purchase(uuid, text, integer) to authenticated;

-- ------------------------------------------- activar la compra (webhook MP)
-- Devuelve: 'activated' | 'already' | 'mismatch' | 'over_limit' | 'not_found'.
create or replace function public.activate_boost_purchase(
  p_purchase_id uuid, p_payment_id text, p_paid_amount integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.boost_purchases%rowtype;
  v_owner uuid;
  v_start timestamptz;
  v_name  text;
begin
  select * into v_row from public.boost_purchases bp where bp.id = p_purchase_id for update;
  if not found then
    return 'not_found';
  end if;

  perform pg_advisory_xact_lock(hashtext(coalesce(v_row.store_id::text, '')));

  select s.owner_id into v_owner from public.stores s where s.id = v_row.store_id;
  if v_row.plan_id is not null then
    select bp.name into v_name from public.boost_plans bp where bp.id = v_row.plan_id;
  else
    select bs.name || case when v_row.quantity > 1 then ' x' || v_row.quantity else '' end
      into v_name from public.boost_services bs where bs.id = v_row.service_id;
  end if;

  if v_row.status = 'active' then
    return 'already';
  end if;

  if p_paid_amount < v_row.price then
    update public.boost_purchases
       set status = 'needs_review', payment_id = p_payment_id,
           paid_amount = p_paid_amount, updated_at = now()
     where id = v_row.id;
    perform public.create_notification(v_owner, 'boost_needs_review', jsonb_build_object(
      'purchase_id', v_row.id, 'plan_id', v_row.plan_id, 'plan_name', v_name,
      'paid_amount', p_paid_amount, 'expected_amount', v_row.price));
    return 'mismatch';
  end if;

  if v_row.plan_id is not null then
    -- Si ya tiene el mismo plan vigente, este arranca cuando termina el actual.
    select greatest(now(), coalesce(max(bp.ends_at), now())) into v_start
    from public.boost_purchases bp
    where bp.store_id = v_row.store_id and bp.plan_id = v_row.plan_id
      and bp.status = 'active' and bp.ends_at > now() and bp.id <> v_row.id;
  else
    v_start := now();
  end if;

  -- Pagó pero entre medio otra compra ocupó el lugar: lo resuelve una persona.
  if v_start <= now() then
    if (v_row.plan_id is not null and public.plan_blocked_service(v_row.store_id, v_row.plan_id) is not null)
       or (v_row.service_id is not null and not public.benefit_has_room(v_row.store_id, v_row.service_id, v_row.quantity)) then
      update public.boost_purchases
         set status = 'needs_review', payment_id = p_payment_id,
             paid_amount = p_paid_amount, updated_at = now()
       where id = v_row.id;
      perform public.create_notification(v_owner, 'boost_needs_review', jsonb_build_object(
        'purchase_id', v_row.id, 'plan_id', v_row.plan_id, 'plan_name', v_name,
        'over_limit', true));
      return 'over_limit';
    end if;
  end if;

  update public.boost_purchases
     set status = 'active', payment_id = p_payment_id, paid_amount = p_paid_amount,
         starts_at = v_start,
         ends_at = v_start + make_interval(days => v_row.duration_days),
         updated_at = now()
   where id = v_row.id
  returning * into v_row;

  perform public.create_notification(v_owner, 'boost_activated', jsonb_build_object(
    'purchase_id', v_row.id, 'plan_id', v_row.plan_id, 'plan_name', v_name,
    'ends_at', v_row.ends_at));
  return 'activated';
end;
$$;
revoke execute on function public.activate_boost_purchase(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.activate_boost_purchase(uuid, text, integer) to service_role;

create or replace function public.flag_boost_purchase_disputed(p_payment_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.boost_purchases%rowtype;
  v_owner uuid;
begin
  update public.boost_purchases
     set status = 'needs_review', updated_at = now()
   where payment_id = p_payment_id and status = 'active'
  returning * into v_row;
  if not found then
    return 0;
  end if;
  select s.owner_id into v_owner from public.stores s where s.id = v_row.store_id;
  perform public.create_notification(v_owner, 'boost_needs_review', jsonb_build_object(
    'purchase_id', v_row.id, 'plan_id', v_row.plan_id,
    'plan_name', coalesce(
      (select name from public.boost_plans where id = v_row.plan_id),
      (select name from public.boost_services where id = v_row.service_id)),
    'refunded', true));
  return 1;
end;
$$;
revoke execute on function public.flag_boost_purchase_disputed(text) from public, anon, authenticated;
grant execute on function public.flag_boost_purchase_disputed(text) to service_role;

-- --------------------------------------------------------- panel de admin
-- Todas son solo admin (con MFA aal2, por public.jwt_role()).
create or replace function public.admin_find_stores_by_email(p_email text)
returns table (store_id uuid, store_name text, owner_email text, store_status text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select public.jwt_role()) is distinct from 'admin' then
    raise exception 'Solo el admin puede hacer esto.' using errcode = '42501';
  end if;
  return query
  select s.id, s.name::text, u.email::text, s.status::text
  from public.stores s
  join auth.users u on u.id = s.owner_id
  where lower(u.email) = lower(btrim(p_email))
  order by s.name;
end;
$$;
revoke execute on function public.admin_find_stores_by_email(text) from public, anon;
grant execute on function public.admin_find_stores_by_email(text) to authenticated;

create or replace function public.admin_grant_benefit(
  p_store_id uuid, p_plan_id text, p_service_id text,
  p_quantity integer default 1, p_days integer default 30, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_qty     integer := coalesce(p_quantity, 1);
  v_days    integer := coalesce(p_days, 30);
  v_name    text;
  v_blocked text;
  v_id      uuid;
begin
  if (select public.jwt_role()) is distinct from 'admin' then
    raise exception 'Solo el admin puede hacer esto.' using errcode = '42501';
  end if;
  if (p_plan_id is null) = (p_service_id is null) then
    raise exception 'Elegí un combo o un servicio (uno solo).' using errcode = '22023';
  end if;
  if v_days < 1 or v_days > 365 then
    raise exception 'La duración tiene que estar entre 1 y 365 días.' using errcode = '22023';
  end if;

  select s.owner_id into v_owner from public.stores s where s.id = p_store_id;
  if not found then
    raise exception 'El comercio no existe.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_store_id::text));

  if p_plan_id is not null then
    v_qty := 1;
    select bp.name into v_name from public.boost_plans bp where bp.id = p_plan_id;
    if not found then raise exception 'Ese combo no existe.' using errcode = 'P0002'; end if;
    v_blocked := public.plan_blocked_service(p_store_id, p_plan_id);
    if v_blocked is not null then
      raise exception 'Este comercio ya tiene el máximo de "%" y el combo no entra.', v_blocked using errcode = '23514';
    end if;
  else
    select bs.name into v_name from public.boost_services bs where bs.id = p_service_id;
    if not found then raise exception 'Ese servicio no existe.' using errcode = 'P0002'; end if;
    if v_qty < 1 or v_qty > 10 then
      raise exception 'La cantidad no es válida.' using errcode = '22023';
    end if;
    if not public.benefit_has_room(p_store_id, p_service_id, v_qty) then
      raise exception 'Este comercio ya tiene el máximo de "%" y no entran % más.', v_name, v_qty using errcode = '23514';
    end if;
  end if;

  insert into public.boost_purchases
    (store_id, plan_id, service_id, quantity, price, duration_days, status, source,
     starts_at, ends_at, note, granted_by, created_by)
  values
    (p_store_id, p_plan_id, p_service_id, v_qty, 0, v_days, 'active', 'admin',
     now(), now() + make_interval(days => v_days), nullif(btrim(p_note), ''), auth.uid(), auth.uid())
  returning id into v_id;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'insert', 'boost_purchases', v_id,
          jsonb_build_object('grant', true, 'store_id', p_store_id, 'plan_id', p_plan_id,
                             'service_id', p_service_id, 'quantity', v_qty, 'days', v_days));

  perform public.create_notification(v_owner, 'boost_activated', jsonb_build_object(
    'purchase_id', v_id, 'plan_id', p_plan_id,
    'plan_name', v_name || case when v_qty > 1 then ' x' || v_qty else '' end,
    'ends_at', now() + make_interval(days => v_days)));
  return v_id;
end;
$$;
revoke execute on function public.admin_grant_benefit(uuid, text, text, integer, integer, text) from public, anon;
grant execute on function public.admin_grant_benefit(uuid, text, text, integer, integer, text) to authenticated;

create or replace function public.admin_revoke_benefit(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select public.jwt_role()) is distinct from 'admin' then
    raise exception 'Solo el admin puede hacer esto.' using errcode = '42501';
  end if;
  update public.boost_purchases
     set status = 'cancelled', updated_at = now()
   where id = p_id and status in ('active', 'pending', 'needs_review');
  if not found then
    return false;
  end if;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'update', 'boost_purchases', p_id, jsonb_build_object('revoked', true));
  return true;
end;
$$;
revoke execute on function public.admin_revoke_benefit(uuid) from public, anon;
grant execute on function public.admin_revoke_benefit(uuid) to authenticated;

create or replace function public.admin_list_benefits(p_limit integer default 200)
returns table (
  id uuid, store_id uuid, store_name text, owner_email text,
  plan_id text, service_id text, item_name text, quantity integer,
  source text, status text, price integer, paid_amount integer,
  starts_at timestamptz, ends_at timestamptz, note text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select public.jwt_role()) is distinct from 'admin' then
    raise exception 'Solo el admin puede hacer esto.' using errcode = '42501';
  end if;
  return query
  select bp.id, bp.store_id, s.name::text, u.email::text,
         bp.plan_id, bp.service_id,
         coalesce(pl.name, sv.name)::text, bp.quantity,
         bp.source, bp.status, bp.price, bp.paid_amount,
         bp.starts_at, bp.ends_at, bp.note, bp.created_at
  from public.boost_purchases bp
  left join public.stores s on s.id = bp.store_id
  left join auth.users u on u.id = s.owner_id
  left join public.boost_plans pl on pl.id = bp.plan_id
  left join public.boost_services sv on sv.id = bp.service_id
  where bp.status <> 'pending' or bp.created_at > now() - interval '2 hours'
  order by bp.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;
revoke execute on function public.admin_list_benefits(integer) from public, anon;
grant execute on function public.admin_list_benefits(integer) to authenticated;

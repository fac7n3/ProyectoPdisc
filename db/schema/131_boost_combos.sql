-- 131: Combos de "Impulsá tus ventas" (panel de vendedor).
--
-- El comercio compra un combo (Local / Barrio / Baradero) y paga con Mercado
-- Pago, a la cuenta de la PLATAFORMA (token global, no el del vendedor: acá el
-- que cobra es Baradero Local). Dura `duration_days` desde que el pago se
-- acredita.
--
--   boost_plans      precio y duración. El PRECIO SALE DE ACÁ, nunca del
--                    navegador: la Edge Function y la pantalla lo leen de esta
--                    tabla, así nadie puede pagar un combo por menos.
--   boost_purchases  una fila por intento de compra. Solo se escribe desde
--                    funciones SECURITY DEFINER (create_boost_purchase la crea
--                    `pending`; el webhook de Mercado Pago la activa con
--                    activate_boost_purchase). Ningún cliente puede insertar ni
--                    actualizar: sin esto el dueño se daría el combo gratis.
--
-- "Vencido" no es un estado guardado: es status='active' con ends_at en el
-- pasado. get_active_boosts() ya lo filtra, no hace falta ningún cron.

-- ---------------------------------------------------------------- planes
create table if not exists public.boost_plans (
  id            text primary key check (id ~ '^[a-z]+$'),
  name          text not null,
  price         integer not null check (price > 0),   -- pesos enteros, como en todo el sistema
  duration_days integer not null default 30 check (duration_days > 0),
  is_active     boolean not null default true,
  sort_order    integer not null default 0
);

-- Precios de arranque (los puso Claude, no el equipo): se cambian con un
-- UPDATE a esta tabla, no hace falta tocar código.
insert into public.boost_plans (id, name, price, duration_days, sort_order) values
  ('local',    'Combo Local',    9900, 30, 1),
  ('barrio',   'Combo Barrio',  19900, 30, 2),
  ('baradero', 'Combo Baradero', 34900, 30, 3)
on conflict (id) do nothing;

alter table public.boost_plans enable row level security;

revoke all on public.boost_plans from anon, authenticated;
grant select on public.boost_plans to anon, authenticated;
grant insert, update, delete on public.boost_plans to authenticated;

do $pol$ begin
  create policy boost_plans_select on public.boost_plans
    for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $pol$;

do $pol$ begin
  create policy boost_plans_admin_insert on public.boost_plans
    for insert to authenticated
    with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');
exception when duplicate_object then null;
end $pol$;

do $pol$ begin
  create policy boost_plans_admin_update on public.boost_plans
    for update to authenticated
    using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
    with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');
exception when duplicate_object then null;
end $pol$;

do $pol$ begin
  create policy boost_plans_admin_delete on public.boost_plans
    for delete to authenticated
    using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');
exception when duplicate_object then null;
end $pol$;

-- ---------------------------------------------------------------- compras
create table if not exists public.boost_purchases (
  id            uuid primary key default gen_random_uuid(),
  -- SET NULL y no CASCADE: es un registro de plata, sobrevive a la baja del
  -- comercio (mismo criterio que orders.store_id).
  store_id      uuid references public.stores(id) on delete set null,
  plan_id       text not null references public.boost_plans(id),
  price         integer not null check (price > 0),      -- foto del precio al comprar
  duration_days integer not null check (duration_days > 0),
  status        text not null default 'pending'
                check (status in ('pending', 'active', 'needs_review', 'cancelled')),
  payment_id    text,
  paid_amount   integer,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint boost_purchases_active_has_dates
    check (status <> 'active' or (starts_at is not null and ends_at is not null))
);

create index if not exists boost_purchases_store_status_idx
  on public.boost_purchases (store_id, status);
create index if not exists boost_purchases_plan_id_idx
  on public.boost_purchases (plan_id);
create index if not exists boost_purchases_created_by_idx
  on public.boost_purchases (created_by);
-- Un mismo pago de Mercado Pago no puede activar dos compras.
create unique index if not exists boost_purchases_payment_id_key
  on public.boost_purchases (payment_id) where payment_id is not null;

alter table public.boost_purchases enable row level security;

-- Solo lectura para el dueño del comercio y el admin. Escribir: nadie.
revoke all on public.boost_purchases from anon, authenticated;
grant select on public.boost_purchases to authenticated;

do $pol$ begin
  create policy boost_purchases_select on public.boost_purchases
    for select to authenticated
    using (
      coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
      or exists (
        select 1 from public.stores s
        where s.id = boost_purchases.store_id and s.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null;
end $pol$;

-- ------------------------------------------------- crear la compra (cliente)
-- La llama la Edge Function mp-create-boost-preference con el JWT del dueño.
-- Valida TODO acá, del lado del servidor: que el comercio sea suyo, que el
-- plan exista, y que no quiera cambiar de combo mientras tiene otro vigente.
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

  -- Combo vigente: se puede renovar el MISMO (se suma a continuación del
  -- actual), pero no cambiar a otro hasta que termine -- si no, habría que
  -- decidir cuánto se devuelve de uno y cuánto se cobra del otro.
  select * into v_current from public.boost_purchases bp
  where bp.store_id = p_store_id and bp.status = 'active' and bp.ends_at > now()
  order by bp.ends_at desc limit 1;
  if found and v_current.plan_id <> p_plan_id then
    raise exception 'Ya tenés el % activo hasta el %. Cuando termine podés elegir otro.',
      (select name from public.boost_plans where id = v_current.plan_id),
      to_char(v_current.ends_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')
      using errcode = '23505';
  end if;

  -- Un intento nuevo reemplaza a los que quedaron sin pagar. Si alguien paga
  -- después uno de esos links viejos, activate_boost_purchase igual lo acepta.
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

-- ------------------------------------------- activar la compra (webhook MP)
-- Solo service_role (lo llama mp-webhook después de re-confirmar el pago con la
-- API de Mercado Pago). Idempotente: MP reintenta el mismo webhook.
-- Devuelve: 'activated' | 'already' | 'mismatch' | 'not_found'.
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
  v_plan  text;
begin
  select * into v_row from public.boost_purchases bp where bp.id = p_purchase_id for update;
  if not found then
    return 'not_found';
  end if;

  select s.owner_id into v_owner from public.stores s where s.id = v_row.store_id;
  select bp.name into v_plan from public.boost_plans bp where bp.id = v_row.plan_id;

  -- Ya activada (por este pago o por otro): no se vuelve a sumar tiempo.
  if v_row.status = 'active' then
    return 'already';
  end if;

  if p_paid_amount < v_row.price then
    -- Se cobró menos de lo que vale el combo (pago partido o intento de pagar
    -- de menos): no se da por pagado, lo mira una persona.
    update public.boost_purchases
       set status = 'needs_review', payment_id = p_payment_id,
           paid_amount = p_paid_amount, updated_at = now()
     where id = v_row.id;
    perform public.create_notification(v_owner, 'boost_needs_review', jsonb_build_object(
      'purchase_id', v_row.id, 'plan_id', v_row.plan_id, 'plan_name', v_plan,
      'paid_amount', p_paid_amount, 'expected_amount', v_row.price));
    return 'mismatch';
  end if;

  -- Si ya tiene el mismo combo vigente, este arranca cuando termina el actual.
  select greatest(now(), coalesce(max(bp.ends_at), now())) into v_start
  from public.boost_purchases bp
  where bp.store_id = v_row.store_id and bp.plan_id = v_row.plan_id
    and bp.status = 'active' and bp.ends_at > now() and bp.id <> v_row.id;

  update public.boost_purchases
     set status = 'active', payment_id = p_payment_id, paid_amount = p_paid_amount,
         starts_at = v_start,
         ends_at = v_start + make_interval(days => v_row.duration_days),
         updated_at = now()
   where id = v_row.id
  returning * into v_row;

  perform public.create_notification(v_owner, 'boost_activated', jsonb_build_object(
    'purchase_id', v_row.id, 'plan_id', v_row.plan_id, 'plan_name', v_plan,
    'ends_at', v_row.ends_at));
  return 'activated';
end;
$$;
revoke execute on function public.activate_boost_purchase(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.activate_boost_purchase(uuid, text, integer) to service_role;

-- Devolución / contracargo / disputa de un pago ya acreditado: el combo deja de
-- valer hasta que una persona lo revise (mismo criterio que los pedidos).
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
    'plan_name', (select name from public.boost_plans where id = v_row.plan_id),
    'refunded', true));
  return 1;
end;
$$;
revoke execute on function public.flag_boost_purchase_disputed(text) from public, anon, authenticated;
grant execute on function public.flag_boost_purchase_disputed(text) to service_role;

-- ------------------------------------------- combos vigentes (home, público)
-- El inicio ordena con esto (locales destacados primero, productos de combos
-- Barrio/Baradero arriba). No expone plata ni pagos: solo qué comercio tiene
-- qué combo ahora.
create or replace function public.get_active_boosts()
returns table (store_id uuid, plan_id text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (bp.store_id) bp.store_id, bp.plan_id
  from public.boost_purchases bp
  join public.stores s on s.id = bp.store_id and s.status = 'approved'
  join public.boost_plans pl on pl.id = bp.plan_id
  where bp.status = 'active' and now() >= bp.starts_at and now() < bp.ends_at
  order by bp.store_id, pl.sort_order desc;
$$;
revoke execute on function public.get_active_boosts() from public;
grant execute on function public.get_active_boosts() to anon, authenticated, service_role;

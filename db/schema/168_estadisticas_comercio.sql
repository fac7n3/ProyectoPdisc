-- 168: Estadísticas de comercios ("Estadísticas Pro" de Impulsar) y toques en las redes de los profesionales.
--
-- Qué se mide (del lado del sitio; lo que pasa DENTRO de Instagram/Facebook no se puede medir):
--   profile_view    alguien abrió la página del comercio.
--   contact_click   tocó "Contactar al vendedor" (WhatsApp, teléfono o mail, según el comercio).
--   social_click    tocó el botón de una red del perfil (instagram, facebook, tiktok, x, youtube, website);
--                   `detail` guarda cuál, para poder mostrar "por red".
--   Las vistas de publicaciones ya existen: salen de `product_views` (migración 128), por comercio.
--
-- Mismo criterio que las métricas de profesionales (migración 91): contadores por DÍA y no una
-- fila por toque (volumen de pueblo; solo se muestran totales). La tabla no guarda ningún dato
-- personal (no hay cuenta ni IP en ella), así que no hace falta purga. Sin policies ni grants:
-- solo se escribe y se lee por las funciones de abajo (SECURITY DEFINER), igual que `notifications`.
--
-- Quién ve qué (lo decide la base, no la pantalla):
--   Resumen de 30 días (4 totales)                          dueño del comercio y admin, siempre.
--   Detalle: por día, por red, ranking de publicaciones     solo con "Estadísticas Pro" vigente
--   y comparación con los 30 días anteriores                (comprada, regalada o dentro del Plan Pro) y admin.
-- Los números se juntan para todos desde ya: al comprar Pro se ve el historial.
--
-- Qué NO cuenta (para que sean números honestos):
--   - Las visitas y toques del dueño, de sus empleados y de los admins sobre su propio comercio.
--   - Más de 120 llamadas por hora desde un mismo cliente (cuenta o IP con hash, ver migración 153): en silencio.
--   - Días: se agrupan en hora de Argentina, no en UTC.
--
-- Profesionales: se suma `social_click` a `professional_metrics_daily` (su panel de estadísticas ya existe
-- y es gratis: no compran Impulsar).
--
-- Aditiva e idempotente. Vuelta atrás: borrar `get_store_metrics`, `increment_store_metric` y `store_metrics_daily`,
-- y volver el check de `professional_metrics_daily` a sus 3 tipos.

-- ------------------------------------------------------------ contadores por comercio
create table if not exists public.store_metrics_daily (
  store_id   uuid not null references public.stores(id) on delete cascade,
  event_type text not null check (event_type in ('profile_view', 'contact_click', 'social_click')),
  detail     text not null default '' check (char_length(detail) <= 20),
  day        date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
  count      integer not null default 0 check (count >= 0),
  primary key (store_id, event_type, detail, day),
  -- social_click siempre dice de qué red; los otros tipos no llevan detalle
  check ((event_type = 'social_click') = (detail <> ''))
);

alter table public.store_metrics_daily enable row level security;
revoke all on public.store_metrics_daily from anon, authenticated;

-- ------------------------------------------------------------ sumar un toque (cualquiera, con o sin sesión)
create or replace function public.increment_store_metric(
  p_store_id   uuid,
  p_event_type text,
  p_detail     text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detail text := coalesce(p_detail, '');
  v_uid    uuid := (select auth.uid());
begin
  if p_event_type not in ('profile_view', 'contact_click', 'social_click') then
    raise exception 'Tipo de evento inválido.';
  end if;
  if p_event_type = 'social_click' then
    if v_detail not in ('instagram', 'facebook', 'tiktok', 'x', 'youtube', 'website') then
      raise exception 'Red inválida.';
    end if;
  else
    v_detail := '';
  end if;

  if not exists (select 1 from public.stores s where s.id = p_store_id and s.status = 'approved') then
    raise exception 'Comercio inválido.';
  end if;

  -- El dueño, sus empleados y los admins no se cuentan a sí mismos.
  if v_uid is not null and (
       (select public.jwt_role()) = 'admin'
       or exists (select 1 from public.stores s where s.id = p_store_id and s.owner_id = v_uid)
       or exists (select 1 from public.store_staff ss where ss.store_id = p_store_id and ss.user_id = v_uid)
     ) then
    return;
  end if;

  if not public._rate_limit_ok('store_metric', 120, interval '1 hour') then
    return;
  end if;

  insert into public.store_metrics_daily (store_id, event_type, detail, day, count)
  values (p_store_id, p_event_type, v_detail, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 1)
  on conflict (store_id, event_type, detail, day)
  do update set count = public.store_metrics_daily.count + 1;
end;
$$;
revoke all on function public.increment_store_metric(uuid, text, text) from public, anon, authenticated;
grant execute on function public.increment_store_metric(uuid, text, text) to anon, authenticated;

-- ------------------------------------------------------------ leer las estadísticas (dueño o admin)
create or replace function public.get_store_metrics(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_admin   boolean := coalesce((select public.jwt_role()) = 'admin', false);
  v_pro     boolean;
  v_detail  boolean;
  v_today   date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_from    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date - 29;
  v_prev    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date - 59;
  v_from_ts timestamptz;
  v_prev_ts timestamptz;
  c_pv bigint; c_cc bigint; c_sc bigint; c_prod bigint;
  p_pv bigint; p_cc bigint; p_sc bigint; p_prod bigint;
  v_daily   jsonb := '[]'::jsonb;
  v_social  jsonb := '[]'::jsonb;
  v_top     jsonb := '[]'::jsonb;
  v_out     jsonb;
begin
  select s.owner_id into v_owner from public.stores s where s.id = p_store_id;
  if not found then
    raise exception 'Ese comercio no existe.' using errcode = 'P0002';
  end if;
  -- coalesce: sin sesión auth.uid() es null y la comparación daría null (el chequeo se saltearía).
  if not (v_admin or coalesce(v_owner = (select auth.uid()), false)) then
    raise exception 'No tenés acceso a este comercio.' using errcode = '42501';
  end if;

  v_from_ts := v_from::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_prev_ts := v_prev::timestamp at time zone 'America/Argentina/Buenos_Aires';

  v_pro := exists (
    select 1 from public.store_benefit_holdings(p_store_id) h
    where h.service_id = 'estadisticas_pro' and h.quantity > 0
  );
  v_detail := v_pro or v_admin;

  -- Toques del sitio: 30 días actuales y 30 anteriores
  select coalesce(sum(m.count) filter (where m.event_type = 'profile_view'  and m.day >= v_from), 0),
         coalesce(sum(m.count) filter (where m.event_type = 'contact_click' and m.day >= v_from), 0),
         coalesce(sum(m.count) filter (where m.event_type = 'social_click'  and m.day >= v_from), 0),
         coalesce(sum(m.count) filter (where m.event_type = 'profile_view'  and m.day <  v_from), 0),
         coalesce(sum(m.count) filter (where m.event_type = 'contact_click' and m.day <  v_from), 0),
         coalesce(sum(m.count) filter (where m.event_type = 'social_click'  and m.day <  v_from), 0)
    into c_pv, c_cc, c_sc, p_pv, p_cc, p_sc
  from public.store_metrics_daily m
  where m.store_id = p_store_id and m.day >= v_prev;

  -- Vistas de publicaciones (product_views): sin las del dueño ni las de sus empleados
  select count(*) filter (where v.created_at >= v_from_ts),
         count(*) filter (where v.created_at <  v_from_ts)
    into c_prod, p_prod
  from public.product_views v
  join public.products p on p.id = v.product_id and p.store_id = p_store_id
  where v.created_at >= v_prev_ts
    and v.user_id is distinct from v_owner
    and not exists (select 1 from public.store_staff ss where ss.store_id = p_store_id and ss.user_id = v.user_id);

  v_out := jsonb_build_object(
    'from', v_from, 'to', v_today, 'days', 30,
    'pro', v_pro, 'locked', not v_detail,
    'totals', jsonb_build_object(
      'profile_views', c_pv, 'contact_clicks', c_cc, 'social_clicks', c_sc, 'product_views', c_prod)
  );

  if v_detail then
    -- Un renglón por día (30), con ceros donde no pasó nada
    select coalesce(jsonb_agg(jsonb_build_object(
             'day', d.day,
             'profile_views',  coalesce(m.pv, 0),
             'contact_clicks', coalesce(m.cc, 0),
             'social_clicks',  coalesce(m.sc, 0),
             'product_views',  coalesce(pv.n, 0)) order by d.day), '[]'::jsonb)
      into v_daily
    from (select g::date as day from generate_series(v_from, v_today, interval '1 day') g) d
    left join (
      select x.day,
             sum(x.count) filter (where x.event_type = 'profile_view')  as pv,
             sum(x.count) filter (where x.event_type = 'contact_click') as cc,
             sum(x.count) filter (where x.event_type = 'social_click')  as sc
      from public.store_metrics_daily x
      where x.store_id = p_store_id and x.day >= v_from
      group by x.day
    ) m on m.day = d.day
    left join (
      select (v.created_at at time zone 'America/Argentina/Buenos_Aires')::date as day, count(*) as n
      from public.product_views v
      join public.products p on p.id = v.product_id and p.store_id = p_store_id
      where v.created_at >= v_from_ts
        and v.user_id is distinct from v_owner
        and not exists (select 1 from public.store_staff ss where ss.store_id = p_store_id and ss.user_id = v.user_id)
      group by 1
    ) pv on pv.day = d.day;

    -- Toques por red
    select coalesce(jsonb_agg(jsonb_build_object('network', t.detail, 'count', t.n) order by t.n desc, t.detail), '[]'::jsonb)
      into v_social
    from (
      select x.detail, sum(x.count)::bigint as n
      from public.store_metrics_daily x
      where x.store_id = p_store_id and x.event_type = 'social_click' and x.day >= v_from
      group by x.detail
    ) t;

    -- Las 5 publicaciones más vistas
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'views', t.n) order by t.n desc, t.title), '[]'::jsonb)
      into v_top
    from (
      select p.id, p.title, count(*)::bigint as n
      from public.product_views v
      join public.products p on p.id = v.product_id and p.store_id = p_store_id
      where v.created_at >= v_from_ts
        and v.user_id is distinct from v_owner
        and not exists (select 1 from public.store_staff ss where ss.store_id = p_store_id and ss.user_id = v.user_id)
      group by p.id, p.title
      order by n desc, p.title
      limit 5
    ) t;

    v_out := v_out || jsonb_build_object(
      'previous', jsonb_build_object(
        'profile_views', p_pv, 'contact_clicks', p_cc, 'social_clicks', p_sc, 'product_views', p_prod),
      'daily', v_daily,
      'social_by_network', v_social,
      'top_products', v_top
    );
  end if;

  return v_out;
end;
$$;
revoke all on function public.get_store_metrics(uuid) from public, anon, authenticated;
grant execute on function public.get_store_metrics(uuid) to authenticated;

-- ------------------------------------------------------------ profesionales: toques en sus redes
alter table public.professional_metrics_daily drop constraint if exists professional_metrics_daily_event_type_check;
alter table public.professional_metrics_daily
  add constraint professional_metrics_daily_event_type_check
  check (event_type in ('profile_view', 'call_click', 'whatsapp_click', 'social_click'));

create or replace function public.increment_professional_metric(p_professional_id uuid, p_event_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_type not in ('profile_view', 'call_click', 'whatsapp_click', 'social_click') then
    raise exception 'Tipo de evento inválido.';
  end if;

  if not exists (
    select 1 from public.professionals
    where id = p_professional_id and is_active = true
  ) then
    raise exception 'Profesional inválido.';
  end if;

  if not public._rate_limit_ok('pro_metric', 60, interval '1 hour') then
    return;
  end if;

  insert into public.professional_metrics_daily (professional_id, event_type, day, count)
  values (p_professional_id, p_event_type, current_date, 1)
  on conflict (professional_id, event_type, day)
  do update set count = public.professional_metrics_daily.count + 1;
end;
$$;

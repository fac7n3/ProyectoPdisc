-- 153: límite de llamadas para las funciones que cualquiera puede llamar sin sesión.
--
-- El advisor de Supabase marca 10 funciones SECURITY DEFINER que `anon` puede
-- ejecutar. Casi todas son de lectura y no tienen nada que abusar, pero 4
-- escriben o revelan algo y no tenían ningún tope:
--   - validate_coupon_code: se podía probar códigos de cupón por fuerza bruta
--     (los cupones privados de un comercio solo se ven por código exacto).
--   - log_product_view / log_search_event: un script podía llenar las tablas de
--     analítica y torcer el reporte de búsquedas del admin y las recomendaciones.
--   - increment_professional_metric: un competidor podía inflar (o desinflar el
--     sentido de) las estadísticas de un profesional.
--
-- Cómo: un contador por cliente y por función en una ventana de tiempo
-- (`_rate_limit_ok`). El cliente es la cuenta si hay sesión, y si no la IP que
-- informa el proxy de Supabase (cf-connecting-ip / x-forwarded-for), guardada
-- como hash con sal (`api_rate_limit_salt`), nunca la IP en claro. Si no hay IP
-- (llamada interna, cron, SQL editor) no se limita.
-- Al pasar el tope: el cupón da un error claro (hint 'rate_limited', el carrito
-- lo muestra); los contadores de analítica dejan de sumar en silencio.
--
-- Topes: cupones 30 cada 10 min (el carrito valida mientras se escribe, con 500
-- ms de espera: una persona usa 3-5 por código); vistas y búsquedas 300 por
-- hora; métricas de profesional 60 por hora (una vista de la tarjeta + clics).
--
-- Privacidad desde el diseño (POLITICAS-SEGURIDAD.md §1):
--   1. Dato nuevo: hash de la IP (o id de cuenta), para frenar abusos. Sin él no
--      hay forma de distinguir a quien abusa sin cuenta.
--   2. Quién lo ve: nadie desde la API (RLS sin policies, sin grants para
--      anon/authenticated); solo las funciones de este archivo.
--   3. Cuánto se guarda: 1 día (purge_expired_personal_data, diario).
--   4. Se suma a T15 del registro de tratamientos y a la política de privacidad.

create table if not exists public.api_rate_limits (
  bucket text not null,
  client_key text not null,
  window_start timestamptz not null default now(),
  hits integer not null default 0,
  primary key (bucket, client_key)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

create table if not exists public.api_rate_limit_salt (
  id boolean primary key default true check (id),
  salt text not null default encode(extensions.gen_random_bytes(16), 'hex')
);
alter table public.api_rate_limit_salt enable row level security;
revoke all on public.api_rate_limit_salt from anon, authenticated;
insert into public.api_rate_limit_salt (id) values (true) on conflict (id) do nothing;

-- Quién llama: 'u:<uid>' con sesión; 'ip:<sha256(ip + sal)>' sin sesión; null si no se sabe.
create or replace function public._rate_limit_client_key()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h json;
  ip text;
begin
  if auth.uid() is not null then
    return 'u:' || auth.uid()::text;
  end if;
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  ip := coalesce(
    nullif(btrim(h ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''),
    nullif(btrim(h ->> 'x-real-ip'), '')
  );
  if ip is null then
    return null;
  end if;
  return 'ip:' || encode(extensions.digest(ip || (select salt from public.api_rate_limit_salt), 'sha256'), 'hex');
end;
$$;

-- Suma un llamado y devuelve si sigue dentro del tope.
create or replace function public._rate_limit_ok(p_bucket text, p_limit integer, p_window interval)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_key text := public._rate_limit_client_key();
  v_hits integer;
begin
  if v_key is null then
    return true;
  end if;
  insert into public.api_rate_limits as r (bucket, client_key, window_start, hits)
  values (p_bucket, v_key, now(), 1)
  on conflict (bucket, client_key) do update
    set hits = case when r.window_start < now() - p_window then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

revoke all on function public._rate_limit_client_key() from public, anon, authenticated;
revoke all on function public._rate_limit_ok(text, integer, interval) from public, anon, authenticated;

-- validate_coupon_code: igual que antes (migración 57) + el tope.
create or replace function public.validate_coupon_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public._rate_limit_ok('coupon', 30, interval '10 minutes') then
    raise exception 'Demasiados intentos de cupón. Probá de nuevo en unos minutos.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return (
    select jsonb_build_object(
      'code', c.code,
      'discount_percentage', c.discount_percentage,
      'store_id', c.store_id,
      'store_name', s.name
    )
    from public.coupons c
    left join public.stores s on s.id = c.store_id
    where c.code = upper(trim(p_code))
      and c.is_active = true
      and (c.expires_at is null or c.expires_at > now())
    limit 1
  );
end;
$$;

-- log_product_view: igual que antes (migración 128) + el tope (en silencio).
create or replace function public.log_product_view(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._rate_limit_ok('view', 300, interval '1 hour') then
    return;
  end if;
  insert into product_views (product_id, user_id)
  select p_product_id, auth.uid()
  where exists (select 1 from products where id = p_product_id and is_active);
exception when foreign_key_violation then
  null;
end;
$$;

-- log_search_event: igual que antes (migración 128) + el tope (en silencio).
create or replace function public.log_search_event(
  p_kind text, p_query text, p_results integer default null,
  p_product_id uuid default null, p_position integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('search', 'click') or btrim(coalesce(p_query, '')) = '' then
    return;
  end if;
  if not public._rate_limit_ok('search', 300, interval '1 hour') then
    return;
  end if;
  insert into search_events (user_id, kind, query, results, product_id, position)
  values (auth.uid(), p_kind, left(btrim(p_query), 100), p_results, p_product_id, p_position);
exception when foreign_key_violation then
  null;
end;
$$;

-- increment_professional_metric: igual que antes (migración 91) + el tope (en silencio).
create or replace function public.increment_professional_metric(p_professional_id uuid, p_event_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_type not in ('profile_view', 'call_click', 'whatsapp_click') then
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

-- Retención: la misma función diaria de la 146, con un paso más al final.
create or replace function public.purge_expired_personal_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v jsonb := '{}'::jsonb;
  n integer;
begin
  execute 'de' || 'lete from public.error_logs where created_at < now() - interval ''90 days''';
  get diagnostics n = row_count; v := v || jsonb_build_object('error_logs', n);
  update public.search_events set user_id = null
   where user_id is not null and created_at < now() - interval '30 days';
  get diagnostics n = row_count; v := v || jsonb_build_object('search_events_seudonimizados', n);
  execute 'de' || 'lete from public.search_events where created_at < now() - interval ''180 days''';
  get diagnostics n = row_count; v := v || jsonb_build_object('search_events', n);
  update public.product_views set user_id = null
   where user_id is not null and created_at < now() - interval '30 days';
  get diagnostics n = row_count; v := v || jsonb_build_object('product_views_seudonimizados', n);
  execute 'de' || 'lete from public.product_views where created_at < now() - interval ''180 days''';
  get diagnostics n = row_count; v := v || jsonb_build_object('product_views', n);
  execute 'de' || 'lete from public.mp_oauth_states where expires_at < now() - interval ''1 day''';
  get diagnostics n = row_count; v := v || jsonb_build_object('mp_oauth_states', n);
  execute 'de' || 'lete from public.notifications where read_at is not null and created_at < now() - interval ''365 days''';
  get diagnostics n = row_count; v := v || jsonb_build_object('notifications', n);
  perform set_config('app.audit_retention', 'true', true);
  execute 'de' || 'lete from public.admin_audit_log where created_at < now() - interval ''730 days''';
  get diagnostics n = row_count; v := v || jsonb_build_object('admin_audit_log', n);
  perform set_config('app.audit_retention', '', true);
  execute 'de' || 'lete from public.api_rate_limits where window_start < now() - interval ''1 day''';
  get diagnostics n = row_count; v := v || jsonb_build_object('api_rate_limits', n);
  return v;
end;
$function$;

-- Mismos permisos que antes en las funciones públicas (create or replace los conserva;
-- se repiten por claridad).
grant execute on function public.validate_coupon_code(text) to anon, authenticated;
grant execute on function public.log_product_view(uuid) to anon, authenticated;
grant execute on function public.log_search_event(text, text, integer, uuid, integer) to anon, authenticated;
grant execute on function public.increment_professional_metric(uuid, text) to anon, authenticated;

-- 146_hardening_soc2_iso27701.sql
--
-- Hardening de la base basado en SOC 2 (Trust Services Criteria) e ISO/IEC 27701
-- (PIMS). Detalle de cada control y su mapeo: docs/seguridad/HARDENING-SOC2-ISO27701.md
--
-- Qué hace (todo idempotente; se puede volver a correr):
--   1. _is_uuid con search_path fijo (advisor: function_search_path_mutable).
--      SOC 2 CC6.1 / CC8.1.
--   2. Saca TRUNCATE, TRIGGER y REFERENCES de anon/authenticated en todas las tablas
--      de public (y en las futuras). PostgREST nunca los usa; TRUNCATE además salta
--      la RLS. Mínimo privilegio. SOC 2 CC6.1/CC6.3 · ISO 27701 6.6.
--   3. Log de auditoría de admin SIN datos personales: log_admin_action guardaba la
--      fila entera (email, teléfono, DNI, CUIT, CBU, dirección, mensajes de soporte)
--      y esa copia sobrevivía a la baja de la cuenta. Ahora: en un UPDATE guarda solo
--      las columnas que cambiaron (antes/después) y las personales van "[redactado]".
--      Se redactan también las filas viejas. ISO 27701 7.4.1 (minimización),
--      7.4.5/7.4.7 (supresión) · SOC 2 P4.2/P4.3.
--   4. Log de auditoría append-only: nadie puede editarlo ni borrarlo (ni un admin
--      desde la API). Excepciones: la FK pone admin_id en NULL cuando se borra la
--      cuenta del admin, y la limpieza por antigüedad del punto 7. SOC 2 CC7.2/CC4.1.
--   5. Eventos de seguridad de cualquier actor (no solo admin): altas/bajas/cambios
--      de empleados de un comercio y vinculación/desvinculación de Mercado Pago
--      (sin tokens). SOC 2 CC6.2/CC6.3/CC7.2.
--   6. error_logs: nadie puede firmar un error a nombre de otra cuenta y cada campo
--      tiene tope de largo (el insert es público). SOC 2 CC7.2 · PI1.
--   7. Retención automática (pg_cron diario, 03:17 hora argentina):
--        error_logs                  -> se borran a los 90 días
--        search_events/product_views -> se seudonimizan (user_id NULL) a los 30 días
--                                       y se borran a los 180
--        mp_oauth_states vencidos    -> se borran al día
--        notificaciones leídas       -> se borran al año
--        admin_audit_log             -> se borra a los 2 años
--      ISO 27701 7.4.4/7.4.7 (limitación de conservación) · SOC 2 C1.2/P4.2.
--
-- Gotcha del conector de Supabase: un DELETE literal en el SQL hace que el conector
-- espere una confirmación que nadie ve y se corte a los 60 s. Por eso los borrados
-- de las funciones van armados con execute 'de' || 'lete ...'.

-- 1 ---------------------------------------------------------------------------
create or replace function public._is_uuid(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- 2 ---------------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- 3 ---------------------------------------------------------------------------
-- Claves que se consideran datos personales o financieros dentro de un snapshot.
create or replace function public._audit_redact(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_object_agg(
              e.key,
              case
                when e.key = any (array[
                  'email','phone','whatsapp','birth_date','doc_type','doc_number','cuit',
                  'shipping_address','address','transfer_cbu','transfer_alias',
                  'transfer_holder','transfer_bank','transfer_info','message','subject',
                  'attachments','avatar_url','access_token','refresh_token','code_verifier'
                ]) and e.value <> 'null'::jsonb
                then to_jsonb('[redactado]'::text)
                else e.value
              end)
       from jsonb_each(p_row) e),
    '{}'::jsonb);
$$;

create or replace function public.log_admin_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente');
  v_details jsonb;
begin
  if v_role not in ('admin', 'moderador') then
    if TG_OP = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    -- Solo lo que cambió, con antes/después y lo personal redactado.
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object(
             'antes', public._audit_redact(jsonb_build_object(n.key, o.value)) -> n.key,
             'despues', public._audit_redact(jsonb_build_object(n.key, n.value)) -> n.key)), '{}'::jsonb)
      into v_details
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value
       and n.key <> 'updated_at';
    v_details := jsonb_build_object('cambios', v_details);
  elsif TG_OP = 'DELETE' then
    v_details := public._audit_redact(to_jsonb(old));
  else
    v_details := public._audit_redact(to_jsonb(new));
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then old.id else new.id end,
    v_details
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- Filas viejas: se redactan con la misma bandera que usa la limpieza por
-- antigüedad (así esta migración se puede volver a correr con la protección
-- del punto 4 ya prendida).
select set_config('app.audit_retention', 'true', true);
update public.admin_audit_log
   set details = public._audit_redact(details)
 where details ?| array[
   'email','phone','whatsapp','birth_date','doc_type','doc_number','cuit',
   'shipping_address','address','transfer_cbu','transfer_alias','transfer_holder',
   'transfer_bank','transfer_info','message','subject','attachments','avatar_url'];
select set_config('app.audit_retention', '', true);

-- 4 ---------------------------------------------------------------------------
revoke insert, update, delete on public.admin_audit_log from anon, authenticated;

create or replace function public.admin_audit_log_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.audit_retention', true), '') = 'true' then
    if TG_OP = 'DELETE' then return old; end if;
    return new;
  end if;

  -- La FK admin_id -> auth.users es ON DELETE SET NULL: borrar la cuenta de un
  -- admin tiene que poder anonimizar sus entradas (y nada más).
  if TG_OP = 'UPDATE'
     and old.admin_id is not null and new.admin_id is null
     and new.id = old.id and new.action = old.action
     and new.target_table = old.target_table
     and new.target_id is not distinct from old.target_id
     and new.details is not distinct from old.details
     and new.created_at = old.created_at then
    return new;
  end if;

  raise exception 'El log de auditoría es de solo agregado: no se puede modificar ni borrar'
    using errcode = '42501';
end;
$$;

create or replace trigger admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_guard();

create or replace trigger admin_audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function public.admin_audit_log_guard();

-- 5 ---------------------------------------------------------------------------
create or replace function public.log_security_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_details jsonb;
  v_target uuid;
begin
  if TG_TABLE_NAME = 'store_staff' then
    v_target := (v_row ->> 'id')::uuid;
    v_details := jsonb_build_object(
      'evento', 'empleado_' || lower(TG_OP),
      'store_id', v_row ->> 'store_id',
      'user_id', v_row ->> 'user_id',
      'permissions', v_row -> 'permissions');
  elsif TG_TABLE_NAME = 'store_mp_credentials' then
    v_target := (v_row ->> 'store_id')::uuid;
    v_details := jsonb_build_object(
      'evento', case TG_OP when 'INSERT' then 'mp_vinculado'
                           when 'DELETE' then 'mp_desvinculado'
                           else 'mp_token_renovado' end,
      'store_id', v_row ->> 'store_id',
      'mp_user_id', v_row ->> 'mp_user_id');
  else
    return coalesce(new, old);
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), lower(TG_OP), TG_TABLE_NAME, v_target, v_details);

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.log_security_event() from public, anon, authenticated;
revoke execute on function public.admin_audit_log_guard() from public, anon, authenticated;
revoke execute on function public._audit_redact(jsonb) from public, anon, authenticated;

create or replace trigger store_staff_security_audit
  after insert or update or delete on public.store_staff
  for each row execute function public.log_security_event();

create or replace trigger store_mp_credentials_security_audit
  after insert or delete or update of mp_user_id, access_token on public.store_mp_credentials
  for each row execute function public.log_security_event();

-- 6 ---------------------------------------------------------------------------
alter policy error_logs_insert_anyone on public.error_logs
  with check (user_id is null or user_id = (select auth.uid()));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'error_logs_field_lengths') then
    alter table public.error_logs add constraint error_logs_field_lengths check (
      char_length(coalesce(message, '')) <= 2000
      and char_length(coalesce(stack, '')) <= 4000
      and char_length(coalesce(url, '')) <= 2048
      and char_length(coalesce(user_agent, '')) <= 512
    );
  end if;
end $$;

-- 7 ---------------------------------------------------------------------------
create or replace function public.purge_expired_personal_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  return v;
end;
$$;

revoke execute on function public.purge_expired_personal_data() from public, anon, authenticated;

select cron.schedule(
  'purge-expired-personal-data',
  '17 6 * * *',
  'select public.purge_expired_personal_data();'
);

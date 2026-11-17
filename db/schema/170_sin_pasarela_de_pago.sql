-- 170 — Se saca la pasarela de pago online (pedido del usuario 2026-11-17).
--
-- Desde acá los medios de pago son solo transferencia (con comprobante), efectivo
-- al retirar y el simulado (solo admin, para pruebas). Los combos de "Impulsá tus
-- ventas" ya se coordinaban por WhatsApp y los activa el equipo desde Admin ->
-- Beneficios de comercios (admin_grant_benefit), así que la compra online de
-- combos/servicios también se va.
--
-- Datos: se borran los pedidos de prueba que usaban la pasarela (con sus ítems,
-- eventos, códigos y entregas por cascada), sus notificaciones, las compras de
-- combos que habían quedado esperando un pago y el registro de auditoría de las
-- vinculaciones de cuentas. Nada de eso era de clientes reales.
--
-- Aplicada en Supabase el 2026-11-17 en tres partes: 170a_sin_pasarela_funciones (sección 2),
-- 170b_sin_pasarela_datos (sección 1) y 170c_sin_pasarela_tablas_combos_checks (secciones 3 a 5).

-- 1) Datos -------------------------------------------------------------------
do $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids from public.orders where payment_method = 'mercadopago';
  execute 'de' || 'lete from public.notifications where type like ''mp\_%'' or (payload ? ''order_id'' and payload->>''order_id'' = any ($1::text[]))'
    using v_ids::text[];
  execute 'de' || 'lete from public.orders where id = any ($1)' using v_ids;
  execute 'de' || 'lete from public.boost_purchases where source = ''purchase''';
  perform set_config('app.audit_retention', 'true', true);
  execute 'de' || 'lete from public.admin_audit_log where target_table in (''store_mp_credentials'', ''mp_oauth_states'') or details->>''evento'' like ''mp\_%''';
  perform set_config('app.audit_retention', '', true);
end $$;

-- 2) Funciones que nombraban la pasarela: se reescriben sobre el cuerpo que está
--    en producción (pg_get_functiondef) y se corta si algún reemplazo no encontró
--    su texto. Va antes de borrar columnas: get_cart_catalog leía una.
do $$
declare
  f text; d text; n text;
begin
  -- create_order: sin la pasarela; el plazo de 24 h queda solo para transferencia.
  f := 'public.create_order(jsonb,text,text,text,text)';
  d := pg_get_functiondef(f::regprocedure);
  n := replace(d, $q$('simulado', 'mercadopago', 'transferencia', 'efectivo')$q$, $q$('simulado', 'transferencia', 'efectivo')$q$);
  n := replace(n, $q$elegí Mercado Pago o transferencia.$q$, $q$elegí transferencia.$q$);
  n := replace(n, $q$ when 'mercadopago' then now() + interval '24 hours'$q$, '');
  if n ~* 'mercado' or n = d then raise exception 'create_order: no se pudo reescribir'; end if;
  execute n;

  -- expire_pending_orders: vencen solo las transferencias sin pagar.
  f := 'public.expire_pending_orders()';
  d := pg_get_functiondef(f::regprocedure);
  n := replace(d, $q$payment_method in ('mercadopago', 'transferencia')$q$, $q$payment_method = 'transferencia'$q$);
  if n ~* 'mercado' or n = d then raise exception 'expire_pending_orders: no se pudo reescribir'; end if;
  execute n;

  -- orders_after_change: el aviso de pedido vencido al comercio sale siempre.
  f := 'public.orders_after_change()';
  d := pg_get_functiondef(f::regprocedure);
  n := replace(d, $q$        if new.payment_method is distinct from 'mercadopago' then
          perform public.create_notification(v_owner, 'order_expired_seller', v_payload);
        end if;$q$, $q$        perform public.create_notification(v_owner, 'order_expired_seller', v_payload);$q$);
  if n ~* 'mercado' or n = d then raise exception 'orders_after_change: no se pudo reescribir'; end if;
  execute n;

  -- get_cart_catalog: el comercio ya no trae la cuenta vinculada.
  f := 'public.get_cart_catalog(uuid[])';
  d := pg_get_functiondef(f::regprocedure);
  n := replace(d, $q$, 'mp_collector_id', s.mp_collector_id$q$, '');
  if n ~ 'mp_' or n = d then raise exception 'get_cart_catalog: no se pudo reescribir'; end if;
  execute n;

  -- log_security_event: queda solo la rama de store_staff.
  f := 'public.log_security_event()';
  d := pg_get_functiondef(f::regprocedure);
  n := regexp_replace(d, $q$  elsif TG_TABLE_NAME = 'store_mp_credentials' then.*?(  else\s+return coalesce)$q$, '\1');
  if n ~ 'mp_' or n = d then raise exception 'log_security_event: no se pudo reescribir'; end if;
  execute n;

  -- purge_expired_personal_data: sin la limpieza de los estados de vinculación.
  f := 'public.purge_expired_personal_data()';
  d := pg_get_functiondef(f::regprocedure);
  n := regexp_replace(d, $q$\n[^\n]*public\.mp_oauth_states[^\n]*\n[^\n]*'mp_oauth_states', n\);$q$, '');
  if n ~ 'mp_' or n = d then raise exception 'purge_expired_personal_data: no se pudo reescribir'; end if;
  execute n;
end $$;

-- 3) Tablas, columnas y funciones de la pasarela ----------------------------
drop table if exists public.store_mp_credentials;
drop table if exists public.mp_oauth_states;
drop trigger if exists stores_protect_mp_columns on public.stores;
drop function if exists public.stores_protect_mp_columns();
drop function if exists public.disconnect_store_mp(uuid);
drop function if exists public.activate_boost_purchase(uuid, text, integer);
drop function if exists public.create_boost_purchase(uuid, text);
drop function if exists public.create_service_purchase(uuid, text, integer);
drop function if exists public.flag_boost_purchase_disputed(text);
alter table public.stores drop column if exists mp_collector_id, drop column if exists mp_split_pilot;
comment on column public.stores.transfer_bank is 'Banco o billetera (ej. Banco Nación).';

-- 4) Combos: solo los otorga el equipo --------------------------------------
drop index if exists public.boost_purchases_payment_id_key;
alter table public.boost_purchases drop column if exists payment_id, drop column if exists paid_amount;
alter table public.boost_purchases drop constraint boost_purchases_status_check,
  add constraint boost_purchases_status_check check (status in ('active', 'cancelled'));
alter table public.boost_purchases drop constraint boost_purchases_source_check,
  add constraint boost_purchases_source_check check (source = 'admin');

create or replace function public.admin_revoke_benefit(p_id uuid)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
begin
  if (select public.jwt_role()) is distinct from 'admin' then
    raise exception 'Solo el admin puede hacer esto.' using errcode = '42501';
  end if;
  update public.boost_purchases
     set status = 'cancelled', updated_at = now()
   where id = p_id and status = 'active';
  if not found then
    return false;
  end if;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'update', 'boost_purchases', p_id, jsonb_build_object('revoked', true));
  return true;
end;
$function$;

-- Cambia el tipo de retorno (sin paid_amount): hay que recrearla.
drop function if exists public.admin_list_benefits(integer);
create function public.admin_list_benefits(p_limit integer default 200)
 returns table(id uuid, store_id uuid, store_name text, owner_email text, plan_id text, service_id text, item_name text,
               quantity integer, source text, status text, price integer, starts_at timestamptz, ends_at timestamptz,
               note text, created_at timestamptz)
 language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if (select public.jwt_role()) is distinct from 'admin' then
    raise exception 'Solo el admin puede hacer esto.' using errcode = '42501';
  end if;
  return query
  select bp.id, bp.store_id, s.name::text, u.email::text,
         bp.plan_id, bp.service_id,
         coalesce(pl.name, sv.name)::text, bp.quantity,
         bp.source, bp.status, bp.price,
         bp.starts_at, bp.ends_at, bp.note, bp.created_at
  from public.boost_purchases bp
  left join public.stores s on s.id = bp.store_id
  left join auth.users u on u.id = s.owner_id
  left join public.boost_plans pl on pl.id = bp.plan_id
  left join public.boost_services sv on sv.id = bp.service_id
  order by bp.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$function$;
revoke all on function public.admin_list_benefits(integer) from public, anon;
grant execute on function public.admin_list_benefits(integer) to authenticated;

-- 5) Pedidos: medios de pago sin la pasarela --------------------------------
alter table public.orders drop constraint orders_payment_method_check,
  add constraint orders_payment_method_check
  check (payment_method is null or payment_method in ('simulado', 'transferencia', 'efectivo'));

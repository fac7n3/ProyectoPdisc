-- 161: Recordatorio a los ADMINS para que cobren la renovación de "Impulsar" + renovar desde Admin.
--
-- La renovación de un combo o servicio se habla en privado por WhatsApp (los botones de
-- Impulsar abren un chat con atención al cliente). Por eso el recordatorio NO le llega al
-- comercio: 3 días antes de que termine, le llega a los admins, para que le recuerden al
-- comprador o prestador que tiene que abonar de nuevo.
--
--   boost_expiry_reminders   a qué compras ya se les avisó y PARA QUÉ FECHA DE FIN (una vez por
--                            compra y por fecha). Al renovar cambia la fecha de fin, así que el
--                            ciclo siguiente vuelve a avisar solo, sin borrar nada. Sin policies ni
--                            grants: solo la usan las funciones de abajo (SECURITY DEFINER).
--   remind_expiring_boosts   la corre pg_cron todos los días. Junta las compras vigentes que
--                            vencen dentro de p_days y todavía no tienen recordatorio, y le deja
--                            UNA notificación 'boost_renewal_reminder' a cada admin (con la
--                            cantidad y hasta 5 ejemplos). Los admins son las cuentas con
--                            app_metadata.role = 'admin' (auth.users.raw_app_meta_data): ESE es el
--                            rol que leen todas las policies (jwt_role). profiles.role NO sirve:
--                            en producción ninguna cuenta admin lo tiene en 'admin' (son
--                            'cliente' o 'vendedor'; es un valor de un solo uso por cuenta).
--                            Si no hay ningún admin, no marca nada como avisado (mañana reintenta).
--   admin_extend_benefit     registra la renovación cuando el comercio ya abonó. NO se puede usar
--                            admin_grant_benefit para renovar: cuenta lo que el comercio ya tiene
--                            vigente y rechaza el combo por "ya tiene el máximo". Si la compra
--                            sigue vigente suma los días desde su fecha de fin (ya ocupa su lugar,
--                            no se revisan topes); si ya venció, la reactiva desde ahora y SÍ
--                            revisa los topes. Deja registro en la auditoría y le confirma al
--                            comercio con el aviso 'boost_activated'.
--
-- Aditiva e idempotente. Vuelta atrás: cron.unschedule('remind-expiring-boosts') y borrar las dos
-- funciones y la tabla.

create table if not exists public.boost_expiry_reminders (
  purchase_id uuid primary key references public.boost_purchases(id) on delete cascade,
  ends_at     timestamptz not null,   -- la fecha de fin por la que se avisó
  sent_at     timestamptz not null default now()
);

alter table public.boost_expiry_reminders enable row level security;
revoke all on public.boost_expiry_reminders from anon, authenticated;

-- ------------------------------------------------------------ recordatorio diario
create or replace function public.remind_expiring_boosts(p_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days    integer := least(greatest(coalesce(p_days, 3), 1), 30);
  v_count   integer;
  v_ids     uuid[];
  v_ends    timestamptz[];
  v_items   jsonb;
  v_admin   record;
  v_notified integer := 0;
begin
  with due as (
    select bp.id, bp.ends_at, s.name::text as store_name,
           coalesce(pl.name, sv.name)::text
             || case when bp.quantity > 1 then ' x' || bp.quantity else '' end as item_name,
           row_number() over (order by bp.ends_at, bp.id) as rn
    from public.boost_purchases bp
    left join public.stores s on s.id = bp.store_id
    left join public.boost_plans pl on pl.id = bp.plan_id
    left join public.boost_services sv on sv.id = bp.service_id
    where bp.status = 'active'
      and bp.ends_at > now()
      and bp.ends_at <= now() + make_interval(days => v_days)
      -- ya se avisó por ESTA fecha de fin (si se renovó, la fecha cambió y vuelve a avisar)
      and not exists (select 1 from public.boost_expiry_reminders r where r.purchase_id = bp.id and r.ends_at = bp.ends_at)
  )
  select count(*)::integer,
         array_agg(due.id order by due.id),
         array_agg(due.ends_at order by due.id),
         coalesce(jsonb_agg(jsonb_build_object('store_name', due.store_name, 'item_name', due.item_name,
                                               'ends_at', due.ends_at) order by due.rn) filter (where due.rn <= 5), '[]'::jsonb)
    into v_count, v_ids, v_ends, v_items
  from due;

  if v_count = 0 then
    return 0;
  end if;

  for v_admin in select u.id from auth.users u where u.raw_app_meta_data ->> 'role' = 'admin' loop
    perform public.create_notification(v_admin.id, 'boost_renewal_reminder',
      jsonb_build_object('count', v_count, 'items', v_items));
    v_notified := v_notified + 1;
  end loop;

  -- Sin admins a quién avisar: no se marcan como avisadas, así se reintenta mañana.
  if v_notified = 0 then
    return 0;
  end if;

  insert into public.boost_expiry_reminders (purchase_id, ends_at)
  select t.id, t.ends_at from unnest(v_ids, v_ends) as t(id, ends_at)
  on conflict (purchase_id) do update set ends_at = excluded.ends_at, sent_at = now();

  return v_count;
end;
$$;
revoke all on function public.remind_expiring_boosts(integer) from public, anon, authenticated;

-- Todos los días 13:37 UTC (10:37 en Argentina). cron.schedule con el mismo nombre reemplaza el trabajo anterior.
select cron.schedule(
  'remind-expiring-boosts',
  '37 13 * * *',
  $cron$select public.remind_expiring_boosts();$cron$
);

-- ------------------------------------------------------------ renovar (admin)
create or replace function public.admin_extend_benefit(p_id uuid, p_days integer default 30)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.boost_purchases%rowtype;
  v_days    integer := coalesce(p_days, 30);
  v_store   uuid;
  v_owner   uuid;
  v_name    text;
  v_expired boolean;
  v_new_end timestamptz;
begin
  if (select public.jwt_role()) is distinct from 'admin' then
    raise exception 'Solo el admin puede hacer esto.' using errcode = '42501';
  end if;
  if v_days < 1 or v_days > 365 then
    raise exception 'La renovación tiene que ser de 1 a 365 días.' using errcode = '22023';
  end if;

  -- Mismo orden de locks que el resto: primero el candado del comercio, después la fila.
  select bp.store_id into v_store from public.boost_purchases bp where bp.id = p_id;
  if not found then
    raise exception 'Esa compra no existe.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext(coalesce(v_store::text, '')));

  select * into v_row from public.boost_purchases bp where bp.id = p_id for update;
  if not found then
    raise exception 'Esa compra no existe.' using errcode = 'P0002';
  end if;
  if v_row.status <> 'active' then
    raise exception 'Solo se puede renovar un combo o servicio vigente o vencido (no uno quitado, en revisión o esperando pago).'
      using errcode = '22023';
  end if;

  v_expired := v_row.ends_at <= now();

  if v_expired then
    -- Ya no ocupaba su lugar: hay que revisar que todavía entre.
    if (v_row.plan_id is not null and public.plan_blocked_service(v_row.store_id, v_row.plan_id) is not null)
       or (v_row.service_id is not null and not public.benefit_has_room(v_row.store_id, v_row.service_id, v_row.quantity)) then
      raise exception 'No se puede reactivar: el comercio ya tiene el máximo de ese combo o servicio.'
        using errcode = '23514';
    end if;
    update public.boost_purchases
       set starts_at = now(), ends_at = now() + make_interval(days => v_days), updated_at = now()
     where id = p_id
    returning ends_at into v_new_end;
  else
    update public.boost_purchases
       set ends_at = ends_at + make_interval(days => v_days), updated_at = now()
     where id = p_id
    returning ends_at into v_new_end;
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'update', 'boost_purchases', p_id,
          jsonb_build_object('extended_days', v_days, 'new_ends_at', v_new_end, 'was_expired', v_expired));

  select s.owner_id into v_owner from public.stores s where s.id = v_row.store_id;
  if v_row.plan_id is not null then
    select pl.name into v_name from public.boost_plans pl where pl.id = v_row.plan_id;
  else
    select sv.name || case when v_row.quantity > 1 then ' x' || v_row.quantity else '' end
      into v_name from public.boost_services sv where sv.id = v_row.service_id;
  end if;
  perform public.create_notification(v_owner, 'boost_activated', jsonb_build_object(
    'purchase_id', p_id, 'plan_id', v_row.plan_id, 'plan_name', v_name, 'ends_at', v_new_end));

  return v_new_end;
end;
$$;
revoke execute on function public.admin_extend_benefit(uuid, integer) from public, anon;
grant execute on function public.admin_extend_benefit(uuid, integer) to authenticated;

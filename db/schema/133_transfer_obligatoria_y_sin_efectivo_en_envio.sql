-- Dos reglas de pago, pedido del usuario el 2026-10-19:
--
--   1. Si el pedido es con ENVÍO a domicilio, no se acepta pago en efectivo
--      (antes "Efectivo al recibir"). El efectivo queda solo para retiro en el
--      local. Se corta en la base y no solo en el carrito: create_order es el
--      único camino para crear un pedido (migración 96), pero se puede llamar
--      directo por la API.
--   2. Todo comercio tiene que tener cargado AL MENOS UN medio de transferencia
--      (alias o CBU/CVU). La migración 107 ya pedía el alias para publicar;
--      ahora basta cualquiera de los dos. Y mientras un comercio no tenga
--      ninguno, su dueño recibe un aviso cada 6 horas (cron) hasta que lo cargue.
--
-- Pedidos viejos con efectivo + envío no se tocan: solo se rechaza el alta de
-- los nuevos.

-- ---------------------------------------------------------------------------
-- 1. create_order: efectivo solo con retiro.
--    Se parchea la función que está en la base (pg_get_functiondef) en vez de
--    copiarla entera: el cuerpo de producción no es el del archivo 115, y
--    copiar uno viejo pisaría cambios. Si el punto de anclaje no aparece
--    exactamente una vez, no hace nada y avisa (no deja la función a medias).
-- ---------------------------------------------------------------------------
do $patch$
declare
  v_def text;
  v_anchor constant text := $a$if p_delivery_method = 'delivery' and coalesce(trim(p_shipping_address), '') = '' then raise exception 'Ingresá una dirección de envío.'; end if;$a$;
  v_check constant text := $c$
  if p_delivery_method = 'delivery' and p_payment_method = 'efectivo' then raise exception 'El pago en efectivo es solo para retiro en el local. Con envío a domicilio elegí Mercado Pago o transferencia.'; end if;$c$;
begin
  v_def := pg_get_functiondef('public.create_order(jsonb,text,text,text,text)'::regprocedure);

  if position('El pago en efectivo es solo para retiro en el local' in v_def) > 0 then
    raise notice 'create_order ya tiene la regla de efectivo + envío.';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'No se encontró (una sola vez) el chequeo de dirección en create_order: revisar a mano.';
  end if;

  execute replace(v_def, v_anchor, v_anchor || v_check);
end
$patch$;

-- ---------------------------------------------------------------------------
-- 2. Publicar productos: alias O CBU/CVU (antes solo alias). El nombre del
--    hint se mantiene ('missing_transfer_alias'): el panel lo busca por ahí.
-- ---------------------------------------------------------------------------
create or replace function public.require_store_transfer_alias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alias text;
  v_cbu text;
begin
  if (select auth.jwt()) -> 'app_metadata' ->> 'role' = 'admin' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.store_id is not distinct from old.store_id then
    return new;
  end if;

  select transfer_alias, transfer_cbu into v_alias, v_cbu from public.stores where id = new.store_id;

  if coalesce(btrim(v_alias), '') = '' and coalesce(btrim(v_cbu), '') = '' then
    raise exception 'Para publicar productos, el comercio tiene que cargar un medio de transferencia: alias o CBU/CVU (Perfil de mi comercio → Transferencia bancaria).'
      using errcode = 'P0001', hint = 'missing_transfer_alias';
  end if;

  return new;
end;
$$;

revoke all on function public.require_store_transfer_alias() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Recordatorio para los comercios sin medio de transferencia.
--    Un solo aviso por DUEÑO (aunque tenga varios comercios sin cargar), y
--    siempre queda uno solo sin leer: el anterior se marca leído y entra el
--    nuevo, así la campanita no se llena y el aviso emergente vuelve a saltar.
-- ---------------------------------------------------------------------------
create or replace function public.remind_stores_missing_transfer()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner record;
  v_sent integer := 0;
begin
  for v_owner in
    select s.owner_id,
           count(*) as store_count,
           (array_agg(s.id order by s.created_at))[1] as first_store_id,
           (array_agg(s.name order by s.created_at))[1] as first_store_name
    from public.stores s
    where s.status = 'approved'
      and s.owner_id is not null
      and coalesce(btrim(s.transfer_alias), '') = ''
      and coalesce(btrim(s.transfer_cbu), '') = ''
    group by s.owner_id
  loop
    update public.notifications
       set read_at = now()
     where user_id = v_owner.owner_id
       and type = 'transfer_method_missing'
       and read_at is null;

    perform public.create_notification(
      v_owner.owner_id,
      'transfer_method_missing',
      jsonb_build_object(
        'store_id', v_owner.first_store_id,
        'store_name', v_owner.first_store_name,
        'store_count', v_owner.store_count
      )
    );
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.remind_stores_missing_transfer() from public, anon, authenticated;

-- Cada 6 horas. cron.schedule con el mismo nombre reemplaza el trabajo anterior.
select cron.schedule(
  'remind-stores-missing-transfer',
  '0 */6 * * *',
  $cron$select public.remind_stores_missing_transfer();$cron$
);

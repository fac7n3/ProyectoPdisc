-- Tests del flujo del pedido (migraciones 115 y 116): un bloque por cada
-- mejora de la lista del 2026-09-30, numerado igual que la lista. La parte de
-- pantalla se prueba en js/order-utils.test.mjs y js/notifications-utils.test.mjs.
--
-- Se corre entero contra la base (SQL Editor de Supabase o el MCP) y NO deja
-- nada: todo va en una transacción que termina en ROLLBACK. Devuelve una fila
-- por test (✅/❌ y el motivo si falla).
--
-- Cuidados para poder correrlo contra producción:
--  * Los pedidos de prueba toman el número de una secuencia temporal (9000001
--    en adelante). La secuencia real no vuelve atrás con un ROLLBACK: así se
--    "gastó" el #BL-1066 en la prueba de la migración.
--  * create_order no deja elegir el número, así que para sus tests (al final)
--    el default de orders.order_number apunta a una secuencia de prueba. Ese
--    ALTER bloquea la tabla orders hasta el ROLLBACK: por eso va último y
--    dura milisegundos.
--  * Cada test termina con raise 'OK' para que su subtransacción se deshaga
--    también: los tests no se pisan entre sí (el stock siempre arranca en 10).
--  * expire_pending_orders recorre todos los pedidos, también los reales;
--    lo que les haga se deshace con su test.

begin;

create temp table _t (n serial, test text, ok boolean, detail text) on commit drop;
create temp sequence _tseq start 9000001;

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------

create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-00000000b00' || case p
    when 'comprador' then '1' when 'vendedor' then '2' when 'otro' then '3'
    when 'repartidor' then '4' when 'comercio' then '5' when 'producto' then '6' end)::uuid
$$;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  (pg_temp.id('comprador'), 'comprador@test.baraderolocal', '{"role":"cliente"}', '{"full_name":"Comprador Test"}'),
  (pg_temp.id('vendedor'), 'vendedor@test.baraderolocal', '{"role":"vendedor"}', '{"full_name":"Vendedor Test"}'),
  (pg_temp.id('otro'), 'otro@test.baraderolocal', '{"role":"cliente"}', '{"full_name":"Otro Test"}'),
  (pg_temp.id('repartidor'), 'repartidor@test.baraderolocal', '{"role":"repartidor"}', '{"full_name":"Repartidor Test"}');

insert into public.stores (id, owner_id, name, transfer_alias, status)
values (pg_temp.id('comercio'), pg_temp.id('vendedor'), 'Comercio de prueba', 'comercio.prueba', 'approved');

insert into public.products (id, seller_id, store_id, title, price, stock)
values (pg_temp.id('producto'), pg_temp.id('vendedor'), pg_temp.id('comercio'), 'Producto de prueba', 1000, 10);

-- ---------------------------------------------------------------------------
-- Ayudas
-- ---------------------------------------------------------------------------

-- Entra como un usuario: es lo que leen auth.uid() y auth.jwt() en los RPC.
-- Sin usuario (null) es "el sistema": el cron o el webhook de Mercado Pago.
create function pg_temp.login(p_uid uuid, p_role text default 'cliente') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else
    json_build_object('sub', p_uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', p_role))::text end, true);
end $$;

-- Un pedido del comprador al comercio de prueba, como lo deja create_order
-- (con su ítem y el stock descontado), pero con un número de prueba.
create function pg_temp.new_order(p_method text, p_delivery text default 'pickup', p_status text default 'pending',
                                  p_payment text default 'pending', p_qty int default 2) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.orders (client_id, store_id, status, payment_status, payment_method, delivery_method,
                             total_price, shipping_address, order_number, payment_due_at)
  values (pg_temp.id('comprador'), pg_temp.id('comercio'), p_status, p_payment, p_method, p_delivery,
          1000 * p_qty, case when p_delivery = 'delivery' then 'Calle de prueba 123' end, nextval('_tseq'),
          case p_method when 'transferencia' then now() + interval '72 hours' when 'mercadopago' then now() + interval '24 hours' end)
  returning id into v_id;
  insert into public.order_items (order_id, product_id, quantity, price, title)
  values (v_id, pg_temp.id('producto'), p_qty, 1000, 'Producto de prueba');
  update public.products set stock = stock - p_qty where id = pg_temp.id('producto');
  return v_id;
end $$;

create function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FALLA: %', p_msg; end if;
end $$;

-- Corre p_sql y exige que falle con un mensaje que contenga p_expected.
create function pg_temp.throws(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_expected) in lower(sqlerrm)) = 0 then
      raise exception 'FALLA: esperaba "%" y dio "%" (%)', p_expected, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'FALLA: esperaba el error "%" y no falló (%)', p_expected, p_sql;
end $$;

create function pg_temp.notifs(p_user text, p_type text, p_order uuid) returns int language sql as $$
  select count(*)::int from public.notifications
  where user_id = pg_temp.id(p_user) and type = p_type and payload ->> 'order_id' = p_order::text
$$;

create function pg_temp.events(p_order uuid) returns text language sql as $$
  select string_agg(kind, ',' order by id) from public.order_events where order_id = p_order
$$;

create function pg_temp.order_state(p_order uuid) returns text language sql as $$
  select status || '/' || payment_status from public.orders where id = p_order
$$;

create function pg_temp.stock() returns int language sql as $$
  select stock from public.products where id = pg_temp.id('producto')
$$;

create function pg_temp.code(p_order uuid) returns text language sql as $$
  select code from public.order_pickup_codes where order_id = p_order
$$;

-- ---------------------------------------------------------------------------
-- Tests
-- ---------------------------------------------------------------------------

do $$ declare o uuid; begin
  o := pg_temp.new_order('efectivo');
  perform pg_temp.ok(pg_temp.events(o) = 'created', 'el alta queda en el historial');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_created', o) = 1, 'al vendedor le llega el pedido en efectivo');
  perform pg_temp.login(pg_temp.id('vendedor'));
  perform public.advance_order_status(o, 'ready_for_pickup');
  perform public.advance_order_status(o, 'completed', pg_temp.code(o));
  perform pg_temp.ok(pg_temp.order_state(o) = 'completed/paid', 'entregar un pedido en efectivo lo marca cobrado: ' || pg_temp.order_state(o));
  perform pg_temp.ok(pg_temp.events(o) = 'created,ready_for_pickup,paid,completed', 'historial: ' || pg_temp.events(o));
  perform pg_temp.ok(pg_temp.notifs('comprador', 'order_paid', o) = 0, 'en efectivo no hay un aviso de pago aparte');
  perform pg_temp.ok(pg_temp.notifs('comprador', 'order_delivered', o) = 1, 'aviso de entregado');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('3 · Efectivo: se prepara sin pagar y al entregar queda cobrado', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; o_paid uuid; o_mp uuid; r jsonb; begin
  o := pg_temp.new_order('transferencia');
  o_paid := pg_temp.new_order('transferencia', 'pickup', 'paid', 'paid');
  o_mp := pg_temp.new_order('mercadopago');
  perform pg_temp.ok(pg_temp.stock() = 4, 'stock antes de cancelar: ' || pg_temp.stock());
  perform pg_temp.login(pg_temp.id('comprador'));
  r := public.cancel_order(o, null);
  perform pg_temp.ok(r ->> 'cancelled_by' = 'buyer', 'cancelled_by = buyer');
  perform pg_temp.ok(pg_temp.order_state(o) = 'cancelled/rejected', 'queda cancelado: ' || pg_temp.order_state(o));
  perform pg_temp.ok(pg_temp.stock() = 6, 'el stock vuelve en el momento: ' || pg_temp.stock());
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_cancelled_by_buyer', o) = 1, 'aviso al vendedor');
  perform pg_temp.ok(pg_temp.notifs('comprador', 'order_cancelled', o) = 0, 'al comprador no se le avisa lo que hizo él');
  perform pg_temp.ok((select actor from public.order_events where order_id = o and kind = 'cancelled') = 'buyer', 'el historial dice que fue el comprador');
  -- Mercado Pago a medias: rejected, así el webhook no puede pagar después un pedido que ya devolvió su stock.
  perform public.cancel_order(o_mp, null);
  perform pg_temp.ok(pg_temp.order_state(o_mp) = 'cancelled/rejected', 'MP cancelado: ' || pg_temp.order_state(o_mp));
  perform pg_temp.throws(format('select public.cancel_order(%L, null)', o_paid), 'ya no se puede cancelar');
  perform pg_temp.throws(format('select public.cancel_order(%L, null)', o), 'ya está cerrado');
  perform pg_temp.login(pg_temp.id('otro'));
  perform pg_temp.throws(format('select public.cancel_order(%L, null)', o_paid), 'No podés cancelar');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('7 · El comprador cancela lo que no pagó y el stock vuelve', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; begin
  o := pg_temp.new_order('transferencia');
  update public.orders set transfer_notified_at = now(), payment_due_at = now() + interval '1 hour' where id = o;
  insert into public.payment_proofs (order_id, receipt_url, status) values (o, 'test/comprobante.jpg', 'pending');
  perform pg_temp.login(pg_temp.id('otro'));
  perform pg_temp.throws(format('select public.reject_transfer_payment(%L, %L)', o, 'x'), 'Solo el dueño');
  perform pg_temp.login(pg_temp.id('vendedor'));
  perform pg_temp.throws(format('select public.reject_transfer_payment(%L, %L)', o, '  '), 'Indicá el motivo');
  perform pg_temp.throws(format('select public.reject_transfer_payment(%L, %L)', o, repeat('x', 301)), 'demasiado largo');
  perform public.reject_transfer_payment(o, 'El monto no coincide');
  perform pg_temp.ok(pg_temp.order_state(o) = 'pending/pending', 'el pedido sigue abierto: ' || pg_temp.order_state(o));
  perform pg_temp.ok((select transfer_notified_at is null from public.orders where id = o), 'se borra el "ya transferí"');
  perform pg_temp.ok((select payment_due_at = now() + interval '24 hours' from public.orders where id = o), 'le da un día más para volver a transferir');
  perform pg_temp.ok((select status from public.payment_proofs where order_id = o) = 'rejected', 'el comprobante queda rechazado');
  perform pg_temp.ok((select payload ->> 'reason' from public.notifications where user_id = pg_temp.id('comprador') and type = 'payment_rejected' and payload ->> 'order_id' = o::text) = 'El monto no coincide', 'al comprador le llega el motivo');
  perform pg_temp.ok((select note from public.order_events where order_id = o and kind = 'payment_rejected') = 'El monto no coincide', 'el motivo queda en el historial');
  perform pg_temp.ok(pg_temp.stock() = 8, 'rechazar el pago no devuelve el stock');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('8a · Rechazar el pago con motivo: el pedido sigue abierto', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; p uuid; begin
  o := pg_temp.new_order('transferencia');
  insert into public.payment_proofs (order_id, receipt_url, status) values (o, 'test/comprobante.jpg', 'pending') returning id into p;
  perform pg_temp.login(pg_temp.id('vendedor'));
  perform public.confirm_transfer_payment(p, false);
  perform pg_temp.ok(pg_temp.order_state(o) = 'pending/pending', 'sigue abierto: ' || pg_temp.order_state(o));
  perform pg_temp.ok(pg_temp.notifs('comprador', 'payment_rejected', o) = 1, 'aviso al comprador');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('8a · Rechazar desde el comprobante tampoco cancela', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; o_mp uuid; r jsonb; begin
  o := pg_temp.new_order('transferencia');
  o_mp := pg_temp.new_order('mercadopago');
  perform pg_temp.login(pg_temp.id('comprador'));
  r := public.notify_transfer_sent(o);
  perform pg_temp.ok((r ->> 'already_notified')::boolean = false, 'primer aviso');
  perform pg_temp.ok((select transfer_notified_at is not null from public.orders where id = o), 'queda marcado');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'transfer_notified', o) = 1, 'al vendedor le llega "avisó que transfirió"');
  perform pg_temp.ok((select actor from public.order_events where order_id = o and kind = 'transfer_notified') = 'buyer', 'historial');
  r := public.notify_transfer_sent(o);
  perform pg_temp.ok((r ->> 'already_notified')::boolean, 'el segundo click no vuelve a avisar');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'transfer_notified', o) = 1, 'un solo aviso');
  perform pg_temp.throws(format('select public.notify_transfer_sent(%L)', o_mp), 'no está esperando una transferencia');
  perform pg_temp.login(pg_temp.id('otro'));
  perform pg_temp.throws(format('select public.notify_transfer_sent(%L)', o), 'no es tuyo');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('9 · "Ya transferí" le avisa al vendedor una sola vez', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; o_cash uuid; begin
  o := pg_temp.new_order('transferencia');
  o_cash := pg_temp.new_order('efectivo');
  insert into public.payment_proofs (order_id, receipt_url, status) values (o, 'test/comprobante.jpg', 'pending');
  perform pg_temp.login(pg_temp.id('otro'));
  perform pg_temp.throws(format('select public.seller_confirm_transfer_payment(%L)', o), 'Solo el dueño');
  perform pg_temp.login(pg_temp.id('vendedor'));
  perform public.seller_confirm_transfer_payment(o);
  perform pg_temp.ok(pg_temp.order_state(o) = 'paid/paid', 'queda pagado: ' || pg_temp.order_state(o));
  perform pg_temp.ok((select status from public.payment_proofs where order_id = o) = 'confirmed', 'el comprobante queda confirmado');
  perform pg_temp.ok(pg_temp.notifs('comprador', 'order_paid', o) = 1, 'aviso al comprador');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_paid_seller', o) = 0, 'al vendedor no se le avisa lo que hizo él');
  perform pg_temp.throws(format('select public.seller_confirm_transfer_payment(%L)', o), 'ya no está pendiente');
  perform pg_temp.throws(format('select public.seller_confirm_transfer_payment(%L)', o_cash), 'no se paga por transferencia');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('10 · Confirmar el pago desde la tarjeta del pedido', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o_plain uuid; o_notified uuid; o_proof uuid; o_mp uuid; o_soon uuid; begin
  o_plain := pg_temp.new_order('transferencia');
  o_notified := pg_temp.new_order('transferencia');
  o_proof := pg_temp.new_order('transferencia');
  o_mp := pg_temp.new_order('mercadopago');
  o_soon := pg_temp.new_order('transferencia');
  update public.orders set payment_due_at = now() - interval '1 hour' where id in (o_plain, o_notified, o_proof, o_mp);
  update public.orders set transfer_notified_at = now() where id = o_notified;
  insert into public.payment_proofs (order_id, receipt_url, status) values (o_proof, 'test/comprobante.jpg', 'pending');
  update public.orders set payment_due_at = now() + interval '12 hours' where id = o_soon;

  perform pg_temp.login(null);
  perform public.expire_pending_orders();

  perform pg_temp.ok(pg_temp.order_state(o_plain) = 'cancelled/rejected', 'vencido: ' || pg_temp.order_state(o_plain));
  perform pg_temp.ok((select cancelled_by = 'system' and cancel_reason = 'Venció el plazo para pagar' from public.orders where id = o_plain), 'cancelado por el sistema, con motivo');
  perform pg_temp.ok(pg_temp.events(o_plain) like '%,expired', 'historial: ' || pg_temp.events(o_plain));
  perform pg_temp.ok(pg_temp.notifs('comprador', 'order_expired', o_plain) = 1, 'aviso al comprador');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_expired_seller', o_plain) = 1, 'aviso al vendedor');
  perform pg_temp.ok(pg_temp.order_state(o_mp) = 'cancelled/rejected', 'MP vencido');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_expired_seller', o_mp) = 0, 'MP abandonado: el vendedor nunca se enteró del pedido, no se le avisa');
  perform pg_temp.ok(pg_temp.stock() = 4, 'vuelve el stock de los dos vencidos: ' || pg_temp.stock());
  -- 11 / arreglo D: lo que el comprador dice que pagó no se vence solo.
  perform pg_temp.ok(pg_temp.order_state(o_notified) = 'pending/pending', 'con "ya transferí" no vence');
  perform pg_temp.ok(pg_temp.order_state(o_proof) = 'pending/pending', 'con comprobante sin revisar no vence');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('11/D · El vencimiento se frena si el comprador avisó que pagó', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; begin
  o := pg_temp.new_order('transferencia');
  update public.orders set payment_due_at = now() + interval '12 hours' where id = o;
  perform pg_temp.login(null);
  perform public.expire_pending_orders();
  perform pg_temp.ok(pg_temp.order_state(o) = 'pending/pending', 'todavía no vence');
  perform pg_temp.ok(pg_temp.notifs('comprador', 'payment_due_soon', o) = 1, 'recordatorio un día antes');
  perform pg_temp.ok((select (payload ->> 'payment_due_at')::timestamptz = now() + interval '12 hours' from public.notifications
                      where user_id = pg_temp.id('comprador') and type = 'payment_due_soon' and payload ->> 'order_id' = o::text), 'el aviso dice hasta cuándo');
  perform public.expire_pending_orders();
  perform pg_temp.ok(pg_temp.notifs('comprador', 'payment_due_soon', o) = 1, 'el cron de la hora siguiente no lo repite');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('2 · Recordatorio antes de que venza la transferencia', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; o_unpaid uuid; v_code text; begin
  o := pg_temp.new_order('transferencia', 'pickup', 'paid', 'paid');
  o_unpaid := pg_temp.new_order('transferencia');
  v_code := pg_temp.code(o);
  perform pg_temp.login(pg_temp.id('vendedor'));
  perform pg_temp.throws(format('select public.advance_order_status(%L, %L)', o, 'shipped'), 'para retirar en el local');
  perform pg_temp.throws(format('select public.advance_order_status(%L, %L)', o_unpaid, 'ready_for_pickup'), 'todavía no se puede preparar');
  perform pg_temp.throws(format('select public.advance_order_status(%L, %L)', o, 'paid'), 'Estado inválido');
  perform public.advance_order_status(o, 'ready_for_pickup');
  perform pg_temp.ok(pg_temp.notifs('comprador', 'order_ready_for_pickup', o) = 1, 'aviso de listo para retirar');
  perform pg_temp.throws(format('select public.advance_order_status(%L, %L, %L)', o, 'completed', lpad(((v_code::int + 1) % 10000)::text, 4, '0')), 'El código no coincide');
  perform pg_temp.throws(format('select public.advance_order_status(%L, %L)', o, 'completed'), 'El código no coincide');
  perform public.advance_order_status(o, 'completed', ' ' || v_code || ' ');
  perform pg_temp.ok(pg_temp.order_state(o) = 'completed/paid', 'entregado: ' || pg_temp.order_state(o));
  perform pg_temp.login(pg_temp.id('otro'));
  perform pg_temp.throws(format('select public.advance_order_status(%L, %L)', o_unpaid, 'completed'), 'No podés modificar');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('13/22 · Retiro: listo para retirar y entregado con el código', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; begin
  o := pg_temp.new_order('transferencia', 'delivery', 'paid', 'paid');
  perform pg_temp.login(pg_temp.id('vendedor'));
  perform pg_temp.throws(format('select public.advance_order_status(%L, %L)', o, 'ready_for_pickup'), 'es con envío');
  perform public.advance_order_status(o, 'shipped');
  perform pg_temp.ok(pg_temp.notifs('comprador', 'order_shipped', o) = 1, 'aviso de en camino');
  perform public.advance_order_status(o, 'completed', null, true); -- "entregar sin código"
  perform pg_temp.ok(pg_temp.order_state(o) = 'completed/paid', 'entregado: ' || pg_temp.order_state(o));
  perform pg_temp.ok(pg_temp.events(o) = 'created,shipped,completed', 'historial: ' || pg_temp.events(o));
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('13/B · Envío: el vendedor despacha y entrega (antes solo podía el repartidor)', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; o2 uuid; d uuid; begin
  o := pg_temp.new_order('transferencia', 'delivery', 'shipped', 'paid');
  o2 := pg_temp.new_order('transferencia', 'delivery', 'paid', 'paid');
  insert into public.deliveries (order_id, repartidor_id, status, assigned_at) values (o, pg_temp.id('repartidor'), 'picked_up', now()) returning id into d;
  insert into public.deliveries (order_id, repartidor_id, status, assigned_at) values (o2, pg_temp.id('repartidor'), 'assigned', now());
  perform pg_temp.login(pg_temp.id('vendedor'));
  perform pg_temp.throws(format('select public.advance_order_status(%L, %L)', o2, 'shipped'), 'lo está llevando un repartidor');
  perform pg_temp.login(pg_temp.id('repartidor'), 'repartidor');
  perform pg_temp.throws(format('select public.update_delivery_status(%L, %L)', d, 'delivered'), 'El código no coincide');
  perform public.update_delivery_status(d, 'delivered', pg_temp.code(o));
  perform pg_temp.ok(pg_temp.order_state(o) = 'completed/paid', 'entregado: ' || pg_temp.order_state(o));
  perform pg_temp.ok((select actor from public.order_events where order_id = o and kind = 'completed') = 'courier', 'el historial dice que fue el repartidor');
  perform pg_temp.ok(pg_temp.notifs('comprador', 'order_delivered', o) = 1, 'aviso de entregado');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('22 · El repartidor entrega solo con el código', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; v_addr text; v_methods text; begin
  o := pg_temp.new_order('efectivo', 'delivery');
  perform pg_temp.login(pg_temp.id('vendedor'));
  set local role authenticated;
  select shipping_address, delivery_method || '/' || payment_method into v_addr, v_methods from public.orders where id = o;
  reset role;
  perform pg_temp.ok(v_addr = 'Calle de prueba 123', 'el vendedor ve la dirección: ' || coalesce(v_addr, 'null'));
  perform pg_temp.ok(v_methods = 'delivery/efectivo', 'y cómo se entrega y cómo se paga: ' || coalesce(v_methods, 'null'));
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('14/C · El vendedor ve la dirección, la entrega y el pago', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; r jsonb; begin
  o := pg_temp.new_order('transferencia', 'pickup', 'paid', 'paid');
  perform pg_temp.login(pg_temp.id('vendedor'));
  perform pg_temp.throws(format('select public.cancel_order(%L, null)', o), 'Indicá el motivo');
  perform pg_temp.throws(format('select public.cancel_order(%L, %L)', o, '   '), 'Indicá el motivo');
  r := public.cancel_order(o, 'No tengo stock');
  perform pg_temp.ok(r ->> 'cancelled_by' = 'seller', 'cancelled_by = seller');
  -- Sigue "paid": es lo que hace que al comprador se le diga que le tienen que devolver la plata.
  perform pg_temp.ok(pg_temp.order_state(o) = 'cancelled/paid', 'cancelado y pagado: ' || pg_temp.order_state(o));
  perform pg_temp.ok((select payload ->> 'reason' from public.notifications where user_id = pg_temp.id('comprador') and type = 'order_cancelled' and payload ->> 'order_id' = o::text) = 'No tengo stock', 'aviso al comprador con el motivo');
  perform pg_temp.ok((select note from public.order_events where order_id = o and kind = 'cancelled') = 'No tengo stock', 'el motivo queda en el historial');
  perform pg_temp.ok(pg_temp.stock() = 10, 'vuelve el stock: ' || pg_temp.stock());
  perform pg_temp.throws(format('select public.cancel_order(%L, %L)', o, 'otra vez'), 'ya está cerrado');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('16 · El vendedor cancela con motivo y se avisa al comprador', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; v_number bigint; begin
  o := pg_temp.new_order('transferencia');
  select order_number into v_number from public.orders where id = o;
  perform pg_temp.ok((select is_nullable = 'NO' and column_default like 'nextval(%orders_order_number_seq%'
                      from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'order_number'),
                     'order_number obligatorio y correlativo');
  perform pg_temp.throws(format('insert into public.orders (total_price, order_number) values (1, %s)', v_number), 'orders_order_number_key');
  perform pg_temp.ok((select payload ->> 'order_number' from public.notifications where user_id = pg_temp.id('vendedor') and type = 'order_created' and payload ->> 'order_id' = o::text) = v_number::text,
                     'el aviso lleva el número de pedido');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('20/F · Número de pedido único, el mismo en los avisos', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; n_buyer int; n_seller int; n_other int; begin
  o := pg_temp.new_order('transferencia', 'pickup', 'paid', 'paid');
  perform pg_temp.ok(pg_temp.code(o) ~ '^[0-9]{4}$', 'código de 4 dígitos al crear el pedido');
  perform pg_temp.login(pg_temp.id('comprador'));
  set local role authenticated;
  select count(*) into n_buyer from public.order_pickup_codes where order_id = o;
  reset role;
  perform pg_temp.login(pg_temp.id('vendedor'));
  set local role authenticated;
  select count(*) into n_seller from public.order_pickup_codes where order_id = o;
  reset role;
  perform pg_temp.login(pg_temp.id('otro'));
  set local role authenticated;
  select count(*) into n_other from public.order_pickup_codes where order_id = o;
  reset role;
  perform pg_temp.ok(n_buyer = 1, 'el comprador ve su código');
  perform pg_temp.ok(n_seller = 0, 'el vendedor NO lo ve: se lo tiene que pedir al comprador');
  perform pg_temp.ok(n_other = 0, 'nadie más lo ve');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('21/22 · El código del QR lo ve solo el comprador', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; begin
  o := pg_temp.new_order('transferencia');
  perform pg_temp.login(pg_temp.id('vendedor'));
  perform public.seller_confirm_transfer_payment(o);
  perform public.advance_order_status(o, 'ready_for_pickup');
  perform public.advance_order_status(o, 'completed', pg_temp.code(o));
  perform pg_temp.ok((select string_agg(type, ',' order by type) from public.notifications
                      where user_id = pg_temp.id('comprador') and payload ->> 'order_id' = o::text) = 'order_delivered,order_paid,order_ready_for_pickup',
                     'un aviso por paso al comprador');
  perform pg_temp.ok(not exists (select 1 from public.notifications where user_id = pg_temp.id('comprador') and payload ->> 'order_id' = o::text
                                 and payload ->> 'order_number' is null), 'todos llevan el número de pedido');
  perform pg_temp.ok(pg_temp.events(o) = 'created,paid,ready_for_pickup,completed', 'línea de tiempo: ' || pg_temp.events(o));
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('26/34/36/A · Un aviso al comprador en cada paso y la línea de tiempo completa', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o_transfer uuid; o_cash uuid; o_mp uuid; begin
  o_transfer := pg_temp.new_order('transferencia');
  o_cash := pg_temp.new_order('efectivo');
  o_mp := pg_temp.new_order('mercadopago');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_created', o_transfer) = 1, 'transferencia: "nuevo pedido, esperando pago"');
  perform pg_temp.ok((select payload ->> 'payment_method' from public.notifications where user_id = pg_temp.id('vendedor') and type = 'order_created' and payload ->> 'order_id' = o_cash::text) = 'efectivo',
                     'efectivo: el aviso dice cómo se paga');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_created', o_mp) = 0, 'Mercado Pago sin pagar: todavía no se le avisa');
  -- El webhook de Mercado Pago acredita el pago (sin usuario: el sistema).
  perform pg_temp.login(null);
  update public.orders set payment_status = 'paid', status = 'paid' where id = o_mp;
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_paid_seller', o_mp) = 1, '"¡Pagado! Prepará el pedido" al vendedor');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_paid', o_mp) = 0, 'el vendedor no recibe el aviso del comprador (arreglo E)');
  perform pg_temp.ok(pg_temp.notifs('comprador', 'order_paid', o_mp) = 1, 'el comprador recibe el suyo');
  perform pg_temp.ok((select actor from public.order_events where order_id = o_mp and kind = 'paid') = 'system', 'el historial dice que fue el sistema');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('27/28/E · Avisos distintos para comprador y vendedor; "nuevo" no es "pagado"', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; begin
  o := pg_temp.new_order('transferencia');
  insert into public.payment_proofs (order_id, receipt_url, status) values (o, 'test/comprobante.jpg', 'pending');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'payment_proof_uploaded', o) = 1, 'aviso al vendedor');
  perform pg_temp.ok(pg_temp.events(o) = 'created,proof_uploaded', 'historial: ' || pg_temp.events(o));
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('G · Subir el comprobante le avisa al vendedor', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; n_buyer int; n_seller int; n_other int; begin
  o := pg_temp.new_order('transferencia', 'pickup', 'paid', 'paid');
  perform pg_temp.login(pg_temp.id('comprador'));
  set local role authenticated;
  select count(*) into n_buyer from public.order_events where order_id = o;
  reset role;
  perform pg_temp.login(pg_temp.id('vendedor'));
  set local role authenticated;
  select count(*) into n_seller from public.order_events where order_id = o;
  reset role;
  perform pg_temp.login(pg_temp.id('otro'));
  set local role authenticated;
  select count(*) into n_other from public.order_events where order_id = o;
  reset role;
  perform pg_temp.ok(n_buyer > 0, 'el comprador ve el historial');
  perform pg_temp.ok(n_seller > 0, 'el vendedor ve el historial (detalle del pedido)');
  perform pg_temp.ok(n_other = 0, 'nadie más');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('34/35 · El historial lo ven comprador y vendedor, nadie más', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; begin
  o := pg_temp.new_order('transferencia', 'pickup', 'completed', 'paid');
  perform pg_temp.login(pg_temp.id('comprador'));
  perform public.request_order_revocation(o);
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'revocation_requested', o) = 1, 'un solo aviso al vendedor (el trigger no lo duplica)');
  perform pg_temp.ok(pg_temp.events(o) = 'created,revocation_requested', 'historial: ' || pg_temp.events(o));
  perform pg_temp.login(pg_temp.id('otro'));
  perform pg_temp.throws(format('select public.accept_order_revocation(%L)', o), 'Solo el dueño');
  perform pg_temp.login(pg_temp.id('vendedor'));
  perform public.accept_order_revocation(o);
  perform pg_temp.ok(pg_temp.order_state(o) = 'cancelled/paid', 'cancelado: ' || pg_temp.order_state(o));
  perform pg_temp.ok((select revocation_resolved_at is not null and cancelled_by = 'seller' from public.orders where id = o), 'queda resuelto');
  perform pg_temp.ok(pg_temp.notifs('comprador', 'revocation_accepted', o) = 1, 'aviso al comprador');
  perform pg_temp.ok(pg_temp.notifs('comprador', 'order_cancelled', o) = 0, 'no le llega además un "el comercio canceló"');
  perform pg_temp.ok(pg_temp.events(o) like '%,revocation_accepted', 'historial: ' || pg_temp.events(o));
  perform pg_temp.ok(pg_temp.stock() = 10, 'devuelve el stock: ' || pg_temp.stock());
  perform pg_temp.throws(format('select public.accept_order_revocation(%L)', o), 'ya está resuelto');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('38 · El vendedor acepta el arrepentimiento y vuelve el stock', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare o uuid; denied boolean; begin
  o := pg_temp.new_order('transferencia', 'pickup', 'paid', 'paid');
  perform pg_temp.login(pg_temp.id('vendedor'));
  set local role authenticated;
  begin
    update public.orders set status = 'completed' where id = o;
    denied := false;
  exception when insufficient_privilege then
    denied := true;
  end;
  perform public.advance_order_status(o, 'ready_for_pickup');
  reset role;
  perform pg_temp.ok(denied, 'un UPDATE directo de status por la API tiene que dar "permission denied"');
  perform pg_temp.ok(pg_temp.order_state(o) = 'ready_for_pickup/paid', 'por el RPC sí: ' || pg_temp.order_state(o));
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('116 · El estado solo cambia por los RPC del flujo', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

-- ---------------------------------------------------------------------------
-- create_order (va al final: ver el encabezado)
-- ---------------------------------------------------------------------------

create sequence public._test_order_number_seq start 9100001;
alter table public.orders alter column order_number set default nextval('public._test_order_number_seq');

do $$ declare cart jsonb := jsonb_build_array(jsonb_build_object('id', pg_temp.id('producto'), 'qty', 1)); r jsonb; o uuid; begin
  perform pg_temp.login(pg_temp.id('comprador'));
  r := public.create_order(cart, null, 'pickup', 'efectivo', null) -> 'orders' -> 0;
  o := (r ->> 'order_id')::uuid;
  perform pg_temp.ok((r ->> 'order_number')::bigint >= 9100001, 'devuelve el número para la pantalla "¡Listo! #BL-…": ' || coalesce(r ->> 'order_number', 'null'));
  perform pg_temp.ok(r -> 'payment_due_at' = 'null'::jsonb, 'efectivo no vence');
  perform pg_temp.ok((select status || '/' || payment_status || '/' || payment_method from public.orders where id = o) = 'pending/pending/efectivo', 'pedido en efectivo pendiente');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_created', o) = 1, 'aviso al vendedor');
  perform pg_temp.ok(pg_temp.code(o) ~ '^[0-9]{4}$', 'código de retiro');
  perform pg_temp.ok((select actor from public.order_events where order_id = o and kind = 'created') = 'buyer', 'el alta la hizo el comprador');
  perform pg_temp.ok(pg_temp.stock() = 9, 'descuenta el stock: ' || pg_temp.stock());
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('1/3 · create_order acepta efectivo y devuelve el número de pedido', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

do $$ declare cart jsonb := jsonb_build_array(jsonb_build_object('id', pg_temp.id('producto'), 'qty', 1)); r jsonb; begin
  perform pg_temp.login(pg_temp.id('comprador'));
  r := public.create_order(cart, null, 'pickup', 'transferencia', null) -> 'orders' -> 0;
  perform pg_temp.ok((r ->> 'payment_due_at')::timestamptz = now() + interval '72 hours', 'transferencia: 72 horas para pagar');
  r := public.create_order(cart, null, 'pickup', 'mercadopago', null) -> 'orders' -> 0;
  perform pg_temp.ok((r ->> 'payment_due_at')::timestamptz = now() + interval '24 hours', 'Mercado Pago: 24 horas');
  perform pg_temp.ok(pg_temp.notifs('vendedor', 'order_created', (r ->> 'order_id')::uuid) = 0, 'Mercado Pago: al vendedor se le avisa recién cuando se paga');
  perform pg_temp.throws(format('select public.create_order(%L::jsonb, null, %L, %L, null)', cart, 'delivery', 'efectivo'), 'Ingresá una dirección');
  perform pg_temp.throws(format('select public.create_order(%L::jsonb, null, %L, %L, null)', cart, 'pickup', 'simulado'), 'solo para pruebas');
  perform pg_temp.throws(format('select public.create_order(%L::jsonb, null, %L, %L, null)', cart, 'pickup', 'cheque'), 'Método de pago inválido');
  raise exception 'OK';
exception when others then
  insert into _t (test, ok, detail) values ('2 · create_order fija hasta cuándo pagar', sqlerrm = 'OK', nullif(sqlerrm, 'OK'));
end $$;

select n, case when ok then '✅' else '❌' end as resultado, test, detail from _t order by n;

rollback;

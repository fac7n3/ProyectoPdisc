-- Fase A del plan de pagos (docs/PLAN_PAGOS.md, hallazgos 3.1/3.2/3.4) — cerrar
-- superficie de escritura/lectura sobre plata que no debería estar abierta.
-- Ninguno de los tres está siendo explotado hoy (no hay cuentas `vendedor` ni
-- `repartidor` en producción, y los cupones de seed no tienen evidencia de
-- abuso) -- se cierran antes de que haya vendedores reales o plata circulando.

-- =========================================================
-- 1. (3.1) `authenticated`/`anon` tenían UPDATE sobre TODAS las columnas de
--    `orders` -- incluidas payment_status/total_price/payment_id -- porque
--    las policies de UPDATE (orders_update_store_or_admin, orders_update_staff)
--    nunca tuvieron WITH CHECK. Hoy mismo, el dueño de un comercio (o
--    cualquiera de sus empleados) puede marcarse un pedido propio como
--    pagado con un update directo desde el navegador, salteando
--    confirm_transfer_payment y el webhook por completo:
--
--      supabase.from('orders').update({ payment_status: 'paid' }).eq('id', ...)
--
--    OJO -- primer intento de este fix (revoke update de columnas puntuales)
--    no alcanza: en Postgres, un GRANT UPDATE a nivel de TABLA sigue
--    permitiendo escribir cualquier columna aunque se revoquen columnas
--    puntuales después -- el grant de tabla completa y el de columna son
--    ACLs independientes, y alcanza con uno solo para poder escribir. Acá
--    ya existía `grant update on orders to authenticated, anon` (default de
--    Supabase) cubriendo la tabla entera. Hay que revocar la tabla completa
--    y volver a otorgar solo la columna que el frontend legítimamente
--    necesita tocar directo: `status`, para el avance de pedidos en
--    vender.js (updateOrderStatus, la única `.update()` sobre `orders` en
--    todo el frontend fuera de los RPCs). `anon` no tiene ningún caso de uso
--    legítimo -- ninguna policy de UPDATE lo alcanza igual (dependen de
--    auth.uid()), así que no se le vuelve a dar nada.
--    No afecta a los RPCs (create_order, confirm_simulated_payment,
--    confirm_transfer_payment, admin_release_order_stock) ni a mp-webhook:
--    corren SECURITY DEFINER o con la service role key, ninguno de los dos
--    pasa por los grants de `authenticated`/`anon`. Tampoco afecta los
--    triggers (set_updated_at, orders_release_stock): un trigger BEFORE
--    UPDATE puede modificar cualquier columna de NEW sin que el rol que
--    disparó el UPDATE tenga privilegio sobre esa columna -- Postgres solo
--    chequea el grant contra las columnas que aparecen en el SET del
--    UPDATE original, no contra lo que el trigger toque después.
revoke update on public.orders from authenticated, anon;
grant update (status) on public.orders to authenticated;

-- =========================================================
-- 2. (3.2) BIENVENIDO10/VERANO20 son datos de seed de 08_coupons_schema.sql,
--    activos, globales y sin `expires_at` -- sin max_uses ni límite por
--    cliente, se pueden usar infinitas veces, y el descuento sale del
--    bolsillo del comercio (total_price es lo que el comercio recibe) sin
--    que lo haya autorizado. Límites de uso reales (max_uses, per_user_limit,
--    coupon_redemptions) quedan para la Fase D del plan -- acá solo se apaga
--    el cupón de prueba que no debería seguir vivo en producción.
update public.coupons
set is_active = false
where code in ('BIENVENIDO10', 'VERANO20');

-- =========================================================
-- 3. (3.4) El 2026-09-16 se sacó todo el frontend del rol `repartidor`
--    (ver CLAUDE.md, "Pendientes activos") pero la policy de esa migración
--    (26_deliveries_and_claim.sql) siguió viva: da SELECT sobre TODOS los
--    pedidos pagados con envío de TODOS los comercios (dirección, total,
--    cliente) a cualquier JWT con role='repartidor'. Verificado: no existe
--    ninguna cuenta con ese rol en producción, así que no hay exposición
--    real hoy -- pero es superficie muerta sobre datos financieros y
--    personales que no tiene por qué seguir ahí. Las tablas
--    deliveries/delivery_requests y sus RPCs quedan intactas, por si se
--    retoma la fase de logística más adelante (igual criterio que la
--    limpieza de frontend del mismo día).
drop policy if exists orders_select_repartidor on public.orders;

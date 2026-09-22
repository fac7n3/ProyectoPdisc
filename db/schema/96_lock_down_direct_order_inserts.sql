-- Fix de seguridad: orders_insert_own / order_items_insert_own dejaban que
-- cualquier usuario autenticado insertara un pedido por la API REST
-- salteándose el RPC create_order() -- el único que calcula total_price
-- server-side desde products.price. La policy de insert solo validaba
-- client_id = auth.uid(): total_price, store_id, payment_status y
-- payment_method quedaban en lo que mandara el cliente. Con
-- order_items_insert_own pasaba lo mismo con el precio y el título de cada
-- ítem. Reportado en CLAUDE.md el 2026-09-16 (prioridad ALTA), sin aplicar
-- hasta ahora.
--
-- create_order() es SECURITY DEFINER y su dueño (postgres) es también el
-- dueño de orders/order_items -- por eso bypassea tanto RLS como los GRANT de
-- tabla (relforcerowsecurity=false, sin FORCE ROW LEVEL SECURITY). Revocar el
-- INSERT directo de authenticated/anon no le toca nada al RPC: sigue siendo
-- el único camino para crear un pedido, ahora sin bypass posible desde la
-- API REST.

revoke insert on public.orders from authenticated, anon;
revoke insert on public.order_items from authenticated, anon;

drop policy if exists orders_insert_own on public.orders;
drop policy if exists order_items_insert_own on public.order_items;

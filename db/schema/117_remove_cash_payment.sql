-- 117 -- Se saca el pago en efectivo (al retirar / al recibir).
--
-- A pedido del usuario. El checkout ya no ofrece la opción, pero `create_order`
-- (migración 115) todavía la aceptaba si alguien llamaba al RPC directo, así
-- que se cierra del lado de la base: `orders.payment_method` deja de admitir
-- 'efectivo'. Se verificó antes de aplicar que no hay ningún pedido en efectivo
-- (los 65 existentes son mercadopago / transferencia / simulado), así que el
-- constraint se agrega sin tocar datos. Un intento de crear un pedido en
-- efectivo ahora falla por este check.
--
-- No cambia `create_order` ni `advance_order_status`: las ramas de efectivo que
-- quedan ahí son inalcanzables sin una fila en efectivo.
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method is null or payment_method in ('simulado', 'mercadopago', 'transferencia'));

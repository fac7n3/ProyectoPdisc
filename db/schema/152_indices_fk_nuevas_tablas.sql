-- 152: índices de las 4 claves foráneas nuevas que no tenían uno.
--
-- Mismo criterio que la 103: el advisor de performance de Supabase
-- (`unindexed_foreign_keys`) marcó 4 FK de tablas creadas después de esa
-- migración (flujo del repartidor, 139/140, y OAuth de Mercado Pago, 132).
-- Sin índice, borrar la fila referenciada (un usuario, un comercio) obliga a
-- recorrer la tabla entera para el ON DELETE.
--
-- Puramente aditivo: no cambia el resultado de ninguna consulta ni policy.

create index if not exists idx_deliveries_pickup_confirmed_by on public.deliveries (pickup_confirmed_by);
create index if not exists idx_delivery_feedback_buyer_id on public.delivery_feedback (buyer_id);
create index if not exists idx_mp_oauth_states_store_id on public.mp_oauth_states (store_id);
create index if not exists idx_mp_oauth_states_user_id on public.mp_oauth_states (user_id);

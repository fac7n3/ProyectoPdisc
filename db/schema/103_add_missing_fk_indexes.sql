-- 103: índices faltantes en columnas de foreign key.
--
-- Encontrado con el advisor de performance de Supabase (lint
-- `unindexed_foreign_keys`, 20 hallazgos): Postgres no crea un índice
-- automático para una FK -- sin uno, cada JOIN, cada policy de RLS que
-- filtra por estas columnas (ej. "productos de esta tienda",
-- "pedidos de este cliente") y cada borrado en cascada del lado
-- referenciado hacen un seq scan de la tabla entera. Hoy no se nota (los
-- catálogos son chicos), pero es exactamente la clase de cosa que hay que
-- tener resuelta antes del lanzamiento real, antes de que el volumen de
-- datos lo vuelva visible.
--
-- Puramente aditivo: crear un índice no cambia el resultado de ninguna
-- consulta ni policy existente, solo cómo se resuelve. Sin baja de código.

create index if not exists idx_admin_audit_log_admin_id on public.admin_audit_log (admin_id);
create index if not exists idx_coupons_store_id on public.coupons (store_id);
create index if not exists idx_error_logs_user_id on public.error_logs (user_id);
create index if not exists idx_favorite_stores_store_id on public.favorite_stores (store_id);
create index if not exists idx_order_items_order_id on public.order_items (order_id);
create index if not exists idx_order_items_product_id on public.order_items (product_id);
create index if not exists idx_orders_client_id on public.orders (client_id);
create index if not exists idx_orders_store_id on public.orders (store_id);
create index if not exists idx_payment_proofs_confirmed_by on public.payment_proofs (confirmed_by);
create index if not exists idx_pharmacy_duty_weeks_pharmacy_id on public.pharmacy_duty_weeks (pharmacy_id);
create index if not exists idx_pharmacy_shifts_pharmacy_id on public.pharmacy_shifts (pharmacy_id);
create index if not exists idx_products_category_id on public.products (category_id);
create index if not exists idx_products_store_id on public.products (store_id);
create index if not exists idx_professional_requests_user_id on public.professional_requests (user_id);
create index if not exists idx_professionals_owner_id on public.professionals (owner_id);
create index if not exists idx_reviews_client_id on public.reviews (client_id);
create index if not exists idx_seller_requests_user_id on public.seller_requests (user_id);
create index if not exists idx_stock_alerts_client_id on public.stock_alerts (client_id);
create index if not exists idx_stores_owner_id on public.stores (owner_id);
create index if not exists idx_support_ticket_messages_sender_id on public.support_ticket_messages (sender_id);

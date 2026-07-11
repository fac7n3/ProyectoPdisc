-- F12-08 (A113-248) — Calificar al repartidor. Las reseñas de F7-01 (36_reviews.sql)
-- solo aceptaban target_type in ('product', 'store'); esto agrega 'repartidor' al
-- mismo CHECK. Sin cambios de RLS: reviews_insert_own/select_public/etc ya son
-- genéricas por target_type (solo exigen client_id = auth.uid() para insertar) --
-- ni siquiera product/store validan "compra verificada" a nivel RLS, así que no
-- se agrega esa restricción acá tampoco (consistencia con el patrón existente).

alter table public.reviews drop constraint if exists reviews_target_type_check;
alter table public.reviews add constraint reviews_target_type_check
  check (target_type in ('product', 'store', 'repartidor'));

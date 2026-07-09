-- F5-05 (A113-195) — Ofertas: precio tachado.
-- Extraída de 13_target_data_model.sql (sección 3) al arrancar esta tarea.

alter table public.products
  add column if not exists compare_at_price integer check (compare_at_price is null or compare_at_price > 0);

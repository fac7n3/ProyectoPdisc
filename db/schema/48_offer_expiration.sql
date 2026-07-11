-- F12-14 (A113-254) — Vencimiento de ofertas. `products.compare_at_price`
-- (F5-05, 30_compare_at_price.sql) no tenía fecha límite -- el vendedor tenía
-- que acordarse de sacarlo a mano. `date` (no timestamptz): el vendedor elige
-- un día en un <input type="date">, no una hora exacta -- "vence el 30" debe
-- seguir mostrando la oferta durante todo el 30, no desde la medianoche.

alter table public.products
  add column if not exists offer_expires_at date;

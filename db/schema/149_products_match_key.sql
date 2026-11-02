-- 149 — Clave de "mismo producto" guardada en products (comparador de la búsqueda).
--
-- La 148 calculaba product_match_key() de TODOS los productos activos en cada
-- búsqueda: medido en producción, ~130 ms sin sesión y ~400 ms con sesión.
-- Ahora la clave vive en products.match_key (con índice) y same_product_offers
-- solo busca por igualdad.
--
-- La escribe SIEMPRE el trigger, en cada INSERT y en cada UPDATE (no solo
-- cuando cambia el nombre): si no, un dueño podría escribir una clave a mano
-- y meter su producto en la comparación de otro.
--
-- El relleno de las filas existentes apaga, solo mientras corre, los triggers
-- de products que reaccionan a un UPDATE (updated_at, log de admin y avisos
-- de favoritos/stock): no cambia nada que tengan que ver.

alter table public.products add column if not exists match_key text;

create or replace function public.products_set_match_key()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.match_key := public.product_match_key(new.title);
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'products_set_match_key'
                 and tgrelid = 'public.products'::regclass) then
    create trigger products_set_match_key
      before insert or update on public.products
      for each row execute function public.products_set_match_key();
  end if;
end $$;

alter table public.products disable trigger products_set_updated_at;
alter table public.products disable trigger log_admin_action_products;
alter table public.products disable trigger products_notify_favorite_discount;
alter table public.products disable trigger products_notify_stock_alerts;
update public.products set match_key = public.product_match_key(title);
alter table public.products enable trigger products_set_updated_at;
alter table public.products enable trigger log_admin_action_products;
alter table public.products enable trigger products_notify_favorite_discount;
alter table public.products enable trigger products_notify_stock_alerts;

create index if not exists idx_products_match_key
  on public.products (match_key) where is_active;

create or replace function public.same_product_offers(p_product_ids uuid[])
returns table (
  id uuid, title text, price integer, compare_at_price integer, offer_expires_at date,
  image_url text, stock integer, store_id uuid, store_name text, match_key text
)
language sql
stable
set search_path = public, extensions
as $$
  with keys as (
    select distinct p.match_key as k
    from products p
    where p.id = any(coalesce(p_product_ids, '{}')) and p.match_key is not null
  )
  select p.id, p.title, p.price, p.compare_at_price, p.offer_expires_at, p.image_url,
         p.stock, p.store_id, s.name, p.match_key
  from keys
  join products p on p.match_key = keys.k and p.is_active and p.stock > 0
  join stores s on s.id = p.store_id and s.status = 'approved'
  limit 300;
$$;

-- Campanita de notificaciones en la navbar (2026-07-12, pedido directo del
-- usuario) — nuevo tipo de aviso: "bajó de precio" para productos en favoritos.
--
-- Mismo patrón que notify_stock_alerts (F12-09, 45_stock_alerts.sql): dispara
-- solo en la TRANSICIÓN false->true de "tiene oferta real" (mismo criterio de
-- hasDiscount que buildPriceRow en cart-utils.js: compare_at_price > price,
-- offer_expires_at nulo o no vencido) -- así una oferta que sigue vigente en
-- updates posteriores (ej. el vendedor ajusta el stock) no re-notifica a cada
-- rato, y si se saca y se vuelve a poner la oferta, sí avisa de nuevo.
--
-- A diferencia de stock_alerts (opt-in explícito por producto), acá se
-- reutiliza `favorites` (F4-03) directamente -- ya marcar un producto como
-- favorito es la señal de interés, no hace falta un opt-in aparte.

create or replace function public.notify_favorite_discount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_had_discount boolean;
  v_has_discount boolean;
  v_fav record;
begin
  v_had_discount := old.compare_at_price is not null and old.compare_at_price > old.price
    and (old.offer_expires_at is null or old.offer_expires_at >= current_date);
  v_has_discount := new.compare_at_price is not null and new.compare_at_price > new.price
    and (new.offer_expires_at is null or new.offer_expires_at >= current_date);

  if v_has_discount and not v_had_discount then
    for v_fav in
      select user_id from public.favorites where product_id = new.id
    loop
      perform public.create_notification(
        v_fav.user_id,
        'favorite_price_drop',
        jsonb_build_object(
          'product_id', new.id, 'product_title', new.title,
          'price', new.price, 'compare_at_price', new.compare_at_price
        )
      );
    end loop;
  end if;

  return new;
end;
$$;
revoke execute on function public.notify_favorite_discount() from public, anon, authenticated;

drop trigger if exists products_notify_favorite_discount on public.products;
create trigger products_notify_favorite_discount
after update on public.products
for each row execute function public.notify_favorite_discount();

-- El trigger consulta favorites por product_id en cada update de precio --
-- índice para que no sea un seq scan a medida que crece la tabla.
create index if not exists favorites_product_id_idx on public.favorites(product_id);

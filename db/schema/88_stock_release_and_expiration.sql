-- Fase A del plan de pagos (docs/PLAN_PAGOS.md, hallazgo 2.1) — devolver el
-- stock que create_order descuenta cuando una orden termina sin pagarse.
--
-- Auditado el 2026-09-16 contra producción: 47 órdenes `pending` habían
-- descontado 141 unidades de 11 productos ($506.960) sin cobrar nada, y 2
-- productos ya estaban en stock 0 solo por checkouts que nadie completó.
-- Ningún camino devolvía el stock: ni el pago rechazado (mp-webhook solo
-- tocaba payment_status), ni el checkout abandonado, ni una cancelación del
-- vendedor (vender.js pone status='cancelled' con un update directo, sin
-- pasar por ningún RPC).
--
-- Solución: un trigger en `orders`, no un cambio en cada código que puede
-- matar una orden — así cubre los tres caminos existentes (webhook,
-- cancelación manual del vendedor, y el job de expiración de abajo) y
-- cualquiera que se agregue después, sin tener que acordarse de llamarlo.
-- `stock_released_at` garantiza que se libera una sola vez.

alter table public.orders add column if not exists stock_released_at timestamptz;

comment on column public.orders.stock_released_at is
  'Cuándo se le devolvió el stock a los productos de esta orden (trigger orders_release_stock). NULL = todavía no se liberó (sigue pending/paid, o ya se liberó desde antes de esta columna).';

-- =========================================================
-- 1. Helper: suma order_items por producto y devuelve stock. Solo toca
--    `products` -- ni el trigger ni la RPC de abajo lo llaman dentro de un
--    UPDATE sobre la misma fila de orders que ya están mutando, para no
--    complicarse con updates anidados.
-- =========================================================
create or replace function public._restock_order_items(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products p
  set stock = p.stock + agg.qty
  from (
    select product_id, sum(quantity) as qty
    from public.order_items
    where order_id = p_order_id
    group by product_id
  ) agg
  where p.id = agg.product_id;
end;
$$;

revoke execute on function public._restock_order_items(uuid) from public, anon, authenticated;

-- =========================================================
-- 2. Trigger: libera automáticamente apenas una orden pasa a un estado del
--    que no vuelve -- cancelada (por el motivo que sea) o con el pago
--    rechazado. `needs_review` (P0-6, pago con split que no se pudo
--    reconfirmar) queda afuera a propósito: todavía puede resolverse a
--    'paid' cuando el admin lo revise, no es un estado final.
--    BEFORE UPDATE + `new.stock_released_at := now()` en vez de un UPDATE
--    aparte -- evita un update anidado sobre la misma fila que el trigger
--    ya está procesando.
-- =========================================================
create or replace function public.orders_release_stock_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock_released_at is null and (
    (new.status = 'cancelled' and old.status is distinct from 'cancelled')
    or (new.payment_status = 'rejected' and old.payment_status is distinct from 'rejected')
  ) then
    perform public._restock_order_items(new.id);
    new.stock_released_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.orders_release_stock_trigger() from public, anon, authenticated;

drop trigger if exists orders_release_stock on public.orders;
create trigger orders_release_stock
before update on public.orders
for each row
when (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status)
execute procedure public.orders_release_stock_trigger();

-- =========================================================
-- 3. RPC manual para el admin: liberar el stock de una orden puntual sin
--    tener que cambiarle el estado (ej. reconciliar algo viejo a mano).
--    El trigger de arriba cubre el caso automático; esto es la válvula de
--    escape, mismo criterio que admin_set_product_active/
--    admin_set_repartidor_suspended.
-- =========================================================
create or replace function public.admin_release_order_stock(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin';
  v_order record;
begin
  if not v_is_admin then
    raise exception 'Solo un admin puede liberar stock manualmente.';
  end if;

  select id, stock_released_at into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'La orden no existe.';
  end if;

  if v_order.stock_released_at is not null then
    return jsonb_build_object('order_id', p_order_id, 'already_released', true);
  end if;

  perform public._restock_order_items(p_order_id);

  update public.orders set stock_released_at = now() where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'already_released', false);
end;
$$;

revoke execute on function public.admin_release_order_stock(uuid) from public, anon;
grant execute on function public.admin_release_order_stock(uuid) to authenticated;

-- =========================================================
-- 4. Job de expiración: una orden `pending` sin pagar durante demasiado
--    tiempo pasa a cancelada -- el UPDATE dispara el trigger de arriba y
--    libera el stock solo, sin duplicar la lógica acá. Umbrales distintos
--    por método: Mercado Pago falla rápido (el usuario vuelve o abandona en
--    minutos), transferencia es lenta por naturaleza (el cliente tiene que
--    ir al banco).
-- =========================================================
create or replace function public.expire_pending_orders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set status = 'cancelled', payment_status = 'rejected'
  where status = 'pending'
    and payment_status = 'pending'
    and (
      (payment_method = 'mercadopago' and created_at < now() - interval '24 hours')
      or (payment_method = 'transferencia' and created_at < now() - interval '72 hours')
    );
end;
$$;

revoke execute on function public.expire_pending_orders() from public, anon, authenticated;

-- pg_cron: corre cada hora. `cron.schedule(job_name, ...)` actualiza el job
-- si ya existe con ese nombre (desde pg_cron 1.4+) -- seguro de re-aplicar.
create extension if not exists pg_cron;

select cron.schedule(
  'expire-pending-orders',
  '0 * * * *',
  $$select public.expire_pending_orders();$$
);

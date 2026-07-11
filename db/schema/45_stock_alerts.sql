-- F12-09 (A113-249) — Aviso de "volvió el stock" para un producto agotado.
-- El cliente pide que le avisen (stock_alerts); cuando products.stock pasa de
-- 0 a >0, un trigger notifica a todos los que tengan una alerta pendiente para
-- ese producto (create_notification, F8-01) y la marca como notificada.
-- notified_at solo lo escribe el trigger (SECURITY DEFINER) -- el cliente no
-- tiene policy de UPDATE, así que no puede marcarse a sí mismo como avisado.

create table if not exists public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, client_id)
);

create index if not exists stock_alerts_product_pending_idx
  on public.stock_alerts(product_id) where notified_at is null;

alter table public.stock_alerts enable row level security;

drop policy if exists stock_alerts_select_own on public.stock_alerts;
create policy stock_alerts_select_own on public.stock_alerts
  for select to authenticated
  using (client_id = auth.uid());

drop policy if exists stock_alerts_insert_own on public.stock_alerts;
create policy stock_alerts_insert_own on public.stock_alerts
  for insert to authenticated
  with check (client_id = auth.uid());

drop policy if exists stock_alerts_delete_own on public.stock_alerts;
create policy stock_alerts_delete_own on public.stock_alerts
  for delete to authenticated
  using (client_id = auth.uid());

create or replace function public.notify_stock_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert record;
begin
  if old.stock = 0 and new.stock > 0 then
    for v_alert in
      select client_id from public.stock_alerts
      where product_id = new.id and notified_at is null
    loop
      perform public.create_notification(
        v_alert.client_id,
        'stock_alert',
        jsonb_build_object('product_id', new.id, 'product_title', new.title)
      );
    end loop;

    update public.stock_alerts
    set notified_at = now()
    where product_id = new.id and notified_at is null;
  end if;

  return new;
end;
$$;
revoke execute on function public.notify_stock_alerts() from public, anon, authenticated;

drop trigger if exists products_notify_stock_alerts on public.products;
create trigger products_notify_stock_alerts
after update on public.products
for each row execute function public.notify_stock_alerts();

-- F12-12 (A113-252) — Log de auditoría de acciones de admin (quién aprobó/
-- suspendió/borró qué). Trigger genérico (mismo patrón que set_updated_at/
-- notify_request_status_change) adjunto a las tablas donde el admin puede
-- moderar algo -- solo registra la fila cuando quien ejecuta la escritura es
-- REALMENTE un admin (chequea el rol del JWT del que llama, `auth.jwt()`,
-- no cambia aunque el UPDATE corra dentro de una función SECURITY DEFINER).
-- Esto distingue, por ejemplo, al dueño de una tienda editando su propio
-- perfil (rol 'vendedor', no se registra) de un admin suspendiéndola (rol
-- 'admin', sí se registra) aunque ambos pasen por la misma policy de RLS.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('insert', 'update', 'delete')),
  target_table text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log(created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_log_select_admin on public.admin_audit_log;
create policy admin_audit_log_select_admin on public.admin_audit_log
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

create or replace function public.log_admin_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente');
begin
  if v_role <> 'admin' then
    if TG_OP = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then old.id else new.id end,
    case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke execute on function public.log_admin_action() from public, anon, authenticated;

-- Suspender/reactivar/aprobar comercio (F6-04).
drop trigger if exists log_admin_action_stores on public.stores;
create trigger log_admin_action_stores
after update on public.stores
for each row execute function public.log_admin_action();

-- Aprobar/rechazar solicitud de vendedor.
drop trigger if exists log_admin_action_seller_requests on public.seller_requests;
create trigger log_admin_action_seller_requests
after update on public.seller_requests
for each row execute function public.log_admin_action();

-- Aprobar/rechazar solicitud de repartidor.
drop trigger if exists log_admin_action_delivery_requests on public.delivery_requests;
create trigger log_admin_action_delivery_requests
after update on public.delivery_requests
for each row execute function public.log_admin_action();

-- Suspender/reactivar repartidor (profiles.is_suspended, F6-04).
drop trigger if exists log_admin_action_profiles on public.profiles;
create trigger log_admin_action_profiles
after update on public.profiles
for each row execute function public.log_admin_action();

-- Moderar un producto puntual (admin_set_product_active, F6-04).
drop trigger if exists log_admin_action_products on public.products;
create trigger log_admin_action_products
after update on public.products
for each row execute function public.log_admin_action();

-- CRUD de categorías (F6-02).
drop trigger if exists log_admin_action_categories on public.categories;
create trigger log_admin_action_categories
after insert or update or delete on public.categories
for each row execute function public.log_admin_action();

-- CRUD de cupones -- los cupones propios de vendedor (F12-03) se filtran solos
-- por el chequeo de rol (auth.jwt() ->> 'role' = 'vendedor' para esas filas).
drop trigger if exists log_admin_action_coupons on public.coupons;
create trigger log_admin_action_coupons
after insert or update or delete on public.coupons
for each row execute function public.log_admin_action();

-- Ocultar/mostrar una reseña reportada (F7-03).
drop trigger if exists log_admin_action_reviews on public.reviews;
create trigger log_admin_action_reviews
after update on public.reviews
for each row execute function public.log_admin_action();

-- Cambiar el estado de un reclamo de soporte (F12-11).
drop trigger if exists log_admin_action_support_tickets on public.support_tickets;
create trigger log_admin_action_support_tickets
after update on public.support_tickets
for each row execute function public.log_admin_action();

-- Confirmar/rechazar un comprobante de transferencia como admin (F2-04/F6-04).
drop trigger if exists log_admin_action_orders on public.orders;
create trigger log_admin_action_orders
after update on public.orders
for each row execute function public.log_admin_action();

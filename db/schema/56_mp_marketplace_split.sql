-- P0-6: Split payments automático con Mercado Pago Marketplace (piloto).
--
-- Decisiones del usuario (2026-07-15): split automático vía OAuth (no
-- conciliación manual), comisión de la plataforma arranca en 0% y se sube
-- de a poco con el tiempo (queda como env var de Edge Function, no columna,
-- para poder subirla sin migración), un vendedor sin Mercado Pago vinculado
-- solo puede cobrar por transferencia, y se prueba primero con 1-2 vendedores
-- piloto antes de abrirlo a todos (por eso el flag `mp_split_pilot`, en vez
-- de una UI de "aprobar piloto" para un caso de 1-2 tiendas).
--
-- Mercado Pago no permite dividir un solo pago entre varios collector_id
-- (verificado contra la documentación oficial): una preferencia = un solo
-- vendedor. Por eso el gating de "ofrecer Mercado Pago" para un carrito
-- multi-tienda queda en el frontend (carrito.js), no acá — create_order no
-- se toca.

alter table public.stores add column if not exists mp_collector_id text;
alter table public.stores add column if not exists mp_split_pilot boolean not null default false;

-- 'needs_review': el webhook no pudo reconfirmar un pago con split porque el
-- access_token del vendedor venció y no se pudo refrescar (revocado, o el
-- vendedor desvinculó la cuenta). No se pierde el pago -- queda marcado para
-- que el admin lo resuelva a mano, en vez de fallar en silencio o marcarlo
-- 'paid' sin poder confirmarlo de verdad contra la API de Mercado Pago.
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('pending', 'paid', 'rejected', 'needs_review'));

-- Credenciales OAuth por vendedor. Primera vez que el proyecto guarda un
-- secreto de terceros en una tabla (hasta ahora MP_ACCESS_TOKEN vivía solo
-- como Edge Function secret, uno global). RLS habilitada A PROPÓSITO SIN
-- NINGUNA POLICY -- ni siquiera el dueño de la tienda puede leer esto vía
-- REST/anon/authenticated. Solo lo tocan las Edge Functions con
-- SUPABASE_SERVICE_ROLE_KEY (mismo modelo de confianza que ya usa
-- mp-webhook para poder marcar cualquier orden como pagada).
create table if not exists public.store_mp_credentials (
  store_id uuid primary key references public.stores(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  mp_user_id text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.store_mp_credentials enable row level security;

drop trigger if exists store_mp_credentials_set_updated_at on public.store_mp_credentials;
create trigger store_mp_credentials_set_updated_at
before update on public.store_mp_credentials
for each row execute procedure public.set_updated_at();

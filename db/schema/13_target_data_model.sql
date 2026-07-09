-- F0-08 (A113-152)
-- Modelo de datos objetivo (docs/ROADMAP.md, sección 5).
-- Agrega las tablas/columnas que todavía faltan para Fases 2, 3, 5, 7 y 8
-- (checkout con envío/pago, reparto, perfil de comercio completo, variantes
-- e imágenes de producto, reseñas, chat y notificaciones). RLS desde el día uno
-- en cada tabla nueva, siguiendo las convenciones ya usadas en 01-12
-- (gen_random_uuid(), precios en pesos enteros, policies con
-- DROP POLICY IF EXISTS antes de recrearlas para que este archivo sea
-- idempotente igual que el resto — ver F0-07 / docs/RUN_LOCAL.md).
--
-- IMPORTANTE: este archivo queda diseñado y listo, pero todavía NO se aplicó
-- a la base real. Aplicarlo cuando arranque la fase que lo necesita
-- (Fase 2 checkout, Fase 3 delivery, Fase 5 perfil de vendedor, Fase 7
-- reseñas/chat, Fase 8 notificaciones) — no antes, para no sumar tablas
-- vacías sin uso a la superficie que audita F1-02 (get_advisors).

-- =========================================================
-- 1. product_variants — talle/color/peso (D14)
-- =========================================================
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (char_length(name) >= 1),
  price integer not null check (price > 0),
  stock integer not null default 0 check (stock >= 0),
  sku text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_variants_product_id_idx on public.product_variants(product_id);

alter table public.product_variants enable row level security;

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute procedure public.set_updated_at();

-- Visible si el producto padre está activo, o siempre para su dueño/admin
drop policy if exists product_variants_select_public on public.product_variants;
create policy product_variants_select_public on public.product_variants
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and (p.is_active = true or p.seller_id = auth.uid())
    )
  );

drop policy if exists product_variants_write_owner on public.product_variants;
create policy product_variants_write_owner on public.product_variants
  for all to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and (p.seller_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and (p.seller_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
    )
  );

-- =========================================================
-- 2. product_images — varias fotos por producto (D14)
-- =========================================================
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_id_idx on public.product_images(product_id);

alter table public.product_images enable row level security;

drop policy if exists product_images_select_public on public.product_images;
create policy product_images_select_public on public.product_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and (p.is_active = true or p.seller_id = auth.uid())
    )
  );

drop policy if exists product_images_write_owner on public.product_images;
create policy product_images_write_owner on public.product_images
  for all to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and (p.seller_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and (p.seller_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
    )
  );

-- =========================================================
-- 3. products.compare_at_price — precio tachado / ofertas (D14)
-- =========================================================
alter table public.products
  add column if not exists compare_at_price integer check (compare_at_price is null or compare_at_price > 0);

-- =========================================================
-- 4. stores — perfil de comercio completo (descripción, horarios, zona)
--    NOTA: comercio.js ya lee `store.description`, pero la columna nunca
--    existió en la tabla real -> siempre caía al fallback "Sin descripción
--    disponible." Este bug se resuelve solo al aplicar este bloque.
-- =========================================================
alter table public.stores
  add column if not exists description text,
  add column if not exists zone text,
  add column if not exists hours jsonb;

-- =========================================================
-- 5. orders — método de entrega/pago (D2, D4)
-- =========================================================
alter table public.orders
  add column if not exists delivery_method text check (delivery_method is null or delivery_method in ('pickup', 'delivery')),
  add column if not exists payment_method text check (payment_method is null or payment_method in ('simulado', 'mercadopago', 'transferencia')),
  add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'rejected')),
  add column if not exists delivery_fee integer check (delivery_fee is null or delivery_fee >= 0);

-- =========================================================
-- 6. payment_proofs — transferencia con comprobante (D2, D3)
-- =========================================================
create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  receipt_url text not null,
  confirmed_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_proofs_order_id_idx on public.payment_proofs(order_id);

alter table public.payment_proofs enable row level security;

drop trigger if exists payment_proofs_set_updated_at on public.payment_proofs;
create trigger payment_proofs_set_updated_at
before update on public.payment_proofs
for each row execute procedure public.set_updated_at();

-- El cliente dueño de la orden, el vendedor de la tienda y el admin pueden verlo
drop policy if exists payment_proofs_select_participants on public.payment_proofs;
create policy payment_proofs_select_participants on public.payment_proofs
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = payment_proofs.order_id
        and (
          o.client_id = auth.uid()
          or o.store_id in (select id from public.stores where owner_id = auth.uid())
          or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
        )
    )
  );

-- Solo el cliente dueño de la orden sube el comprobante
drop policy if exists payment_proofs_insert_client on public.payment_proofs;
create policy payment_proofs_insert_client on public.payment_proofs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = payment_proofs.order_id and o.client_id = auth.uid()
    )
  );

-- Solo el vendedor de la tienda o el admin confirman/rechazan
drop policy if exists payment_proofs_update_store_or_admin on public.payment_proofs;
create policy payment_proofs_update_store_or_admin on public.payment_proofs
  for update to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = payment_proofs.order_id
        and (
          o.store_id in (select id from public.stores where owner_id = auth.uid())
          or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
        )
    )
  );

-- =========================================================
-- 7. deliveries — flujo de reparto (D5)
-- =========================================================
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  repartidor_id uuid references auth.users(id) on delete set null,
  status text not null default 'unassigned' check (status in ('unassigned', 'assigned', 'picked_up', 'delivered', 'cancelled')),
  assigned_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deliveries_repartidor_id_idx on public.deliveries(repartidor_id);

alter table public.deliveries enable row level security;

drop trigger if exists deliveries_set_updated_at on public.deliveries;
create trigger deliveries_set_updated_at
before update on public.deliveries
for each row execute procedure public.set_updated_at();

drop policy if exists deliveries_select_participants on public.deliveries;
create policy deliveries_select_participants on public.deliveries
  for select to authenticated
  using (
    repartidor_id = auth.uid()
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
    or exists (
      select 1 from public.orders o
      where o.id = deliveries.order_id
        and (o.client_id = auth.uid() or o.store_id in (select id from public.stores where owner_id = auth.uid()))
    )
  );

-- Asignar reparto: el vendedor de la tienda del pedido o un admin
drop policy if exists deliveries_insert_store_or_admin on public.deliveries;
create policy deliveries_insert_store_or_admin on public.deliveries
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = deliveries.order_id and o.store_id in (select id from public.stores where owner_id = auth.uid())
    )
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  );

-- El repartidor asignado actualiza el estado de su propia entrega; la tienda/admin también pueden gestionarla
drop policy if exists deliveries_update_repartidor_or_store on public.deliveries;
create policy deliveries_update_repartidor_or_store on public.deliveries
  for update to authenticated
  using (
    repartidor_id = auth.uid()
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
    or exists (
      select 1 from public.orders o
      where o.id = deliveries.order_id and o.store_id in (select id from public.stores where owner_id = auth.uid())
    )
  );

-- =========================================================
-- 8. reviews — reseñas y calificaciones de producto o comercio (D8)
-- =========================================================
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('product', 'store')),
  target_id uuid not null,
  client_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_type, target_id, client_id)
);

create index if not exists reviews_target_idx on public.reviews(target_type, target_id);

alter table public.reviews enable row level security;

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
before update on public.reviews
for each row execute procedure public.set_updated_at();

drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews
  for select to anon, authenticated using (true);

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (client_id = auth.uid());

drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews
  for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

drop policy if exists reviews_delete_own_or_admin on public.reviews;
create policy reviews_delete_own_or_admin on public.reviews
  for delete to authenticated
  using (client_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- =========================================================
-- 9. conversations + messages — chat comprador-vendedor (D8)
-- =========================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_id, store_id)
);

alter table public.conversations enable row level security;

drop policy if exists conversations_select_participants on public.conversations;
create policy conversations_select_participants on public.conversations
  for select to authenticated
  using (
    client_id = auth.uid()
    or store_id in (select id from public.stores where owner_id = auth.uid())
  );

drop policy if exists conversations_insert_client on public.conversations;
create policy conversations_insert_client on public.conversations
  for insert to authenticated
  with check (client_id = auth.uid());

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) >= 1),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages(conversation_id);

alter table public.messages enable row level security;

drop policy if exists messages_select_participants on public.messages;
create policy messages_select_participants on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.client_id = auth.uid() or c.store_id in (select id from public.stores where owner_id = auth.uid()))
    )
  );

drop policy if exists messages_insert_participants on public.messages;
create policy messages_insert_participants on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.client_id = auth.uid() or c.store_id in (select id from public.stores where owner_id = auth.uid()))
    )
  );

-- =========================================================
-- 10. notifications — centro de notificaciones (D8, D10)
-- =========================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'whatsapp')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id);

alter table public.notifications enable row level security;

-- Solo lectura y marcar-como-leída de las propias. La inserción la hace el
-- backend (triggers/RPC con SECURITY DEFINER o service_role, que bypasea RLS)
-- cuando pasa algo que amerita notificar — no hay policy de insert para
-- `authenticated` a propósito.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================
-- 11. favorites — favoritos persistentes en el servidor (D8)
--     (hoy viven solo en localStorage, ver js/cart-utils.js initWishlist)
-- =========================================================
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists favorites_user_id_idx on public.favorites(user_id);

alter table public.favorites enable row level security;

drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own on public.favorites
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own on public.favorites
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own on public.favorites
  for delete to authenticated
  using (user_id = auth.uid());

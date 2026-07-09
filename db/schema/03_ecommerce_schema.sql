-- Phase 1: E-commerce Schema for Baradero Local

-- 1. CATEGORIES TABLE
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists categories_select_public on public.categories;
create policy categories_select_public on public.categories
  for select to anon, authenticated using (true);

drop policy if exists categories_insert_admin on public.categories;
create policy categories_insert_admin on public.categories
  for insert to authenticated
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

drop policy if exists categories_update_admin on public.categories;
create policy categories_update_admin on public.categories
  for update to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- 2. STORES TABLE
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  cuit text,
  name text not null,
  logo_url text,
  address text,
  phone text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stores enable row level security;

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at
before update on public.stores
for each row execute procedure public.set_updated_at();

-- Stores RLS: Public can see approved stores. Owners can see their own store. Admins see all.
drop policy if exists stores_select_public on public.stores;
create policy stores_select_public on public.stores
  for select to anon, authenticated
  using (status = 'approved' or owner_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

drop policy if exists stores_insert_own on public.stores;
create policy stores_insert_own on public.stores
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists stores_update_own on public.stores;
create policy stores_update_own on public.stores
  for update to authenticated
  using (owner_id = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- 3. UPDATE PRODUCTS TABLE
alter table public.products add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists category_id uuid references public.categories(id) on delete set null;

-- Update products RLS to allow store owners to manage their products
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'products_update_seller'
  ) then
    create policy products_update_seller on public.products
      for update to authenticated
      using (seller_id = auth.uid() and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') in ('vendedor', 'admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'products_delete_seller'
  ) then
    create policy products_delete_seller on public.products
      for delete to authenticated
      using (seller_id = auth.uid() and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') in ('vendedor', 'admin'));
  end if;
end $$;


-- 4. ORDERS AND ORDER_ITEMS TABLES
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'shipped', 'ready_for_pickup', 'completed', 'cancelled')),
  shipping_address text,
  total_price_cents integer not null check (total_price_cents >= 0),
  payment_id text, -- ID from MercadoPago / Stripe
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute procedure public.set_updated_at();

-- Orders RLS
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated
  using (
    client_id = auth.uid() or
    store_id in (select id from public.stores where owner_id = auth.uid()) or
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  );

drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders
  for insert to authenticated
  with check (client_id = auth.uid());

drop policy if exists orders_update_store_or_admin on public.orders;
create policy orders_update_store_or_admin on public.orders
  for update to authenticated
  using (
    store_id in (select id from public.stores where owner_id = auth.uid()) or
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  );


create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  quantity integer not null check (quantity > 0),
  price_cents integer not null check (price_cents >= 0),
  created_at timestamptz not null default now()
);

alter table public.order_items enable row level security;

-- Order Items RLS (derive from order access)
drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (
    order_id in (select id from public.orders where client_id = auth.uid() or store_id in (select id from public.stores where owner_id = auth.uid())) or
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  );

drop policy if exists order_items_insert_own on public.order_items;
create policy order_items_insert_own on public.order_items
  for insert to authenticated
  with check (
    order_id in (select id from public.orders where client_id = auth.uid())
  );


-- 5. STORAGE BUCKETS
insert into storage.buckets (id, name, public) values ('products', 'products', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('stores', 'stores', true) on conflict (id) do nothing;

-- Storage RLS Policies
drop policy if exists "Public Access to products" on storage.objects;
create policy "Public Access to products" on storage.objects for select using (bucket_id = 'products');

drop policy if exists "Public Access to stores" on storage.objects;
create policy "Public Access to stores" on storage.objects for select using (bucket_id = 'stores');

drop policy if exists "Authenticated users can upload product images" on storage.objects;
create policy "Authenticated users can upload product images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products' and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') in ('vendedor', 'admin'));

drop policy if exists "Authenticated users can upload store logos" on storage.objects;
create policy "Authenticated users can upload store logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'stores');

drop policy if exists "Users can update their own product images" on storage.objects;
create policy "Users can update their own product images" on storage.objects
  for update to authenticated
  using (bucket_id = 'products' and auth.uid() = owner);

drop policy if exists "Users can update their own store logos" on storage.objects;
create policy "Users can update their own store logos" on storage.objects
  for update to authenticated
  using (bucket_id = 'stores' and auth.uid() = owner);

drop policy if exists "Users can delete their own product images" on storage.objects;
create policy "Users can delete their own product images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'products' and auth.uid() = owner);

drop policy if exists "Users can delete their own store logos" on storage.objects;
create policy "Users can delete their own store logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'stores' and auth.uid() = owner);

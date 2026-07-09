-- Schema for discount coupons

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_percentage integer not null check (discount_percentage > 0 and discount_percentage <= 100),
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;

-- Public can read active coupons to validate them at checkout
drop policy if exists coupons_select_public on public.coupons;
create policy coupons_select_public on public.coupons
  for select to anon, authenticated
  using (is_active = true and (expires_at is null or expires_at > now()));

-- Admins can manage coupons
drop policy if exists coupons_all_admin on public.coupons;
create policy coupons_all_admin on public.coupons
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- Seed a dummy coupon for testing
insert into public.coupons (code, discount_percentage) values ('BIENVENIDO10', 10) on conflict (code) do nothing;
insert into public.coupons (code, discount_percentage) values ('VERANO20', 20) on conflict (code) do nothing;

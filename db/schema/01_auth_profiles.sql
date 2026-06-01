-- Base schema for MVP auth/profile flow.
-- Run this in Supabase SQL Editor.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'app_role' and n.nspname = 'public'
  ) then
    create type public.app_role as enum ('cliente', 'vendedor', 'admin');
  end if;
end $$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) >= 3),
  description text,
  price_cents integer not null check (price_cents > 0),
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_seller_id_idx on public.products(seller_id);
create index if not exists products_is_active_idx on public.products(is_active);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute procedure public.set_updated_at();

alter table public.products enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'products_select_public_active'
  ) then
    create policy products_select_public_active
      on public.products
      for select
      to anon, authenticated
      using (is_active = true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'products_select_own'
  ) then
    create policy products_select_own
      on public.products
      for select
      to authenticated
      using (seller_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'products_insert_seller_or_admin'
  ) then
    create policy products_insert_seller_or_admin
      on public.products
      for insert
      to authenticated
      with check (
        seller_id = auth.uid()
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('vendedor', 'admin')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'products_update_own_seller_or_admin'
  ) then
    create policy products_update_own_seller_or_admin
      on public.products
      for update
      to authenticated
      using (
        seller_id = auth.uid()
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('vendedor', 'admin')
        )
      )
      with check (
        seller_id = auth.uid()
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('vendedor', 'admin')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'products_delete_own_seller_or_admin'
  ) then
    create policy products_delete_own_seller_or_admin
      on public.products
      for delete
      to authenticated
      using (
        seller_id = auth.uid()
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('vendedor', 'admin')
        )
      );
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  role public.app_role not null default 'cliente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    (case lower(coalesce(new.raw_user_meta_data ->> 'account_type', 'cliente'))
      when 'vendedor' then 'vendedor'
      when 'comercio' then 'vendedor'
      else 'cliente'
    end)::public.app_role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        role = coalesce(excluded.role, public.profiles.role),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
      on public.profiles
      for select
      to authenticated
      using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
      on public.profiles
      for update
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_own'
  ) then
    create policy profiles_insert_own
      on public.profiles
      for insert
      to authenticated
      with check (auth.uid() = id);
  end if;
end $$;

-- Proteger la columna 'role' para que no sea modificada directamente por el cliente
create or replace function public.prevent_role_update_on_profile()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.role <> new.role and auth.role() = 'authenticated' then
    raise exception 'No esta permitido modificar el rol del usuario directamente.';
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_prevent_role_update on public.profiles;
create trigger trigger_prevent_role_update
before update on public.profiles
for each row execute procedure public.prevent_role_update_on_profile();

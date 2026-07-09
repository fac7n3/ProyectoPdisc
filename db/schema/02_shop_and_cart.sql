-- Schema para las solicitudes de vendedor y persistencia (opcional) del carrito/favoritos

create table if not exists public.seller_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seller_requests enable row level security;

drop trigger if exists seller_requests_set_updated_at on public.seller_requests;
create trigger seller_requests_set_updated_at
before update on public.seller_requests
for each row execute procedure public.set_updated_at();

-- Políticas RLS para seller_requests
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seller_requests' and policyname = 'seller_requests_insert_own'
  ) then
    create policy seller_requests_insert_own
      on public.seller_requests for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seller_requests' and policyname = 'seller_requests_select_own'
  ) then
    create policy seller_requests_select_own
      on public.seller_requests for select to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

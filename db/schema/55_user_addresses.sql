-- P0-2: Multi-address book. Antes el sistema guardaba UNA sola dirección
-- por usuario en profiles.address/address_details. Ahora: múltiples direcciones
-- guardadas (casa, trabajo, etc.) que el usuario puede elegir al comprar.
-- Las direcciones viejas en profiles.address/address_details/phone quedan
-- como dato del perfil (teléfono de contacto general) — la migración no
-- toca profiles, el JS auto-migra la dirección vieja a la nueva tabla la
-- primera vez que el usuario abre la libreta de direcciones.

create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Casa',
  address text not null,
  details text,
  phone text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_addresses_user_id_idx on public.user_addresses(user_id);

alter table public.user_addresses enable row level security;

drop policy if exists user_addresses_select_own on public.user_addresses;
create policy user_addresses_select_own on public.user_addresses
  for select to authenticated using (user_id = auth.uid());

drop policy if exists user_addresses_insert_own on public.user_addresses;
create policy user_addresses_insert_own on public.user_addresses
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_addresses_update_own on public.user_addresses;
create policy user_addresses_update_own on public.user_addresses
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_addresses_delete_own on public.user_addresses;
create policy user_addresses_delete_own on public.user_addresses
  for delete to authenticated using (user_id = auth.uid());

drop trigger if exists user_addresses_set_updated_at on public.user_addresses;
create trigger user_addresses_set_updated_at
before update on public.user_addresses
for each row execute procedure public.set_updated_at();

-- Asegura que solo haya una dirección predeterminada por usuario.
create or replace function public.ensure_single_default_address()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.user_addresses
    set is_default = false
    where user_id = new.user_id and id <> new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.ensure_single_default_address() from public, anon, authenticated;

drop trigger if exists user_addresses_ensure_single_default on public.user_addresses;
create trigger user_addresses_ensure_single_default
after insert or update on public.user_addresses
for each row execute function public.ensure_single_default_address();

-- Consultas de presupuesto del directorio "Contratar": el vecino le deja al
-- profesional qué necesita y su teléfono, y al profesional le entra en la
-- bandeja de su panel (pages/profesional.html) con una notificación.
--
-- Hasta acá "Contratar" era 100% informativo (el contacto salía por tel: o
-- wa.me y la plataforma no se enteraba de nada). Esto le da al profesional un
-- registro de quién lo buscó, sin meterse todavía con pedidos ni pagos.
--
-- Solo inserta el vecino LOGUEADO, no anónimo: sin captcha una bandeja
-- abierta se llena de spam, y además hace falta la cuenta para poder
-- mostrarle después "tus consultas".

create table if not exists public.professional_inquiries (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  request_details text not null check (char_length(request_details) between 5 and 1000),
  -- Lista fija en vez de texto libre: se elige de un desplegable, así la
  -- bandeja queda ordenada y filtrable.
  needed_when text check (needed_when is null or needed_when in ('hoy', 'esta_semana', 'sin_apuro')),
  contact_phone text not null check (char_length(contact_phone) between 6 and 20),
  status text not null default 'new' check (status in ('new', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists professional_inquiries_professional_id_idx
  on public.professional_inquiries(professional_id, status);
create index if not exists professional_inquiries_client_id_idx
  on public.professional_inquiries(client_id);

alter table public.professional_inquiries enable row level security;

drop trigger if exists professional_inquiries_set_updated_at on public.professional_inquiries;
create trigger professional_inquiries_set_updated_at
  before update on public.professional_inquiries
  for each row execute procedure public.set_updated_at();

-- El vecino manda la consulta a nombre propio, y solo a un profesional
-- publicado y activo.
drop policy if exists professional_inquiries_insert_own on public.professional_inquiries;
create policy professional_inquiries_insert_own on public.professional_inquiries
  for insert to authenticated
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.is_active = true
    )
  );

drop policy if exists professional_inquiries_select_client on public.professional_inquiries;
create policy professional_inquiries_select_client on public.professional_inquiries
  for select to authenticated
  using (client_id = auth.uid());

drop policy if exists professional_inquiries_select_professional on public.professional_inquiries;
create policy professional_inquiries_select_professional on public.professional_inquiries
  for select to authenticated
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.owner_id = auth.uid()
  ));

drop policy if exists professional_inquiries_select_admin on public.professional_inquiries;
create policy professional_inquiries_select_admin on public.professional_inquiries
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- Solo el profesional (y el admin) actualiza: el vecino no tiene policy de
-- UPDATE, así que una consulta enviada no se edita -- si hay que corregir
-- algo, se manda otra.
drop policy if exists professional_inquiries_update_professional on public.professional_inquiries;
create policy professional_inquiries_update_professional on public.professional_inquiries
  for update to authenticated
  using (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.owner_id = auth.uid()
    )
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  )
  with check (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.owner_id = auth.uid()
    )
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  );

-- RLS no sabe restringir por columna, así que el "solo puede mover el estado"
-- va en un trigger -- mismo patrón que prevent_role_update_on_profile
-- (01_auth_profiles.sql). Sin esto, el profesional podría reescribir lo que
-- el vecino pidió, o cambiarle el teléfono.
create or replace function public.protect_inquiry_content()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin' then
    return new;
  end if;

  if new.request_details is distinct from old.request_details
     or new.needed_when is distinct from old.needed_when
     or new.contact_phone is distinct from old.contact_phone
     or new.client_id is distinct from old.client_id
     or new.professional_id is distinct from old.professional_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Solo podés cambiar el estado de la consulta.';
  end if;

  return new;
end;
$$;

drop trigger if exists professional_inquiries_protect_content on public.professional_inquiries;
create trigger professional_inquiries_protect_content
  before update on public.professional_inquiries
  for each row execute function public.protect_inquiry_content();

-- Aviso al profesional cuando entra una consulta nueva. Mismo patrón que
-- notify_request_status_change (84): SECURITY DEFINER, search_path fijo y
-- create_notification por perform.
create or replace function public.notify_new_inquiry()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id
  from public.professionals
  where id = new.professional_id;

  if v_owner_id is not null then
    perform public.create_notification(
      v_owner_id,
      'professional_inquiry_new',
      jsonb_build_object('inquiry_id', new.id, 'professional_id', new.professional_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists professional_inquiries_notify_new on public.professional_inquiries;
create trigger professional_inquiries_notify_new
  after insert on public.professional_inquiries
  for each row execute function public.notify_new_inquiry();

-- La función solo tiene sentido como trigger; nadie la llama a mano.
revoke execute on function public.notify_new_inquiry() from public, anon, authenticated;
revoke execute on function public.protect_inquiry_content() from public, anon, authenticated;

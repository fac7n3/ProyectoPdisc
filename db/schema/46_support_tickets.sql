-- F12-11 (A113-251) — Panel de soporte/reclamos. Antes la única vía de contacto
-- era el mail genérico de las páginas legales, sin registro estructurado ni
-- forma de que el admin le haga seguimiento. Alcance a propósito acotado: el
-- admin cambia el estado (open/in_progress/resolved), no hay hilo de
-- respuesta en la app -- para responder de verdad sigue usando el email del
-- usuario (ya visible en el ticket), como hasta ahora. Un hilo completo sería
-- repetir el sistema de chat de F7-02 para un caso de uso distinto.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_status_idx on public.support_tickets(status);
create index if not exists support_tickets_user_id_idx on public.support_tickets(user_id);

alter table public.support_tickets enable row level security;

drop policy if exists support_tickets_select_own_or_admin on public.support_tickets;
create policy support_tickets_select_own_or_admin on public.support_tickets
  for select to authenticated
  using (
    user_id = auth.uid()
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  );

drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own on public.support_tickets
  for insert to authenticated
  with check (user_id = auth.uid());

-- Solo el admin cambia el estado.
drop policy if exists support_tickets_update_admin on public.support_tickets;
create policy support_tickets_update_admin on public.support_tickets
  for update to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
before update on public.support_tickets
for each row execute procedure public.set_updated_at();

-- Notifica al autor cuando el admin cambia el estado del reclamo (mismo
-- criterio que notify_request_status_change, F12-01, pero separado porque
-- acá el vocabulario de estados es distinto: 3 valores, no approved/rejected).
create or replace function public.notify_support_ticket_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  perform public.create_notification(
    new.user_id,
    'support_ticket_status_change',
    jsonb_build_object('ticket_id', new.id, 'subject', new.subject, 'status', new.status)
  );

  return new;
end;
$$;
revoke execute on function public.notify_support_ticket_status_change() from public, anon, authenticated;

drop trigger if exists support_tickets_notify_status_change on public.support_tickets;
create trigger support_tickets_notify_status_change
after update on public.support_tickets
for each row execute function public.notify_support_ticket_status_change();

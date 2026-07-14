-- P0-5 + P1-11: Hilo de respuesta bidireccional en soporte + usuario cancela reclamo.
--
-- Antes (F12-11): el admin solo cambiaba el estado del ticket (open/in_progress/
-- resolved), sin hilo de respuesta -- respondía por email. Ahora: hilo tipo
-- chat (mensajes múltiples back-and-forth), reutilizando el patrón de
-- conversations/messages de F7-02 pero adaptado a soporte (un ticket, no una
-- conversación entre cliente y vendedor). Además el usuario puede cancelar
-- su propio reclamo (nuevo estado 'cancelled').

-- =========================================================
-- 1. Agregar 'cancelled' al CHECK de status
-- =========================================================
alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets
  add constraint support_tickets_status_check
  check (status in ('open', 'in_progress', 'resolved', 'cancelled'));

-- =========================================================
-- 2. Tabla de mensajes del hilo
-- =========================================================
create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_id_idx
  on public.support_ticket_messages(ticket_id);

alter table public.support_ticket_messages enable row level security;

-- El dueño del ticket o el admin/moderador pueden leer los mensajes
drop policy if exists support_ticket_messages_select_participants on public.support_ticket_messages;
create policy support_ticket_messages_select_participants on public.support_ticket_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (
          t.user_id = auth.uid()
          or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') in ('admin', 'moderador')
        )
    )
  );

-- El dueño del ticket o el admin/moderador pueden insertar mensajes.
-- sender_id = auth.uid() previene suplantación (no podés mandar mensajes
-- a nombre de otro usuario).
drop policy if exists support_ticket_messages_insert_participants on public.support_ticket_messages;
create policy support_ticket_messages_insert_participants on public.support_ticket_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (
          t.user_id = auth.uid()
          or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') in ('admin', 'moderador')
        )
    )
  );

-- =========================================================
-- 3. Actualizar la policy de update del ticket:
--    - admin/moderador: puede cambiar cualquier campo/status
--    - dueño: solo puede cancelar (status = 'cancelled')
-- =========================================================
drop policy if exists support_tickets_update_admin on public.support_tickets;
create policy support_tickets_update on public.support_tickets
  for update to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') in ('admin', 'moderador')
    or user_id = auth.uid()
  )
  with check (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') in ('admin', 'moderador')
    or (user_id = auth.uid() and status = 'cancelled')
  );

-- =========================================================
-- 4. Notificación: cuando el admin/moderador responde, el usuario
--    recibe una notificación. Cuando el usuario envía un mensaje,
--    no se notifica al admin (no hay un admin específico -- el admin
--    ve la actividad al revisar el panel, mismo criterio que el
--    resto del proyecto: sin push, se actualiza al recargar).
-- =========================================================
create or replace function public.notify_support_ticket_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket record;
  v_sender_role text;
begin
  v_sender_role := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente');

  -- Solo notificar cuando responde admin/moderador (no cuando el usuario
  -- manda un mensaje nuevo -- el admin revisa el panel).
  if v_sender_role not in ('admin', 'moderador') then
    return new;
  end if;

  select user_id, subject into v_ticket
  from public.support_tickets where id = new.ticket_id;

  if not found then
    return new;
  end if;

  perform public.create_notification(
    v_ticket.user_id,
    'support_ticket_message',
    jsonb_build_object(
      'ticket_id', new.ticket_id,
      'subject', v_ticket.subject,
      'message', left(new.message, 100)
    )
  );

  return new;
end;
$$;
revoke execute on function public.notify_support_ticket_message() from public, anon, authenticated;

drop trigger if exists support_tickets_notify_message on public.support_ticket_messages;
create trigger support_tickets_notify_message
after insert on public.support_ticket_messages
for each row execute function public.notify_support_ticket_message();

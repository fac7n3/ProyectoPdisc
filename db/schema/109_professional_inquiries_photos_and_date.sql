-- "Pedir presupuesto" (contratar.html) suma dos cosas al pedido de la
-- migración 90, a pedido del usuario: el vecino puede sumar hasta 5 fotos
-- del problema (ej. la pérdida de la canilla) y, si "Hoy"/"Esta semana"/
-- "Sin apuro" no alcanza, elegir un día puntual con un selector de fecha al
-- lado de esos chips.

alter table public.professional_inquiries
  add column if not exists attachments text[];

alter table public.professional_inquiries drop constraint if exists professional_inquiries_attachments_max;
alter table public.professional_inquiries
  add constraint professional_inquiries_attachments_max
  check (attachments is null or array_length(attachments, 1) <= 5);

-- Un cuarto valor ('fecha') para needed_when, con la fecha puntual en su
-- propia columna -- así la bandeja del profesional (profesional-consultas.js)
-- puede seguir filtrando/mostrando por el mismo campo de siempre.
alter table public.professional_inquiries drop constraint if exists professional_inquiries_needed_when_check;
alter table public.professional_inquiries
  add constraint professional_inquiries_needed_when_check
  check (needed_when is null or needed_when in ('hoy', 'esta_semana', 'sin_apuro', 'fecha'));

alter table public.professional_inquiries add column if not exists needed_date date;

alter table public.professional_inquiries drop constraint if exists professional_inquiries_needed_date_check;
alter table public.professional_inquiries
  add constraint professional_inquiries_needed_date_check
  check (
    (needed_when = 'fecha' and needed_date is not null and needed_date >= current_date)
    or (needed_when is distinct from 'fecha' and needed_date is null)
  );

-- El trigger que solo deja mover `status` (90) tenía que aprender de las dos
-- columnas nuevas: sin esto el profesional podría reescribirle al vecino las
-- fotos o la fecha pedida, igual que ya no puede con el resto del contenido.
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
     or new.needed_date is distinct from old.needed_date
     or new.contact_phone is distinct from old.contact_phone
     or new.attachments is distinct from old.attachments
     or new.client_id is distinct from old.client_id
     or new.professional_id is distinct from old.professional_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Solo podés cambiar el estado de la consulta.';
  end if;

  return new;
end;
$$;

-- Bucket privado para las fotos, mismo criterio que support-attachments (73):
-- pueden mostrar la casa o la dirección de la persona, no es para servir por
-- URL pública. Convención de paths: {client_uid}/{professional_id}/{archivo}
-- -- con el professional_id como segundo segmento, la policy de lectura del
-- profesional resuelve el dueño sin tener que abrir la tabla
-- professional_inquiries (que además todavía no existe cuando se sube la
-- foto: se sube antes del insert, mismo orden que support_tickets).
insert into storage.buckets (id, name, public)
values ('professional-inquiry-attachments', 'professional-inquiry-attachments', false)
on conflict (id) do nothing;

drop policy if exists professional_inquiry_attachments_insert_own on storage.objects;
create policy professional_inquiry_attachments_insert_own on storage.objects for insert
to authenticated
with check (
  bucket_id = 'professional-inquiry-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists professional_inquiry_attachments_select on storage.objects;
create policy professional_inquiry_attachments_select on storage.objects for select
to authenticated
using (
  bucket_id = 'professional-inquiry-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.professionals p
      where p.id::text = (storage.foldername(name))[2]
        and p.owner_id = auth.uid()
    )
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin'
  )
);

-- Borrado propio: permite limpiar las fotos ya subidas si el insert de la
-- consulta falla después (mismo motivo que support_attachments_delete_own, 73).
drop policy if exists professional_inquiry_attachments_delete_own on storage.objects;
create policy professional_inquiry_attachments_delete_own on storage.objects for delete
to authenticated
using (
  bucket_id = 'professional-inquiry-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

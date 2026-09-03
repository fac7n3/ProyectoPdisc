-- Adjuntos en los reclamos de soporte: al enviar un reclamo se pueden sumar
-- capturas de pantalla (o un PDF). Antes el ticket era solo texto y el admin
-- tenía que pedir las capturas por email, fuera de la app.
--
-- Bucket privado, como payment-proofs (22) y a diferencia de products/avatars:
-- una captura suele traer datos personales (dirección, mail, medio de pago),
-- no es algo para servir por URL pública a cualquiera -- se abre con signed
-- URLs de 60s, igual que los comprobantes.
--
-- Convención de paths: support-attachments/{uid}/{timestamp}-{archivo}. El
-- primer segmento es el uid del autor, no el ticket_id: así el archivo se
-- puede subir ANTES de que el ticket exista (que es el orden real -- primero
-- sube, después se inserta la fila con los paths) y la policy resuelve el
-- dueño sin mirar ninguna tabla.

alter table public.support_tickets
  add column if not exists attachments text[];

-- Tope también en la DB: el front limita a 5, pero el insert es un borde de
-- confianza (la API de Supabase está abierta a cualquier cliente).
alter table public.support_tickets drop constraint if exists support_tickets_attachments_max;
alter table public.support_tickets
  add constraint support_tickets_attachments_max
  check (attachments is null or array_length(attachments, 1) <= 5);

insert into storage.buckets (id, name, public)
values ('support-attachments', 'support-attachments', false)
on conflict (id) do nothing;

drop policy if exists support_attachments_insert_own on storage.objects;
create policy support_attachments_insert_own on storage.objects for insert
to authenticated
with check (
  bucket_id = 'support-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Lo ve el autor y el equipo de soporte (mismos roles que el hilo de
-- mensajes, 54_support_ticket_messages.sql).
drop policy if exists support_attachments_select_own_or_staff on storage.objects;
create policy support_attachments_select_own_or_staff on storage.objects for select
to authenticated
using (
  bucket_id = 'support-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') in ('admin', 'moderador')
  )
);

-- Borrado propio: es lo que permite limpiar los archivos si el insert del
-- ticket falla después de haberlos subido (si no, quedan pagos para siempre,
-- el mismo bug que arregló storage-utils.js con las fotos de producto).
drop policy if exists support_attachments_delete_own on storage.objects;
create policy support_attachments_delete_own on storage.objects for delete
to authenticated
using (
  bucket_id = 'support-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- La galería de fotos del profesional (professional_promos, 85) pasa de ser
-- una pila sin orden a una galería que se ordena y se puede describir: el
-- profesional elige qué foto va primero y le pone un pie ("baño terminado en
-- Barrio Güemes").

alter table public.professional_promos add column if not exists sort_order integer not null default 0;
alter table public.professional_promos add column if not exists description text;

alter table public.professional_promos drop constraint if exists professional_promos_description_check;
alter table public.professional_promos add constraint professional_promos_description_check
  check (description is null or char_length(description) <= 160);

create index if not exists professional_promos_sort_idx
  on public.professional_promos(professional_id, sort_order);

-- Al bucket le faltaba la policy de UPDATE que sí tienen los otros: sin ella
-- un `upsert` sobre una foto ya subida falla. Mismo patrón por carpeta {uid}/
-- que professional_promos_insert_own (85).
drop policy if exists professional_promos_update_own on storage.objects;
create policy professional_promos_update_own on storage.objects for update
to authenticated
using (
  bucket_id = 'professional-promos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'professional-promos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Extiende el directorio "Contratar" (migración 77): categoría fija arriba
-- de la lista, calificación por estrellas y foto/logo opcional por
-- profesional.
--
-- Categorías: lista fija y chica (6 valores, ver js/professional-categories.js
-- para la etiqueta/ícono de cada una) -- a diferencia de `specialty` (texto
-- libre, "Plomero", "Clases de inglés"), sirve para los chips de filtro de
-- arriba de la página sin depender de que el texto libre coincida exacto.
alter table public.professional_requests add column if not exists category text;
alter table public.professional_requests drop constraint if exists professional_requests_category_check;
alter table public.professional_requests add constraint professional_requests_category_check
  check (category is null or category in ('hogar', 'clases', 'cuidado', 'belleza', 'tecnologia', 'eventos'));

alter table public.professionals add column if not exists category text;
alter table public.professionals drop constraint if exists professionals_category_check;
alter table public.professionals add constraint professionals_category_check
  check (category is null or category in ('hogar', 'clases', 'cuidado', 'belleza', 'tecnologia', 'eventos'));

-- Foto/logo opcional, mismo criterio que stores.logo_url (migración 74):
-- bucket público, cada usuario escribe solo en su propia carpeta {uid}/.
alter table public.professional_requests add column if not exists photo_url text;
alter table public.professionals add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('professional-photos', 'professional-photos', true)
on conflict (id) do nothing;

drop policy if exists professional_photos_read_public on storage.objects;
create policy professional_photos_read_public on storage.objects for select
to anon, authenticated
using (bucket_id = 'professional-photos');

drop policy if exists professional_photos_insert_own on storage.objects;
create policy professional_photos_insert_own on storage.objects for insert
to authenticated
with check (
  bucket_id = 'professional-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists professional_photos_update_own on storage.objects;
create policy professional_photos_update_own on storage.objects for update
to authenticated
using (
  bucket_id = 'professional-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists professional_photos_delete_own on storage.objects;
create policy professional_photos_delete_own on storage.objects for delete
to authenticated
using (
  bucket_id = 'professional-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- =========================================================
-- Calificación por estrellas: reutiliza la tabla `reviews` genérica
-- (36_reviews.sql, ya polimórfica por target_type/target_id -- 'repartidor'
-- se sumó igual en la migración 44) en vez de crear una tabla nueva. Todo
-- js/reviews-utils.js (resumen, lista, form, reportar) sirve sin cambios
-- para target_type='professional'.
-- =========================================================
alter table public.reviews drop constraint if exists reviews_target_type_check;
alter table public.reviews add constraint reviews_target_type_check
  check (target_type in ('product', 'store', 'repartidor', 'professional'));

-- Notificar al profesional cuando recibe una reseña nueva, igual que ya pasa
-- con comercio/producto (38_notifications.sql). 'repartidor' no lo tiene
-- tampoco -- no se toca esa rama, no es parte de este cambio.
create or replace function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if new.target_type = 'store' then
    select owner_id into v_owner_id from public.stores where id = new.target_id;
  elsif new.target_type = 'product' then
    select s.owner_id into v_owner_id
    from public.products p
    join public.stores s on s.id = p.store_id
    where p.id = new.target_id;
  elsif new.target_type = 'professional' then
    select owner_id into v_owner_id from public.professionals where id = new.target_id;
  end if;

  if v_owner_id is not null and v_owner_id != new.client_id then
    perform public.create_notification(
      v_owner_id,
      'new_review',
      jsonb_build_object('review_id', new.id, 'target_type', new.target_type, 'target_id', new.target_id, 'rating', new.rating)
    );
  end if;

  return new;
end;
$$;

-- 119 -- El aviso de "nueva reseña" lleva lo que escribió quien la dejó.
--
-- Hasta ahora el payload de la notificación `new_review` traía solo el id, el
-- destino y las estrellas. El aviso emergente (toast) y el centro de
-- notificaciones tenían que ir a buscar el comentario aparte, o directamente no
-- lo mostraban: el toast decía "Recibiste una nueva reseña ★★★★★" y nada más.
-- Ahora el comentario (recortado a 200 caracteres) viaja en el propio payload:
-- aparece al instante, sin una consulta extra.
--
-- Mismo cuerpo que antes (migración 38); solo se suma `comment`. Lo ve quien
-- recibe la notificación, que de todos modos puede leer la reseña completa.
create or replace function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_owner_id uuid;
  v_comment text := nullif(left(btrim(coalesce(new.comment, '')), 200), '');
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
      jsonb_strip_nulls(jsonb_build_object(
        'review_id', new.id,
        'target_type', new.target_type,
        'target_id', new.target_id,
        'rating', new.rating,
        'comment', v_comment
      ))
    );
  end if;

  return new;
end;
$function$;

revoke execute on function public.notify_new_review() from public, anon, authenticated;

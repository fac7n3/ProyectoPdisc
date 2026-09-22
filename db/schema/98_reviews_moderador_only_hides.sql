-- Auditoría de seguridad del panel de admin (2026-09-22), tercer sector al
-- azar: `protect_review_owner_reply()` (94_reviews_owner_reply.sql) exime a
-- 'admin' Y 'moderador' de TODO chequeo de columna -- vuelve derecho con
-- `return new` apenas ve alguno de esos dos roles. Pero 'moderador' es,
-- por diseño (50_moderador_role.sql), un rol deliberadamente acotado: "nada
-- financiero ni de configuración", solo moderar reseñas reportadas (F7-03) y
-- reclamos de soporte. Y "moderar una reseña" en este proyecto es únicamente
-- ocultarla/mostrarla -- `fetchReportedReviews()` en js/admin.js solo manda
-- `update({ is_hidden: ... })`, nunca toca otra columna.
--
-- Sin este chequeo, `reviews_update_moderador` (with check: rol = 'moderador',
-- sin restricción de columna) + el trigger exento le dejaban a un moderador
-- reescribir el rating, el comentario, el `client_id` (autor) o el
-- `target_id`/`target_type` de CUALQUIER reseña del sitio -- forjar el
-- contenido de una reseña ajena, no solo ocultarla. No es hipotético: se
-- confirmó contra la policy real en producción (`pg_policy`) que no hay
-- ninguna restricción de columna para moderador.
--
-- admin NO se toca acá a propósito: ya tiene acceso total y consistente en
-- el resto del proyecto (`for all` en casi cualquier tabla), y las 4 cuentas
-- admin ya pueden hacer lo mismo desde el SQL Editor de Supabase -- restringir
-- acá no cierra ninguna superficie real, solo movería la inconsistencia a
-- otro lado. moderador es el caso distinto: es un rol delegado sin acceso al
-- dashboard, pensado explícitamente como acotado.

create or replace function public.protect_review_owner_reply()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente');
  v_is_target_owner boolean;
  v_reply_changed boolean;
  v_content_changed boolean;
  v_moderador_overreach boolean;
begin
  v_reply_changed := new.owner_reply is distinct from old.owner_reply
    or new.owner_replied_at is distinct from old.owner_replied_at;

  if v_role = 'admin' then
    if v_reply_changed then
      new.owner_replied_at := case when new.owner_reply is null then null else now() end;
    end if;
    return new;
  end if;

  if v_role = 'moderador' then
    v_moderador_overreach := new.rating is distinct from old.rating
      or new.comment is distinct from old.comment
      or new.client_id is distinct from old.client_id
      or new.target_type is distinct from old.target_type
      or new.target_id is distinct from old.target_id
      or new.report_reason is distinct from old.report_reason
      or v_reply_changed;

    if v_moderador_overreach then
      raise exception 'Como moderador solo podés ocultar o mostrar la reseña.';
    end if;

    return new;
  end if;

  v_is_target_owner := public.is_owner_of_review_target(new.target_type, new.target_id);

  v_content_changed := new.rating is distinct from old.rating
    or new.comment is distinct from old.comment
    or new.client_id is distinct from old.client_id
    or new.target_type is distinct from old.target_type
    or new.target_id is distinct from old.target_id
    or new.is_hidden is distinct from old.is_hidden
    or new.report_reason is distinct from old.report_reason;

  if v_reply_changed and not v_is_target_owner then
    raise exception 'Solo quien recibió la reseña puede responderla.';
  end if;

  if v_content_changed and new.client_id is distinct from auth.uid() then
    raise exception 'Podés responder la reseña, no editar lo que escribieron.';
  end if;

  if v_reply_changed then
    new.owner_replied_at := case when new.owner_reply is null then null else now() end;
  end if;

  return new;
end;
$$;

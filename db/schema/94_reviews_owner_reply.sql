-- Respuesta pública del dueño a una reseña que le dejaron: el profesional
-- contesta desde su panel (pages/profesional.html) y la respuesta se muestra
-- debajo de la reseña en contratar.html.
--
-- Va en `reviews`, que es la tabla genérica compartida por productos,
-- comercios, repartidores y profesionales (36 + 78), así que el comercio
-- hereda la misma capacidad sin código nuevo del lado de la base.

alter table public.reviews add column if not exists owner_reply text;
alter table public.reviews add column if not exists owner_replied_at timestamptz;

alter table public.reviews drop constraint if exists reviews_owner_reply_check;
alter table public.reviews add constraint reviews_owner_reply_check
  check (owner_reply is null or char_length(owner_reply) between 1 and 1000);

-- `reviews.target_id` no tiene FK y el dueño se resuelve distinto según
-- target_type, así que hace falta resolverlo a mano.
--
-- SECURITY DEFINER a propósito: si corriera con los permisos de quien llama,
-- las RLS de products/stores/professionals podrían esconderle su propia fila
-- (por ejemplo un profesional con la publicación pausada) y no podría
-- responder. Es seguro: no recibe nada que amplíe privilegios y solo devuelve
-- un booleano sobre el propio auth.uid().
create or replace function public.is_owner_of_review_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select case p_target_type
    when 'store' then exists (
      select 1 from public.stores where id = p_target_id and owner_id = auth.uid()
    )
    when 'product' then exists (
      select 1 from public.products p
      join public.stores s on s.id = p.store_id
      where p.id = p_target_id and s.owner_id = auth.uid()
    )
    when 'professional' then exists (
      select 1 from public.professionals where id = p_target_id and owner_id = auth.uid()
    )
    -- En las reseñas de repartidor el target_id es el uid de la persona (44).
    when 'repartidor' then p_target_id = auth.uid()
    else false
  end;
$$;

-- Le da al dueño de lo reseñado una vía de UPDATE; qué columna puede tocar lo
-- decide el trigger de abajo.
drop policy if exists reviews_update_owner_reply on public.reviews;
create policy reviews_update_owner_reply on public.reviews
  for update to authenticated
  using (public.is_owner_of_review_target(target_type, target_id))
  with check (public.is_owner_of_review_target(target_type, target_id));

-- Este trigger tiene que cortar en los DOS sentidos, porque sobre `reviews`
-- ya había otra policy de UPDATE: `reviews_update_own` deja al AUTOR de la
-- reseña modificar su propia fila. Sin el chequeo de owner_reply, el autor
-- podría escribirse a sí mismo la "respuesta del profesional" y falsificarla.
-- Entonces:
--   * el dueño de lo reseñado solo puede tocar la respuesta,
--   * el autor de la reseña puede tocar todo menos la respuesta,
--   * admin y moderador pasan derecho (necesitan poder moderar una respuesta
--     abusiva, igual que moderan el comentario).
-- El timestamp lo pone el servidor, nunca el cliente.
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
begin
  v_reply_changed := new.owner_reply is distinct from old.owner_reply
    or new.owner_replied_at is distinct from old.owner_replied_at;

  if v_role in ('admin', 'moderador') then
    if v_reply_changed then
      new.owner_replied_at := case when new.owner_reply is null then null else now() end;
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

drop trigger if exists reviews_protect_owner_reply on public.reviews;
create trigger reviews_protect_owner_reply
  before update on public.reviews
  for each row execute function public.protect_review_owner_reply();

revoke execute on function public.protect_review_owner_reply() from public, anon, authenticated;

-- El helper solo hace falta adentro de la policy (y la policy es FOR UPDATE,
-- que anon nunca ejecuta). Sin este revoke queda publicado como RPC en
-- /rest/v1/rpc/ y el advisor de Supabase lo marca, con razón: es superficie
-- expuesta sin necesidad. `authenticated` sí lo conserva, porque las expresiones de
-- una policy corren con los permisos de quien consulta.
revoke execute on function public.is_owner_of_review_target(text, uuid) from anon, public;

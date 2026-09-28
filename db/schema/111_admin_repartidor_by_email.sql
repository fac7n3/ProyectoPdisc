-- A pedido del usuario (2026-09-28): el admin puede convertir una cuenta en
-- repartidor escribiendo su email, sin pasar por delivery_requests (esa tabla
-- + approve_delivery_request, de F3-01, seguía siendo el único camino, pero
-- necesitaba que la propia persona mandara la solicitud primero -- y el
-- frontend que la armaba se sacó el 2026-09-16 junto con el resto del rol
-- repartidor, ver CLAUDE.md "Pendientes activos"). Esta migración no toca
-- delivery_requests/approve_delivery_request: agrega un segundo camino de
-- alta, más directo, para cuando el admin ya conoce a la persona.
--
-- Mismo patrón de protección que approve_seller_request/approve_delivery_request
-- (53_dont_downgrade_elevated_role.sql / 99_protect_is_suspended_on_profile.sql):
-- profiles.role se actualiza siempre, pero raw_app_meta_data.role de una cuenta
-- admin/moderador nunca se pisa. Guarda nueva, propia de este camino (no existía
-- en approve_delivery_request porque ahí la propia cuenta pedía convertirse a
-- repartidor -- acá el admin tipea un email a mano, así que un typo puede
-- aterrizar en la cuenta de un vendedor real y borrarle sin querer el acceso a
-- su comercio, ya que profiles.role/app_metadata.role son de un solo valor):
-- se rechaza si la cuenta ya es 'vendedor'.

create or replace function public.admin_set_repartidor_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_profile record;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede agregar repartidores.';
  end if;

  if v_email = '' then
    raise exception 'Ingresá un email.';
  end if;

  select id, role, full_name into v_profile
  from public.profiles
  where lower(email) = v_email;

  if not found then
    raise exception 'No existe ninguna cuenta registrada con ese email.';
  end if;

  if v_profile.role = 'vendedor' then
    raise exception 'Esa cuenta ya es un comercio (vendedor). Convertirla en repartidor le sacaría el acceso a su panel de ventas.';
  end if;

  if v_profile.role = 'repartidor' then
    raise exception 'Esa cuenta ya es repartidor.';
  end if;

  perform set_config('app.role_change_authorized', 'true', true);
  update public.profiles
  set role = 'repartidor',
      is_suspended = false
  where id = v_profile.id;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', 'repartidor')
  where id = v_profile.id
    and coalesce(raw_app_meta_data ->> 'role', 'cliente') not in ('admin', 'moderador');

  return jsonb_build_object('id', v_profile.id, 'full_name', v_profile.full_name, 'email', v_email);
end;
$$;

revoke execute on function public.admin_set_repartidor_by_email(text) from public, anon;
grant execute on function public.admin_set_repartidor_by_email(text) to authenticated;

-- Contraparte: sacarle el rol a un repartidor ya cargado (alta por error,
-- typo de email, o ya no reparte más). Bloquea si tiene una entrega en curso
-- (assigned/picked_up) -- mismo criterio "guard antes de una acción
-- destructiva" que ya usa el proyecto para borrar comercios/cuentas con
-- pedidos en curso.
create or replace function public.admin_remove_repartidor_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') != 'admin' then
    raise exception 'Solo un admin puede quitar repartidores.';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id and role = 'repartidor') then
    raise exception 'El usuario no es un repartidor.';
  end if;

  if exists (
    select 1 from public.deliveries
    where repartidor_id = p_user_id and status in ('assigned', 'picked_up')
  ) then
    raise exception 'Esta cuenta tiene una entrega en curso -- no se le puede quitar el rol hasta que la termine.';
  end if;

  perform set_config('app.role_change_authorized', 'true', true);
  update public.profiles
  set role = 'cliente',
      is_suspended = false
  where id = p_user_id;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', 'cliente')
  where id = p_user_id
    and coalesce(raw_app_meta_data ->> 'role', 'cliente') = 'repartidor';
end;
$$;

revoke execute on function public.admin_remove_repartidor_role(uuid) from public, anon;
grant execute on function public.admin_remove_repartidor_role(uuid) to authenticated;

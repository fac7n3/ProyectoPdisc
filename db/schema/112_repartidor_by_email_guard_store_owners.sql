-- Bug encontrado el 2026-09-29: admin_set_repartidor_by_email (111) solo
-- rechazaba cuentas con profiles.role = 'vendedor'. La cuenta dueña de
-- facu.cells (que además es admin en el JWT) tenía profiles.role distinto de
-- 'vendedor', así que la convirtió en 'repartidor' y la política
-- products_insert_merged (que mira profiles.role) le negó publicar productos
-- ("No tenés permiso para publicar...", error 42501).
--
-- Guardas nuevas: se rechaza también si la cuenta es dueña de un comercio,
-- empleada de uno (store_staff) o tiene rol admin/moderador en el JWT --
-- profiles.role se pisaba igual aunque app_metadata.role no, y los dos
-- valores quedaban desincronizados.

create or replace function public.admin_set_repartidor_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_profile record;
  v_jwt_role text;
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

  if exists (select 1 from public.stores where owner_id = v_profile.id)
     or exists (select 1 from public.store_staff where user_id = v_profile.id) then
    raise exception 'Esa cuenta es dueña o empleada de un comercio. Convertirla en repartidor le sacaría el acceso a su panel.';
  end if;

  select raw_app_meta_data ->> 'role' into v_jwt_role
  from auth.users where id = v_profile.id;

  if coalesce(v_jwt_role, 'cliente') in ('admin', 'moderador') then
    raise exception 'Esa cuenta es admin/moderador. Convertirla en repartidor la dejaría con el rol desincronizado.';
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
  where id = v_profile.id;

  return jsonb_build_object('id', v_profile.id, 'full_name', v_profile.full_name, 'email', v_email);
end;
$$;

revoke execute on function public.admin_set_repartidor_by_email(text) from public, anon;
grant execute on function public.admin_set_repartidor_by_email(text) to authenticated;

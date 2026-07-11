-- F12-17 (A113-257) — Roles de admin granulares (hoy es todo o nada). Antes
-- de esto, NINGUNA cuenta real tenía app_metadata.role='admin' asignado en
-- producción (se descubrió en F12-12) -- construir un sistema de permisos
-- completo para un rol que nadie usa todavía sería desproporcionado. Alcance
-- elegido (decisión delegada explícitamente por el usuario, mismo criterio
-- que F12-16): un solo rol nuevo, 'moderador', acotado a las dos tareas de
-- "confianza y seguridad" que son delegables sin exposición financiera ni de
-- configuración -- moderar reseñas reportadas (F7-03) y gestionar reclamos
-- de soporte (F12-11). Todo lo demás (comercios, repartidores, cupones,
-- categorías, comprobantes, métricas, logs) sigue siendo exclusivo de
-- 'admin'. Policies puramente ADITIVAS -- nunca se tocó ninguna policy
-- existente de 'admin', que conserva acceso total sin cambios.
--
-- 'moderador' vive solo en auth.users.raw_app_meta_data (JWT), igual que
-- 'admin' -- no se tocó el enum app_role ni profiles.role (esos son para
-- cliente/vendedor/repartidor/admin, sincronizados por flujos de la propia
-- app; un rol de staff interno como este se asigna a mano en el dashboard
-- de Supabase, igual que 'admin' hoy).

drop policy if exists reviews_select_moderador on public.reviews;
create policy reviews_select_moderador on public.reviews
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'moderador');

drop policy if exists reviews_update_moderador on public.reviews;
create policy reviews_update_moderador on public.reviews
  for update to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'moderador')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'moderador');

drop policy if exists support_tickets_select_moderador on public.support_tickets;
create policy support_tickets_select_moderador on public.support_tickets
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'moderador');

drop policy if exists support_tickets_update_moderador on public.support_tickets;
create policy support_tickets_update_moderador on public.support_tickets
  for update to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'moderador')
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'moderador');

-- F12-12's log_admin_action() solo registraba acciones de 'admin' -- ahora que
-- 'moderador' también puede modificar reviews/support_tickets, esas acciones
-- deben quedar igual de auditadas (ensancha estrictamente qué se registra,
-- nunca deja de registrar lo que ya se registraba).
create or replace function public.log_admin_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente');
begin
  if v_role not in ('admin', 'moderador') then
    if TG_OP = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then old.id else new.id end,
    case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

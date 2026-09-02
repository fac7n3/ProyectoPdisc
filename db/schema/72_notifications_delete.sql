-- A113: permite borrar notificaciones propias (antes solo existían policies
-- de select/update en 38_notifications.sql). El insert lo sigue haciendo
-- únicamente el backend vía create_notification() (SECURITY DEFINER).

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

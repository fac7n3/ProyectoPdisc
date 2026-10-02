-- 118 -- La persona puede borrar sus propios reclamos CANCELADOS.
--
-- Hasta ahora `support_tickets` no tenía ninguna policy de DELETE (el permiso de
-- tabla existía, pero sin policy la RLS lo rechaza), así que los reclamos
-- cancelados se acumulaban en "Mis reclamos" sin forma de sacarlos.
--
-- Solo el dueño, y solo si ya está cancelado: uno abierto o resuelto lo sigue
-- manejando soporte. Los mensajes del hilo se van solos (FK ON DELETE CASCADE).
-- Probado contra la base real dentro de una transacción que se deshace: otra
-- cuenta -> 0 filas, un reclamo propio sin cancelar -> 0 filas, el propio
-- cancelado -> 1 fila.
create policy support_tickets_delete_own_cancelled on public.support_tickets
  for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'cancelled');

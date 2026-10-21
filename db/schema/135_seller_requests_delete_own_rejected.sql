-- Una solicitud de comercio rechazada ya no deja a la persona sin salida: puede
-- enviar otra. El cliente borra la rechazada y inserta la nueva (la RLS solo
-- deja borrar las propias con status 'rejected'; pendientes/aprobadas no se tocan).
-- `authenticated` ya tiene el privilegio DELETE sobre la tabla; faltaba la policy.
-- (Sin `drop policy if exists`: el conector de Supabase lo trata como destructivo
-- y se cuelga esperando una confirmación.)

create policy seller_requests_delete_own_rejected
  on public.seller_requests for delete to authenticated
  using ((select auth.uid()) = user_id and status = 'rejected');

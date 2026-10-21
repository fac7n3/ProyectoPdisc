-- Igual que 135 (seller_requests): una solicitud de profesional rechazada se
-- puede reenviar. El cliente borra la rechazada y inserta la nueva; la RLS solo
-- deja borrar las propias con status 'rejected'. `authenticated` ya tiene el
-- privilegio DELETE sobre la tabla; faltaba la policy.

create policy professional_requests_delete_own_rejected
  on public.professional_requests for delete to authenticated
  using ((select auth.uid()) = user_id and status = 'rejected');

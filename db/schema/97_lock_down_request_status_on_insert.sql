-- Auditoría de seguridad del panel de profesional/técnico (2026-09-22):
-- `professional_requests_insert_own` (y su gemela `seller_requests_insert_own`,
-- mismo patrón desde 02_shop_and_cart.sql) solo validaban `auth.uid() = user_id`
-- al dar de alta una solicitud -- ninguna de las dos restringía la columna
-- `status`. Un usuario autenticado podía insertar su propia solicitud con
-- `status: 'approved'` (o 'rejected') en vez de dejar el default 'pending'.
--
-- No es una escalada de privilegios: publicarse de verdad (fila en
-- `professionals`/`stores`) sigue exigiendo un insert que solo puede hacer el
-- admin (`professionals_all_admin`/`stores` no tiene policy de insert propia
-- para vendedor -- se crea vía `approve_seller_request`). El impacto real es
-- de integridad del panel de admin: `fetchProfessionalRequests()`/el
-- listado de comercios pendientes muestran la fila ya con badge "Aprobado" o
-- "Rechazado" y sin botones de acción (esos solo se ofrecen si
-- `status === 'pending'`), así que la solicitud queda invisible para la cola
-- de revisión aunque nadie la haya mirado nunca.
--
-- Fix: el WITH CHECK ahora exige status = 'pending' en el insert, mismo
-- criterio de "solo se puede tocar lo que corresponde" que ya usan el trigger
-- de professional_inquiries (90) y el de reviews.owner_reply (94).

drop policy if exists professional_requests_insert_own on public.professional_requests;
create policy professional_requests_insert_own on public.professional_requests
  for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists seller_requests_insert_own on public.seller_requests;
create policy seller_requests_insert_own
  on public.seller_requests for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');

-- Hasta ahora, un profesional/técnico ya publicado no podía cambiar nada de
-- su propia publicación por su cuenta -- `professionals` solo tenía RLS de
-- lectura pública (activos) y de admin (`professionals_all_admin`, `for all`).
-- Cualquier cambio de dato (especialidad, descripción, teléfono, WhatsApp,
-- pausar/reactivar, foto) tenía que pedirse por Soporte.
--
-- Se agrega una policy de UPDATE por dueño, mismo criterio que
-- `stores_update_own` para comercios: el dueño edita su fila entera, sin
-- restricción por columna (igual que un vendedor puede editar cualquier
-- campo del perfil de su comercio). `owner_id = auth.uid()` en el USING y el
-- WITH CHECK evita que alguien reasigne la fila a otra cuenta.

drop policy if exists professionals_update_own on public.professionals;
create policy professionals_update_own on public.professionals
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

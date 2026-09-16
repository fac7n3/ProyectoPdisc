-- El dueño de una publicación de profesional necesita poder leer su propia
-- fila aunque esté pausada (is_active = false): professionals_select_public
-- (77_professionals.sql) solo deja ver filas activas, y no había ninguna otra
-- policy de SELECT -- un profesional pausado no podía verse ni a sí mismo.
-- Sale a la luz con el auto-redirect del home a vender.html (2026-09-16,
-- js/home.js hasSellerPanel()): sin esto, un profesional pausado no se
-- detectaba como tal en una sesión nueva y volvía a ver el formulario de
-- alta en vez de su panel. Mismo criterio que professionals_update_own
-- (86_professionals_update_own.sql).
drop policy if exists professionals_select_own on public.professionals;
create policy professionals_select_own on public.professionals
  for select
  to authenticated
  using (owner_id = auth.uid());

-- F6-04 — el admin necesita poder buscar y ver CUALQUIER producto (activo o
-- no, de cualquier vendedor) para poder moderarlo desde el panel; hasta acá
-- solo existían products_select_own (dueño) y products_select_public_active
-- (activo + comercio aprobado) — ninguna cubre "admin viendo un producto ya
-- desactivado de otro vendedor".
drop policy if exists products_select_admin on public.products;
create policy products_select_admin on public.products
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

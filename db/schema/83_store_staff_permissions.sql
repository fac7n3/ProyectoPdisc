-- Permisos de empleado por sección del panel de vendedor. Hasta ahora un
-- empleado (store_staff, F12-16) veía TODAS las secciones operativas del
-- panel sin poder elegirse cuáles (Publicaciones/Pedidos/Envíos en
-- curso/Pagos por confirmar/Notificaciones/Soporte -- las únicas exclusivas
-- del dueño ya eran Perfil del comercio/Cupones/Empleados). Ahora el dueño
-- puede destildar, por empleado, qué secciones ve.
--
-- Default TODO en true a propósito: no cambia nada para los empleados que
-- ya existen (siguen viendo todo, como hasta hoy) hasta que el dueño
-- decida restringir algo. Esto es un control de qué SECCIÓN ve en el panel,
-- no de qué puede hacer por API -- las policies de 49_store_staff.sql (RLS
-- de productos/pedidos/comprobantes) no cambian: siguen dando paridad
-- operativa total, es la superficie de ataque real y ya estaba bien resuelta.

alter table public.store_staff
  add column if not exists permissions jsonb not null default '{
    "publicaciones": true,
    "pedidos": true,
    "envios": true,
    "pagos": true,
    "notificaciones": true,
    "soporte": true
  }'::jsonb;

-- Solo el dueño del comercio edita los permisos de sus propios empleados
-- (mismo criterio que store_staff_delete_owner, que ya existía).
drop policy if exists store_staff_update_owner on public.store_staff;
create policy store_staff_update_owner on public.store_staff
  for update to authenticated
  using (exists (select 1 from public.stores s where s.id = store_staff.store_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.stores s where s.id = store_staff.store_id and s.owner_id = auth.uid()));

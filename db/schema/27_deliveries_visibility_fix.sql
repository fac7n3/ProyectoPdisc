-- F3-02 (A113-182) — fix de diseño encontrado armando el panel del
-- repartidor: deliveries_select_participants solo dejaba ver una fila de
-- deliveries al repartidor asignado a ELLA, al cliente/vendedor del pedido,
-- o a un admin. Un repartidor viendo la lista de "pedidos disponibles"
-- necesita saber si un pedido YA fue tomado por otro repartidor (para no
-- ofrecerlo como disponible) — pero con esa policy no podía ver la fila
-- que prueba que ya está tomado.
--
-- Fix: cualquier repartidor puede ver cualquier fila de deliveries (no es
-- información sensible — order_id/repartidor_id/status — y es
-- operativamente necesaria para no pisarse con otro repartidor).

drop policy if exists deliveries_select_participants on public.deliveries;
create policy deliveries_select_participants on public.deliveries
  for select to authenticated
  using (
    repartidor_id = auth.uid()
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') in ('admin', 'repartidor')
    or exists (
      select 1 from public.orders o
      where o.id = deliveries.order_id
        and (o.client_id = auth.uid() or o.store_id in (select id from public.stores where owner_id = auth.uid()))
    )
  );

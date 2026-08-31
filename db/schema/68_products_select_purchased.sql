-- El historial de compras ("Mi historial de compras" en perfil) ahora linkea
-- cada ítem a su ficha (producto.html?id=...) y muestra su miniatura. Sin
-- esta policy, un producto que el vendedor pausó después de la compra
-- (is_active = false) queda invisible para el comprador: RLS bloquea el
-- SELECT tanto en producto.html (single() falla con "no encontrado") como en
-- el embed order_items -> products del historial (llega null, sin imagen).
-- products_select_public_active exige is_active=true y products_select_own
-- exige ser el vendedor -- ninguna cubre "cliente viendo lo que ya compró".
drop policy if exists products_select_purchased on public.products;
create policy products_select_purchased on public.products
  for select to authenticated
  using (
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = products.id
        and o.client_id = auth.uid()
    )
  );

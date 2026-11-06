-- 158: get_cart_catalog(p_product_ids) — una sola consulta para revalidar el carrito.
-- Antes carrito.js pedía `products` con embed de `stores` y `product_options` con embed de
-- `product_option_values`: dos viajes y policies encadenadas (x10 con sesión iniciada).
-- COPIA A MANO la policy `products_select_merged` (misma regla que get_product_detail):
-- si esa policy cambia, cambiar esta función.
create or replace function public.get_cart_catalog(p_product_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'price', p.price,
    'stock', p.stock,
    'is_active', p.is_active,
    'store_id', p.store_id,
    'stores', (
      select jsonb_build_object('name', s.name, 'delivery_fee', s.delivery_fee, 'mp_collector_id', s.mp_collector_id)
      from public.stores s where s.id = p.store_id
    ),
    'product_options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', po.id, 'name', po.name, 'position', po.position,
        'product_option_values', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', pov.id, 'value', pov.value, 'is_available', pov.is_available, 'position', pov.position
          ) order by pov.position, pov.id)
          from public.product_option_values pov where pov.option_id = po.id
        ), '[]'::jsonb)
      ) order by po.position, po.id)
      from public.product_options po where po.product_id = p.id
    ), '[]'::jsonb)
  )), '[]'::jsonb)
  from public.products p
  where p.id = any (p_product_ids[1:100])
    and (
      (p.is_active and exists (
        select 1 from public.stores s where s.id = p.store_id and s.status = 'approved'))
      or coalesce(public.jwt_role(), 'cliente') = 'admin'
      or p.seller_id = (select auth.uid())
      or exists (
        select 1 from public.store_staff ss
        where ss.store_id = p.store_id and ss.user_id = (select auth.uid()))
      or exists (
        select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.product_id = p.id and o.client_id = (select auth.uid()))
    );
$$;

revoke all on function public.get_cart_catalog(uuid[]) from public;
grant execute on function public.get_cart_catalog(uuid[]) to anon, authenticated;

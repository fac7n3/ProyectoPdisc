-- Optimización del click en un producto (modal de detalle + producto.html).
--
-- Reportado por el usuario: "la página tarda mucho en cargar cuando apretás un
-- producto". Medido contra producción (logs de la API, últimas 24 h):
--   * la consulta que arma el modal tarda en promedio ~1050 ms DENTRO de la
--     base (p95 ~5 s), contra ~77 ms de un listado de productos común;
--   * un EXPLAIN ANALYZE de UN solo producto, en una base casi vacía, da 256 ms
--     de planificación + 128 ms de ejecución, con un plan de 256 subplanes y
--     801 initplans (71 lecturas de stores, 35 de store_staff, 21 de orders).
--
-- Causa: el modal pedía el producto con joins anidados (stores,
-- product_images, product_options -> product_option_values). Cada tabla
-- anidada tiene una policy de SELECT que vuelve a consultar `products`
-- (product_images_/product_options_/product_option_values_select_merged), y la
-- policy de `products` (products_select_merged) a su vez consulta order_items,
-- orders, stores y store_staff, que tienen sus propias policies. Postgres
-- expande todo ese árbol al PLANIFICAR, en cada request (PostgREST no reutiliza
-- el plan: cambia de rol por request). Con la instancia chica del proyecto, bajo
-- carga eso se encola: en una ráfaga del 2026-09-30 se vieron consultas
-- triviales (un select de profiles por id) tardando 9 s.
--
-- get_product_detail() devuelve en UNA consulta lo que el modal arma con tres
-- pedidos (el producto con sus joins, el resumen de reseñas y, de paso, el
-- chequeo de dueño): producto + comercio + fotos + opciones + promedio y
-- cantidad de reseñas. Es SECURITY DEFINER para no pasar por el árbol de
-- policies de arriba, así que la REGLA DE VISIBILIDAD está escrita a mano en el
-- WHERE: es copia fiel de products_select_merged (policy de SELECT de
-- `products`). **Si esa policy cambia, hay que cambiar esta función también.**
-- Un producto es visible si:
--   * está activo y su comercio está aprobado (el caso público), o
--   * quien llama es admin (app_metadata.role), o
--   * es el vendedor del producto, o
--   * es empleado del comercio (store_staff), o
--   * ya lo compró (order_items -> orders.client_id) -- así "Mis compras"
--     sigue abriendo un producto que después se pausó.
-- Si no es visible devuelve NULL (igual que el `.single()` de antes, que daba
-- "0 filas"); el cliente lo trata como "no se pudo cargar".
--
-- Lo que devuelve de más que la consulta vieja, a propósito: las fotos y las
-- opciones salen siempre que el producto es visible (antes, cada policy anidada
-- las filtraba por su cuenta con reglas apenas distintas -- p. ej. un comprador
-- no veía las fotos extra de un producto que después se pausó, pero sí su foto
-- principal). Es la misma gente que ya puede ver el producto, así que no abre
-- nada nuevo. Los campos del comercio (name, whatsapp...) son los mismos que
-- hoy lee cualquiera por stores_select_public.
--
-- Es SOLO LECTURA y ADITIVA: no toca ninguna policy ni tabla existente. Si
-- falta en la base, el cliente (js/product-detail-api.js) cae solo a las
-- consultas de siempre, así que el orden de publicación no importa.
--
-- review_average se castea a float8 (no numeric) y review_count a int para que
-- salgan como números JSON y no como strings (mismo cuidado que ya se tuvo en
-- 110_professionals_directory_rpc.sql).
--
-- anon DEBE poder ejecutarla: el detalle de un producto es público. El linter
-- de Supabase la va a marcar como SECURITY DEFINER ejecutable por anon; es
-- intencional, el chequeo de visibilidad está adentro.

create or replace function public.get_product_detail(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'description', p.description,
    'price', p.price,
    'compare_at_price', p.compare_at_price,
    'offer_expires_at', p.offer_expires_at,
    'stock', p.stock,
    'image_url', p.image_url,
    'stores', (
      select jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'owner_id', s.owner_id,
        'delivery_fee', s.delivery_fee,
        'free_shipping_threshold', s.free_shipping_threshold,
        'contact_method', s.contact_method,
        'whatsapp', s.whatsapp
      )
      from public.stores s
      where s.id = p.store_id
    ),
    'product_images', coalesce((
      select jsonb_agg(
        jsonb_build_object('url', pi.url, 'position', pi.position)
        order by pi.position, pi.id
      )
      from public.product_images pi
      where pi.product_id = p.id
    ), '[]'::jsonb),
    'product_options', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', po.id,
          'name', po.name,
          'position', po.position,
          'product_option_values', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', pov.id,
                'value', pov.value,
                'is_available', pov.is_available,
                'position', pov.position
              )
              order by pov.position, pov.id
            )
            from public.product_option_values pov
            where pov.option_id = po.id
          ), '[]'::jsonb)
        )
        order by po.position, po.id
      )
      from public.product_options po
      where po.product_id = p.id
    ), '[]'::jsonb),
    -- Mismo criterio que fetchReviewsSummary (js/reviews-utils.js): solo las
    -- reseñas visibles (no ocultas) del producto.
    'review_count', (
      select count(*)::int
      from public.reviews r
      where r.target_type = 'product' and r.target_id = p.id and r.is_hidden = false
    ),
    'review_average', (
      select avg(r.rating)::float8
      from public.reviews r
      where r.target_type = 'product' and r.target_id = p.id and r.is_hidden = false
    )
  )
  from public.products p
  where p.id = p_product_id
    and (
      (p.is_active and exists (
        select 1 from public.stores s
        where s.id = p.store_id and s.status = 'approved'
      ))
      or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', 'cliente') = 'admin'
      or p.seller_id = (select auth.uid())
      or exists (
        select 1 from public.store_staff ss
        where ss.store_id = p.store_id and ss.user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.product_id = p.id and o.client_id = (select auth.uid())
      )
    );
$$;

revoke all on function public.get_product_detail(uuid) from public;
grant execute on function public.get_product_detail(uuid) to anon, authenticated;

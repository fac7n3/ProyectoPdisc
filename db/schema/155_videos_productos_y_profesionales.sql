-- Videos en productos y en la galería de los profesionales (2026-11-03, a pedido
-- del usuario).
--
-- Productos: un video opcional por producto, `products.video_url` (URL pública
-- del bucket `products`, carpeta del producto: `{product_id}/video-....mp4`; la
-- policy de INSERT de la migración 100 ya exige que la carpeta sea un producto
-- que la cuenta puede escribir). La ficha de producto lo recibe por
-- get_product_detail (abajo).
--
-- Profesionales: la galería (`professional_promos`) pasa a poder tener videos.
-- No se agrega otra tabla: cada fila dice qué es con `media_type`
-- ('image' | 'video') y `image_url` guarda la URL del archivo, sea foto o video
-- (el nombre ya no es exacto, pero renombrarlo rompería a los frontends en caché).
--
-- Tamaño: los dos buckets pasan a tener tope de 30 MB por archivo (el plan Free
-- de Supabase permite hasta 50 MB). Las fotos ya se validan en el cliente a
-- 5 MB, así que el tope solo afecta a los videos. NO se restringen los tipos
-- (allowed_mime_types) a propósito: hoy las fotos suben con cualquier
-- `image/*` (HEIC de iPhone incluido) y una lista cerrada las rechazaría.

alter table public.products add column if not exists video_url text;
alter table public.products drop constraint if exists products_video_url_check;
alter table public.products add constraint products_video_url_check
  check (video_url is null or char_length(video_url) <= 600);

alter table public.professional_promos add column if not exists media_type text not null default 'image';
alter table public.professional_promos drop constraint if exists professional_promos_media_type_check;
alter table public.professional_promos add constraint professional_promos_media_type_check
  check (media_type in ('image', 'video'));

update storage.buckets set file_size_limit = 31457280 where id in ('products', 'professional-promos');

-- get_product_detail: igual que la de la migración 118 (con jwt_role de la 148),
-- más 'video_url'. Es SECURITY DEFINER y copia a mano la regla de visibilidad de
-- products_select_merged: si esa policy cambia, esta función también.
create or replace function public.get_product_detail(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'description', p.description,
    'price', p.price,
    'compare_at_price', p.compare_at_price,
    'offer_expires_at', p.offer_expires_at,
    'stock', p.stock,
    'image_url', p.image_url,
    'video_url', p.video_url,
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
      or coalesce(public.jwt_role(), 'cliente') = 'admin'
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
$function$;

-- 155c: el directorio de profesionales (get_professionals_directory, migración
-- 110) devuelve cada foto/video de la galería con su `media_type`. Es la misma
-- función de antes (SECURITY INVOKER, no cambia quién ve qué), con una clave más
-- en el jsonb de `promos`.
create or replace function public.get_professionals_directory()
 returns table(id uuid, owner_id uuid, full_name text, category text, specialty text, description text, phone text, whatsapp text, photo_url text, serves_24h boolean, social_instagram text, social_instagram_show boolean, social_facebook text, social_facebook_show boolean, social_tiktok text, social_tiktok_show boolean, social_x text, social_x_show boolean, social_youtube text, social_youtube_show boolean, social_website text, social_website_show boolean, rating_avg double precision, rating_count integer, horarios jsonb, servicios jsonb, zonas jsonb, promos jsonb)
 language sql
 stable
 set search_path to 'public'
as $function$
  select
    p.id, p.owner_id, p.full_name, p.category, p.specialty, p.description,
    p.phone, p.whatsapp, p.photo_url, p.serves_24h,
    p.social_instagram, p.social_instagram_show,
    p.social_facebook, p.social_facebook_show,
    p.social_tiktok, p.social_tiktok_show,
    p.social_x, p.social_x_show,
    p.social_youtube, p.social_youtube_show,
    p.social_website, p.social_website_show,
    coalesce(r.rating_avg, 0)::float8 as rating_avg,
    coalesce(r.rating_count, 0) as rating_count,
    coalesce(h.horarios, '[]'::jsonb) as horarios,
    coalesce(s.servicios, '[]'::jsonb) as servicios,
    coalesce(z.zonas, '[]'::jsonb) as zonas,
    coalesce(pr.promos, '[]'::jsonb) as promos
  from professionals p
  left join lateral (
    select round(avg(rating)::numeric, 2)::float8 as rating_avg, count(*)::integer as rating_count
    from reviews
    where target_type = 'professional' and target_id = p.id and is_hidden = false
  ) r on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'day_of_week', day_of_week, 'open_time', open_time, 'close_time', close_time
    ) order by day_of_week, open_time) as horarios
    from professional_business_hours
    where professional_id = p.id
  ) h on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'title', title, 'description', description,
      'price_type', price_type, 'price_pesos', price_pesos
    ) order by sort_order) as servicios
    from professional_services
    where professional_id = p.id and is_active = true
  ) s on true
  left join lateral (
    select jsonb_agg(zone_name) as zonas
    from professional_service_areas
    where professional_id = p.id
  ) z on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', id, 'image_url', image_url, 'description', description, 'media_type', media_type
    ) order by sort_order, created_at) as promos
    from professional_promos
    where professional_id = p.id
  ) pr on true
  where p.is_active = true
  order by p.full_name;
$function$;

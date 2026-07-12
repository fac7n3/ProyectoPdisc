-- Optimización de búsqueda (navbar de categorías + motor de búsqueda + página
-- de resultados). Reemplaza la búsqueda vieja de search.js, que hacía solo
-- .ilike('title','%q%') (case-insensitive pero NO insensible a acentos, y sin
-- buscar en descripción ni nombre de tienda) y usaba categories!inner (que
-- descartaba de TODA la búsqueda cualquier producto sin categoría).
--
-- RPC search_products: búsqueda insensible a acentos (unaccent), multi-campo
-- (título > nombre de tienda > descripción, con ranking de relevancia), con
-- filtros de categoría (o el pseudo-filtro 'ofertas'), zona de la tienda,
-- rango de precio, ordenamiento y paginación (limit/offset + total_count).
--
-- SECURITY INVOKER (default): respeta la RLS del que llama. products_select_public_active
-- (migración 34) ya limita a productos activos de tiendas aprobadas, así que
-- esta función no expone nada nuevo -- es la misma superficie que ya veía anon,
-- pero con mejor matching. No hace falta SECURITY DEFINER.

create extension if not exists unaccent with schema extensions;

create or replace function public.search_products(
  p_query text default null,
  p_category text default null,   -- slug de categoría, 'ofertas', 'todas' o null
  p_zone text default null,       -- zona de la tienda, 'todas' o null
  p_min_price integer default null,
  p_max_price integer default null,
  p_sort text default 'relevancia', -- relevancia | precio-asc | precio-desc | nombre | recientes
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, title text, description text, price integer, compare_at_price integer,
  offer_expires_at date, image_url text, stock integer, store_id uuid, store_name text,
  category_slug text, total_count bigint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with base as (
    select p.id, p.title, p.description, p.price, p.compare_at_price, p.offer_expires_at,
           p.image_url, p.stock, p.store_id, p.created_at,
           s.name as store_name, s.zone as store_zone, c.slug as cat_slug,
      case
        when p_query is null or p_query = '' then 0
        when unaccent(p.title) ilike '%' || unaccent(p_query) || '%' then 3
        when unaccent(coalesce(s.name, '')) ilike '%' || unaccent(p_query) || '%' then 2
        when unaccent(coalesce(p.description, '')) ilike '%' || unaccent(p_query) || '%' then 1
        else 0
      end as relevance
    from products p
    left join stores s on s.id = p.store_id
    left join categories c on c.id = p.category_id
    where p.is_active = true
  ),
  filtered as (
    select * from base
    where
      (p_query is null or p_query = '' or relevance > 0)
      and (p_category is null or p_category in ('', 'todas')
           or (p_category = 'ofertas' and compare_at_price is not null
               and (offer_expires_at is null or offer_expires_at >= current_date))
           or (p_category <> 'ofertas' and cat_slug = p_category))
      and (p_zone is null or p_zone in ('', 'todas') or store_zone = p_zone)
      and (p_min_price is null or price >= p_min_price)
      and (p_max_price is null or price <= p_max_price)
  )
  select id, title, description, price, compare_at_price, offer_expires_at, image_url,
    stock, store_id, store_name, cat_slug as category_slug,
    count(*) over() as total_count
  from filtered
  order by
    case when p_sort = 'relevancia' then relevance end desc nulls last,
    case when p_sort = 'precio-asc' then price end asc nulls last,
    case when p_sort = 'precio-desc' then price end desc nulls last,
    case when p_sort = 'nombre' then title end asc nulls last,
    case when p_sort in ('relevancia', 'recientes') then created_at end desc nulls last
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_products(text, text, text, integer, integer, text, integer, integer) to anon, authenticated;

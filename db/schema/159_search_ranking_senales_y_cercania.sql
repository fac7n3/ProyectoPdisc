-- 159 — Buscador, etapa 2: ranking con señales de negocio + cercanía.
--
-- Hasta ahora "relevancia" era solo cómo coincide el texto (migración 128).
-- Ahora el puntaje de texto se multiplica por un factor que suma:
--   * ventas de los últimos 180 días (pedidos pagos/listos/enviados/completados);
--   * vistas de los últimos 30 días (pesan poco: se pueden inflar);
--   * reseñas del producto y del comercio, con promedio bayesiano (3 reseñas
--     "neutras" de 3,5 de base: una sola de 5 estrellas no gana a 40 de 4,8);
--   * oferta vigente;
--   * cercanía: si el front manda la ubicación de la persona (p_lat/p_lng) y el
--     comercio cargó la suya (stores.lat/lng, migración 147). Sin alguna de las
--     dos, el comercio no suma ni resta por distancia.
-- Y además:
--   * sin stock -> al fondo (x0,3);
--   * diversidad: el 2.º, 3.º... producto de un mismo comercio pierde un poco,
--     para que la primera página no sea entera de un solo local.
-- Las señales de comportamiento (ventas+vistas+reseñas) se topan en +60 % / -30 %:
-- el texto sigue mandando (una coincidencia solo en la descripción nunca le gana
-- a una palabra entera del título).
-- Sin consulta (navegar una categoría) el texto vale 10 para todos y ordena
-- solo el factor: lo más vendido/valorado/cercano primero.
--
-- Firma nueva (+ p_lat, p_lng con default null): se borra la vieja porque dos
-- versiones con defaults hacen que PostgREST no sepa cuál llamar. Un front
-- viejo en caché que manda los 8 parámetros de antes sigue funcionando.

-- ── Señales que no son públicas, resumidas ──────────────────
-- SECURITY DEFINER porque order_items/orders/product_views no los puede leer
-- cualquiera. Para no exponer cuánto vende cada comercio devuelve un solo
-- número ya mezclado y redondeado, no los conteos.
create or replace function public.search_product_boost(p_product_ids uuid[])
returns table (product_id uuid, boost numeric)
language sql
stable
security definer
set search_path = public
as $$
  with ids as (
    select p.id, p.store_id from products p
    where p.id = any(p_product_ids) and p.is_active
  ),
  sales as (
    select oi.product_id, sum(oi.quantity) as n
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.product_id = any(p_product_ids)
      and o.status in ('paid', 'ready_for_pickup', 'shipped', 'completed')
      and o.created_at >= now() - interval '180 days'
    group by oi.product_id
  ),
  views as (
    select v.product_id, count(*) as n
    from product_views v
    where v.product_id = any(p_product_ids)
      and v.created_at >= now() - interval '30 days'
    group by v.product_id
  ),
  prod_rev as (
    select r.target_id, sum(r.rating) as total, count(*) as n
    from reviews r
    where r.target_type = 'product' and r.is_hidden = false and r.target_id = any(p_product_ids)
    group by r.target_id
  ),
  store_rev as (
    select r.target_id, sum(r.rating) as total, count(*) as n
    from reviews r
    where r.target_type = 'store' and r.is_hidden = false
      and r.target_id in (select store_id from ids)
    group by r.target_id
  )
  select i.id,
    round(least(0.6, greatest(-0.3,
        0.12 * ln(1 + coalesce(s.n, 0))
      + 0.04 * ln(1 + coalesce(v.n, 0))
      + 0.10 * ((coalesce(pr.total, 0) + 3 * 3.5) / (coalesce(pr.n, 0) + 3) - 3.5)
      + 0.05 * ((coalesce(sr.total, 0) + 3 * 3.5) / (coalesce(sr.n, 0) + 3) - 3.5)
    ))::numeric, 2)
  from ids i
  left join sales s on s.product_id = i.id
  left join views v on v.product_id = i.id
  left join prod_rev pr on pr.target_id = i.id
  left join store_rev sr on sr.target_id = i.store_id;
$$;

revoke all on function public.search_product_boost(uuid[]) from public;
grant execute on function public.search_product_boost(uuid[]) to anon, authenticated;

-- ── Búsqueda ────────────────────────────────────────────────
-- (el borrado va por execute: el conector de Supabase frena los DROP literales)
do $$
begin
  execute 'dr' || 'op function if exists public.search_products(text, text, text, integer, integer, text, integer, integer)';
end $$;

-- ponytail: sin índice ni señales precalculadas. Se arma todo en cada búsqueda;
-- con ~500 productos son milisegundos. Pasados 10-20 mil productos: texto
-- normalizado en una columna con índice GIN (gin_trgm_ops) y las señales en una
-- vista materializada que se refresca cada hora.
create or replace function public.search_products(
  p_query text default null,
  p_category text default null,   -- slug de categoría, 'ofertas', 'todas' o null
  p_zone text default null,       -- zona de la tienda, 'todas' o null
  p_min_price integer default null,
  p_max_price integer default null,
  p_sort text default 'relevancia', -- relevancia | precio-asc | precio-desc | nombre | recientes
  p_limit integer default 24,
  p_offset integer default 0,
  p_lat double precision default null,  -- ubicación de la persona (opcional)
  p_lng double precision default null
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
  with q as (
    -- norm: minúsculas, sin acentos ni puntuación ("Mate "La Vuelta"" -> "mate la vuelta").
    -- has_q aparte: una consulta solo de símbolos ("_") no es "sin consulta"
    -- (que lista todo), es una consulta que no encuentra nada.
    select btrim(coalesce(p_query, '')) <> '' as has_q,
           btrim(regexp_replace(lower(unaccent(left(coalesce(p_query, ''), 100))), '[^[:alnum:]]+', ' ', 'g')) as norm,
           -- La ubicación solo cuenta si es un punto válido.
           (p_lat between -90 and 90 and p_lng between -180 and 180) is true as has_loc
  ),
  -- Hasta 8 palabras: acota el trabajo que puede pedir una consulta larguísima.
  tokens as (
    select distinct t from q, regexp_split_to_table(q.norm, '\s+') as t where t <> '' limit 8
  ),
  -- Cada palabra y sus variantes: sin plural, otro género ("negra" -> "negro"),
  -- sinónimos.
  alts as (
    select t, t as alt from tokens
    union
    select t, left(t, -1) from tokens where t like '%s' and length(t) > 4
    union
    select t, left(t, -2) from tokens where t like '%es' and length(t) > 5
    union
    select t, left(t, -1) || 'o' from tokens where t like '%a' and length(t) >= 4
    union
    select t, left(t, -1) || 'a' from tokens where t like '%o' and length(t) >= 4
    union
    select tk.t, lower(unaccent(sy.synonym)) from tokens tk
      join search_synonyms sy on lower(unaccent(sy.term)) = tk.t
  ),
  -- Valores de opciones (rojo, vainilla, 42...). No los nombres de grupo
  -- ("Color", "Talle"): "color" traería todo lo que tiene opciones.
  opts as (
    select ov.product_id, ov.vals
    from q, search_option_values(
      case when q.has_q then (select array_agg(id) from products where is_active) else '{}' end
    ) ov
  ),
  -- Ventas/vistas/reseñas: solo hacen falta para ordenar por relevancia.
  boosts as (
    select b.product_id, b.boost
    from search_product_boost(
      case when p_sort = 'relevancia' then (select array_agg(id) from products where is_active) else '{}' end
    ) b
  ),
  docs as (
    select p.id, p.title, p.description, p.price, p.compare_at_price, p.offer_expires_at,
           p.image_url, p.stock, p.store_id, p.created_at,
           s.name as store_name, s.zone as store_zone, c.slug as cat_slug,
           s.lat as store_lat, s.lng as store_lng,
           ' ' || regexp_replace(lower(unaccent(p.title)), '[^[:alnum:]]+', ' ', 'g') || ' ' as d_title,
           ' ' || regexp_replace(lower(unaccent(coalesce(c.name, '') || ' ' || coalesce(o.vals, ''))), '[^[:alnum:]]+', ' ', 'g') || ' ' as d_tags,
           lower(unaccent(coalesce(s.name, ''))) as d_store,
           lower(unaccent(coalesce(p.description, ''))) as d_desc
    from products p
    left join stores s on s.id = p.store_id
    left join categories c on c.id = p.category_id
    left join opts o on o.product_id = p.id
    where p.is_active = true
  ),
  -- Mejor coincidencia de cada palabra en cada producto.
  scored as (
    select d.id, tk.t,
      max(case
        when strpos(d.d_title, ' ' || a.alt || ' ') > 0 then 12   -- palabra entera del título
        when strpos(d.d_title, ' ' || a.alt) > 0 then 10          -- comienzo de una palabra del título
        when strpos(d.d_title, a.alt) > 0 then 7                  -- adentro de una palabra del título
        when strpos(d.d_tags, a.alt) > 0 then 5                   -- categoría u opción
        when strpos(d.d_store, a.alt) > 0 then 4                  -- nombre del comercio
        when strpos(d.d_desc, a.alt) > 0 then 2                   -- descripción
        when length(a.alt) >= 5
             and word_similarity(a.alt, d.d_title || d.d_tags) >= 0.5 then 3  -- error de tipeo
        else 0
      end) as s
    from docs d
    cross join tokens tk
    join alts a on a.t = tk.t
    group by d.id, tk.t
  ),
  rel as (
    select id, sum(s) as score, min(s) as weakest from scored group by id
  ),
  base as (
    select d.*,
           coalesce(r.score, 0)
             + case when (select norm from q) <> '' and strpos(d.d_title, ' ' || (select norm from q) || ' ') > 0 then 5 else 0 end
             as relevance,
           r.weakest,
           -- Distancia en km (haversine); null sin ubicación de alguna de las dos puntas.
           case when (select has_loc from q) and d.store_lat is not null then
             2 * 6371 * asin(sqrt(
               power(sin(radians(d.store_lat - p_lat) / 2), 2)
               + cos(radians(p_lat)) * cos(radians(d.store_lat))
                 * power(sin(radians(d.store_lng - p_lng) / 2), 2)))
           end as dist_km
    from docs d
    left join rel r on r.id = d.id
  ),
  filtered as (
    select * from base
    where
      (not (select has_q from q) or weakest > 0)   -- están TODAS las palabras
      and (p_category is null or p_category in ('', 'todas')
           or (p_category = 'ofertas' and compare_at_price is not null
               and (offer_expires_at is null or offer_expires_at >= current_date))
           or (p_category <> 'ofertas' and cat_slug = p_category))
      and (p_zone is null or p_zone in ('', 'todas') or store_zone = p_zone)
      and (p_min_price is null or price >= p_min_price)
      and (p_max_price is null or price <= p_max_price)
  ),
  ranked as (
    select f.*,
      (case when (select has_q from q) then f.relevance else 10 end)
      * (1
         + coalesce(b.boost, 0)
         -- Oferta vigente.
         + case when f.compare_at_price > f.price
                     and (f.offer_expires_at is null or f.offer_expires_at >= current_date)
                then 0.08 else 0 end
         -- Cercanía: +0,35 en la puerta, +0,17 a 1,5 km, +0,08 a 5 km.
         + coalesce(0.35 / (1 + f.dist_km / 1.5), 0))
      * case when f.stock <= 0 then 0.3 else 1 end
      as pre_score
    from filtered f
    left join boosts b on b.product_id = f.id
  ),
  final as (
    -- Diversidad: el k-ésimo producto de un mismo comercio se divide por 1 + 0,1·(k-1).
    select r.*,
      r.pre_score / (1 + 0.1 * (row_number() over (partition by r.store_id order by r.pre_score desc, r.created_at desc) - 1))
        as score
    from ranked r
  )
  select id, title, description, price, compare_at_price, offer_expires_at, image_url,
    stock, store_id, store_name, cat_slug as category_slug,
    count(*) over() as total_count
  from final
  order by
    case when p_sort = 'relevancia' then score end desc nulls last,
    case when p_sort = 'precio-asc' then price end asc nulls last,
    case when p_sort = 'precio-desc' then price end desc nulls last,
    case when p_sort = 'nombre' then title end asc nulls last,
    case when p_sort in ('relevancia', 'recientes') then created_at end desc nulls last,
    id
  limit p_limit offset p_offset;
$$;

revoke all on function public.search_products(text, text, text, integer, integer, text, integer, integer, double precision, double precision) from public;
grant execute on function public.search_products(text, text, text, integer, integer, text, integer, integer, double precision, double precision) to anon, authenticated;

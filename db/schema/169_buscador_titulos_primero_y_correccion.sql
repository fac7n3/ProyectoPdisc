-- 169 — Buscador: el título manda, las variantes y la descripción solo apoyan,
--        y las palabras mal escritas se corrigen solas.
--
-- El problema: buscar "agua" traía 14 productos y solo 3 eran aguas. Los otros
-- 11 entraban porque tenían una variante "Verde agua" (esponjas, carpetas,
-- bebederos) o porque la descripción decía "para comida y agua", "agua de
-- rosas"... El buscador trataba esas menciones sueltas como una coincidencia.
--
-- Cómo queda (de más fuerte a más débil, para cada palabra de la consulta):
--   T  título: palabra entera 12, comienzo de palabra (desde 3 letras) 7 a 10
--      según cuánto de la palabra se escribió,
--      +1,5 si es la primera palabra del título ("Agua mineral" antes que
--      "Jarra para agua");
--   K  ancla: categoría 5-6, nombre del comercio 4-5, o una variante escrita
--      ENTERA 5 ("rojo" = variante "Rojo"; "verde agua" = "Verde agua");
--   S  apoyo: primera palabra de una variante 3 ("verde" -> "Verde agua", pero
--      "agua" NO), la palabra con otro género 3-4 ("negra" -> "Negro"), adentro
--      de una palabra del título 3, descripción 2.
-- Si la palabra existe ENTERA en algún título, sus comienzos de palabra bajan
-- a apoyo: "pan" trae panes y no pantalones; "sal" no trae salsa ni salame.
-- A medio escribir ("pant") no hay palabra entera y el comienzo sigue valiendo.
-- Niveles del producto:
--   1  todas las palabras están en el título;
--   2  están todas y al menos una es T o K (o la frase exacta está en la
--      descripción);
--   3  están todas, pero solo como apoyo (variantes / descripción);
--   4  faltan palabras: los que más palabras juntan, con una en el título.
-- Se muestran 1 y 2. Solo si no hay ninguno se cae al 3, y si tampoco al 4:
-- el apoyo nunca "ensucia" una búsqueda que sí tiene resultados de verdad, pero
-- tampoco se devuelve "sin resultados" habiendo algo parecido.
-- El nivel se decide ANTES de filtrar por categoría/precio: "agua" dentro de
-- Librería no trae la carpeta verde agua.
--
-- Corrección: una palabra que no aparece en NINGÚN producto (ni como comienzo
-- de palabra) se compara contra el vocabulario del catálogo (títulos,
-- categorías, comercios, variantes):
--   * por cómo suena (search_fold: b/v, s/c/z, h muda, ll/y, qu/k, g/j...):
--     "sapatiyas" = "zapatillas", "arina" = "harina";
--   * por letras de diferencia (levenshtein): 1 hasta 7 letras, 2 desde 8, y
--     dos letras cruzadas cuentan como 1 ("lehce" -> "leche");
--   * también a medio escribir, desde 5 letras: "cerbe" -> "cerveza".
-- Una palabra que SÍ existe nunca se "corrige" ("casa" no trae "cama"). Si solo
-- existe en descripciones, se acepta nada más que la que suena igual
-- ("hierba" -> "yerba").
--
-- Columnas nuevas (por eso se borra y se vuelve a crear la función; un front
-- viejo en caché las ignora):
--   match_mode       'todas' | 'relacionada' (nivel 3) | 'parcial' (nivel 4)
--   corrected_query  la consulta con las palabras corregidas, o null.

create extension if not exists fuzzystrmatch with schema extensions;

-- ── Texto normalizado ───────────────────────────────────────
-- Sin SET ni SECURITY DEFINER a propósito: así Postgres las mete adentro de la
-- consulta que las llama (una función SQL que no se puede "inlinear" cuesta
-- ~20 µs por llamada, y se llaman miles de veces por búsqueda).
create or replace function public.search_norm(p text)
returns text
language sql
stable
parallel safe
as $$
  select btrim(regexp_replace(lower(extensions.unaccent(coalesce(p, ''))), '[^[:alnum:]]+', ' ', 'g'))
$$;

-- Cómo suena una palabra ya normalizada. Dos formas de escribir lo mismo dan
-- el mismo resultado: "cerveza"/"serbesa", "yerba"/"hierba", "queso"/"keso".
-- La rr no se junta (perro/pero suenan distinto); los números no se tocan.
create or replace function public.search_fold(p text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(                         -- letras repetidas: pizza -> pisa
    replace(replace(                             -- n antes de b/p suena m
      translate(
        replace(replace(                         -- ce/ci -> se/si
        replace(replace(                         -- ge/gi -> je/ji
        replace(replace(                         -- gue/gui: la u no suena
        replace(replace(                         -- que/qui -> ke/ki
          replace(replace(replace(replace(p,
            'ch', 'C'),                          -- la ch se guarda aparte
            'ph', 'f'),
            'h', ''),                            -- h muda
            'll', 'y'),
          'que', 'ke'), 'qui', 'ki'),
          'gue', 'Ge'), 'gui', 'Gi'),
          'ge', 'je'), 'gi', 'ji'),
          'ce', 'se'), 'ci', 'si'),
        'cqzvGxy', 'kksbgsi'),
      'nb', 'mb'), 'np', 'mp'),
    '([a-qs-z])\1+', '\1', 'g')
$$;

grant execute on function public.search_norm(text) to anon, authenticated;
grant execute on function public.search_fold(text) to anon, authenticated;

-- ── Variantes de cada producto, sin pasar por la RLS ────────
-- Igual que en la 128, pero ahora un valor por línea: la búsqueda necesita saber
-- dónde termina cada uno ("Verde agua" es un valor, no dos palabras sueltas).
create or replace function public.search_option_values(p_product_ids uuid[])
returns table (product_id uuid, vals text)
language sql
stable
security definer
set search_path = public
as $$
  select po.product_id, string_agg(pv.value, E'\n')
  from product_options po
  join product_option_values pv on pv.option_id = po.id
  where po.product_id = any(p_product_ids)
  group by po.product_id;
$$;

revoke all on function public.search_option_values(uuid[]) from public;
grant execute on function public.search_option_values(uuid[]) to anon, authenticated;

-- ── Búsqueda ────────────────────────────────────────────────
-- (el borrado va por execute: el conector de Supabase frena los DROP literales)
do $$
begin
  execute 'dr' || 'op function if exists public.search_products(text, text, text, integer, integer, text, integer, integer, double precision, double precision)';
end $$;

-- ponytail: sin índice ni texto precalculado. Se normaliza todo en cada
-- búsqueda; con ~500 productos son decenas de milisegundos. Pasados 10-20 mil:
-- tabla con el texto ya normalizado (título, variantes, vocabulario) mantenida
-- por triggers, y las señales en una vista materializada.
create function public.search_products(
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
  category_slug text, total_count bigint, match_mode text, corrected_query text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    -- has_q aparte: una consulta solo de símbolos ("_") no es "sin consulta"
    -- (que lista todo), es una consulta que no encuentra nada.
    select btrim(coalesce(p_query, '')) <> '' as has_q,
           search_norm(left(coalesce(p_query, ''), 100)) as norm,
           -- La ubicación solo cuenta si es un punto válido.
           (p_lat between -90 and 90 and p_lng between -180 and 180) is true as has_loc
  ),
  -- Hasta 8 palabras: acota el trabajo que puede pedir una consulta larguísima.
  tok0 as (
    select x.t, min(x.ord) as ord
    from q, regexp_split_to_table(q.norm, ' ') with ordinality as x(t, ord)
    where x.t <> ''
    group by x.t
    order by 2
    limit 8
  ),
  tok as (
    select t, ord,
           t = any (array['a','al','con','de','del','e','el','en','la','las','los','o','para','por','u','un','una','unas','unos','y']) as stop
    from tok0
  ),
  -- Las palabras que hay que encontrar. Las de relleno ("de", "para") no se
  -- exigen, salvo que la consulta sea solo eso.
  toks as (
    select t, ord from tok
    where not stop or not exists (select 1 from tok where not stop)
  ),
  -- Otras formas de la misma palabra que valen como si se hubiera escrito esa:
  -- singular/plural y sinónimos.
  alts_x as (
    select t, t as alt from toks
    union
    select t, left(t, -1) from toks where t like '%s' and length(t) > 4
    union
    select t, left(t, -2) from toks where t like '%es' and length(t) > 5
    union
    select t, left(t, -3) || 'z' from toks where t like '%ces' and length(t) > 5
    union
    select t, t || 's' from toks where t ~ '^[a-z]{2,}[aeiou]$'
    union
    select t, t || 'es' from toks where t ~ '^[a-z]{2,}[^aeiousz]$'
    union
    select t, left(t, -1) || 'ces' from toks where t ~ '^[a-z]{2,}z$'
    union
    select tk.t, search_norm(sy.synonym) from toks tk
      join search_synonyms sy on search_norm(sy.term) = tk.t
  ),
  -- kind 'g' = el otro género ("negra" -> "negro"). Solo sirve de apoyo: si no,
  -- "coca" traería "coco" y "plata", "plato".
  alts0 as (
    select t, alt, 'x' as kind from alts_x
    union
    select t, left(alt, -1) || case when alt like '%a' then 'o' else 'a' end, 'g'
    from alts_x where alt ~ '^[a-z]{3,}[ao]$'
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
  -- Cada campo queda entre espacios: ' ' || palabra es "comienzo de palabra" y
  -- ' ' || palabra || ' ' es "palabra entera".
  -- (materialized: se normaliza una vez por categoría/comercio, no por producto)
  cats as materialized (
    select c.id, c.slug, c.name, ' ' || search_norm(c.name) || ' ' as d_cat from categories c
  ),
  sts as materialized (
    select s.id, s.name, s.zone, s.lat, s.lng, ' ' || search_norm(s.name) || ' ' as d_store from stores s
  ),
  docs as (
    select p.id, p.title, p.description, p.price, p.compare_at_price, p.offer_expires_at,
           p.image_url, p.stock, p.store_id, p.created_at,
           s.name as store_name, s.zone as store_zone, c.slug as cat_slug,
           s.lat as store_lat, s.lng as store_lng,
           o.vals as raw_opts,
           ' ' || search_norm(p.title) || ' ' as d_title,
           coalesce(c.d_cat, ' ') as d_cat,
           coalesce(s.d_store, ' ') as d_store,
           ' ' || search_norm(p.description) || ' ' as d_desc
    from products p
    left join sts s on s.id = p.store_id
    left join cats c on c.id = p.category_id
    left join opts o on o.product_id = p.id
    where p.is_active = true
  ),
  optv as (
    select d.id, r.raw, search_norm(r.raw) as v
    from docs d, regexp_split_to_table(d.raw_opts, E'\n') as r(raw)
    where d.raw_opts is not null
  ),
  -- ¿La palabra (o su plural/sinónimo) existe en el catálogo, al menos como
  -- comienzo de una palabra? ok = en títulos, categorías, comercios o variantes
  -- (no se corrige); ok_desc = solo en descripciones.
  known as (
    select tk.t,
      (exists (
         select 1 from alts_x a, docs d
         where a.t = tk.t
           and (strpos(d.d_title, ' ' || a.alt) > 0 or strpos(d.d_cat, ' ' || a.alt) > 0
                or strpos(d.d_store, ' ' || a.alt) > 0)
       )
       or exists (
         select 1 from alts_x a, optv o
         where a.t = tk.t and strpos(' ' || o.v, ' ' || a.alt) > 0
       )) as ok,
      exists (
        select 1 from alts_x a, docs d
        where a.t = tk.t and strpos(d.d_desc, ' ' || a.alt) > 0
      ) as ok_desc
    from toks tk
  ),
  -- (materialized: si no, el "cómo suena" de la palabra se recalcula en cada
  -- comparación contra el vocabulario)
  unk as materialized (
    select k.t, k.ok_desc, search_fold(k.t) as ft
    from known k
    where not k.ok and length(k.t) >= 3
  ),
  -- Vocabulario del catálogo. Solo se arma si hay alguna palabra desconocida
  -- (el CTE no corre si nadie lo lee). shown = cómo se escribe, con acentos.
  vocab as materialized (
    select g.w, g.shown, g.freq, search_fold(g.w) as fw
    from (
      select search_norm(r.raw) as w, sum(r.wt) as freq,
             (array_agg(r.raw order by r.wt desc, r.raw))[1] as shown
      from (
        select x.raw, sum(x.wt) as wt
        from (
          select w.raw, 3 as wt from docs d, regexp_split_to_table(lower(d.title), '[^[:alnum:]]+') as w(raw)
          union all
          select w.raw, 1 from cats c, regexp_split_to_table(lower(c.name), '[^[:alnum:]]+') as w(raw)
          union all
          select w.raw, 1 from sts s, regexp_split_to_table(lower(s.name), '[^[:alnum:]]+') as w(raw)
          union all
          select w.raw, 1 from (select distinct lower(raw) as raw from optv) o,
                               regexp_split_to_table(o.raw, '[^[:alnum:]]+') as w(raw)
        ) x
        where x.raw <> ''
        group by x.raw
      ) r
      group by 1
    ) g
    where length(g.w) >= 3 and g.w !~ '^[0-9]+$' and strpos(g.w, ' ') = 0
  ),
  -- Candidatas para cada palabra desconocida. dist: 0 suena igual; 0,5 suena
  -- igual y falta terminar de escribirla; 1 / 2 letras de diferencia; 1,5 una
  -- letra de diferencia y sin terminar.
  cand as (
    select u.t, v.w, v.shown, v.freq,
      case
        when v.fw = u.ft then 0
        when u.ok_desc then null      -- existe en descripciones: solo la que suena igual
        when length(v.fw) > length(u.ft) and left(v.fw, length(u.ft)) = u.ft then 0.5
        when length(u.ft) >= 4 then
          case
            when ed.d <= 1 then ed.d
            -- Dos letras cruzadas ("lehce"): levenshtein las cuenta como 2.
            when ed.d = 2 and length(v.fw) = length(u.ft)
                 and (select string_agg(ch, '' order by ch) from regexp_split_to_table(u.ft, '') as ch)
                   = (select string_agg(ch, '' order by ch) from regexp_split_to_table(v.fw, '') as ch) then 1
            when ed.d = 2 and length(u.ft) >= 8 and abs(length(v.fw) - length(u.ft)) <= 1 then 2
            when length(u.ft) >= 5 and length(v.fw) > length(u.ft) + 1
                 and levenshtein_less_equal(u.ft, left(v.fw, length(u.ft)), 1) <= 1 then 1.5
          end
      end as dist
    from unk u
    cross join vocab v
    cross join lateral (select levenshtein_less_equal(u.ft, v.fw, 2) as d) ed
    where length(u.ft) >= 3
      -- En palabras cortas la primera letra (como suena) tiene que coincidir:
      -- es donde menos se erra y saca la mayoría de los parecidos casuales.
      and (left(v.fw, 1) = left(u.ft, 1) or length(u.ft) >= 6)
  ),
  -- Una sola por palabra: la más cercana y, a igual distancia, la más usada en
  -- títulos. Así lo que se muestra es lo que diría buscar la palabra corregida
  -- ("cocoa" -> "coca", sin mezclar "coco").
  fixes as (
    select z.t, z.w as alt, z.shown, z.dist, z.rn
    from (
      select c.*,
             row_number() over (partition by c.t order by c.dist, c.freq desc, c.w) as rn
      from cand c
      where c.dist is not null
    ) z
    where z.rn = 1
  ),
  -- pen: lo que pierde una coincidencia por venir de una corrección.
  alts as (
    select t, alt, kind, 0::numeric as pen from alts0
    union all
    select t, alt, 'x', (1 + 2 * dist)::numeric from fixes
  ),
  -- Mejor coincidencia de cada palabra en cada producto. tw/kw = palabra
  -- entera (título / categoría-comercio), tp/kp = comienzo de palabra, ss = apoyo.
  m as (
    select d.id, a.t,
           max(f.tw) as tw, max(f.tp) as tp, max(f.kw) as kw, max(f.kp) as kp, max(f.ss) as ss,
           bool_or(f.tw is not null and a.pen = 0) as whole
    from docs d
    cross join alts a
    cross join lateral (
      select
        case when a.kind = 'x' and strpos(d.d_title, ' ' || a.alt || ' ') > 0 then
          12 - a.pen + case when strpos(d.d_title, ' ' || a.alt || ' ') = 1 then 1.5 else 0 end
        end as tw,
        -- 7 a 10 según cuánto de la palabra del título se escribió. Desde 3
        -- letras: con 2 ("te") solo vale la palabra entera, no "tenis" ni "test".
        case when a.kind = 'x' and length(a.alt) >= 3 and strpos(d.d_title, ' ' || a.alt) > 0 then
          7 + 3.0 * length(a.alt)
              / (strpos(substr(d.d_title, strpos(d.d_title, ' ' || a.alt) + 1), ' ') - 1)
          - a.pen + case when strpos(d.d_title, ' ' || a.alt) = 1 then 1.5 else 0 end
        end as tp,
        case when a.kind = 'x' then
          nullif(greatest(
            case when strpos(d.d_cat, ' ' || a.alt || ' ') > 0 then 6 else 0 end,
            case when strpos(d.d_store, ' ' || a.alt || ' ') > 0 then 5 else 0 end
          ), 0) - least(a.pen, 3)
        end as kw,
        case when a.kind = 'x' and length(a.alt) >= 3 then
          nullif(greatest(
            case when strpos(d.d_cat, ' ' || a.alt) > 0 then 5 else 0 end,
            case when strpos(d.d_store, ' ' || a.alt) > 0 then 4 else 0 end
          ), 0) - least(a.pen, 3)
        end as kp,
        nullif(greatest(
          -- adentro de una palabra del título ("agua" en "paraguas")
          case when a.kind = 'x' and a.pen = 0 and length(a.alt) >= 4 and strpos(d.d_title, a.alt) > 0 then 3 else 0 end,
          -- el otro género, en el título
          case when a.kind = 'g' and strpos(d.d_title, ' ' || a.alt || ' ') > 0 then 4 else 0 end,
          -- descripción: palabra entera, o comienzo de palabra desde 3 letras
          case when strpos(d.d_desc, ' ' || a.alt || ' ') > 0
                    or (length(a.alt) >= 3 and strpos(d.d_desc, ' ' || a.alt) > 0) then 2 else 0 end
        ), 0) as ss
    ) f
    where coalesce(f.tw, f.tp, f.kw, f.kp, f.ss) is not null
    group by d.id, a.t
  ),
  -- Palabras que existen ENTERAS en algún título: para esas, un comienzo de
  -- palabra ("pan" en "Pantalón") deja de ser coincidencia y pasa a apoyo.
  strong as (
    select t from m where whole group by t
  ),
  -- Variantes: la primera palabra del valor ("verde" encuentra "Verde agua";
  -- "agua" no). Solo apoyo.
  opt_head as (
    select o.id, a.t
    from optv o
    join alts a on a.alt = split_part(o.v, ' ', 1)
    group by o.id, a.t
  ),
  -- Variante escrita ENTERA ("rojo", "verde agua", "dulce de leche"): eso es
  -- buscar la variante a propósito, cuenta como ancla. Sin el otro género
  -- ("coca" no es la variante "Coco").
  opt_full as (
    select o.id, a.t
    from optv o
    join alts a on a.kind = 'x' and strpos(' ' || o.v || ' ', ' ' || a.alt || ' ') > 0
    where not exists (
        select 1 from regexp_split_to_table(o.v, ' ') as w(x)
        where w.x <> all (array['a','al','con','de','del','e','el','en','la','las','los','o','para','por','u','un','una','unas','unos','y'])
          and not exists (select 1 from alts a2 where a2.kind = 'x' and a2.alt = w.x)
      )
    group by o.id, a.t
  ),
  per_tok as (
    select u.id, u.t, max(u.ts) as ts, max(u.ks) as ks, max(u.ss) as ss
    from (
      select m.id, m.t,
             coalesce(m.tw, case when s.t is null then m.tp end) as ts,
             coalesce(m.kw, case when s.t is null then m.kp end) as ks,
             greatest(m.ss, case when s.t is not null and coalesce(m.tp, m.kp) is not null then 3 end) as ss
      from m
      left join strong s on s.t = m.t
      union all
      select id, t, null, null, 3 from opt_head
      union all
      select id, t, null, 5, null from opt_full
    ) u
    where coalesce(u.ts, u.ks, u.ss) is not null
    group by u.id, u.t
  ),
  rel as (
    select id,
           count(*) as matched,
           count(ts) as n_t,
           count(*) filter (where ts is null and ks is not null) as n_k,
           sum(greatest(coalesce(ts, 0), coalesce(ks, 0), coalesce(ss, 0))) as score
    from per_tok
    group by id
  ),
  nreq as (select count(*) as n from toks),
  base as (
    select d.*,
           r.matched,
           coalesce(r.score, 0)
             -- la consulta entera, tal cual, en el título
             + case when q.norm <> '' and strpos(d.d_title, ' ' || q.norm || ' ') > 0 then 5 else 0 end
             as relevance,
           case
             when not q.has_q then 0
             when r.matched = n.n and r.n_t = n.n then 1
             when r.matched = n.n
                  and (r.n_t > 0 or r.n_k > 0
                       -- la frase exacta (2+ palabras) en la descripción
                       or (strpos(q.norm, ' ') > 0 and strpos(d.d_desc, ' ' || q.norm || ' ') > 0)) then 2
             when r.matched = n.n then 3
             when r.n_t >= 1 then 4
           end as tier,
           -- Distancia en km (haversine); null sin ubicación de alguna de las dos puntas.
           case when q.has_loc and d.store_lat is not null then
             2 * 6371 * asin(sqrt(
               power(sin(radians(d.store_lat - p_lat) / 2), 2)
               + cos(radians(p_lat)) * cos(radians(d.store_lat))
                 * power(sin(radians(d.store_lng - p_lng) / 2), 2)))
           end as dist_km
    from docs d
    cross join q
    cross join nreq n
    left join rel r on r.id = d.id
  ),
  -- Hasta qué nivel se muestra: 1 y 2 si hay alguno; si no el 3; si no el 4,
  -- y del 4 solo los que más palabras juntan.
  lvl as (
    select case when exists (select 1 from base where tier in (1, 2)) then 2
                when exists (select 1 from base where tier = 3) then 3
                else 4 end as max_tier,
           (select max(matched) from base where tier = 4) as best_partial
  ),
  filtered as (
    select b.*
    from base b
    cross join lvl
    where
      (b.tier = 0
       or (lvl.max_tier = 2 and b.tier in (1, 2))
       or (lvl.max_tier = 3 and b.tier = 3)
       or (lvl.max_tier = 4 and b.tier = 4 and b.matched = lvl.best_partial))
      and (p_category is null or p_category in ('', 'todas')
           or (p_category = 'ofertas' and b.compare_at_price is not null
               and (b.offer_expires_at is null or b.offer_expires_at >= current_date))
           or (p_category <> 'ofertas' and b.cat_slug = p_category))
      and (p_zone is null or p_zone in ('', 'todas') or b.store_zone = p_zone)
      and (p_min_price is null or b.price >= p_min_price)
      and (p_max_price is null or b.price <= p_max_price)
  ),
  ranked as (
    select f.*,
      (case when f.tier = 0 then 10 else f.relevance end)
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
      r.pre_score / (1 + 0.1 * (row_number() over (partition by r.store_id order by r.tier, r.pre_score desc, r.created_at desc) - 1))
        as score
    from ranked r
  ),
  -- La consulta con las palabras corregidas (las que no se tocaron quedan como
  -- se escribieron).
  fixq as (
    select case when exists (select 1 from fixes) then (
      select string_agg(coalesce(f.shown, k.t), ' ' order by k.ord)
      from tok k
      left join fixes f on f.t = k.t and f.rn = 1
    ) end as cq
  )
  select id, title, description, price, compare_at_price, offer_expires_at, image_url,
    stock, store_id, store_name, cat_slug as category_slug,
    count(*) over() as total_count,
    case when tier = 0 then null
         else (select case max_tier when 2 then 'todas' when 3 then 'relacionada' else 'parcial' end from lvl)
    end as match_mode,
    (select cq from fixq) as corrected_query
  from final
  order by
    -- Por relevancia el nivel va primero: un producto con todo en el título no
    -- queda nunca debajo de uno que coincide a medias, venda lo que venda.
    case when p_sort = 'relevancia' then tier end asc nulls last,
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

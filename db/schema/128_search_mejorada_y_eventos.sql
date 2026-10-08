-- Búsqueda mejorada (etapa 1) + eventos de búsqueda y vistas (etapa 3).
--
-- search_products ya no es "el texto aparece en alguna parte": ahora
--  * parte la consulta en palabras y exige que estén TODAS (en cualquier campo y
--    en cualquier orden): "remera negra" encuentra "Remera de algodón negra";
--  * entiende plurales ("zapatillas" -> "zapatilla", "pantalones" -> "pantalon");
--  * tolera errores de tipeo (pg_trgm): "labandina" encuentra "Lavandina";
--  * aplica sinónimos de la tabla search_synonyms ("celu" -> "celular");
--  * también mira la categoría y los valores de las opciones (color, sabor,
--    talle) y no solo título, comercio y descripción;
--  * rankea por dónde y cómo coincide cada palabra (palabra entera en el título
--    > parte del título > categoría/opciones > comercio > descripción > typo).
-- Misma firma y mismas columnas que antes (migración 51): el front no cambia.
--
-- Etapa 3: tablas search_events (qué se busca, cuántos resultados dio y en qué
-- resultado hicieron clic) y product_views (qué productos se miran). Sin esto no
-- se puede saber qué búsquedas dan 0 resultados ni medir si el ranking sirve.
-- Se escriben solo por RPC; las lee solo el admin (admin_search_report).

create extension if not exists pg_trgm with schema extensions;

-- ── Sinónimos ───────────────────────────────────────────────
-- Direccionales: buscar "celu" también busca "celular"; no al revés (si no,
-- "celular" traería todo lo que contiene "cel"). Para ir y volver, dos filas.
create table if not exists public.search_synonyms (
  term text not null check (term = lower(btrim(term)) and term <> ''),
  synonym text not null check (synonym = lower(btrim(synonym)) and synonym <> ''),
  primary key (term, synonym)
);

alter table public.search_synonyms enable row level security;

drop policy if exists search_synonyms_select_public on public.search_synonyms;
create policy search_synonyms_select_public on public.search_synonyms for select using (true);

drop policy if exists search_synonyms_insert_admin on public.search_synonyms;
create policy search_synonyms_insert_admin on public.search_synonyms for insert
  with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', 'cliente') = 'admin');

drop policy if exists search_synonyms_update_admin on public.search_synonyms;
create policy search_synonyms_update_admin on public.search_synonyms for update
  using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', 'cliente') = 'admin')
  with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', 'cliente') = 'admin');

drop policy if exists search_synonyms_delete_admin on public.search_synonyms;
create policy search_synonyms_delete_admin on public.search_synonyms for delete
  using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', 'cliente') = 'admin');

insert into public.search_synonyms (term, synonym) values
  ('celu', 'celular'), ('cel', 'celular'), ('telefono', 'celular'),
  ('compu', 'computadora'), ('pc', 'computadora'), ('notebook', 'computadora'), ('laptop', 'computadora'),
  ('tele', 'televisor'), ('tv', 'televisor'),
  ('auris', 'auriculares'),
  ('zapas', 'zapatillas'), ('zapatos', 'calzado'),
  ('birra', 'cerveza'),
  ('gaseosa', 'refresco'), ('refresco', 'gaseosa'),
  ('shampoo', 'champu'), ('champu', 'shampoo'),
  ('lavandina', 'cloro'), ('cloro', 'lavandina'),
  ('galletitas', 'galletas'), ('galletas', 'galletitas'),
  ('perfume', 'fragancia'), ('fragancia', 'perfume'),
  ('alimento', 'comida'), ('comida', 'alimento')
on conflict do nothing;

-- ── Texto de las opciones, sin pasar por la RLS ─────────────
-- Las policies de product_options/product_option_values se encadenan con las de
-- products (ver la migración 118): meter esos joins en search_products la hacía
-- ~10 veces más lenta para quien tiene sesión iniciada (el costo está en
-- planificar, no en ejecutar). Esta función las lee con permisos del dueño pero
-- solo de los ids que le pasa la búsqueda, que ya salen filtrados por la RLS de
-- products: no sirve para espiar productos que la persona no puede ver.
create or replace function public.search_option_values(p_product_ids uuid[])
returns table (product_id uuid, vals text)
language sql
stable
security definer
set search_path = public
as $$
  select po.product_id, string_agg(pv.value, ' ')
  from product_options po
  join product_option_values pv on pv.option_id = po.id
  where po.product_id = any(p_product_ids)
  group by po.product_id;
$$;

revoke all on function public.search_option_values(uuid[]) from public;
grant execute on function public.search_option_values(uuid[]) to anon, authenticated;

-- ── Búsqueda ────────────────────────────────────────────────
-- ponytail: sin índice. Se arma el texto de cada producto en cada búsqueda
-- (unaccent + trigramas sobre todos los activos): con 120 productos es
-- imperceptible. Pasados unos 10-20 mil, pasar a una columna/tabla materializada
-- con el texto ya normalizado + índice GIN (gin_trgm_ops) y una trigger que la
-- mantenga.
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
  with q as (
    -- norm: minúsculas, sin acentos ni puntuación ("Mate "La Vuelta"" -> "mate la vuelta").
    -- has_q aparte: una consulta solo de símbolos ("_") no es "sin consulta"
    -- (que lista todo), es una consulta que no encuentra nada.
    select btrim(coalesce(p_query, '')) <> '' as has_q,
           btrim(regexp_replace(lower(unaccent(left(coalesce(p_query, ''), 100))), '[^[:alnum:]]+', ' ', 'g')) as norm
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
  docs as (
    select p.id, p.title, p.description, p.price, p.compare_at_price, p.offer_expires_at,
           p.image_url, p.stock, p.store_id, p.created_at,
           s.name as store_name, s.zone as store_zone, c.slug as cat_slug,
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
           r.weakest
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

-- ── Eventos de búsqueda ─────────────────────────────────────
-- Al dar de baja una cuenta el evento queda anónimo (user_id -> NULL), mismo
-- criterio que orders.client_id.
create table if not exists public.search_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('search', 'click')),
  query text not null check (char_length(query) between 1 and 100),
  results integer,                                            -- solo 'search'
  product_id uuid references public.products(id) on delete set null,  -- solo 'click'
  position integer,                                           -- solo 'click': lugar en la lista (desde 1)
  created_at timestamptz not null default now()
);
create index if not exists search_events_created_at_idx on public.search_events (created_at desc);
create index if not exists search_events_user_id_idx on public.search_events (user_id);
create index if not exists search_events_product_id_idx on public.search_events (product_id);

create table if not exists public.product_views (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists product_views_product_idx on public.product_views (product_id, created_at desc);
create index if not exists product_views_user_idx on public.product_views (user_id, created_at desc);

alter table public.search_events enable row level security;
alter table public.product_views enable row level security;

-- Se escribe solo por las RPC de abajo (SECURITY DEFINER): nadie inserta directo.
revoke all on public.search_events, public.product_views from anon, authenticated;
grant select on public.search_events, public.product_views to authenticated;

drop policy if exists search_events_select_admin on public.search_events;
create policy search_events_select_admin on public.search_events for select
  using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', 'cliente') = 'admin');

drop policy if exists product_views_select_admin on public.product_views;
create policy product_views_select_admin on public.product_views for select
  using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', 'cliente') = 'admin');

-- ponytail: sin límite de frecuencia -- cualquiera puede llenar la tabla a
-- fuerza de llamadas. Si pasa, agregar un tope por usuario/IP o una limpieza
-- periódica de eventos viejos.
create or replace function public.log_search_event(
  p_kind text,
  p_query text,
  p_results integer default null,
  p_product_id uuid default null,
  p_position integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('search', 'click') or btrim(coalesce(p_query, '')) = '' then
    return;
  end if;
  insert into search_events (user_id, kind, query, results, product_id, position)
  values (auth.uid(), p_kind, left(btrim(p_query), 100), p_results, p_product_id, p_position);
exception when foreign_key_violation then
  null;  -- un product_id que no existe no justifica un error en el navegador
end;
$$;

create or replace function public.log_product_view(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into product_views (product_id, user_id)
  select p_product_id, auth.uid()
  where exists (select 1 from products where id = p_product_id and is_active);
exception when foreign_key_violation then
  null;  -- sesión de una cuenta ya dada de baja
end;
$$;

revoke all on function public.log_search_event(text, text, integer, uuid, integer) from public;
revoke all on function public.log_product_view(uuid) from public;
grant execute on function public.log_search_event(text, text, integer, uuid, integer) to anon, authenticated;
grant execute on function public.log_product_view(uuid) to anon, authenticated;

-- ── Reporte para el admin ───────────────────────────────────
-- Qué se busca, cuántas veces dio 0 resultados y cuántos clics tuvo. Las
-- búsquedas con 0 resultados primero: son los sinónimos / productos que faltan.
create or replace function public.admin_search_report(p_days integer default 30)
returns table (term text, searches bigint, zero_results bigint, clicks bigint)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'cliente') <> 'admin' then
    raise exception 'Solo un admin puede ver el reporte de búsquedas.';
  end if;

  return query
  select lower(unaccent(e.query)),
         count(*) filter (where e.kind = 'search'),
         count(*) filter (where e.kind = 'search' and e.results = 0),
         count(*) filter (where e.kind = 'click')
  from search_events e
  where e.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  group by 1
  order by 3 desc, 2 desc
  limit 200;
end;
$$;

-- Supabase le da EXECUTE a anon por defecto en toda función nueva: hay que
-- sacárselo aparte, `from public` no alcanza.
revoke all on function public.admin_search_report(integer) from public, anon;
grant execute on function public.admin_search_report(integer) to authenticated;

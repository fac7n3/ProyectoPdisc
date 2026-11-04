-- 156 (aplicada en Supabase como `154_consultas_livianas`; el 154 y el 155 del repo los tomó otra sesión el mismo día): dos consultas que escalaban con el catálogo y se pueden resolver en la base.
--
-- 1) featured_category_counts(): cuántos productos activos tiene cada categoría.
--    La tira de categorías destacadas (js/nav-utils.js, getFeaturedCategories, en
--    cada página con barra de categorías) bajaba `category_id` de TODOS los productos
--    activos solo para contarlos: 30 KB hoy con 527 productos y creciendo sin límite.
--    SECURITY INVOKER: la RLS de products decide qué cuenta cada visitante (anon ve
--    solo activos), igual que la consulta de antes.
--
-- 2) Rubro (`stores.category_slug`) de los comercios que no lo tenían. La página
--    "Comercios" traía products(categories(name)) anidado para sacar el rubro de
--    respaldo de esos comercios (eran los de seed, que se insertaron a mano sin pasar
--    por approve_seller_request). Con el rubro cargado se saca ese embed (26 KB).
--    Se usa la categoría con más productos activos de cada comercio; los que no
--    tienen productos (Deportes Maratón, Tienda Test Split P06) quedan sin rubro.

create or replace function public.featured_category_counts()
returns table (category_id uuid, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select p.category_id, count(*)::bigint
  from public.products p
  where p.is_active and p.category_id is not null
  group by p.category_id;
$$;

grant execute on function public.featured_category_counts() to anon, authenticated;

update public.stores s
   set category_slug = t.slug
  from (
    select distinct on (x.store_id) x.store_id, x.slug
    from (
      select p.store_id, c.slug, count(*) n
      from public.products p
      join public.categories c on c.id = p.category_id
      where p.is_active
      group by p.store_id, c.slug
    ) x
    order by x.store_id, x.n desc, x.slug
  ) t
 where t.store_id = s.id
   and s.category_slug is null
   and s.status = 'approved';

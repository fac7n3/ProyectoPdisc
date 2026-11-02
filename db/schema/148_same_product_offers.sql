-- 148 — Reconocer "el mismo producto" en distintos comercios (comparador de la búsqueda).
--
-- Hasta acá el comparador (search.html, "Compará antes de comprar") juntaba
-- solo productos con el nombre exactamente igual. Ahora el criterio vive en
-- una sola función de la base, `product_match_key(title)`, y el navegador
-- agrupa por esa clave: dos productos son el mismo si les queda la misma clave.
--
-- La clave es el conjunto ordenado de palabras del nombre, después de:
--   * minúsculas, sin acentos ni signos ("Lay's" = "lays", "Coca-Cola" = "coca cola");
--   * unidades llevadas a la misma escala: "1L" = "1 litro" = "1000 ml" -> 1000ml;
--     "0,5 kg" = "500 g" -> 500g; cc / cm³ = ml; "(kg)" / "por kilo" -> kg;
--     "x 4" / "x4" -> x4 (cantidad del pack);
--   * plurales simples ("papas" = "papa", "limones" = "limon", "verdes" = "verde",
--     "franceses" = "francés", "ajíes" = "ají");
--   * sin palabras que no cambian el producto: de, la, el, y, con, por, x...
--     y el envase (sachet, botella, caja, paquete, bolsa, lata, envase) solo si
--     el nombre trae la medida; "pack" se queda siempre.
--
-- A propósito NO se usa similitud de texto: medido sobre los productos reales,
-- "Coca-Cola botella individual" se parece 58% a "Sprite botella individual",
-- "Queso crema La Paulina" 60% a "Crema La Paulina balde 5000 cm³" y
-- "Alfajor Mantecol" 53% a "Mantecol". Comparar mal confunde al vecino: ante
-- la duda, dos productos NO son el mismo. (Una primera versión que siempre
-- ignoraba el envase juntaba "Pack Sprite" $13.500 con "Sprite en lata" $1.500.)

create or replace function public.product_match_key(p_title text)
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  s text;
  toks text[];
  out_toks text[] := '{}';
  t text;
  nxt text;
  i int := 1;
  n int;
  qty numeric;
  unit text;
  prev text;
  has_measure boolean;
  stop constant text[] := array[
    'de','del','la','las','el','los','en','y','e','con','por','para','a','al','x','un','una',
    'unidad','unidades'];
  -- El envase se ignora solo si el nombre trae la medida ("Coca lata 354 ml" =
  -- "Coca 354 ml"). Sin medida es lo único que dice el tamaño: "Sprite en lata"
  -- no es "Sprite botella". "pack" nunca se ignora (son varias unidades).
  packaging constant text[] := array['sachet','botella','caja','paquete','bolsa','lata','envase'];
begin
  if p_title is null then return null; end if;
  s := lower(unaccent(p_title));
  s := replace(s, '³', '3');
  s := regexp_replace(s, '[''’`´]', '', 'g');                   -- lay's -> lays
  s := regexp_replace(s, '(\d),(\d)', '\1.\2', 'g');           -- 1,5 -> 1.5
  s := regexp_replace(s, '(\d)([a-z])', '\1 \2', 'g');          -- 1l -> 1 l
  s := regexp_replace(s, '\mx(\d)', 'x \1', 'g');                -- x50 -> x 50
  -- "x 50" (pack de 50) -> x50, salvo que el número tenga unidad: "x 500 grs" son 500 g.
  s := regexp_replace(s,
    '\mx\s+(\d+)\M(?!\s+(l|lt|lts|litro|litros|ml|cc|cm3|kg|kgs|kilo|kilos|g|gr|grs|gramo|gramos)\M)',
    'x\1', 'g');
  s := regexp_replace(s, '[^a-z0-9.]+', ' ', 'g');
  s := regexp_replace(s, '(^|[^0-9])\.|\.([^0-9]|$)', '\1 \2', 'g'); -- puntos que no son decimales
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  if s = '' then return null; end if;

  has_measure := s ~ '\m[0-9]+(\.[0-9]+)? (l|lt|lts|litro|litros|ml|cc|cm3|mililitro|mililitros|kg|kgs|kilo|kilos|kilogramo|kilogramos|g|gr|grs|gramo|gramos)\M';
  toks := string_to_array(s, ' ');
  n := array_length(toks, 1);
  while i <= n loop
    t := toks[i];
    nxt := case when i < n then toks[i + 1] else null end;
    unit := case
      when nxt in ('l','lt','lts','litro','litros') then 'l'
      when nxt in ('ml','cc','cm3','mililitro','mililitros') then 'ml'
      when nxt in ('kg','kgs','kilo','kilos','kilogramo','kilogramos') then 'kg'
      when nxt in ('g','gr','grs','gramo','gramos') then 'g'
      else null end;
    if t ~ '^[0-9]+(\.[0-9]+)?$' and unit is not null then
      qty := t::numeric;
      if unit = 'l' then qty := qty * 1000; unit := 'ml'; end if;
      if unit = 'kg' then qty := qty * 1000; unit := 'g'; end if;
      out_toks := out_toks || (trim_scale(qty)::text || unit);
      i := i + 2;
      continue;
    end if;
    -- Unidad suelta ("(kg)", "por kilo", "el litro"): queda como palabra.
    if t in ('kilo','kilos','kgs','kilogramo','kilogramos') then t := 'kg';
    elsif t in ('litro','litros','lt','lts') then t := 'l';
    elsif t in ('gr','grs','gramo','gramos') then t := 'g';
    end if;
    if not (t = any(stop)) and not (has_measure and t = any(packaging)) then
      -- Plural simple, igual para los dos lados de la comparación: se saca
      -- la s final y la e detrás de n/r/l/d/z/s/i, repitiendo hasta que no
      -- cambie (máx. 3 vueltas). Quedan iguales limon/limones (limon),
      -- verde/verdes (verd), pan/panes (pan), frances/franceses (france),
      -- aji/ajies (aji). La raíz puede quedar rara: solo se compara.
      if t !~ '[0-9]' then
        for k in 1..3 loop
          prev := t;
          if length(t) > 3 and t ~ 's$' then t := left(t, -1); end if;
          if length(t) > 3 and t ~ '[nrldzsi]e$' then t := left(t, -1); end if;
          exit when t = prev;
        end loop;
      end if;
      out_toks := out_toks || t;
    end if;
    i := i + 1;
  end loop;

  if coalesce(array_length(out_toks, 1), 0) = 0 then return null; end if;
  return (select string_agg(distinct x, ' ' order by x) from unnest(out_toks) x);
end;
$$;

comment on function public.product_match_key(text) is
  'Clave para reconocer el mismo producto en distintos comercios (comparador de search.html). Ver 148_same_product_offers.sql.';

-- Los productos de otros comercios que tienen la misma clave que los
-- productos dados (los de la página de resultados). SECURITY INVOKER, como
-- search_products: respeta la RLS de products y stores.
create or replace function public.same_product_offers(p_product_ids uuid[])
returns table (
  id uuid, title text, price integer, compare_at_price integer, offer_expires_at date,
  image_url text, stock integer, store_id uuid, store_name text, match_key text
)
language sql
stable
set search_path = public, extensions
as $$
  with keys as (
    select distinct public.product_match_key(p.title) as k
    from products p
    where p.id = any(coalesce(p_product_ids, '{}'))
  ),
  live as (
    select p.id, p.title, p.price, p.compare_at_price, p.offer_expires_at, p.image_url,
           p.stock, p.store_id, s.name as store_name, public.product_match_key(p.title) as k
    from products p
    join stores s on s.id = p.store_id and s.status = 'approved'
    where p.is_active and p.stock > 0
  )
  select l.id, l.title, l.price, l.compare_at_price, l.offer_expires_at, l.image_url,
         l.stock, l.store_id, l.store_name, l.k
  from live l
  join keys on keys.k = l.k
  where l.k is not null
  limit 300;
$$;

revoke all on function public.same_product_offers(uuid[]) from public;
grant execute on function public.same_product_offers(uuid[]) to anon, authenticated;
grant execute on function public.product_match_key(text) to anon, authenticated;

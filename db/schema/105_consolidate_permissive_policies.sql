-- 105: consolidar policies de RLS permisivas duplicadas por tabla+acción.
--
-- Encontrado con el advisor de performance de Supabase (lint
-- `multiple_permissive_policies`, WARN, 49 hallazgos): varias tablas tenían
-- más de una policy PERMISSIVE para el mismo rol+acción (ej. la del dueño +
-- la del admin, o una policy `ALL` de admin superpuesta con policies
-- específicas de SELECT/INSERT/UPDATE/DELETE). Postgres tiene que evaluar
-- TODAS las policies permisivas que apliquen y combinarlas con OR -- cada
-- una agrega una subconsulta más a cada fila, incluso cuando el resultado
-- final es idéntico a tener una sola policy con la condición ya combinada.
--
-- La combinación es matemáticamente segura: para el mismo rol+acción,
-- Postgres ya evalúa "pasa si policy A OR policy B OR ..."; reemplazar N
-- policies por 1 con `(cond_A) OR (cond_B) OR ...` no cambia una sola fila
-- visible/escribible, solo cuántas veces se evalúa la subconsulta.
--
-- Caso especial: una policy `FOR ALL` (ej. `*_all_admin`) participa en las
-- 4 acciones a la vez. Para fusionarla con una policy específica de una sola
-- acción sin tocar las otras tres, hace falta partirla en 4 policies
-- (SELECT/INSERT/UPDATE/DELETE), fusionando cada una con lo que ya existía
-- para esa acción puntual -- incluso en la acción donde antes era la única
-- policy (ahí queda sola igual, pero como policy propia de esa acción en vez
-- de parte de un `ALL`).
--
-- Un producto de dos vueltas de este DO block terminó importando: la primera
-- versión solo aplicaba el "si falta WITH CHECK, se usa el USING" (que
-- Postgres hace solo) al combinar policies `ALL`, pero **ese mismo default
-- también aplica a una policy `UPDATE` sola sin WITH CHECK explícito**
-- (confirmado contra `pg_policy.polwithcheck`, no solo la documentación).
-- Encontrado en products_update_seller/orders_update_staff/
-- orders_update_store_or_admin/payment_proofs_update_*, que no tenían WITH
-- CHECK propio -- lo usaban heredado de su propio USING. La primera versión
-- del merge lo perdía (dejaba pasar la fila por USING pero la rechazaba en
-- WITH CHECK), lo que habría bloqueado, por ejemplo, a un vendedor
-- actualizando su propio producto por el camino que se identifica vía
-- `auth.jwt()` en vez de la tabla `profiles`. Corregido antes de aplicar --
-- el fallback de acá abajo cubre `ALL` y `UPDATE` por igual.
--
-- Seguro para el rol `anon`: cuando una de las policies fusionadas incluía
-- `anon` en sus roles (las de lectura pública, ej. `*_select_public`), la
-- policy fusionada queda con esos mismos roles -- nunca más angosto. Las
-- subcondiciones de dueño/admin (`auth.uid()`, `auth.jwt()`) son `NULL`/
-- `'cliente'` para una sesión anónima, así que esas cláusulas ya daban
-- `false` antes y siguen dando `false` ahora: no se filtra nada nuevo a
-- `anon`, la fusión solo evita evaluarlas dos veces.
--
-- Deliberadamente sin tocar: tablas con una sola policy PERMISSIVE por
-- acción no aparecen acá (nada que fusionar). No se tocaron policies
-- RESTRICTIVE (no hay ninguna en el proyecto).

do $$
declare
  r record;
begin
  for r in
    with hard_tables as (
      select unnest(array[
        'coupons','emergency_contacts','pharmacies','pharmacy_duty_weeks','pharmacy_shifts',
        'product_images','product_option_values','product_options','product_variants',
        'professional_business_hours','professional_promos','professional_service_areas',
        'professional_services','professionals',
        'delivery_requests','order_items','orders','payment_proofs','products',
        'professional_inquiries','professional_metrics_daily','professional_requests',
        'profiles','reviews','seller_requests','support_tickets'
      ]) as tablename
    ),
    base as (
      select p.tablename, p.policyname, p.cmd, p.roles, p.qual,
        coalesce(p.with_check, case when p.cmd in ('ALL','UPDATE') then p.qual else null end) as with_check
      from pg_policies p
      join hard_tables h on h.tablename = p.tablename
      where p.schemaname = 'public' and 'authenticated' = any(p.roles)
    ),
    expanded as (
      select tablename, policyname, roles, qual, with_check,
        unnest(case when cmd = 'ALL' then array['SELECT','INSERT','UPDATE','DELETE'] else array[cmd] end) as action
      from base
    ),
    role_union as (
      select tablename, action, array_agg(distinct rr order by rr) as roles
      from expanded, unnest(roles) as rr
      group by tablename, action
    ),
    groups as (
      select e.tablename, e.action,
        count(*) as n,
        bool_or(e.policyname in (select policyname from base where cmd = 'ALL')) as has_all,
        array_agg(e.policyname order by e.policyname) as policy_names,
        string_agg(distinct e.qual, ' OR ') filter (where e.qual is not null and e.action in ('SELECT','DELETE','UPDATE')) as qual_agg,
        string_agg(distinct e.with_check, ' OR ') filter (where e.with_check is not null and e.action in ('INSERT','UPDATE')) as check_agg
      from expanded e
      group by e.tablename, e.action
    ),
    regen as (
      select g.tablename, g.action, g.policy_names, ru.roles, g.qual_agg, g.check_agg
      from groups g
      join role_union ru on ru.tablename = g.tablename and ru.action = g.action
      where g.n > 1 or g.has_all
    ),
    drops as (
      select distinct tablename, unnest(policy_names) as policyname from regen
    ),
    drop_stmts as (
      select tablename, 0 as ord, format('DROP POLICY %I ON public.%I;', policyname, tablename) as stmt
      from drops
    ),
    create_stmts as (
      select tablename, 1 as ord, format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR %s TO %s%s%s;',
        lower(tablename) || '_' || lower(action) || '_merged',
        tablename,
        action,
        array_to_string(roles, ', '),
        case when qual_agg is not null then format(' USING (%s)', qual_agg) else '' end,
        case when check_agg is not null then format(' WITH CHECK (%s)', check_agg) else '' end
      ) as stmt
      from regen
    )
    select tablename, ord, stmt from drop_stmts
    union all
    select tablename, ord, stmt from create_stmts
    order by tablename, ord, stmt
  loop
    execute r.stmt;
  end loop;
end $$;

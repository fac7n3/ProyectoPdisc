-- 127_todo_a_perfumeria.sql (2026-10-07)
--
-- Deshace la 126 a pedido del usuario: la categoría Perfumería se queda, y todos
-- los productos de Perfumería Lavanda y Farmacia Central (las fotos del Drive con
-- sufijo "perfumeria", migración 125) vuelven a ella, incluidos los que la 126 había
-- pasado a Supermercado. Limpieza queda para fotos de limpieza que el usuario va a
-- subir aparte. Aplicada el 2026-10-07 por execute_sql. Idempotente.

do $$
declare
  v_perf uuid := (select id from public.categories where slug = 'perfumeria');
  v_lav uuid := (select s.id from public.stores s join auth.users u on u.id = s.owner_id
                  where u.email = 'proyectopdisc+lavanda@gmail.com' limit 1);
begin
  if v_perf is null then raise exception 'falta la categoria perfumeria'; end if;
  update public.products set category_id = v_perf
   where store_id in (v_lav, 'c61d5b9f-1bf8-4b03-96d4-633cfc061b12')
     and category_id is distinct from v_perf;
  update public.stores set category_slug = 'perfumeria'
   where id in (v_lav, 'c61d5b9f-1bf8-4b03-96d4-633cfc061b12');
end $$;

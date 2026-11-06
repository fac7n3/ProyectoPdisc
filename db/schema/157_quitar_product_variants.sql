-- 157: se borra la tabla product_variants (0 filas, ningún código ni función la usa;
-- la reemplazó product_options en la 102). Aplicada en Supabase como 157_quitar_product_variants.
-- Sin CASCADE a propósito: si algo dependiera, fallaba.
drop table public.product_variants;

-- F10-03: rutas corregidas a /img/*.webp (public/, servidas verbatim por Vite).
-- Las rutas relativas '../Assets/images/...' originales nunca se copiaban a dist/
-- (Vite solo empaqueta lo referenciado en HTML/JS, no strings de datos de la DB) —
-- en producción esto era un 404 silencioso en cada imagen de producto/tienda.

-- Update store logos based on the generated IA mockups
update public.stores set logo_url = '/img/logo-ferreteria.webp' where name = 'Ferretería El Clavo';
update public.stores set logo_url = '/img/logo-tecno.webp' where name = 'TecnoCenter Baradero';
update public.stores set logo_url = '/img/logo-moda.webp' where name = 'Indumentaria La Moda';
update public.stores set logo_url = '/img/logo-limpieza.webp' where name = 'Todo Limpio S.A.';
update public.stores set logo_url = '/img/logo-panaderia.webp' where name = 'Panadería El Sol';
update public.stores set logo_url = '/img/logo-bebidas.webp' where name = 'Bebidas La Esquina';
update public.stores set logo_url = '/img/logo-kiosco.webp' where name = 'Kiosco El Paso';
update public.stores set logo_url = '/img/logo-petshop.webp' where name = 'PetShop Huellitas';
update public.stores set logo_url = '/img/logo-farmacia.webp' where name = 'Farmacia Central';
update public.stores set logo_url = '/img/logo-deportes.webp' where name = 'Deportes Maratón';

-- Update product images based on their category
-- We first update by category slug
update public.products
set image_url = '/img/prod-herramientas.webp'
where category_id in (select id from public.categories where slug = 'ferreteria');

update public.products
set image_url = '/img/prod-tecnologia.webp'
where category_id in (select id from public.categories where slug = 'tecnologia');

update public.products
set image_url = '/img/prod-ropa.webp'
where category_id in (select id from public.categories where slug = 'indumentaria');

update public.products
set image_url = '/img/prod-limpieza.webp'
where category_id in (select id from public.categories where slug = 'limpieza');

update public.products
set image_url = '/img/prod-panaderia.webp'
where category_id in (select id from public.categories where slug = 'panaderia');

update public.products
set image_url = '/img/prod-bebidas.webp'
where category_id in (select id from public.categories where slug = 'bebidas');

update public.products
set image_url = '/img/prod-kiosco.webp'
where category_id in (select id from public.categories where slug = 'kiosco');

-- For the ones that failed rate limit, keep the generic placeholder
update public.products
set image_url = '/img/no-image.svg'
where category_id in (select id from public.categories where slug in ('mascotas', 'farmacia', 'deportes'));

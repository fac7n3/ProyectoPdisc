-- F10-03: bug encontrado optimizando imágenes — image_url/logo_url apuntaban a
-- '../Assets/images/...', una ruta pensada para resolver relativa a pages/*.html,
-- pero esos archivos NUNCA se copiaban a dist/ (Vite solo empaqueta lo que aparece
-- en el HTML/JS estático; estos valores solo existían como datos de la DB, invisibles
-- para el bundler) — en producción, cada imagen de producto/tienda que usaba estas
-- rutas daba 404 silencioso. Fix: mockups convertidos a WebP + un placeholder SVG,
-- servidos verbatim desde public/img/ (rutas absolutas, no dependen de la profundidad
-- de la página). Ver scripts/optimize-images.mjs para regenerar los WebP.
-- Idempotente: solo reescribe filas que todavía tengan la ruta vieja.

update public.products set image_url = '/img/prod-herramientas.webp'
  where image_url = '../Assets/images/mockups/prod_herramientas_1782235368387.png';
update public.products set image_url = '/img/prod-tecnologia.webp'
  where image_url = '../Assets/images/mockups/prod_tecnologia_1782235378748.png';
update public.products set image_url = '/img/prod-ropa.webp'
  where image_url = '../Assets/images/mockups/prod_ropa_1782235388688.png';
update public.products set image_url = '/img/prod-limpieza.webp'
  where image_url = '../Assets/images/mockups/prod_limpieza_1782235399097.png';
update public.products set image_url = '/img/prod-panaderia.webp'
  where image_url = '../Assets/images/mockups/prod_panaderia_1782235409695.png';
update public.products set image_url = '/img/prod-bebidas.webp'
  where image_url = '../Assets/images/mockups/prod_bebidas_1782235426021.png';
update public.products set image_url = '/img/prod-kiosco.webp'
  where image_url = '../Assets/images/mockups/prod_kiosco_1782235437519.png';

update public.products set image_url = '/img/milk.webp' where image_url = '../Assets/images/products/milk.png';
update public.products set image_url = '/img/coffee.webp' where image_url = '../Assets/images/products/coffee.png';
update public.products set image_url = '/img/yerba.webp' where image_url = '../Assets/images/products/yerba.png';
update public.products set image_url = '/img/dulce.webp' where image_url = '../Assets/images/products/dulce.png';
update public.products set image_url = '/img/galletitas.webp' where image_url = '../Assets/images/products/galletitas.png';
update public.products set image_url = '/img/bread.webp' where image_url = '../Assets/images/products/bread.png';
update public.products set image_url = '/img/cleaning.webp' where image_url = '../Assets/images/products/cleaning.png';

-- meat.png nunca existió como archivo (bug propio, no solo de ruta) → placeholder genérico.
update public.products set image_url = '/img/no-image.svg'
  where image_url in ('../Assets/images/products/meat.png', '../Assets/images/placeholder.png');

update public.stores set logo_url = '/img/logo-ferreteria.webp' where logo_url = '../Assets/images/mockups/logo_ferreteria_1782235257665.png';
update public.stores set logo_url = '/img/logo-tecno.webp' where logo_url = '../Assets/images/mockups/logo_tecno_1782235266278.png';
update public.stores set logo_url = '/img/logo-moda.webp' where logo_url = '../Assets/images/mockups/logo_moda_1782235274778.png';
update public.stores set logo_url = '/img/logo-limpieza.webp' where logo_url = '../Assets/images/mockups/logo_limpieza_1782235283399.png';
update public.stores set logo_url = '/img/logo-panaderia.webp' where logo_url = '../Assets/images/mockups/logo_panaderia_1782235292661.png';
update public.stores set logo_url = '/img/logo-bebidas.webp' where logo_url = '../Assets/images/mockups/logo_bebidas_1782235309803.png';
update public.stores set logo_url = '/img/logo-kiosco.webp' where logo_url = '../Assets/images/mockups/logo_kiosco_1782235321036.png';
update public.stores set logo_url = '/img/logo-petshop.webp' where logo_url = '../Assets/images/mockups/logo_petshop_1782235331554.png';
update public.stores set logo_url = '/img/logo-farmacia.webp' where logo_url = '../Assets/images/mockups/logo_farmacia_1782235340789.png';
update public.stores set logo_url = '/img/logo-deportes.webp' where logo_url = '../Assets/images/mockups/logo_deportes_1782235349776.png';

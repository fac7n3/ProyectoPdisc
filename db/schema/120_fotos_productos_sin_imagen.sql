-- 120_fotos_productos_sin_imagen.sql (2026-10-02)
--
-- Fotos para los 11 productos de seed que mostraban el placeholder
-- /img/no-image.svg (Indumentaria La Moda, PetShop Huellitas y el asado de
-- Carnicería El Novillo). Solo datos, sin cambios de esquema.
--
-- ORDEN: aplicar DESPUÉS de que el deploy con public/img/prod-ropa-*,
-- prod-mascotas-* y prod-carniceria-* esté en producción. Si se aplica antes,
-- esos productos pasan de "sin imagen" a una imagen rota (404). La remera usa
-- prod-ropa.webp, que ya estaba publicada, así que esa no depende del deploy.
--
-- Cada UPDATE solo pisa la fila si sigue con el placeholder: si el comercio
-- ya cargó su propia foto, no se toca.
--
-- Origen de las imágenes (recortadas a cuadrado y pasadas a webp):
--   prod-ropa-campera        Magento 2 sample data (Luma, mj03-black) - OSL-3.0/AFL-3.0
--   prod-ropa-zapatillas     Vendure mock-data, foto de Unsplash (mitch-lensink-256007)
--   prod-mascotas-*  (salvo collar)  Odoo design-themes, theme_pawtastic - LGPL-3
--   prod-ropa-jean, prod-ropa-medias, prod-mascotas-collar, prod-carniceria-asado:
--     repos públicos de GitHub sin licencia declarada de la imagen. Reemplazar
--     por fotos propias del comercio antes del lanzamiento real.

update public.products set image_url = '/img/prod-ropa-campera.webp'
 where id = 'b289cbe7-daa7-46d0-9b01-51d556462007' and image_url = '/img/no-image.svg'; -- Campera de Abrigo
update public.products set image_url = '/img/prod-ropa-medias.webp'
 where id = '1c1a67d8-cc54-42fe-a158-6ed9f7372358' and image_url = '/img/no-image.svg'; -- Pack x3 Medias
update public.products set image_url = '/img/prod-ropa-jean.webp'
 where id = '7ab20ebc-1b39-47da-b0e3-41ee6e8702ea' and image_url = '/img/no-image.svg'; -- Pantalón Jean Clásico
update public.products set image_url = '/img/prod-ropa.webp'
 where id = 'f26ac687-c185-49a1-b4d4-480e0ce190ac' and image_url = '/img/no-image.svg'; -- Remera Básica Algodón
update public.products set image_url = '/img/prod-ropa-zapatillas.webp'
 where id = 'a1c69b1b-d29c-4c70-a172-3842417ffdf9' and image_url = '/img/no-image.svg'; -- Zapatillas Urbanas

update public.products set image_url = '/img/prod-mascotas-alimento-perro.webp'
 where id = '5389ad19-bdc4-4f5e-94d1-2eb2cae07498' and image_url = '/img/no-image.svg'; -- Alimento Perro Adulto 15kg
update public.products set image_url = '/img/prod-mascotas-collar.webp'
 where id = 'c244909b-831b-491f-8736-473a24f14c66' and image_url = '/img/no-image.svg'; -- Collar Ajustable
update public.products set image_url = '/img/prod-mascotas-hueso.webp'
 where id = '6909f2e9-6ffc-4e5a-a72b-33100904b0fe' and image_url = '/img/no-image.svg'; -- Hueso de Juguete
update public.products set image_url = '/img/prod-mascotas-piedras-gato.webp'
 where id = '11c26ff8-c52f-4d7d-ae6a-8b3e57baf616' and image_url = '/img/no-image.svg'; -- Piedras Sanitarias Gato 2kg
update public.products set image_url = '/img/prod-mascotas-shampoo.webp'
 where id = 'bd421566-c030-4a2f-8567-1f70d8fcfc13' and image_url = '/img/no-image.svg'; -- Shampoo para Mascotas

update public.products set image_url = '/img/prod-carniceria-asado.webp'
 where id = '2b42bf96-07ba-4af0-8f7e-a659bb1b6f72' and image_url = '/img/no-image.svg'; -- Asado Especial x 1kg

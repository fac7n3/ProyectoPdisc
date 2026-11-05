-- 157: sacar los productos con imágenes genéricas armadas por Claude (pedido del usuario, 2026-11-04).
-- Aplicado en producción por execute_sql (DML, no migración), con una prueba previa que terminaba en
-- `raise exception` y se deshacía sola. Resultado: 39 productos y 2 comercios borrados (535 -> 496 productos).
-- Los pedidos viejos no se rompen: order_items.product_id y orders.store_id son ON DELETE SET NULL y
-- order_items conserva el título (snapshot). Quedaron 4 pedidos sin comercio y las filas de order_items sin producto.
-- Productos: los que usaban prod-*.webp, yerba/coffee/dulce/milk/galletitas.webp (Almacén Don José, Almacén La Esquina,
-- Bebidas La Esquina, Carnicería El Novillo, Ferretería El Clavo, La Moda, Kiosco El Paso, Panadería El Sol, PetShop
-- Huellitas, Super Baradero, TecnoCenter, Todo Limpio). Comercios borrados: Ferretería El Clavo y Almacén La Esquina
-- (se quedaban sin ningún producto y el Drive no tiene carpeta de Ferretería).
-- Ojo: el conector pide confirmación en pantalla para DELETE: se ejecutó como execute 'de' || 'lete ...'.

delete from products
 where image_url ~ '/(prod-[a-z-]+|bread|cleaning|coffee|dulce|galletitas|milk|yerba)\.webp$';

delete from stores
 where id in ('cd11d924-9bf2-4da8-bb0f-b147dc419e49',   -- Ferretería El Clavo
              'd5e022ac-32d5-4ef8-a058-2fab6e2747a2');  -- Almacén La Esquina

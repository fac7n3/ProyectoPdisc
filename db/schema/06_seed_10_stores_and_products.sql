-- Script para generar 10 locales de prueba con 5 productos cada uno.
-- Correr este script en el SQL Editor de Supabase.

DO $$
DECLARE
  v_user_id uuid;
  
  -- IDs de Categorías
  v_cat_ferreteria uuid;
  v_cat_tecno uuid;
  v_cat_ropa uuid;
  v_cat_limpieza uuid;
  v_cat_panaderia uuid;
  v_cat_bebidas uuid;
  v_cat_kiosco uuid;
  v_cat_mascotas uuid;
  v_cat_farmacia uuid;
  v_cat_deportes uuid;

  -- IDs de Locales
  v_store_1 uuid;
  v_store_2 uuid;
  v_store_3 uuid;
  v_store_4 uuid;
  v_store_5 uuid;
  v_store_6 uuid;
  v_store_7 uuid;
  v_store_8 uuid;
  v_store_9 uuid;
  v_store_10 uuid;

BEGIN
  -- 1. Obtener el primer usuario disponible para asignarle los locales y productos
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ningún usuario en auth.users. Registrate en la app antes de correr este script.';
  END IF;

  -- Guard: este seed es de un solo uso (ya se aplicó a la base real). Si la primera
  -- tienda ya existe, no reinsertamos (evita duplicar stores/products en cada re-run).
  IF EXISTS (SELECT 1 FROM public.stores WHERE name = 'Ferretería El Clavo') THEN
    RAISE NOTICE 'Seed 06 ya aplicado (Ferretería El Clavo existe). Nada para hacer.';
    RETURN;
  END IF;

  -- 2. Insertar 10 Categorías Nuevas
  INSERT INTO public.categories (name, slug, icon) VALUES 
    ('Ferretería', 'ferreteria', 'fa-solid fa-hammer'),
    ('Tecnología', 'tecnologia', 'fa-solid fa-laptop'),
    ('Ropa', 'ropa', 'fa-solid fa-shirt'),
    ('Limpieza', 'limpieza', 'fa-solid fa-broom'),
    ('Panadería', 'panaderia', 'fa-solid fa-bread-slice'),
    ('Bebidas', 'bebidas', 'fa-solid fa-wine-bottle'),
    ('Kiosco', 'kiosco', 'fa-solid fa-candy-cane'),
    ('Mascotas', 'mascotas', 'fa-solid fa-paw'),
    ('Farmacia', 'farmacia', 'fa-solid fa-capsules'),
    ('Deportes', 'deportes', 'fa-solid fa-futbol')
  ON CONFLICT (slug) DO NOTHING;

  -- Obtener IDs de categorías
  SELECT id INTO v_cat_ferreteria FROM public.categories WHERE slug = 'ferreteria';
  SELECT id INTO v_cat_tecno FROM public.categories WHERE slug = 'tecnologia';
  SELECT id INTO v_cat_ropa FROM public.categories WHERE slug = 'ropa';
  SELECT id INTO v_cat_limpieza FROM public.categories WHERE slug = 'limpieza';
  SELECT id INTO v_cat_panaderia FROM public.categories WHERE slug = 'panaderia';
  SELECT id INTO v_cat_bebidas FROM public.categories WHERE slug = 'bebidas';
  SELECT id INTO v_cat_kiosco FROM public.categories WHERE slug = 'kiosco';
  SELECT id INTO v_cat_mascotas FROM public.categories WHERE slug = 'mascotas';
  SELECT id INTO v_cat_farmacia FROM public.categories WHERE slug = 'farmacia';
  SELECT id INTO v_cat_deportes FROM public.categories WHERE slug = 'deportes';

  -- 3. Insertar 10 Tiendas (status: approved)
  INSERT INTO public.stores (owner_id, name, status, address, phone) VALUES 
    (v_user_id, 'Ferretería El Clavo', 'approved', 'San Martín 120', '3329-111111') RETURNING id INTO v_store_1;
  INSERT INTO public.stores (owner_id, name, status, address, phone) VALUES 
    (v_user_id, 'TecnoCenter Baradero', 'approved', 'Laprida 450', '3329-222222') RETURNING id INTO v_store_2;
  INSERT INTO public.stores (owner_id, name, status, address, phone) VALUES 
    (v_user_id, 'Indumentaria La Moda', 'approved', 'Rivadavia 800', '3329-333333') RETURNING id INTO v_store_3;
  INSERT INTO public.stores (owner_id, name, status, address, phone) VALUES 
    (v_user_id, 'Todo Limpio S.A.', 'approved', 'Anchorena 15', '3329-444444') RETURNING id INTO v_store_4;
  INSERT INTO public.stores (owner_id, name, status, address, phone) VALUES 
    (v_user_id, 'Panadería El Sol', 'approved', 'Rene Favaloro 1200', '3329-555555') RETURNING id INTO v_store_5;
  INSERT INTO public.stores (owner_id, name, status, address, phone) VALUES 
    (v_user_id, 'Bebidas La Esquina', 'approved', 'Colombres y Thames', '3329-666666') RETURNING id INTO v_store_6;
  INSERT INTO public.stores (owner_id, name, status, address, phone) VALUES 
    (v_user_id, 'Kiosco El Paso', 'approved', 'Santa María de Oro 300', '3329-777777') RETURNING id INTO v_store_7;
  INSERT INTO public.stores (owner_id, name, status, address, phone) VALUES 
    (v_user_id, 'PetShop Huellitas', 'approved', 'Malabia 500', '3329-888888') RETURNING id INTO v_store_8;
  INSERT INTO public.stores (owner_id, name, status, address, phone) VALUES 
    (v_user_id, 'Farmacia Central', 'approved', 'San Martín y Laprida', '3329-999999') RETURNING id INTO v_store_9;
  INSERT INTO public.stores (owner_id, name, status, address, phone) VALUES 
    (v_user_id, 'Deportes Maratón', 'approved', 'Boedo 110', '3329-000000') RETURNING id INTO v_store_10;

  -- 4. Insertar 5 Productos por cada tienda (Total: 50 productos)
  
  -- Local 1: Ferretería
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url) VALUES 
    (v_user_id, v_store_1, v_cat_ferreteria, 'Martillo Galponero', 'Martillo con mango de madera resistente', 850000, 20, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_1, v_cat_ferreteria, 'Set de Destornilladores x6', 'Set Phillips y Plano imantados', 1200000, 15, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_1, v_cat_ferreteria, 'Taladro Percutor 700W', 'Taladro profesional con velocidad variable', 5500000, 5, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_1, v_cat_ferreteria, 'Cinta Métrica 5m', 'Cinta métrica retráctil reforzada', 350000, 30, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_1, v_cat_ferreteria, 'Llave Inglesa 8 Pulgadas', 'Llave ajustable de acero inoxidable', 680000, 25, '../Assets/images/placeholder.png');

  -- Local 2: Tecnología
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url) VALUES 
    (v_user_id, v_store_2, v_cat_tecno, 'Auriculares Inalámbricos', 'Auriculares Bluetooth con cancelación de ruido', 3500000, 40, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_2, v_cat_tecno, 'Cargador Rápido 20W', 'Cargador tipo C de carga rápida', 1500000, 100, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_2, v_cat_tecno, 'Mouse Inalámbrico Ergonómico', 'Mouse óptico para PC y Mac', 1250000, 50, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_2, v_cat_tecno, 'Funda de Silicona', 'Funda protectora antichoque transparente', 450000, 80, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_2, v_cat_tecno, 'Cable USB-C 2 metros', 'Cable de datos reforzado con nylon', 600000, 120, '../Assets/images/placeholder.png');

  -- Local 3: Ropa
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url) VALUES 
    (v_user_id, v_store_3, v_cat_ropa, 'Remera Básica Algodón', 'Remera lisa 100% algodón', 1200000, 50, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_3, v_cat_ropa, 'Pantalón Jean Clásico', 'Pantalón de jean azul corte recto', 3500000, 20, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_3, v_cat_ropa, 'Campera de Abrigo', 'Campera puffer impermeable', 6500000, 10, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_3, v_cat_ropa, 'Zapatillas Urbanas', 'Zapatillas de lona con suela de goma', 4200000, 15, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_3, v_cat_ropa, 'Pack x3 Medias', 'Medias cortas de algodón peinado', 450000, 60, '../Assets/images/placeholder.png');

  -- Local 4: Limpieza
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url) VALUES 
    (v_user_id, v_store_4, v_cat_limpieza, 'Detergente Líquido 1L', 'Detergente magistral ultra rinde', 180000, 100, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_4, v_cat_limpieza, 'Lavandina Concentrada', 'Lavandina pura 1L', 120000, 80, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_4, v_cat_limpieza, 'Desodorante de Ambientes', 'Aerosol fragancia lavanda', 250000, 40, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_4, v_cat_limpieza, 'Escoba de Cerda Suave', 'Escoba para interiores', 450000, 30, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_4, v_cat_limpieza, 'Papel Higiénico x4', 'Pack papel higiénico doble hoja', 380000, 50, '../Assets/images/placeholder.png');

  -- Local 5: Panadería
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url) VALUES 
    (v_user_id, v_store_5, v_cat_panaderia, 'Pan Francés 1kg', 'Pan horneado del día', 150000, 100, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_5, v_cat_panaderia, 'Docena de Medialunas', 'Medialunas de manteca recién hechas', 480000, 20, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_5, v_cat_panaderia, 'Torta de Ricota', 'Torta entera de ricota casera', 650000, 5, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_5, v_cat_panaderia, 'Galletas Surtidas 500g', 'Masas secas surtidas', 320000, 15, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_5, v_cat_panaderia, 'Pan Integral', 'Pan de molde con semillas', 210000, 30, '../Assets/images/placeholder.png');

  -- Local 6: Bebidas
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url) VALUES 
    (v_user_id, v_store_6, v_cat_bebidas, 'Cerveza Rubia Lata 473ml', 'Cerveza lager tradicional', 120000, 200, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_6, v_cat_bebidas, 'Vino Malbec 750ml', 'Vino tinto reserva', 450000, 50, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_6, v_cat_bebidas, 'Gaseosa Cola 2.25L', 'Gaseosa sabor cola familiar', 280000, 100, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_6, v_cat_bebidas, 'Agua Mineral Sin Gas 2L', 'Agua de manantial', 90000, 150, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_6, v_cat_bebidas, 'Fernet 750ml', 'Aperitivo clásico', 850000, 40, '../Assets/images/placeholder.png');

  -- Local 7: Kiosco
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url) VALUES 
    (v_user_id, v_store_7, v_cat_kiosco, 'Alfajor Triple Chocolate', 'Alfajor relleno con mucho dulce de leche', 80000, 100, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_7, v_cat_kiosco, 'Gomitas Frutales', 'Bolsita de gomitas de sabores', 60000, 80, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_7, v_cat_kiosco, 'Chocolate con Almendras', 'Tableta grande de chocolate', 250000, 40, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_7, v_cat_kiosco, 'Papas Fritas Clásicas', 'Snack papas fritas paquete mediano', 180000, 60, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_7, v_cat_kiosco, 'Chicles Menta x4', 'Paquete de chicles refrescantes', 45000, 150, '../Assets/images/placeholder.png');

  -- Local 8: Mascotas
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url) VALUES 
    (v_user_id, v_store_8, v_cat_mascotas, 'Alimento Perro Adulto 15kg', 'Bolsa de alimento balanceado premium', 2450000, 10, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_8, v_cat_mascotas, 'Piedras Sanitarias Gato 2kg', 'Piedras aglomerantes', 450000, 30, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_8, v_cat_mascotas, 'Collar Ajustable', 'Collar de nylon para perro mediano', 380000, 20, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_8, v_cat_mascotas, 'Hueso de Juguete', 'Hueso de goma resistente', 250000, 25, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_8, v_cat_mascotas, 'Shampoo para Mascotas', 'Shampoo neutro sin lágrimas 500ml', 550000, 15, '../Assets/images/placeholder.png');

  -- Local 9: Farmacia
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url) VALUES 
    (v_user_id, v_store_9, v_cat_farmacia, 'Alcohol en Gel 250ml', 'Alcohol sanitizante', 280000, 50, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_9, v_cat_farmacia, 'Crema Hidratante', 'Crema corporal dermatológica', 1250000, 20, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_9, v_cat_farmacia, 'Caja de Curitas', 'Apósitos protectores x20', 150000, 100, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_9, v_cat_farmacia, 'Cepillo de Dientes', 'Cepillo cerdas suaves', 350000, 40, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_9, v_cat_farmacia, 'Pasta Dental 90g', 'Pasta con flúor protección total', 420000, 60, '../Assets/images/placeholder.png');

  -- Local 10: Deportes
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url) VALUES 
    (v_user_id, v_store_10, v_cat_deportes, 'Pelota de Fútbol N°5', 'Pelota oficial tamaño estándar', 2500000, 15, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_10, v_cat_deportes, 'Botella de Agua 750ml', 'Botella deportiva libre de BPA', 850000, 30, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_10, v_cat_deportes, 'Colchoneta de Yoga', 'Mat antideslizante 6mm', 1800000, 20, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_10, v_cat_deportes, 'Pesas Rusas 5kg', 'Kettlebell de hierro recubierto', 3200000, 10, '../Assets/images/placeholder.png'),
    (v_user_id, v_store_10, v_cat_deportes, 'Toalla de Microfibra', 'Toalla secado rápido compacta', 550000, 40, '../Assets/images/placeholder.png');

END $$;

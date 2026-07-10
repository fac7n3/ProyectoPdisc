-- Seed script to populate mock data using the first available user as the store owner

DO $$
DECLARE
  v_user_id uuid;
  v_almacen_id uuid;
  v_carniceria_id uuid;
  v_verduleria_id uuid;
  v_lacteos_id uuid;
  
  v_store_jose_id uuid;
  v_store_novillo_id uuid;
  v_store_esquina_id uuid;
  v_store_super_id uuid;
BEGIN
  -- Get the first available user (assuming the developer has logged in at least once)
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No users found in auth.users. Please sign up a user first before running this seed.';
    RETURN;
  END IF;

  -- Guard: este seed es de un solo uso (ya se aplicó a la base real). Si la primera
  -- tienda ya existe, no reinsertamos (evita duplicar stores/products en cada re-run).
  IF EXISTS (SELECT 1 FROM public.stores WHERE name = 'Almacén Don José') THEN
    RAISE NOTICE 'Seed 04 ya aplicado (Almacén Don José existe). Nada para hacer.';
    RETURN;
  END IF;

  -- 1. Insert Categories
  INSERT INTO public.categories (name, slug, icon) VALUES 
    ('Almacén', 'almacen', 'fa-solid fa-box'),
    ('Carnicería', 'carniceria', 'fa-solid fa-drumstick-bite'),
    ('Verdulería', 'verduleria', 'fa-solid fa-apple-whole'),
    ('Lácteos', 'lacteos', 'fa-solid fa-cheese')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_almacen_id FROM public.categories WHERE slug = 'almacen';
  SELECT id INTO v_carniceria_id FROM public.categories WHERE slug = 'carniceria';
  SELECT id INTO v_verduleria_id FROM public.categories WHERE slug = 'verduleria';
  SELECT id INTO v_lacteos_id FROM public.categories WHERE slug = 'lacteos';

  -- 2. Insert Stores (owned by the first user)
  INSERT INTO public.stores (owner_id, name, status) VALUES 
    (v_user_id, 'Almacén Don José', 'approved') RETURNING id INTO v_store_jose_id;
    
  INSERT INTO public.stores (owner_id, name, status) VALUES 
    (v_user_id, 'Carnicería El Novillo', 'approved') RETURNING id INTO v_store_novillo_id;
    
  INSERT INTO public.stores (owner_id, name, status) VALUES 
    (v_user_id, 'Almacén La Esquina', 'approved') RETURNING id INTO v_store_esquina_id;
    
  INSERT INTO public.stores (owner_id, name, status) VALUES 
    (v_user_id, 'Super Baradero', 'approved') RETURNING id INTO v_store_super_id;

  -- 3. Insert Products
  -- Product 1: Yerba
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url)
  VALUES (v_user_id, v_store_jose_id, v_almacen_id, 'Yerba Mate "La Vuelta" 500g', 'Yerba mate tradicional con palo', 245000, 100, '/img/yerba.webp');

  -- Product 2: Asado
  -- F10-03: no hay foto real de asado entre los mockups generados; placeholder genérico
  -- en vez de la ruta rota '../Assets/images/products/meat.png' (el archivo nunca existió).
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url)
  VALUES (v_user_id, v_store_novillo_id, v_carniceria_id, 'Asado Especial x 1kg', 'Asado de tira de primera calidad', 850000, 50, '/img/no-image.svg');

  -- Product 3: Cafe
  -- Note: price_cents is an integer. 5990 -> 599000 (if we use cents, wait! The original price is $5.990 which is 5990 pesos. In cents it's 599000). Wait, does price_cents mean pesos * 100? Yes.
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url)
  VALUES (v_user_id, v_store_jose_id, v_almacen_id, 'Café Molido Premium 500g', 'Café molido tostado natural', 599000, 30, '/img/coffee.webp');

  -- Product 4: Dulce de leche
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url)
  VALUES (v_user_id, v_store_esquina_id, v_almacen_id, 'Dulce de Leche Artesanal 1kg', 'Dulce de leche colonial', 420000, 20, '/img/dulce.webp');

  -- Product 5: Leche
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url)
  VALUES (v_user_id, v_store_super_id, v_lacteos_id, 'Leche Entera 1L', 'Sachet de leche entera', 89000, 200, '/img/milk.webp');

  -- Product 6: Galletitas
  INSERT INTO public.products (seller_id, store_id, category_id, title, description, price_cents, stock, image_url)
  VALUES (v_user_id, v_store_super_id, v_almacen_id, 'Galletitas de Agua Pack x3', 'Pack ahorro de galletitas de agua', 179000, 150, '/img/galletitas.webp');

END $$;

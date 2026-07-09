-- F0-03 (A113-139 / A113-140)
-- 1) Migrar price_cents -> price (PESOS enteros, sin centavos) en todo el sistema.
--    Decisión de producto: precios en PESOS enteros. Datos al migrar: 64 products
--    (todos divisibles por 100, sin redondeo); orders/order_items vacías.
-- 2) Arreglar validate_cart_prices: antes leía products.name / products.price
--    (columnas inexistentes: la tabla tiene title / price_cents) -> fallaba en runtime.

-- Guardas por columna: si ya se corrió esta migración (price_cents ya no existe),
-- cada bloque se saltea. Sin esto, re-ejecutar el script fallaría al intentar
-- renombrar una columna inexistente, o peor, dividiría por 100 una segunda vez
-- sobre datos que ya están en pesos.

-- === 1) products.price_cents -> price ===
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'price_cents'
  ) THEN
    ALTER TABLE public.products RENAME COLUMN price_cents TO price;
    ALTER TABLE public.products RENAME CONSTRAINT products_price_cents_check TO products_price_check;
    UPDATE public.products SET price = price / 100;
  END IF;
END $$;

-- === 2) order_items.price_cents -> price ===
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'price_cents'
  ) THEN
    ALTER TABLE public.order_items RENAME COLUMN price_cents TO price;
    ALTER TABLE public.order_items RENAME CONSTRAINT order_items_price_cents_check TO order_items_price_check;
    UPDATE public.order_items SET price = price / 100;
  END IF;
END $$;

-- === 3) orders.total_price_cents -> total_price ===
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_price_cents'
  ) THEN
    ALTER TABLE public.orders RENAME COLUMN total_price_cents TO total_price;
    ALTER TABLE public.orders RENAME CONSTRAINT orders_total_price_cents_check TO orders_total_price_check;
    UPDATE public.orders SET total_price = total_price / 100;
  END IF;
END $$;

-- === 4) Recrear validate_cart_prices con columnas reales (title, price) ===
-- Recibe [{ "id": "<uuid>", "qty": 2, "price": 2850 }]
-- Devuelve { "valid": bool, "total": <pesos>, "items": [...] }
CREATE OR REPLACE FUNCTION public.validate_cart_prices(cart_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item jsonb;
    prod_record record;
    item_total numeric;
    cart_total numeric := 0;
    validated_items jsonb := '[]'::jsonb;
    is_valid boolean := true;
    prod_uuid uuid;
    qty integer;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(cart_payload)
    LOOP
        -- Extraer el ID. Si no es un UUID válido, el item es inválido.
        BEGIN
            prod_uuid := (item->>'id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            is_valid := false;
            CONTINUE;
        END;

        qty := COALESCE((item->>'qty')::integer, 0);

        -- Buscar el producto activo en la BD (precio real en pesos)
        SELECT id, title, price, stock INTO prod_record
        FROM public.products
        WHERE id = prod_uuid AND is_active = true;

        IF NOT FOUND THEN
            is_valid := false;
            CONTINUE;
        END IF;

        item_total := prod_record.price * qty;
        cart_total := cart_total + item_total;

        -- El precio enviado por el cliente debe coincidir con el real (null-safe)
        IF (item->>'price')::numeric IS DISTINCT FROM prod_record.price THEN
            is_valid := false;
        END IF;

        -- Validar stock disponible
        IF prod_record.stock < qty THEN
            is_valid := false;
        END IF;

        -- Construir el item validado con el precio real de la BD
        validated_items := validated_items || jsonb_build_object(
            'id', prod_record.id,
            'title', prod_record.title,
            'qty', qty,
            'real_price', prod_record.price,
            'subtotal', item_total
        );
    END LOOP;

    RETURN jsonb_build_object(
        'valid', is_valid,
        'total', cart_total,
        'items', validated_items
    );
END;
$$;

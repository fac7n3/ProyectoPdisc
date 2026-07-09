-- 1. Tabla de carritos de usuario (Sincronización en la nube)
CREATE TABLE IF NOT EXISTS public.user_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    items JSONB DEFAULT '[]'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cart" ON public.user_carts;
CREATE POLICY "Users can view own cart" ON public.user_carts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own cart" ON public.user_carts;
CREATE POLICY "Users can insert own cart" ON public.user_carts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own cart" ON public.user_carts;
CREATE POLICY "Users can update own cart" ON public.user_carts FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Actualizar timestamp automáticamente
CREATE OR REPLACE FUNCTION public.update_user_carts_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_carts_modtime ON public.user_carts;
CREATE TRIGGER update_user_carts_modtime
BEFORE UPDATE ON public.user_carts
FOR EACH ROW EXECUTE PROCEDURE public.update_user_carts_modtime();


-- 2. Función para validar los precios del carrito en el servidor (Checkout seguro)
-- Recibe un JSONB con la forma [{ "id": "uuid_del_producto", "qty": 2 }]
-- Devuelve un JSONB con la forma { "valid": true|false, "total": 5000, "items": [...] }
CREATE OR REPLACE FUNCTION public.validate_cart_prices(cart_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Se ejecuta con permisos de DB para poder leer todos los productos
AS $$
DECLARE
    item jsonb;
    prod_record record;
    item_total numeric;
    cart_total numeric := 0;
    validated_items jsonb := '[]'::jsonb;
    is_valid boolean := true;
    prod_uuid uuid;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(cart_payload)
    LOOP
        -- Extraer el ID. Si no es un UUID válido, fallará.
        BEGIN
            prod_uuid := (item->>'id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            is_valid := false;
            CONTINUE;
        END;

        -- Buscar el producto en la BD
        SELECT id, name, price, stock INTO prod_record
        FROM public.products
        WHERE id = prod_uuid;

        IF NOT FOUND THEN
            is_valid := false;
            CONTINUE;
        END IF;

        -- Validar stock y precio
        item_total := prod_record.price * (item->>'qty')::integer;
        cart_total := cart_total + item_total;

        IF (item->>'price')::numeric != prod_record.price THEN
            is_valid := false; -- El precio fue manipulado en el cliente
        END IF;

        IF prod_record.stock < (item->>'qty')::integer THEN
            is_valid := false; -- Supera el stock disponible
        END IF;

        -- Construir el item validado (precio real de la BD)
        validated_items := validated_items || jsonb_build_object(
            'id', prod_record.id,
            'name', prod_record.name,
            'qty', (item->>'qty')::integer,
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

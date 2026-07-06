-- 1. Arreglar CODE-08: No sobreescribir el rol en el trigger handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
    v_role public.app_role;
BEGIN
    -- Validar el rol que viene en el metadata
    v_role := (case lower(coalesce(new.raw_user_meta_data ->> 'account_type', 'cliente'))
        when 'vendedor' then 'vendedor'
        when 'repartidor' then 'repartidor'
        when 'admin' then 'admin'
        else 'cliente'
    end)::public.app_role;

    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        new.id, 
        new.email, 
        coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
        v_role
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        -- FIX: Eliminamos el update de 'role'. Una vez creado, el rol solo lo puede cambiar un admin.
        updated_at = now();

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Arreglar AUTH-05: El bypass del trigger de protección de roles
CREATE OR REPLACE FUNCTION public.prevent_role_update_on_profile()
RETURNS trigger AS $$
BEGIN
    -- Si el rol está intentando ser modificado
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        -- auth.role() devuelve 'authenticated', 'anon', o 'service_role' (en llamadas via service key)
        -- current_user es 'postgres' o 'authenticator' dependiendo de cómo se haga la query.
        -- Para evitar que clientes (authenticated) y anónimos (anon) lo modifiquen:
        IF auth.role() IN ('authenticated', 'anon') THEN
            RAISE EXCEPTION 'No está permitido modificar el rol del usuario directamente por seguridad.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

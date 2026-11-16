-- 166: desactivar la verificación en dos pasos del personal (admin/moderador).
-- Pedido del usuario, 2026-11-16: "por ahora no la vamos a usar".
--
-- La 151 hacía que jwt_role() devolviera 'cliente' a un admin/moderador sin sesión
-- aal2. Ahora devuelve siempre el rol del JWT. Se mantiene la función (y la tabla
-- security_settings) para que reactivarla sea volver a aplicar el cuerpo de la 151
-- (sección 2); todas las policies y funciones siguen llamando a jwt_role().
create or replace function public.jwt_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return auth.jwt() -> 'app_metadata' ->> 'role';
end;
$$;

comment on function public.jwt_role() is
  'Rol del JWT (app_metadata.role). La exigencia de aal2 para admin/moderador está DESACTIVADA (166); el cuerpo con el chequeo está en la 151. Usar siempre esto, nunca auth.jwt()->''app_metadata''->>''role''.';

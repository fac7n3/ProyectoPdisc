-- Para publicar productos, el comercio tiene que tener cargado su alias
-- bancario (stores.transfer_alias, migración 106). Pedido del usuario el
-- 2026-09-23: "para subir productos tenés que sí o sí tener el alias cargado".
--
-- Por qué en la base y no solo en el panel: `products_insert_seller` deja
-- insertar por la API REST a cualquier vendedor/empleado de la tienda, así
-- que un chequeo solo de interfaz se saltea con un insert directo (misma
-- lección que orders_insert_own, migración 96). El panel (js/vender.js) igual
-- lo avisa antes de abrir el formulario, para que nadie llegue a este error.
--
-- Alcance, a propósito:
--   * Solo el ALTA (y mover un producto a otra tienda, update de store_id).
--     Editar, pausar o borrar un producto ya publicado sigue andando aunque
--     el comercio no tenga alias: los productos existentes no se tocan.
--   * El admin queda exento (carga de datos de prueba/soporte), mismo
--     criterio que el resto de las funciones con chequeo de rol.
--   * Borrar el alias después NO baja los productos: solo impide sumar
--     nuevos hasta volver a cargarlo.

create or replace function public.require_store_transfer_alias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alias text;
begin
  if (select auth.jwt()) -> 'app_metadata' ->> 'role' = 'admin' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.store_id is not distinct from old.store_id then
    return new;
  end if;

  select transfer_alias into v_alias from public.stores where id = new.store_id;

  if v_alias is null or btrim(v_alias) = '' then
    raise exception 'Para publicar productos, el comercio tiene que cargar su alias bancario (Perfil de mi comercio → Transferencia bancaria).'
      using errcode = 'P0001', hint = 'missing_transfer_alias';
  end if;

  return new;
end;
$$;

revoke all on function public.require_store_transfer_alias() from public, anon, authenticated;

drop trigger if exists products_require_transfer_alias on public.products;
create trigger products_require_transfer_alias
  before insert or update of store_id on public.products
  for each row execute function public.require_store_transfer_alias();

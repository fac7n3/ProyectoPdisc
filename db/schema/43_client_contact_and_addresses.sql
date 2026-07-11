-- F12-05 (teléfono de contacto) + F12-06 (direcciones guardadas).
--
-- Hallazgo al auditar esto: `profiles.phone`/`address`/`address_details` YA
-- existían en la base real y YA estaban conectados de punta a punta en
-- `js/perfil.js` (pestaña "Direcciones" del perfil) — pero se habían creado
-- a mano en el dashboard de Supabase, nunca quedaron en una migración
-- versionada (el propio comentario en perfil.js ya avisaba de esto). Este
-- archivo los deja en el control de versiones (idempotente, no cambia nada
-- en la base real que no estuviera ya).
--
-- Lo que sí faltaba de verdad: ni el vendedor ni el repartidor podían VER
-- ese teléfono/dirección para coordinar una entrega — no había ninguna
-- policy que permitiera leer el `profiles` de un cliente ajeno, ni siquiera
-- para quien tiene una orden real con ese cliente.

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists address_details text;

-- Un vendedor ve el profile de un cliente que le compró en su tienda;
-- un repartidor ve el profile de un cliente cuya entrega tiene asignada.
-- No es acceso general a profiles ajenos -- solo mientras haya una
-- transacción real de por medio.
drop policy if exists profiles_select_order_participants on public.profiles;
create policy profiles_select_order_participants on public.profiles for select to authenticated
using (
  exists (
    select 1 from public.orders o
    join public.stores s on s.id = o.store_id
    where o.client_id = profiles.id and s.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.deliveries d
    join public.orders o on o.id = d.order_id
    where o.client_id = profiles.id and d.repartidor_id = auth.uid()
  )
);

-- El banner grande del home (mosaic_g) pasa de 3 a 5 publicidades que se van
-- pasando solas (pedido del usuario 2026-11-12). Los demás espacios siguen en 3.
-- Solo se amplía el check de `position` (1 a 5) y se siembran las posiciones 4 y 5
-- de mosaic_g, libres (sin comercio). Policies y triggers no cambian: validan
-- contra las filas de la tabla, no contra una lista fija.
alter table public.home_promos drop constraint if exists home_promos_position_check;
alter table public.home_promos add constraint home_promos_position_check
  check (position between 1 and 5);

insert into public.home_promos (slot, position)
values ('mosaic_g', 4), ('mosaic_g', 5)
on conflict (slot, position) do nothing;

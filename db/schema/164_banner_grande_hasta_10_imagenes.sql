-- El banner grande del home (mosaic_g) pasa de 5 a 10 publicidades (pedido del usuario
-- 2026-11-12). Se amplía el check de `position` (1 a 10) y se siembran las posiciones 6 a 10
-- de mosaic_g, libres (sin comercio). Los demás espacios siguen en 3.
alter table public.home_promos drop constraint if exists home_promos_position_check;
alter table public.home_promos add constraint home_promos_position_check
  check (position between 1 and 10);

insert into public.home_promos (slot, position)
select 'mosaic_g', p from generate_series(6, 10) as p
on conflict (slot, position) do nothing;

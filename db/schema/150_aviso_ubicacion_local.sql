-- 150 — Aviso a los comercios: "si tenés local a la calle, marcalo en el mapa".
--
-- Desde la 147 el dueño puede marcar su local en "Perfil de mi comercio"
-- (stores.lat/lng) y el buscador usa eso para la fila "Más cerca" del
-- comparador. Al publicarlo ningún comercio la tenía cargada.
--
-- Un solo aviso por dueño, a diferencia del recordatorio de alias/CBU (133),
-- que se repite cada 6 horas: tener local a la calle no es obligatorio (hay
-- quien vende desde su casa) y el texto le dice que, si no tiene, lo ignore.
-- Con varios comercios sin ubicación, un solo aviso que los nombra.
--
-- A quién ya se le avisó queda en store_location_reminders (no en la propia
-- notificación: si la borra, no tiene que volver a llegarle). El trabajo de
-- pg_cron corre todos los días, así un comercio aprobado más adelante también
-- recibe su aviso, una vez.

create table if not exists public.store_location_reminders (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);

-- Sin policies: solo la usa la función de abajo (SECURITY DEFINER).
alter table public.store_location_reminders enable row level security;

create or replace function public.remind_stores_missing_location()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner record;
  v_sent integer := 0;
begin
  for v_owner in
    select s.owner_id,
           count(*) as store_count,
           (array_agg(s.id order by s.created_at))[1] as first_store_id,
           (array_agg(s.name order by s.created_at))[1] as first_store_name
    from public.stores s
    where s.status = 'approved'
      and s.owner_id is not null
      and s.lat is null
      and not exists (select 1 from public.store_location_reminders r where r.owner_id = s.owner_id)
    group by s.owner_id
  loop
    perform public.create_notification(
      v_owner.owner_id,
      'store_location_missing',
      jsonb_build_object(
        'store_id', v_owner.first_store_id,
        'store_name', v_owner.first_store_name,
        'store_count', v_owner.store_count
      )
    );
    insert into public.store_location_reminders (owner_id) values (v_owner.owner_id)
      on conflict (owner_id) do nothing;
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.remind_stores_missing_location() from public, anon, authenticated;

-- Todos los días a las 13:17 UTC (10:17 en Argentina). Solo le escribe a quien
-- todavía no recibió el aviso.
select cron.schedule(
  'remind-stores-missing-location',
  '17 13 * * *',
  $cron$select public.remind_stores_missing_location();$cron$
);

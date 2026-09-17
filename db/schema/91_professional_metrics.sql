-- Métricas del directorio "Contratar": cuánta gente miró la tarjeta del
-- profesional y cuántos tocaron Llamar o WhatsApp. El profesional las ve en
-- su panel (pages/profesional.html).
--
-- Contadores agregados por día y no una tabla de eventos crudos: el volumen
-- es de pueblo chico y lo único que se muestra son totales de los últimos 30
-- días, así que guardar una fila por click sería escribir mucho para no usarlo
-- nunca. Con (professional_id, event_type, day) de PK, incrementar es un solo
-- upsert y quedan ~3 filas por profesional por día.

create table if not exists public.professional_metrics_daily (
  professional_id uuid not null references public.professionals(id) on delete cascade,
  event_type text not null check (event_type in ('profile_view', 'call_click', 'whatsapp_click')),
  day date not null default current_date,
  count integer not null default 0 check (count >= 0),
  primary key (professional_id, event_type, day)
);

create index if not exists professional_metrics_daily_professional_day_idx
  on public.professional_metrics_daily(professional_id, day);

alter table public.professional_metrics_daily enable row level security;

-- A propósito NO hay policy de insert/update para nadie: la tabla se escribe
-- únicamente por el RPC de abajo. Mismo criterio que notifications (38).
drop policy if exists professional_metrics_select_own on public.professional_metrics_daily;
create policy professional_metrics_select_own on public.professional_metrics_daily
  for select to authenticated
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.owner_id = auth.uid()
  ));

drop policy if exists professional_metrics_select_admin on public.professional_metrics_daily;
create policy professional_metrics_select_admin on public.professional_metrics_daily
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'cliente') = 'admin');

-- Quien mira la tarjeta puede no estar logueado, así que el contador lo sube
-- un RPC SECURITY DEFINER. Está acotado a propósito: valida el tipo de evento
-- contra la lista, exige que el profesional exista y esté activo, y solo suma
-- 1 -- nunca recibe el valor a escribir ni puede tocar otra columna.
--
-- Ojo con esta clase de función: en este proyecto ya hubo un RPC SECURITY
-- DEFINER que no validaba nada adentro (approve_seller_request, parchado en la
-- migración 75) y permitía auto-aprobarse como vendedor. De ahí el search_path
-- fijo y los chequeos explícitos.
create or replace function public.increment_professional_metric(
  p_professional_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if p_event_type not in ('profile_view', 'call_click', 'whatsapp_click') then
    raise exception 'Tipo de evento inválido.';
  end if;

  if not exists (
    select 1 from public.professionals
    where id = p_professional_id and is_active = true
  ) then
    raise exception 'Profesional inválido.';
  end if;

  insert into public.professional_metrics_daily (professional_id, event_type, day, count)
  values (p_professional_id, p_event_type, current_date, 1)
  on conflict (professional_id, event_type, day)
  do update set count = public.professional_metrics_daily.count + 1;
end;
$$;

grant execute on function public.increment_professional_metric(uuid, text) to anon, authenticated;

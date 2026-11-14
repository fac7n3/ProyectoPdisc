-- Farmacias de turno: sincronización con el servicio oficial del Colegio Farmacéutico de Baradero.
--
-- Hasta acá las tablas `pharmacies` y `pharmacy_shifts` (migración 67) estaban VACÍAS: la página
-- `pages/farmacias.html` y la banda del inicio dicen "no tenemos el turno" porque nadie cargaba los datos
-- a mano. La fuente real es https://farmaciasdeturnobaradero.com/turno (servicio oficial del Colegio
-- Farmacéutico). Esa página es una SPA que lee una API pública de solo lectura:
--     GET https://api.farmaciasdeturnobaradero.com/api/v1/public/turno
--     { success, data: { today: {dutyDate, openTime, closeTime, pharmacy}, upcoming: [ ... ], generatedAt } }
--     pharmacy = { id (uuid), name, address, phone, mapsUrl }
--
-- Decisión: el navegador NO llama a esa API (la CSP solo deja `connect-src` a Supabase, y sumar un tercero
-- rompe el humo e2e y la regla "sin hosts de terceros"). La llama la base, con la extensión `http`, y vuelca
-- el resultado en las MISMAS tablas que ya lee la página. Así el frontend no cambia y sigue valiendo todo
-- lo de `js/farmacias.js` (ventana 8:00 a 8:00, "ante la duda no mostrar", aviso de datos viejos).
--
--   sync_farmacias_turno()   trae la API, valida cada fila y hace upsert. Devuelve un resumen jsonb.
--                            Si la API falla o devuelve algo raro, LEVANTA una excepción y no toca nada
--                            (queda en cron.job_run_details); las filas ya cargadas siguen como estaban.
--   cron 'sync-farmacias-turno'   cada 2 horas (minuto 17).
--
-- Detalles:
--   * El `id` de la farmacia de la API (uuid) se usa como `pharmacies.id`: el upsert es idempotente y no
--     se duplica nada aunque corra mil veces.
--   * Del lado nuestro sobreviven los campos que la API no trae (`whatsapp`, `pharmacist`, `insurances`):
--     el upsert no los pisa, y `phone`/`maps_url` solo se pisan si la API trae valor.
--   * Un turno por día (`unique (shift_date)`): si el admin cargó a mano uno de los días que informa la API,
--     el del Colegio manda. Los días que la API no informa no se tocan.
--   * Cada corrida exitosa deja `updated_at = now()` en los turnos que confirmó la API: el cartel
--     "Turnos actualizados el ..." de la página significa "la última vez que verificamos contra el Colegio".
--     Si el cron se cae 10 días, la página avisa sola que los datos pueden estar vencidos.
--
-- Aditiva e idempotente. Vuelta atrás: select cron.unschedule('sync-farmacias-turno'); drop function
-- public.sync_farmacias_turno(); (las filas ya cargadas quedan y se pueden borrar desde Admin).

create extension if not exists http with schema extensions;

create or replace function public.sync_farmacias_turno()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c_url constant text := 'https://api.farmaciasdeturnobaradero.com/api/v1/public/turno';
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_res extensions.http_response;
  v_body jsonb;
  v_data jsonb;
  v_item jsonb;
  v_ph jsonb;
  v_items jsonb := '[]'::jsonb;
  v_id uuid;
  v_name text;
  v_address text;
  v_phone text;
  v_maps text;
  v_date date;
  v_open time;
  v_close time;
  v_shifts integer := 0;
  v_skipped integer := 0;
  v_pharmacies integer := 0;
  v_seen uuid[] := '{}';
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '15');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '8');

  v_res := extensions.http_get(c_url);
  if v_res.status is distinct from 200 then
    raise exception 'sync_farmacias_turno: la API respondió HTTP %', v_res.status;
  end if;

  begin
    v_body := v_res.content::jsonb;
  exception when others then
    raise exception 'sync_farmacias_turno: la respuesta no es JSON';
  end;

  if coalesce((v_body ->> 'success')::boolean, false) is not true
     or jsonb_typeof(v_body -> 'data') is distinct from 'object' then
    raise exception 'sync_farmacias_turno: respuesta inesperada de la API';
  end if;
  v_data := v_body -> 'data';

  -- Un solo arreglo con "hoy" + "próximos".
  if jsonb_typeof(v_data -> 'today') = 'object' then
    v_items := v_items || jsonb_build_array(v_data -> 'today');
  end if;
  if jsonb_typeof(v_data -> 'upcoming') = 'array' then
    v_items := v_items || (v_data -> 'upcoming');
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'sync_farmacias_turno: la API no informó ningún turno';
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    begin
      v_ph := v_item -> 'pharmacy';

      -- Ante la duda NO se carga la fila (criterio de toda esta función: un dato mal mandaría a alguien
      -- a la puerta equivocada de madrugada). Cada campo obligatorio se valida antes de insertar.
      if jsonb_typeof(v_ph) is distinct from 'object'
         or coalesce(v_ph ->> 'id', '') !~ c_uuid
         or nullif(btrim(coalesce(v_ph ->> 'name', '')), '') is null
         or nullif(btrim(coalesce(v_ph ->> 'address', '')), '') is null
         or coalesce(v_item ->> 'dutyDate', '') !~ '^\d{4}-\d{2}-\d{2}' then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_id := (v_ph ->> 'id')::uuid;
      v_name := left(btrim(v_ph ->> 'name'), 120);
      v_address := left(btrim(v_ph ->> 'address'), 200);
      v_phone := nullif(left(btrim(coalesce(v_ph ->> 'phone', '')), 40), '');
      -- maps_url va derecho a un href: solo https.
      v_maps := nullif(btrim(coalesce(v_ph ->> 'mapsUrl', '')), '');
      if v_maps is not null and v_maps !~* '^https://[^\s]+$' then
        v_maps := null;
      end if;
      v_date := left(v_item ->> 'dutyDate', 10)::date;
      v_open := case when coalesce(v_item ->> 'openTime', '') ~ '^\d{2}:\d{2}' then (v_item ->> 'openTime')::time else time '08:00' end;
      v_close := case when coalesce(v_item ->> 'closeTime', '') ~ '^\d{2}:\d{2}' then (v_item ->> 'closeTime')::time else time '08:00' end;

      insert into public.pharmacies (id, name, address, phone, maps_url, is_active)
      values (v_id, v_name, v_address, v_phone, v_maps, true)
      on conflict (id) do update
        set name = excluded.name,
            address = excluded.address,
            phone = coalesce(excluded.phone, public.pharmacies.phone),
            maps_url = coalesce(excluded.maps_url, public.pharmacies.maps_url),
            is_active = true;

      if not (v_id = any(v_seen)) then
        v_seen := v_seen || v_id;
        v_pharmacies := v_pharmacies + 1;
      end if;

      insert into public.pharmacy_shifts (pharmacy_id, shift_date, opens_at, closes_at)
      values (v_id, v_date, v_open, v_close)
      on conflict (shift_date) do update
        set pharmacy_id = excluded.pharmacy_id,
            opens_at = excluded.opens_at,
            closes_at = excluded.closes_at,
            updated_at = now();

      v_shifts := v_shifts + 1;
    exception when others then
      -- Una fila rara no tira abajo las demás.
      v_skipped := v_skipped + 1;
    end;
  end loop;

  if v_shifts = 0 then
    raise exception 'sync_farmacias_turno: ninguna fila de la API pasó la validación (% descartadas)', v_skipped;
  end if;

  return jsonb_build_object(
    'turnos', v_shifts,
    'farmacias', v_pharmacies,
    'descartadas', v_skipped,
    'generado_por_la_api', v_data ->> 'generatedAt'
  );
end;
$$;

revoke all on function public.sync_farmacias_turno() from public, anon, authenticated;

-- Cada 2 horas (minuto 17). El turno cambia a las 8:00 de Argentina; con esto, a lo sumo ~2 h de demora.
-- cron.schedule con el mismo nombre reemplaza el trabajo anterior.
select cron.schedule(
  'sync-farmacias-turno',
  '17 */2 * * *',
  $cron$select public.sync_farmacias_turno();$cron$
);

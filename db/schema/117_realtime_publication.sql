-- 2026-10-02: tiempo real (Supabase Realtime, "postgres_changes").
--
-- Hasta ahora el sitio no usaba Realtime en ningún lado: las notificaciones
-- se pedían cada 30 segundos (js/toast-utils.js) y todo lo demás (pedidos del
-- comercio, "Mis compras", reclamos, consultas de un profesional, el panel de
-- admin, el carrito en otro dispositivo) recién aparecía al recargar la
-- página. Ahora cada página se suscribe a los cambios de estas tablas
-- (js/realtime-utils.js) y se actualiza sola, en todos los dispositivos donde
-- esté abierta la cuenta.
--
-- Por qué es seguro sumar estas tablas a la publicación: Realtime respeta la
-- RLS. Por cada cambio, el servidor de Realtime corre la policy de SELECT con
-- el JWT de cada suscriptor y solo le manda la fila a quien igual podría
-- leerla por la API REST. Las 11 tablas tienen RLS activa (verificado contra
-- pg_class.relrowsecurity antes de aplicar), así que esto no le muestra a
-- nadie nada que hoy no pueda ver con un select.
--
-- Una sola excepción, documentada por Supabase: los DELETE no pasan por la
-- RLS (Postgres no puede saber si el usuario veía una fila que ya no existe)
-- y llegan con la clave primaria nada más (old = { id }), sin el resto de las
-- columnas. js/notifications-live.js los usa solo para borrar de la vista
-- una notificación que ya tenía en pantalla; un id suelto no dice nada.
--
-- No se suman tablas con datos que la RLS deja leer a cualquiera pero que no
-- hace falta seguir en vivo (products, stores...): cada tabla publicada le
-- suma al servidor una verificación de RLS por cambio y por suscriptor.
--
-- Idempotente: solo agrega las que todavía no están.
do $$
declare
  t text;
begin
  foreach t in array array[
    'notifications',           -- campanita, avisos emergentes, centro de notificaciones
    'orders',                  -- pedidos del comercio, "Mis compras", repartidor, admin
    'payment_proofs',          -- comprobantes de transferencia (comercio y admin)
    'deliveries',              -- cola del repartidor
    'support_tickets',         -- reclamos (usuario y admin)
    'support_ticket_messages', -- respuestas dentro de un reclamo
    'professional_inquiries',  -- pedidos de presupuesto de un profesional
    'seller_requests',         -- solicitudes de comercio (admin)
    'professional_requests',   -- solicitudes de profesional (admin)
    'reviews',                 -- reseñas reportadas (admin) y reseñas del profesional
    'user_carts'               -- el mismo carrito en todos los dispositivos
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

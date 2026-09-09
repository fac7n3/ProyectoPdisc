-- Se elimina el chat interno comprador-vendedor (F7-02, conversations +
-- messages de 37_conversations_messages.sql) a pedido del usuario:
-- "Contactar al vendedor" pasa a abrir teléfono/WhatsApp directo en vez de
-- un chat dentro de la página. Ver 82_store_contact_and_social.sql para el
-- reemplazo y js/store-contact-utils.js para la lógica del nuevo botón.
--
-- Aplicada a producción el 2026-09-09. Al momento de aplicarla había 10
-- conversaciones y 2 mensajes reales en la base -- se perdieron con esta
-- migración (a pedido explícito del usuario, avisado de antemano).

drop trigger if exists messages_notify_new on public.messages;
drop function if exists public.notify_new_message();
drop table if exists public.messages;
drop table if exists public.conversations;

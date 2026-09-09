-- Reemplaza el checkbox accepts_contact (sí/no, 58_store_accepts_contact.sql)
-- por 3 opciones: 'phone' (el botón "Contactar al vendedor" muestra/llama al
-- teléfono), 'whatsapp' (abre wa.me con un mensaje prellenado) o 'none' (sin
-- botón). Todas las tiendas ya tienen `phone` obligatorio desde el alta y
-- ninguna tenía whatsapp todavía, así que 'phone' es la migración natural de
-- accepts_contact=true (antes tampoco distinguía el medio). Reemplaza
-- también el chat interno eliminado en 81_remove_in_app_messaging.sql.
--
-- Aplicada a producción el 2026-09-09.

alter table public.stores
  add column if not exists contact_method text not null default 'phone'
    check (contact_method in ('phone', 'whatsapp', 'none'));

update public.stores
  set contact_method = case when accepts_contact = false then 'none' else 'phone' end;

alter table public.stores add column if not exists whatsapp text;

alter table public.stores drop column if exists accepts_contact;

-- Redes sociales: 6 campos fijos (mismo criterio que professionals/pharmacies,
-- volumen y forma conocida de antemano, no ameritan tabla aparte). Cada red
-- tiene su propio link + un check "mostrar en mi comercio" -- el frontend
-- solo la muestra si ambas cosas están: activada Y con un link cargado.
alter table public.stores
  add column if not exists social_instagram text,
  add column if not exists social_instagram_show boolean not null default true,
  add column if not exists social_facebook text,
  add column if not exists social_facebook_show boolean not null default true,
  add column if not exists social_tiktok text,
  add column if not exists social_tiktok_show boolean not null default true,
  add column if not exists social_x text,
  add column if not exists social_x_show boolean not null default true,
  add column if not exists social_youtube text,
  add column if not exists social_youtube_show boolean not null default true,
  add column if not exists social_website text,
  add column if not exists social_website_show boolean not null default true;

comment on column public.stores.contact_method is 'Cómo se puede contactar al vendedor desde producto.html/comercio.html: phone (llama/muestra el teléfono), whatsapp (abre wa.me con mensaje prellenado) o none (sin botón).';
comment on column public.stores.whatsapp is 'Número de WhatsApp del comercio (solo dígitos al usarlo, igual que professionals.whatsapp). NULL = no cargado.';

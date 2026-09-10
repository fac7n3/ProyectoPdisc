-- Redes sociales para el profesional/técnico, mismo criterio y mismas 6
-- redes que ya tiene un comercio (82_store_contact_and_social.sql): un link
-- + un check "mostrar" por red, se pintan como íconos en su tarjeta de
-- contratar.html (getVisibleSocialLinks() en js/store-contact-utils.js, ya
-- genérica -- no le importa si el objeto es una `store` o un `professional`,
-- solo que tenga los campos `social_<red>`/`social_<red>_show`).
--
-- No hace falta tocar RLS: `professionals_update_own`
-- (86_professionals_update_own.sql) ya deja al dueño actualizar su fila
-- entera, sin restricción por columna.

alter table public.professionals
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

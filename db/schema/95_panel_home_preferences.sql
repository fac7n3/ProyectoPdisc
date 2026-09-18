-- Home según tipo de cuenta: preferencia de auto-redirect al panel propio +
-- registro de qué paneles ya vieron la bienvenida con la explicación de sus
-- secciones.
--
-- auto_redirect_panel_enabled: si es true (default), una cuenta con un solo
-- panel posible (vendedor, empleada de un comercio, profesional publicado, o
-- admin/moderador SIN además vender/ofrecer un servicio) entra directo a su
-- panel en vez de ver el inicio de compras al iniciar sesión (ver
-- initPanelAction en js/home.js). Se apaga desde Perfil → Ajustes; aunque
-- esté apagada, la persona sigue pudiendo entrar a su panel a mano desde
-- "Tu cuenta" en Información de tu perfil (role-panel-link) o desde el botón
-- "Panel" del inicio.
--
-- panel_onboarding_seen: qué paneles ya vieron el overlay de bienvenida (una
-- tarjeta por sección del sidebar, ver js/panel-onboarding-utils.js). Claves
-- posibles hoy: "vendedor", "profesional", "admin". Un jsonb en vez de tres
-- columnas booleanas porque las claves son abiertas (podrían sumarse paneles
-- nuevos más adelante) y porque una misma cuenta puede tener que ver más de
-- uno (ej. vendedor que además es admin).
--
-- Mismo patrón que 66_cart_hints_preference.sql: cache en localStorage +
-- estas columnas como fuente de verdad, con fallback defensivo en el código
-- mientras esta migración no esté aplicada.
--
-- Sin RLS nueva: profiles_select_own / profiles_update_own
-- (01_auth_profiles.sql) ya cubren cualquier columna de la propia fila.
--
-- Idempotente: "add column if not exists" -- correrla dos veces no hace nada.

alter table public.profiles
  add column if not exists auto_redirect_panel_enabled boolean not null default true;

alter table public.profiles
  add column if not exists panel_onboarding_seen jsonb not null default '{}'::jsonb;

comment on column public.profiles.auto_redirect_panel_enabled is
  'Si false, esta cuenta no entra automáticamente a su panel al iniciar sesión: ve primero el inicio de compras. Se edita desde Perfil → Ajustes.';

comment on column public.profiles.panel_onboarding_seen is
  'Qué paneles (vendedor/profesional/admin) ya vieron el overlay de bienvenida con la explicación de sus secciones. Se completa solo, la primera vez que se entra a cada panel.';

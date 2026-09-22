# Migraciones SQL pendientes de aplicar

> **IMPORTANTE — leer antes de cualquier otra tarea.**
>
> Este archivo lista las migraciones SQL nuevas que todavía **no se aplicaron**
> a la base de producción de Supabase. Cualquier agente Claude (o humano) con
> acceso al proyecto debe aplicarlas en orden antes de considerar "listo" el
> trabajo que las generó.
>
> **Si tenés credenciales de Supabase** (MCP tools de Supabase cargadas,
> `SUPABASE_ACCESS_TOKEN` en el entorno, o acceso al SQL Editor del dashboard
> del proyecto `otzhdwuaffcplrveuadc`): aplicá cada archivo con `execute_sql`
> o pegándolo en el SQL Editor, en el orden en que aparecen acá. Si no tenés
> credenciales, dejá este archivo tal cual y avisá al usuario que falta aplicar.
>
> **Después de aplicar**: borrá la entrada correspondiente de la lista de
> abajo (o marcala como ✅ aplicada con la fecha), así el próximo agente no la
> repite. Todas las migraciones son idempotentes por diseño (ver F0-07), así
> que correr dos veces la misma no rompe nada — pero no es necesario.

---

## Pendientes (en orden de aplicación)

*(Sin pendientes en esta rama.)*

## ✅ Aplicadas recientemente

- `db/schema/99_protect_is_suspended_on_profile.sql` — **aplicada el 2026-09-22** vía
  `apply_migration` (nombre en Supabase: `protect_is_suspended_on_profile`). Encontrada en una
  auditoría de seguridad de "Mi perfil": `profiles_update_own` no restringe columnas, y
  `profiles.is_suspended` (pensada para suspender repartidores) no tenía la misma protección que
  `role` -- un usuario podía des-suspenderse a sí mismo con un update directo. El trigger
  `prevent_role_update_on_profile` ahora también protege `is_suspended` bajo la bandera
  `app.role_change_authorized`, y `admin_set_repartidor_suspended` la setea antes de su propio
  update. Verificado con pruebas en transacciones con ROLLBACK. Detalle completo en el skill
  `progreso-baradero-local`.

- `db/schema/98_reviews_moderador_only_hides.sql` — **aplicada el 2026-09-22** vía
  `apply_migration` (nombre en Supabase: `reviews_moderador_only_hides`). Encontrada en una
  auditoría de seguridad del panel de admin: el trigger `protect_review_owner_reply()` eximía a
  `moderador` de todo chequeo de columna en `reviews`, así que ese rol (deliberadamente acotado,
  50_moderador_role.sql) podía en los hechos reescribir el rating/comentario/autor de cualquier
  reseña en vez de solo ocultarla/mostrarla, que es todo lo que hace el panel. Ahora el trigger
  bloquea cualquier cambio de moderador que no sea `is_hidden`. `admin` no se tocó (ya tiene acceso
  total consistente en el resto del proyecto). Detalle completo en el skill
  `progreso-baradero-local`.

- `db/schema/97_lock_down_request_status_on_insert.sql` — **aplicada el 2026-09-22** vía
  `apply_migration` (nombre en Supabase: `lock_down_request_status_on_insert`). Encontrada en una
  auditoría de seguridad del panel de profesional/técnico: `professional_requests_insert_own` y
  `seller_requests_insert_own` no restringían la columna `status` al insertar, así que un usuario
  podía autoinsertar su solicitud ya "aprobada"/"rechazada" (sin ganar ningún privilegio real,
  pero desapareciendo de la cola de revisión del admin). El `with check` ahora exige
  `status = 'pending'` en las dos. Detalle completo en el skill `progreso-baradero-local`.

- `db/schema/96_lock_down_direct_order_inserts.sql` — **aplicada el 2026-09-22** vía
  `apply_migration` (nombre en Supabase: `lock_down_direct_order_inserts`). Fix de seguridad
  ALTA anotado el 2026-09-16: revoca el `INSERT` directo de `orders`/`order_items` para
  `authenticated`/`anon` y borra `orders_insert_own`/`order_items_insert_own` (solo validaban
  `client_id = auth.uid()`, sin cubrir `total_price`/`payment_status`). `create_order()` sigue
  funcionando igual — es `SECURITY DEFINER`, dueña `postgres`, misma dueña de las dos tablas, así
  que bypassea RLS y grants. Verificado post-aplicación contra `information_schema.role_table_grants`.
  Detalle completo en el skill `progreso-baradero-local`.

- `db/schema/66_cart_hints_preference.sql` — **aplicada el 2026-08-18** vía `apply_migration`
  (nombre en Supabase: `cart_hints_preference`). Agrega `profiles.cart_hints_enabled`
  (boolean not null default true), la preferencia "Mostrar ayudas en el carrito" que se edita
  desde Perfil → Mis datos. Verificado post-aplicación: la columna existe y los 15 perfiles
  quedaron con las ayudas activas por el default. Sin RLS ni funciones nuevas
  (`profiles_select_own`/`profiles_update_own` ya cubren la columna).

- `db/schema/67_pharmacies.sql` — **aplicada el 2026-08-16** (A113-261). Crea `pharmacies` y
  `pharmacy_shifts` con RLS (lectura pública incluido `anon`, escritura solo admin) y triggers de
  auditoría.
  **Gotcha que costó un rato:** la tabla `pharmacies` **ya existía** en producción de un intento
  anterior de esta misma función (vacía, con `id/name/address/phone/hours/is_active/created_at`).
  Un `create table if not exists` con la definición completa **no falla pero tampoco agrega nada**:
  se saltea la tabla en silencio y la página revienta después con
  `column pharmacies.whatsapp does not exist`. La migración quedó reescrita con
  `create table` mínimo + `alter table ... add column if not exists` por columna, que es idempotente
  y sirve tanto en base limpia como en la que ya tenía la tabla vieja. Se aplicó también una
  migración correctiva (`pharmacies_missing_columns`) sobre la base real.
  Las tablas quedan **vacías a propósito**: no hay seed porque no tenemos los datos reales de las
  farmacias de Baradero, e inventarlos sería repetir el bug que este módulo vino a arreglar.

- `db/schema/60_seller_request_multi_category.sql` — **aplicada el 2026-08-16** vía
  `apply_migration` (nombre en Supabase: `seller_request_multi_category`). Agrega
  `seller_requests.category_slugs` (array) para P2-10. Verificado post-aplicación: la columna
  existe y el backfill corrió sobre 2 de las 3 solicitudes (la tercera es la fila vieja de
  prueba con `category_slug` en null, sin rubro que copiar — esperado, mismo caso que
  documenta `16_input_validation_constraints.sql`).

> **Numeración — no reusar:** 61 a 65 están tomadas por `feature/logistica-terceros` (sin
> aplicar todavía). 66 y 67 ya fueron aplicadas (arriba). La próxima migración nueva arranca en
> la **68**.

---

Antes de esta entrada: verificado contra la base real (`list_migrations`, proyecto
`otzhdwuaffcplrveuadc`) el 2026-07-23: **todas las migraciones 01 a 59 ya
están aplicadas**, incluidas 54-59 que esta lista había dejado de actualizar
(quedaban registradas como pendientes/no mencionadas pese a estar aplicadas
desde las sesiones del 2026-07-14 al 2026-07-16).

---

## Cómo aplicar (3 formas, cualquiera sirve)

### 1. MCP de Supabase (preferido si hay tools cargadas)
```
codebase-memory-mcp / supabase MCP expone execute_sql
→ ejecutar el contenido de cada archivo .sql contra el project
  "otzhdwuaffcplrveuadc" (Baradero Local)
```

### 2. Supabase CLI (si está logueada)
```bash
supabase db execute --project-ref otzhdwuaffcplrveuadc < db/schema/54_support_ticket_messages.sql
supabase db execute --project-ref otzhdwuaffcplrveuadc < db/schema/55_user_addresses.sql
```

### 3. SQL Editor del dashboard (manual)
1. Entrar a https://supabase.com/dashboard/project/otzhdwuaffcplrveuadc/sql/new
2. Pegar el contenido de cada archivo y ejecutar.
3. Verificar que no haya errores.

## Después de aplicar

- Marcar cada entrada como ✅ aplicada (o borrarla) en este archivo.
- Si algo falla, **no insistir a ciegas**: las migraciones son idempotentes
  (`create table if not exists`, `drop policy if exists` antes de crear) así
  que re-correrlas no rompe nada, pero un error nuevo sí hay que investigarlo.
- El `get_advisors` de Supabase se puede correr después para verificar que no
  haya hallazgos críticos nuevos (mismo criterio que F1-02 y el resto del
  proyecto: revocar `EXECUTE` de `anon`/`public` en funciones `SECURITY DEFINER`
  internas, fijar `search_path`, etc. — las migraciones nuevas ya lo hacen).

## Historial (ya aplicadas, no tocar)

Las migraciones 01 a 59 ya están aplicadas en producción (ver skill
`progreso-baradero-local` para el detalle de cada una). Este archivo solo
lista las pendientes.

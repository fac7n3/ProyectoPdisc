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

- `db/schema/66_cart_hints_preference.sql` — **aplicada el 2026-08-18** vía `apply_migration`
  (nombre en Supabase: `cart_hints_preference`). Agrega `profiles.cart_hints_enabled`
  (boolean not null default true), la preferencia "Mostrar ayudas en el carrito" que se edita
  desde Perfil → Mis datos. Verificado post-aplicación: la columna existe y los 15 perfiles
  quedaron con las ayudas activas por el default. Sin RLS ni funciones nuevas
  (`profiles_select_own`/`profiles_update_own` ya cubren la columna).
- `db/schema/60_seller_request_multi_category.sql` — **aplicada el 2026-08-16**
  (`seller_request_multi_category`). Agrega `seller_requests.category_slugs` para P2-10.

> **Numeración — no reusar:** 61 a 65 están tomadas por `feature/logistica-terceros` (sin
> aplicar todavía) y la 67 por `feature/farmacias-de-turno` (ya aplicada). La próxima
> migración nueva arranca en la **68**.

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

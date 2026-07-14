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

### `db/schema/54_support_ticket_messages.sql`
- **Tarea**: P0-5 — Soporte hilo tipo chat + usuario cancela reclamo.
- **Qué hace**: agrega `cancelled` al CHECK de `support_tickets.status`, crea
  tabla `support_ticket_messages` (hilo bidireccional cliente ↔ admin/moderador),
  actualiza la RLS de `support_tickets` para que el dueño pueda cancelar
  (solo `status='cancelled'`, no otros cambios), y un trigger que notifica al
  usuario cuando el admin responde en el hilo.
- **Depende de**: `46_support_tickets.sql` (F12-11, ya aplicada) y
  `38_notifications.sql` (`create_notification`, ya aplicada).
- **Aplicada**: ✅ 2026-07-14 — verificada con `BEGIN;...ROLLBACK;` antes de
  aplicar para real; `get_advisors` sin hallazgos nuevos (`notify_support_ticket_message`
  ya sin `EXECUTE` de `public`/`anon`/`authenticated`).

### `db/schema/55_user_addresses.sql`
- **Tarea**: P0-2 — Multi-address book (varias direcciones guardadas por usuario).
- **Qué hace**: crea tabla `user_addresses` (label, address, details, phone,
  is_default) con RLS ownership y un trigger `ensure_single_default_address`
  que garantiza que solo haya una dirección predeterminada por usuario.
- **Depende de**: nada (tabla nueva, sin FK a otras tablas nuevas).
- **Nota**: el JS de `perfil.js` auto-migra la dirección vieja de
  `profiles.address`/`address_details` a esta tabla la primera vez que el
  usuario abre la libreta de direcciones — no hace falta migrar datos a mano.
- **Aplicada**: ✅ 2026-07-14 — verificada con `BEGIN;...ROLLBACK;` antes de
  aplicar para real; `get_advisors` sin hallazgos nuevos (`ensure_single_default_address`
  ya sin `EXECUTE` de `public`/`anon`/`authenticated`).

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

Las migraciones 01 a 53 ya están aplicadas en producción (ver sección
"Progreso" del `CLAUDE.md` para el detalle de cada una). Este archivo solo
lista las pendientes desde julio 2026 en adelante.

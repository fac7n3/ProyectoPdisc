# CLAUDE.md — Baradero Local (Proyecto-Pdisc)

> Contexto del proyecto para Claude Code. Se auto-carga cada sesión y **viaja con el repo**
> (sirve para trabajar desde cualquier computadora). **Mantener actualizado al completar cada tarea.**
> Última actualización: 2026-07-16 (noche). Estado: M1-M11 completos; Fase 12 completa salvo F12-18
> (facturación/AFIP, fuera de alcance). Detalle línea por línea de cada fase/tarea (F0-F12, bugs
> corregidos, decisiones de diseño, gotchas de RLS/triggers): skill `progreso-baradero-local`
> (se carga solo cuando hace falta consultar el historial). Pendientes que sí necesitan quedar
> siempre visibles: ver sección "Pendientes activos" más abajo.

> ## ⚠️ PRIMERA ACCIÓN DE CADA SESIÓN
> **Antes de cualquier otra tarea, leer [docs/MIGRACIONES_PENDIENTES.md](docs/MIGRACIONES_PENDIENTES.md).**
> Lista las migraciones SQL nuevas todavía no aplicadas a la base de producción
> de Supabase (`otzhdwuaffcplrveuadc`). Si tenés credenciales de Supabase
> (MCP tools cargadas, `SUPABASE_ACCESS_TOKEN` en el entorno, o acceso al
> SQL Editor del dashboard), **aplicalas en orden** antes de seguir. Si no
> tenés credenciales, avisá al usuario que faltan aplicar y seguí con tareas
> que no dependan de ellas. Marcar cada entrada como aplicada en ese archivo
> después de correrla.

## Qué es
**Baradero Local**: e-commerce de comercio de proximidad para Baradero (Argentina).
Objetivo definido: **lanzamiento real**. Roles: `cliente`, `vendedor`, `repartidor` (planeado), `admin`.
Contexto largo: [docs/CONTEXTO-PROYECTO.md](docs/CONTEXTO-PROYECTO.md) · Plan completo: [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack y convenciones
- **Vite 8** multipágina + **Supabase** (Postgres/Auth/Google OAuth/Storage/RLS) + **JS vanilla ES6**.
- `dist/` **se versiona** en git. El rol se lee del **JWT** (`app_metadata.role`). Precios: ver "Decisiones".
- **Supabase project_id:** `otzhdwuaffcplrveuadc`. Idioma del proyecto: **español**.
- **Hosting:** Vercel, proyecto `proyectopdisc` (team `baradero-local`), conectado a este repo (`fac7n3/ProyectoPdisc`, rama `main`). Cada push a `main` dispara deploy automático a producción.
- **`.env` YA NO se versiona en git** (revertido 2026-07-14, a pedido del usuario — hasta esa fecha era decisión intencional). Sigue teniendo solo `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, públicas por diseño de Supabase (protegidas por RLS, no por secreto) — pero se sacó del repo igual para reducir superficie expuesta. No rompe nada: Vercel ya tiene estas mismas variables cargadas aparte en su propio panel (Project Settings → Environment Variables, confirmado funcionando desde F11-02) y construye desde esas, no desde el `.env` commiteado; en local hace falta crear el archivo a mano (ver `docs/RUN_LOCAL.md`). El commit que lo agregó (`07bcadd`) sigue en el historial de git (no se reescribió el historial — el contenido nunca fue un secreto real, no ameritaba un rewrite destructivo con force-push). Nunca versionar acá una service role key ni tokens de Jira (esos sí quedan en `.jira.env`, gitignoreado).

## Decisiones de producto (definidas)
- **Pagos:** ✅ Mercado Pago real (Checkout Pro, F2-07) + transferencia con comprobante + simulado (solo para testing interno). Credenciales de **prueba** cargadas como secret `MP_ACCESS_TOKEN` en Supabase Edge Functions — para lanzar de verdad falta reemplazarlas por las de **producción** (mismo nombre de secret, no requiere tocar código).
- **Envíos:** ambos (retiro en local + envío dentro de Baradero).
- **Verificación de vendedor:** aprobación manual del admin **+** validar CUIT.
- **Precios:** **PESOS enteros** en todo el sistema (sin centavos). ✅ DB migrada a `price`/`total_price` (pesos) en F0-03 (migración 12); `price_cents` ya no existe.

## Flujo de trabajo y tracking (IMPORTANTE)
- **Jira A113** (baraderolocal.atlassian.net) es el tablero de progreso. **M1** = Fase 0 (padre `A113-134`) + Fase 1 (padre `A113-153`), subtareas `A113-135`…`A113-163` — **completo**. **M2 en adelante** (Fases 2-11) ya tiene tablero creado: `A113-172`…`A113-237`, con prefijo del roadmap (`F2-01a`…).
- Estados: `Tareas por hacer` → `En curso` → `Finalizada`.
  - **Empezar** una tarea: `node scripts/jira-move.mjs A113-XXX progress`
  - **Terminar**: incluir la clave `A113-XXX` en el **mensaje del commit** → el hook `post-commit` la pasa a Finalizada.
- Credenciales Jira en `.jira.env` (gitignoreado; falta poner el token en cada máquina nueva).
- **Regla:** commitear + pushear a GitHub cuando el cambio supere ~150 líneas.
- **Al completar cada tarea**: agregar el detalle al skill `progreso-baradero-local` (`.claude/skills/progreso-baradero-local/SKILL.md`) y, si abre o cierra algo que necesite quedar siempre visible, actualizar "Pendientes activos" acá abajo.
- Entre sesiones, para saber por dónde se quedó: consultar Jira A113 (subtareas no Finalizadas), la sección "Pendientes activos" acá abajo, o el skill `progreso-baradero-local` para el detalle completo.

## Pendientes activos
Historial completo de cómo se llegó a cada uno: skill `progreso-baradero-local`.
- **F8-02/F8-03** — Notificaciones por Email/WhatsApp bloqueadas: faltan credenciales de un proveedor externo (Resend/Meta Business). Plantillas de WhatsApp ya redactadas en `docs/WHATSAPP_TEMPLATES.md`.
- **F11-04** — Dominio propio: requiere que el usuario compre un dominio (decisión de costo). Hoy corre en `proyectopdisc.vercel.app`. Pasos para cuando se compre uno, en `docs/DEPLOY.md`.
- **F11-06** — Cargar comercios reales: las 14 tiendas/64 productos son datos de seed. Falta que vendedores reales se registren y sean aprobados (el flujo ya funciona).
- **P0-6** — Split payments con Mercado Pago Marketplace (modo piloto): `MP_CLIENT_ID`/`MP_CLIENT_SECRET` cargados como secrets (2026-07-15, app MP "Baradero Local" id `7108552352273197`). **OAuth de vinculación + creación de preferencia verificados end-to-end** contra una tienda/cuenta de prueba (no una real). **2026-07-16: dos regresiones reales encontradas y arregladas** — el split había roto el botón "Pagar" del carrito para cualquier tienda sin split vinculado (backend sin fallback al token global + un gate de frontend que exigía split para habilitar la opción); ambas restauradas, el botón del carrito ya funciona de nuevo para todas las tiendas. **Sigue pendiente** (sin relación con lo anterior): dentro del checkout de MP en sí, el botón "Pagar" queda deshabilitado sin error tanto con tarjeta de prueba como con saldo del comprador de prueba, causa no aislada. El usuario va a probarlo manualmente. Detalle completo en `docs/BACKLOG_MEJORAS.md` (P0-6) y skill `progreso-baradero-local`.
- **F12-18** — Facturación/AFIP: fuera de alcance de código desde el principio (ver `docs/ROADMAP.md` sección 17.1).
- **F10-02** — Tests E2E con Playwright: diferido a propósito, opcional en el roadmap.
- **Backlog mencionado por el usuario (2026-07-10), sin abordar aún**: pulido de responsive en detalles sin especificar; apps nativas (App Store/Google Play) recomendadas pero no iniciadas.
- Nadie tiene el rol `admin` asignado todavía en producción (asignar a mano en el dashboard de Supabase, Authentication → Users → `raw_app_meta_data` → `{"role": "admin"}`) — necesario antes de poder usar el panel de admin con una cuenta real.

## Scripts de tooling

- `scripts/jira-move.mjs <KEY> <progress|done|todo>` — cambia estado de subtareas.
- `scripts/jira-create-subtasks.mjs` — creó el tablero de M1 (Fase 0+1) en Jira.
- `scripts/jira-create-subtasks-m2-m11.mjs` — creó el tablero de M2 en adelante (Fases 2-11) en Jira.
- `scripts/jira-commit-log.mjs` — hook `post-commit`: cierra las subtareas referenciadas en el commit. **Ojo:** el regex busca `A113-\d+` en TODO el mensaje — no escribas un rango tipo "A113-172 a A113-237" en el cuerpo del commit, cierra esas claves literalmente aunque no sea la intención (pasó en esta sesión, hubo que reabrirlas a mano).

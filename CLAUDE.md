# CLAUDE.md — Baradero Local (Proyecto-Pdisc)

> Contexto del proyecto para Claude Code. Se auto-carga cada sesión y **viaja con el repo**
> (sirve para trabajar desde cualquier computadora). **Mantener actualizado al completar cada tarea.**
> Última actualización: 2026-07-07.

## Qué es
**Baradero Local**: e-commerce de comercio de proximidad para Baradero (Argentina).
Objetivo definido: **lanzamiento real**. Roles: `cliente`, `vendedor`, `repartidor` (planeado), `admin`.
Contexto largo: [docs/CONTEXTO-PROYECTO.md](docs/CONTEXTO-PROYECTO.md) · Plan completo: [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack y convenciones
- **Vite 8** multipágina + **Supabase** (Postgres/Auth/Google OAuth/Storage/RLS) + **JS vanilla ES6**.
- `dist/` **se versiona** en git. Precios en **`price_cents`** (centavos). El rol se lee del **JWT** (`app_metadata.role`).
- **Supabase project_id:** `otzhdwuaffcplrveuadc`. Idioma del proyecto: **español**.

## Decisiones de producto (definidas)
- **Pagos:** simulado ahora (testing) → después MercadoPago real + transferencia con envío de comprobante.
- **Envíos:** ambos (retiro en local + envío dentro de Baradero).
- **Verificación de vendedor:** aprobación manual del admin **+** validar CUIT.

## Flujo de trabajo y tracking (IMPORTANTE)
- **Jira A113** (baraderolocal.atlassian.net) es el tablero de progreso. **M1** = Fase 0 (padre `A113-134`) + Fase 1 (padre `A113-153`). Subtareas `A113-135`…`A113-163`, con prefijo del roadmap (`F0-01a`…).
- Estados: `Tareas por hacer` → `En curso` → `Finalizada`.
  - **Empezar** una tarea: `node scripts/jira-move.mjs A113-XXX progress`
  - **Terminar**: incluir la clave `A113-XXX` en el **mensaje del commit** → el hook `post-commit` la pasa a Finalizada.
- Credenciales Jira en `.jira.env` (gitignoreado; falta poner el token en cada máquina nueva).
- **Regla:** commitear + pushear a GitHub cuando el cambio supere ~150 líneas.
- **Este archivo se actualiza al completar cada tarea** (sección "Progreso").
- Entre sesiones, para saber por dónde se quedó: consultar Jira A113 (subtareas no Finalizadas) o esta sección.

## Progreso (Milestone 1)
### ✅ Hecho
- **F0-01** (`A113-135`, `A113-136`) — Auditoría de la base real. Hallazgos abajo.

### ⏳ Próximo (en orden)
- **F0-02** (`A113-137/138`) — Agregar `repartidor` al enum `app_role` + ajustar `handle_new_user`.
- **F0-03** (`A113-139/140`) — Arreglar `validate_cart_prices` (usar `price_cents`/`title`, comparar en centavos).
- **F0-04** (`A113-141..144`) — Alta de producto correcta (seller_id, centavos, category_id) + prueba E2E.
- **F0-05/06/07/08** — Formateo de precios, limpieza del carrito, orden de migraciones, modelo objetivo.
- **Fase 1** (`A113-154..163`) — Seguridad (XSS, advisors, CUIT, headers).

## Hallazgos de la auditoría de DB (2026-07-07)
- **9 tablas**, todas con RLS, **todas con 0 filas** → los seeds NO están aplicados (catálogo vacío).
- No se usan migraciones de Supabase (`list_migrations` vacío); el SQL se aplicó a mano en el SQL Editor.
- `app_role` = {cliente, vendedor, admin} — **falta `repartidor`**.
- 🔴 **BUG F0-02:** `handle_new_user` castea `'repartidor'::app_role`, pero el enum no tiene ese valor → **el registro de un repartidor falla**.
- 🔴 **BUG F0-03:** `validate_cart_prices` lee `products.name` y `products.price`, pero la tabla tiene `title` y `price_cents` → **la función falla en runtime**.
- Funciones en la DB: `approve_seller_request`, `handle_new_user`, `prevent_role_update_on_profile` (protección de rol activa), `rls_auto_enable`, `set_updated_at`, `update_user_carts_modtime`, `validate_cart_prices`.
- `seller_requests` tiene columnas extra (`cuit`, `address`, `category_slug`, `phone`) → migración 05 aplicada.

## Scripts de tooling
- `scripts/jira-move.mjs <KEY> <progress|done|todo>` — cambia estado de subtareas.
- `scripts/jira-create-subtasks.mjs` — crea el tablero de un milestone en Jira.
- `scripts/jira-commit-log.mjs` — hook `post-commit`: cierra las subtareas referenciadas en el commit.

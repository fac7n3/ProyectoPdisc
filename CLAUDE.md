# CLAUDE.md — Baradero Local (Proyecto-Pdisc)

> Contexto del proyecto para Claude Code. Se auto-carga cada sesión y **viaja con el repo**
> (sirve para trabajar desde cualquier computadora). **Mantener actualizado al completar cada tarea.**
> Última actualización: 2026-07-08.

## Qué es
**Baradero Local**: e-commerce de comercio de proximidad para Baradero (Argentina).
Objetivo definido: **lanzamiento real**. Roles: `cliente`, `vendedor`, `repartidor` (planeado), `admin`.
Contexto largo: [docs/CONTEXTO-PROYECTO.md](docs/CONTEXTO-PROYECTO.md) · Plan completo: [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack y convenciones
- **Vite 8** multipágina + **Supabase** (Postgres/Auth/Google OAuth/Storage/RLS) + **JS vanilla ES6**.
- `dist/` **se versiona** en git. El rol se lee del **JWT** (`app_metadata.role`). Precios: ver "Decisiones".
- **Supabase project_id:** `otzhdwuaffcplrveuadc`. Idioma del proyecto: **español**.

## Decisiones de producto (definidas)
- **Pagos:** simulado ahora (testing) → después MercadoPago real + transferencia con envío de comprobante.
- **Envíos:** ambos (retiro en local + envío dentro de Baradero).
- **Verificación de vendedor:** aprobación manual del admin **+** validar CUIT.
- **Precios:** **PESOS enteros** en todo el sistema (sin centavos). ✅ DB migrada a `price`/`total_price` (pesos) en F0-03 (migración 12); `price_cents` ya no existe.

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
- **F0-02** (`A113-137`, `A113-138`) — Enum `app_role` ahora incluye `repartidor` (migración 11, aplicada). `handle_new_user` ya lo mapeaba → el registro de repartidor funciona.
- **F0-03** (`A113-139`, `A113-140`) — Migración 12 (aplicada): `price_cents`→`price` y `total_price_cents`→`total_price` en pesos enteros (products/order_items/orders); `validate_cart_prices` recreada con columnas reales (`title`/`price`, filtra `is_active`, `search_path` fijo). Frontend (7 archivos JS) sin `/100` + `dist/` rebuildeado. Verificado: caso ok `valid:true`, precio manipulado `valid:false`.

### ⏳ Próximo (en orden)
- **F0-04** (`A113-141..144`) — Alta de producto correcta (seller_id, `price` en pesos, category_id por slug) + prueba E2E.
- **F0-05/06/07/08** — Formateo de precios, limpieza del carrito, orden de migraciones, modelo objetivo.
- **Fase 1** (`A113-154..163`) — Seguridad (XSS, advisors, CUIT, headers).

## Hallazgos de la auditoría de DB (2026-07-07)
- **9 tablas**, todas con RLS. (Actualización 2026-07-08: los seeds YA se aplicaron — 64 products, 14 stores, 14 categories, 2 coupons; orders/order_items siguen vacías.)
- No se usan migraciones de Supabase (`list_migrations` vacío); el SQL se aplicó a mano en el SQL Editor.
- `app_role` = {cliente, vendedor, admin} — **falta `repartidor`**.
- ✅ **BUG F0-02 (resuelto):** faltaba `repartidor` en el enum `app_role`; agregado en migración 11.
- ✅ **BUG F0-03 (resuelto):** `validate_cart_prices` leía `products.name`/`products.price` (inexistentes) → fallaba en runtime. Recreada con `title`/`price` en migración 12; columnas migradas de centavos a pesos.
- Funciones en la DB: `approve_seller_request`, `handle_new_user`, `prevent_role_update_on_profile` (protección de rol activa), `rls_auto_enable`, `set_updated_at`, `update_user_carts_modtime`, `validate_cart_prices`.
- `seller_requests` tiene columnas extra (`cuit`, `address`, `category_slug`, `phone`) → migración 05 aplicada.

## Scripts de tooling
- `scripts/jira-move.mjs <KEY> <progress|done|todo>` — cambia estado de subtareas.
- `scripts/jira-create-subtasks.mjs` — crea el tablero de un milestone en Jira.
- `scripts/jira-commit-log.mjs` — hook `post-commit`: cierra las subtareas referenciadas en el commit.

# CLAUDE.md — Baradero Local (Proyecto-Pdisc)

> Contexto del proyecto para Claude Code. Se auto-carga cada sesión y **viaja con el repo**
> (sirve para trabajar desde cualquier computadora). **Mantener actualizado al completar cada tarea.**
> Última actualización: 2026-07-09 (M1 completo; Fase 2 en curso: F2-01 listo).

## Qué es
**Baradero Local**: e-commerce de comercio de proximidad para Baradero (Argentina).
Objetivo definido: **lanzamiento real**. Roles: `cliente`, `vendedor`, `repartidor` (planeado), `admin`.
Contexto largo: [docs/CONTEXTO-PROYECTO.md](docs/CONTEXTO-PROYECTO.md) · Plan completo: [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack y convenciones
- **Vite 8** multipágina + **Supabase** (Postgres/Auth/Google OAuth/Storage/RLS) + **JS vanilla ES6**.
- `dist/` **se versiona** en git. El rol se lee del **JWT** (`app_metadata.role`). Precios: ver "Decisiones".
- **Supabase project_id:** `otzhdwuaffcplrveuadc`. Idioma del proyecto: **español**.
- **Hosting:** Vercel, proyecto `proyectopdisc` (team `baradero-local`), conectado a este repo (`fac7n3/ProyectoPdisc`, rama `main`). Cada push a `main` dispara deploy automático a producción.
- **`.env` se versiona en git** (decisión intencional, no descuido): solo tiene `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, que son públicas por diseño de Supabase (protegidas por RLS, no por secreto) — terminan igual embebidas en el JS que se sirve al navegador en cada build. Vite las inyecta en build-time; Vercel también necesita estas mismas variables cargadas en su propio panel (Project Settings → Environment Variables) porque construye el sitio desde cero en cada deploy, no sirve el `dist/` commiteado. Nunca versionar acá una service role key ni tokens de Jira (esos sí quedan en `.jira.env`, gitignoreado).

## Decisiones de producto (definidas)
- **Pagos:** simulado ahora (testing) → después MercadoPago real + transferencia con envío de comprobante.
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
- **Este archivo se actualiza al completar cada tarea** (sección "Progreso").
- Entre sesiones, para saber por dónde se quedó: consultar Jira A113 (subtareas no Finalizadas) o esta sección.

## Progreso (Milestone 1)
### ✅ Hecho
- **F0-01** (`A113-135`, `A113-136`) — Auditoría de la base real. Hallazgos abajo.
- **F0-02** (`A113-137`, `A113-138`) — Enum `app_role` ahora incluye `repartidor` (migración 11, aplicada). `handle_new_user` ya lo mapeaba → el registro de repartidor funciona.
- **F0-03** (`A113-139`, `A113-140`) — Migración 12 (aplicada): `price_cents`→`price` y `total_price_cents`→`total_price` en pesos enteros (products/order_items/orders); `validate_cart_prices` recreada con columnas reales (`title`/`price`, filtra `is_active`, `search_path` fijo). Frontend (7 archivos JS) sin `/100` + `dist/` rebuildeado. Verificado: caso ok `valid:true`, precio manipulado `valid:false`.
- **F0-04** (`A113-141..144`) — Alta de producto: `vender.js` no seteaba `seller_id` (NOT NULL + RLS `seller_id = auth.uid()`) → todo alta real fallaba con "new row violates row-level security policy". Fix: obtener `user.id` vía `supabase.auth.getUser()` y setearlo. También faltaba el campo `stock` en el form (quedaba en 0 = invendible) → agregado input `prod-stock` en `pages/vender.html`. `category_id` por slug ya estaba bien resuelto (comentario viejo engañoso, limpiado). Verificado con simulación RLS real en transacción con rollback (cuenta de test existente): reproduje el bug sin el fix y confirmé el insert exitoso con el fix (seller_id/price/category_id/stock correctos). No probado por UI en navegador (no hay credenciales de una cuenta vendedor real).
- **F0-05** (`A113-145`, `A113-146`) — Helper `formatPrice()` central en `cart-utils.js` (pesos AR, separador de miles), unificado en home/search/producto/comercio/carrito/perfil/vender. Antes había 4 formatos distintos conviviendo (`toLocaleString` suelto, `Intl.NumberFormat` con `style:'currency'` en perfil.js que agregaba un espacio, y un caso en vender.js sin separador de miles).
- **F0-06** (`A113-147..149`) — Integridad del carrito: se quitó `PRODUCTO_PRUEBA`/`seedCartIfEmpty` de `carrito.js` (ya no se precarga un producto falso); `initCartButtons` (cart-utils.js) ahora usa `data-product-id`/`dataset.price` en vez de parsear el texto ya renderizado del DOM. Verificado en navegador: id agregado al carrito es el UUID real de Supabase, carrito vacío no se auto-siembra.
- **F0-07** (`A113-150`, `A113-151`) — Idempotencia en `db/schema/01-12`: faltaban `DROP POLICY/TRIGGER IF EXISTS` en 02/03/08/09 (re-correrlos fallaba con "already exists"); `09_user_carts.sql` creaba la tabla sin `IF NOT EXISTS`; `12_price_cents_to_price.sql` ahora guarda cada rename con un chequeo de `information_schema.columns` (si no, re-ejecutarlo dividiría los precios por 100 dos veces); seeds `04`/`06` detectan si ya corrieron. Orden completo documentado en `docs/RUN_LOCAL.md`. **Verificado corriendo los 12 archivos en orden contra la base real**: 0 errores, 0 duplicados (14 stores/64 products/14 categories antes y después), `validate_cart_prices` funcionando.
- **F0-08** (`A113-152`) — Diseñado `db/schema/13_target_data_model.sql`: modelo de datos objetivo (roadmap sección 5) — `product_variants`, `product_images`, `products.compare_at_price`, `stores.description/zone/hours`, `orders.delivery_method/payment_method/payment_status/delivery_fee`, `payment_proofs`, `deliveries`, `reviews`, `conversations`/`messages`, `notifications`, `favorites`, todo con RLS. Validado con `BEGIN;...ROLLBACK;` contra la base real (corre sin errores). **A propósito NO aplicado todavía** — son tablas de fases que no arrancaron (Fase 2/3/5/7/8); aplicar cuando arranque cada una. Nota: `stores.description` ya se leía desde `comercio.js` sin existir en la tabla (bug silencioso, siempre caía al fallback) — se resuelve al aplicar este archivo.
- **F1-01** (`A113-154..157`) — Anti-XSS: `comercio.js`/`producto.js` reconstruidos con DOM API (interpolaban `store.name`/`description`/`product.title` crudos); `admin.js` (shop_name/address/cuit/category_slug del registro de vendedor sin escapar); `perfil.js` (favoritos); `product-modal.js` ya tenía `escapeHTML()` pero el bloque de "productos relacionados" no lo aplicaba (un título con `<img onerror=...>` no ejecutaba en la grilla pero sí al aparecer como relacionado en otro modal — corregido y probado con payload real en el navegador, `xssFired: false`).
- **F1-02** (`A113-158`, `A113-159`) — `get_advisors`: 15→6 hallazgos. **Crítico resuelto**: `approve_seller_request` no validaba rol admin → cualquier autenticado podía aprobarse a sí mismo como vendedor vía RPC directo (D6 bypaseada). Agregado chequeo + revocado `EXECUTE` de `anon`. También: `search_path` fijo en 4 funciones, revocado `EXECUTE` público de `handle_new_user`/`rls_auto_enable` (solo triggers), sacadas policies de listado público de storage. Quedan 2 hallazgos intencionales documentados en RUN_LOCAL.md + "Leaked Password Protection" pendiente (toggle manual en dashboard de Supabase).
- **F1-03** (`A113-160`) — Verificado con sesión simulada: `prevent_role_update_on_profile` rechaza que un cliente se cambie el rol. Sin cambios de código.
- **F1-04** (`A113-161`, `A113-162`) — `js/validation-utils.js`: CUIT (dígito verificador módulo 11) + shop_name/phone/producto, usado en los 2 formularios de `vender.js`. Espejo en SQL (`is_valid_cuit()` + `CHECK` en `seller_requests`) — verificado que JS y SQL dan el mismo resultado.
- **F1-05** (`A113-163`) — `vercel.json` con los mismos 4 headers de seguridad que el dev server de Vite (antes no llegaban a producción). Verificado con fetch real a producción tras el deploy: los 4 headers presentes.

**M1 (Fase 0 + Fase 1) completo.** Bonus de esta sesión: 7 hallazgos de auditoría fuera del roadmap corregidos (`info.html` 404 en build, README desactualizado, CI de build, logging de errores a `error_logs`, Supabase CLI local) — ver claves `A113-165` a `A113-171`. Tablero completo de Jira para Fases 2-11 creado (`A113-172..237`, script `scripts/jira-create-subtasks-m2-m11.mjs`).

**Nota operativa:** el repo debe quedar **público** en GitHub — Vercel dejó de poder deployar (`BLOCKED`, sin build logs) apenas se puso privado esta noche; volver a público lo destrabó al toque. Si se vuelve a poner privado, hay que revisar los permisos del GitHub App de Vercel.

## Progreso (Fase 2 — Compra: checkout, órdenes y pagos)
### ✅ Hecho
- **F2-01** (`A113-173`) — RPC `create_order` (SECURITY DEFINER, migración 18): revalida `store_id`/precio/stock leyendo `products` en el momento del checkout (ni siquiera recibe el precio del cliente), bloquea filas con `for update`, divide el carrito en **una orden por tienda** (orders.store_id es not null), aplica cupón, descuenta stock real, guarda `delivery_method`/`payment_method` (agregados a `orders` en migración 17 junto con `payment_proofs`, extraídos de `13_target_data_model.sql` — el resto de ese archivo sigue sin aplicar, es de Fases 3/4/5/7/8). Revocado `EXECUTE` de anon/public, solo `authenticated`. Verificado con `BEGIN;...ROLLBACK;` + sesión simulada: carrito de 2 tiendas + cupón `BIENVENIDO10` creó 2 órdenes con totales y stock correctos; stock insuficiente/cupón inválido/envío sin dirección rechazados sin dejar rastro. `get_advisors`: sin hallazgos críticos nuevos.

- **F2-02** (`A113-174`) — `carrito.js`: el botón "Iniciar pago" ahora llama a `create_order` de verdad (antes solo llamaba `validate_cart_prices` y nunca creaba nada). Manda `[{id, qty}]` sin precio (el RPC lo relee del servidor) + el código de cupón ya validado (`appliedCouponCode`, nuevo, separado de `currentDiscount` que es solo para el cálculo visual). `delivery_method` queda fijo en `'pickup'` sin dirección — elegir retiro/envío es F2-05, todavía no tiene UI (el selector "Calcular costos de envío" del sidebar es un stub visual sin lógica detrás). Al crear la(s) orden(es) con éxito: vacía el carrito, toast con el total, redirige a `home.html`. Sin sesión real de vendedor/cliente para loguearse en el navegador (mismo límite que F0-04) — verificado que no hay errores de consola, que el carrito renderiza bien, y que la rama de "no hay sesión" del botón redirige a login (confirmé que `getSession()` da `null` en el preview, por lo que un click ahí nunca llega a invocar `create_order`); la creación de la orden en sí ya se probó a fondo contra la base real en F2-01.

- **F2-03** (`A113-175`) — RPC `confirm_simulated_payment` (migración 19, SECURITY DEFINER, revocado de anon/public): marca `paid` una orden propia con `payment_method='simulado'` y `payment_status='pending'`; idempotente (`already_paid: true` en vez de fallar si ya está pagada). Separado a propósito de `create_order` — crear y pagar son pasos distintos, como en una pasarela real. `js/payment-providers.js` (nuevo): interfaz `getPaymentProvider(method) → { name, pay(orderIds) }`; hoy solo `'simulado'`, los próximos (F2-04 transferencia, F2-07 MercadoPago) se agregan ahí sin tocar `carrito.js` ni `create_order`. `carrito.js` ahora llama al provider después de `create_order`, antes de vaciar el carrito. Verificado con `BEGIN;...ROLLBACK;` (creando una orden real con `create_order` en la misma transacción): pago propio → `paid` + `payment_id`; doble confirmación → idempotente; orden inexistente/ajena → rechazada.

### ⏳ Próximo
- Resto de Fase 2: F2-04 (`A113-176`, transferencia + comprobante), F2-05 (`A113-177`, elegir retiro/envío + delivery_fee), F2-06 (`A113-178`, historial de pedidos), F2-07 (`A113-179`, MercadoPago, futuro).

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
- `scripts/jira-create-subtasks.mjs` — creó el tablero de M1 (Fase 0+1) en Jira.
- `scripts/jira-create-subtasks-m2-m11.mjs` — creó el tablero de M2 en adelante (Fases 2-11) en Jira.
- `scripts/jira-commit-log.mjs` — hook `post-commit`: cierra las subtareas referenciadas en el commit. **Ojo:** el regex busca `A113-\d+` en TODO el mensaje — no escribas un rango tipo "A113-172 a A113-237" en el cuerpo del commit, cierra esas claves literalmente aunque no sea la intención (pasó en esta sesión, hubo que reabrirlas a mano).

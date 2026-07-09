# Run local (HTML/JS)

## 1) Requisitos

- Node.js 20+
- Proyecto de Supabase creado
- Google OAuth habilitado en Supabase Auth

## 2) Instalar y correr

1. `npm install`
2. `npm run dev`
3. Abrir `http://localhost:5173` (si ese puerto esta ocupado, `serve` usa otro)

## 3) Paginas principales

- `pages/login.html` -> inicio de sesion con email/contrasena y Google
- `pages/register.html` -> crear cuenta con email/contrasena y Google
- `pages/perfil.html` -> sesion activa y cierre de sesion

## 4) Configurar login con Google

En Supabase Dashboard:

- Auth -> Providers -> Google -> Enable
- Configurar Client ID / Secret de Google
- Callback de Supabase:
  - `https://<your-project-ref>.supabase.co/auth/v1/callback`

En Google Cloud Console:

- Agregar ese callback en Authorized redirect URIs
- Agregar `http://localhost:5173` en Authorized JavaScript origins

## 5) SQL base

No se usan migraciones de Supabase (`supabase migration` / `list_migrations` vacío):
el SQL se corre a mano en el **SQL Editor** de Supabase, en este orden exacto
(el número del archivo = el orden de ejecución; no saltear ninguno):

1. `01_auth_profiles.sql` — enum `app_role`, tabla `products`, tabla `profiles` + triggers de auth.
2. `02_shop_and_cart.sql` — `seller_requests`.
3. `03_ecommerce_schema.sql` — `categories`, `stores`, `orders`, `order_items`, buckets de storage.
4. `04_seed_mock_data.sql` — **seed de un solo uso** (datos de prueba). Ver nota abajo.
5. `05_admin_seller.sql` — columnas extra en `seller_requests` + función `approve_seller_request`.
6. `06_seed_10_stores_and_products.sql` — **seed de un solo uso** (10 locales + 50 productos de prueba).
7. `07_update_mock_images.sql` — actualiza `logo_url`/`image_url` de los datos de prueba (`UPDATE`, sin riesgo).
8. `08_coupons_schema.sql` — tabla `coupons` + 2 cupones de prueba.
9. `09_user_carts.sql` — tabla `user_carts` + primera versión de `validate_cart_prices` (ver nota).
10. `10_fix_auth_triggers.sql` — fix de `handle_new_user` / `prevent_role_update_on_profile`.
11. `11_add_repartidor_role.sql` — agrega `'repartidor'` al enum `app_role`.
12. `12_price_cents_to_price.sql` — migra `price_cents`/`total_price_cents` → `price`/`total_price`
    (pesos enteros) y recrea `validate_cart_prices` con las columnas reales (`title`, `price`).
13. `13_target_data_model.sql` — **diseñado, NO aplicado completo** (ver nota abajo): modelo de
    datos objetivo de fases futuras. Se va aplicando por partes a medida que arranca cada fase.
14. `14_error_logs.sql` — tabla `error_logs` (telemetría de errores del cliente).
15. `15_security_advisors_fixes.sql` — fixes de `get_advisors` (F1-02).
16. `16_input_validation_constraints.sql` — validación de CUIT/inputs también en la DB (F1-04).
17. `17_fase2_order_payment_columns.sql` — arranca Fase 2: columnas de `orders`
    (`delivery_method`/`payment_method`/`payment_status`/`delivery_fee`) + tabla `payment_proofs`.
18. `18_create_order_rpc.sql` — RPC `create_order` (F2-01, ver nota abajo).

### Idempotencia (F0-07 / A113-150)

Todos los archivos son seguros de re-ejecutar sobre una base que ya los tiene aplicados
(tablas `IF NOT EXISTS`, policies con `DROP POLICY IF EXISTS` antes de recrearlas, triggers
con `DROP TRIGGER IF EXISTS`, y en `12` los `RENAME COLUMN`/`UPDATE` de precios están dentro
de un `DO $$ IF EXISTS (...) THEN ... END IF; END $$` que solo corre si la columna vieja
(`price_cents`) todavía existe — así evita dividir un precio por 100 dos veces). Verificado
corriendo los 12 archivos en orden contra la base real: 0 errores, 0 filas duplicadas
(14 stores, 64 products, 14 categories antes y después).

Los dos seeds (`04` y `06`) son de **un solo uso**: insertan datos de prueba hardcodeados
y tienen una guarda al principio del bloque (`IF EXISTS (... WHERE name = '<primer local>')
THEN RETURN; END IF;`) que hace que un re-run no duplique tiendas/productos. No están pensados
para poblar una base nueva de producción — son solo para tener catálogo de prueba en desarrollo.

`09_user_carts.sql` define una primera versión de `validate_cart_prices` que lee
`products.name` (columna que no existe, es `title`) — es un bug histórico ya conocido
(ver `CLAUDE.md`). No lo arregles ahí: `12_price_cents_to_price.sql` la recrea con las
columnas correctas vía `CREATE OR REPLACE FUNCTION`, así que el resultado final después
de correr 01→12 en orden es siempre el correcto. Si alguna vez corrés los archivos de a
uno y te quedás parado justo después del 09, vas a ver ese bug hasta que corras el 12.

### Setup nuevo (base vacía)

En un proyecto de Supabase nuevo: corré 01→12 en orden. Los seeds (04, 06) van a insertar
los datos de prueba porque la guarda no encuentra nada todavía. Si no querés los datos de
prueba, salteá 04, 06 y 07.

### 13_target_data_model.sql (F0-08 / A113-152) — diseñado, se aplica por partes

Modelo de datos objetivo de `docs/ROADMAP.md` sección 5: `product_variants`,
`product_images`, `products.compare_at_price`, `stores.description/zone/hours`,
`orders.delivery_method/payment_method/payment_status/delivery_fee`,
`payment_proofs`, `deliveries`, `reviews`, `conversations`/`messages`,
`notifications`, `favorites` — cada tabla nueva con RLS. Verificado con
`BEGIN; ...; ROLLBACK;` contra la base real (corre sin errores, no queda nada
creado). **A propósito no se aplicó entero de una vez**: son tablas para
funcionalidad de fases distintas (Fase 2 checkout, Fase 3 delivery, Fase 5
perfil de vendedor, Fase 7 reseñas/chat, Fase 8 notificaciones). Se va
aplicando bloque por bloque cuando arranca cada fase, para no sumarle tablas
vacías sin uso a la superficie que audita F1-02 (`get_advisors`).

El primer bloque (`orders` columns + `payment_proofs`) ya se extrajo y aplicó
en `17_fase2_order_payment_columns.sql` al arrancar Fase 2 (ver abajo). El
resto (`product_variants`, `product_images`, `compare_at_price`,
`stores.description/zone/hours`, `deliveries`, `reviews`,
`conversations`/`messages`, `notifications`, `favorites`) sigue sin aplicar,
pendiente de Fases 3/4/5/7/8. Nota: `stores.description` estaba siendo leída
por `comercio.js` sin existir en la tabla real (bug silencioso, caía siempre
al fallback "Sin descripción disponible.") — se resuelve recién cuando se
aplique el bloque de `stores` en Fase 5.

### 17_fase2_order_payment_columns.sql (F2-01 / A113-173) — aplicado

Arranca Fase 2: agrega a `orders` las columnas `delivery_method`
(`pickup`/`delivery`), `payment_method` (`simulado`/`mercadopago`/`transferencia`),
`payment_status` (`pending`/`paid`/`rejected`, default `pending`) y
`delivery_fee` (nullable — se calcula en F2-05); crea `payment_proofs` con RLS
(cliente dueño de la orden sube el comprobante, vendedor de la tienda o admin
lo confirma/rechaza — usado recién en F2-04). Testeado con `BEGIN;...ROLLBACK;`
contra la base real antes de aplicar.

### 18_create_order_rpc.sql (F2-01 / A113-173) — aplicado

RPC `create_order(cart_payload, coupon_code, p_delivery_method,
p_payment_method, p_shipping_address)`, `SECURITY DEFINER`, revocado de
`anon`/`public` (solo `authenticated`, mismo patrón que
`approve_seller_request`). Reemplaza la validación de solo-lectura de
`validate_cart_prices` por la creación real de la orden:

- Vuelve a leer `store_id`/`title`/`price`/`stock` de `products` en el momento
  del checkout — **ni siquiera recibe el precio del cliente** (a diferencia de
  `validate_cart_prices`, que sí lo recibe para compararlo). Bloquea cada fila
  de producto con `for update` para serializar contra checkouts concurrentes
  sobre el mismo stock.
- Divide el carrito en **una orden por tienda**: `orders.store_id` es
  `not null`, así que un carrito con productos de varios comercios genera
  varias órdenes (una por `store_id`), cada una con su propio `order_items` y
  su propio total (con el mismo cupón aplicado a cada una).
- Descuenta el stock real y guarda `delivery_method`/`payment_method`;
  `payment_status`/`status` quedan en `pending` — marcarlos como pagados es
  F2-03 (simulado) / F2-04 (transferencia). `delivery_fee` queda sin calcular
  a propósito (F2-05).
- Al ser una función `plpgsql`, toda la lógica corre en una única transacción
  implícita: cualquier `raise exception` revierte todo lo hecho hasta ese
  punto (sin necesitar `BEGIN`/`COMMIT` manual, que tampoco se puede usar
  dentro de una función).

Testeado con `BEGIN;...ROLLBACK;` + sesión simulada (`request.jwt.claims` con
un usuario real existente): carrito de 2 productos de 2 tiendas distintas +
cupón `BIENVENIDO10` (10%) creó 2 órdenes con los totales correctos y
descontó el stock exacto de cada producto (verificado leyendo `products.stock`
dentro de la misma transacción antes del rollback); intentar comprar una
cantidad mayor al stock disponible, un cupón inexistente, o "envío a
domicilio" sin dirección, los 3 casos fueron rechazados con
`raise exception` sin alterar nada. `get_advisors` después de aplicar: sin
hallazgos críticos nuevos (la única advertencia nueva es "puede ejecutarla
`authenticated`", esperada e intencional — mismo patrón que
`validate_cart_prices`).

### 16_input_validation_constraints.sql (F1-04 / A113-161, A113-162) — aplicado

Validación de CUIT (dígito verificador, módulo 11) y de los campos de
`seller_requests` (shop_name, phone), del lado cliente (`js/validation-utils.js`,
usado en `vender.js` en los dos formularios: alta de comercio y alta de
producto) **y** del lado servidor (`public.is_valid_cuit()` + `CHECK`
constraints — nunca confiar solo en la validación del cliente, cualquiera
puede pegarle directo al endpoint de Supabase). Verificado que el algoritmo
da el mismo resultado en JS y en SQL para los mismos CUITs de prueba.

Los `CHECK` permiten `NULL` a propósito: hay una fila vieja de prueba
("Test Bakery") con `cuit`/`address`/`phone` en `null` que no se tocó.

### 15_security_advisors_fixes.sql (F1-02 / A113-158, A113-159) — aplicado

Hallazgos de `get_advisors` (security) y su fix. El más serio: **`approve_seller_request`
no validaba que quien la llama sea admin** — al ser `SECURITY DEFINER` y quedar expuesta
como RPC pública (PostgREST expone toda función de `public` salvo que se revoque el
`EXECUTE`), cualquier usuario autenticado podía llamar
`supabase.rpc('approve_seller_request', { req_id: '<pendiente>' })` directo y aprobarse
a sí mismo como vendedor, saltando la aprobación manual del admin (D6). Se agregó el
chequeo de rol + se revocó `EXECUTE` de `anon` (verificado: un `cliente` ahora recibe
"Solo un admin puede aprobar solicitudes de vendedor.").

También: `search_path` fijo en 4 funciones que lo tenían mutable (`handle_new_user` lo
había perdido al redefinirse en el archivo 10), se revocó el `EXECUTE` público de
`handle_new_user`/`rls_auto_enable` (son solo para triggers, no RPCs de verdad), y se
sacaron las policies de listado público de los buckets de storage (los buckets ya son
`public=true`, así que el acceso a un objeto por su URL sigue andando — solo se pierde
la posibilidad de listar todo el contenido del bucket vía API; confirmado que el
frontend no usa esa función todavía).

**Quedan 2 hallazgos de `get_advisors` sin tocar, a propósito:**
- `error_logs_insert_anyone` con `WITH CHECK (true)` — intencional, es telemetría de
  diagnóstico (ver A113-171).
- `validate_cart_prices` callable por `anon`/`authenticated` — intencional, es el RPC
  de checkout que llama cualquier cliente.

**Pendiente manual (no se puede por SQL):** "Leaked Password Protection" está
deshabilitado — es un toggle en el dashboard de Supabase (Authentication → Settings),
no una migración.

### 14_error_logs.sql (A113-171) — aplicado

Tabla `error_logs` para capturar errores no manejados del cliente
(`window.onerror`/`unhandledrejection`, ver `js/error-logger.js`, enganchado
en `auth-utils.js`). RLS: cualquiera puede insertar su propio error, solo
`admin` puede leerlos. Mientras no exista un panel propio en el admin, se
consulta con el SQL Editor de Supabase: `select * from error_logs order by
created_at desc;`.

## 6) Ambiente local con Supabase CLI (A113-170)

Solo hay un proyecto de Supabase (producción, plan Free) — no hay branching
disponible (`create_branch` devuelve "Branching is supported only on the Pro
plan or above"). Para no seguir probando cosas directo contra producción, el
repo ya trae el **Supabase CLI** como devDependency (`supabase/config.toml`
generado con `npx supabase init`):

- `npm run db:start` — levanta un stack local completo (Postgres + Auth +
  Storage + Studio) en Docker.
- `npm run db:stop` — lo apaga.

**Requiere [Docker Desktop](https://www.docker.com/products/docker-desktop/)
instalado y corriendo** — el CLI no lo trae, y no se puede instalar
automáticamente (hay que aceptar la licencia y es una instalación pesada a
nivel sistema). Es una decisión manual pendiente del dueño de la máquina.

El stack local arranca con un schema **vacío** (no usamos el sistema de
migraciones de Supabase, ver sección 5) — después de `db:start`, correr los
archivos de `db/schema/` en orden contra `localhost:54322` (Studio local en
`http://localhost:54323`) igual que se hace contra producción.

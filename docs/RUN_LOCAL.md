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

### 13_target_data_model.sql (F0-08 / A113-152) — diseñado, NO aplicado todavía

Modelo de datos objetivo de `docs/ROADMAP.md` sección 5: `product_variants`,
`product_images`, `products.compare_at_price`, `stores.description/zone/hours`,
`orders.delivery_method/payment_method/payment_status/delivery_fee`,
`payment_proofs`, `deliveries`, `reviews`, `conversations`/`messages`,
`notifications`, `favorites` — cada tabla nueva con RLS. Verificado con
`BEGIN; ...; ROLLBACK;` contra la base real (corre sin errores, no queda nada
creado), pero **no se aplicó a producción a propósito**: son tablas para
funcionalidad de fases que todavía no arrancaron (Fase 2 checkout, Fase 3
delivery, Fase 5 perfil de vendedor, Fase 7 reseñas/chat, Fase 8
notificaciones). Aplicar recién cuando arranque la fase correspondiente, para
no sumarle tablas vacías sin uso a la superficie que audita F1-02
(`get_advisors`). Nota: `stores.description` estaba siendo leída por
`comercio.js` sin existir en la tabla real (bug silencioso, caía siempre al
fallback "Sin descripción disponible.") — se resuelve al aplicar este bloque.

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

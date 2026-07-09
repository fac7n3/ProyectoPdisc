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

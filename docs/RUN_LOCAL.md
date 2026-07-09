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
19. `19_confirm_simulated_payment_rpc.sql` — RPC `confirm_simulated_payment` (F2-03, ver nota abajo).
20. `20_create_order_delivery_fee.sql` — `create_order` calcula `delivery_fee` real (F2-05, ver nota abajo).
21. `21_order_items_title_snapshot.sql` — `order_items.title` (snapshot) para el historial de pedidos (F2-06, ver nota abajo).
22. `22_transfer_payment_proofs.sql` — bucket `payment-proofs` + RPC `confirm_transfer_payment` (F2-04, ver nota abajo).
23. `23_fix_handle_new_user_role_escalation.sql` — **CRÍTICO**, corrige escalación de rol en signup (A113-238, ver nota abajo).
24. `24_fix_role_approval_trigger_block.sql` — **CRÍTICO**, corrige `prevent_role_update_on_profile` que bloqueaba también las aprobaciones legítimas del admin (A113-239, ver nota abajo).
25. `25_delivery_requests.sql` — tabla `delivery_requests` + RPC `approve_delivery_request` (F3-01, ver nota abajo).
26. `26_deliveries_and_claim.sql` — tabla `deliveries` + RPC `claim_delivery` + policy de `orders` para repartidor (F3-02, ver nota abajo).
27. `27_deliveries_visibility_fix.sql` — cualquier repartidor puede ver cualquier fila de `deliveries` (F3-02, ver nota abajo).
28. `28_delivery_status_flow.sql` — RPC `update_delivery_status` (F3-03, ver nota abajo).
29. `29_favorites.sql` — tabla `favorites` (F4-03, ver nota abajo).

No hubo migración nueva para F3-04 (`A113-184`) — solo consultas nuevas en el
frontend sobre columnas/tablas ya existentes (`orders`, `deliveries`). Ver
nota en `js/perfil.js` (`DELIVERY_STATUS_LABELS`) y `js/vender.js`
(`renderShipmentsInProgress`, sección "Envíos en curso"): el cliente ve el
estado de su envío en "Mis compras", el vendedor ve una lista de envíos en
curso de su tienda en el dashboard. **Sin push en tiempo real todavía** — se
actualiza al recargar la página, igual que el resto de los paneles de este
proyecto (admin, pagos por confirmar, etc.); implementar Supabase Realtime
(`postgres_changes` sobre `deliveries`) queda como mejora futura, no se hizo
acá para no meter un patrón de suscripción/limpieza nuevo sin poder
verificarlo en un navegador con sesión real.

### F4-01 (A113-187) — sincronizar carrito en la nube — sin migración nueva

`user_carts` ya existía desde `09_user_carts.sql` (tabla + RLS `select`/
`insert`/`update` propias) — solo hacía falta usarla. `js/cart-utils.js`:

- `saveCart(cart)` ahora también llama a `pushCartToCloud(cart)` (upsert en
  `user_carts` por `user_id`, "fire and forget" — si falla la red, el
  carrito local se guarda igual, no se rompe la UI). Como `saveCart` ya era
  el único punto de guardado del carrito (usado por `initCartButtons` y por
  `carrito.js`), no hizo falta tocar los call sites.
- `initCartSync()`: al importar `cart-utils.js` (todas las páginas que usan
  el carrito lo importan) trae el carrito de `user_carts` si hay sesión, lo
  mezcla con el local (`mergeCarts`: suma cantidades de productos repetidos
  con tope `MAX_QTY`, usa los datos de display —nombre/precio/imagen— de la
  versión local por ser la más reciente en ese navegador) y guarda el
  resultado combinado. Se ejecuta una sola vez por pestaña
  (`sessionStorage`, flag `bl_cart_synced`) para no repetir el merge en cada
  navegación entre páginas de la misma sesión.

Verificado: `mergeCarts` probado en el navegador con casos de producto solo
local, solo en la nube, y repetido en ambos (cantidades sumadas
correctamente, nombre de display tomado del local). El camino de escritura
(upsert con `on conflict (user_id)`) probado contra la base real en
`BEGIN;...ROLLBACK;`: dos upserts sucesivos actualizan la misma fila (no
duplican), y un usuario no puede leer el `user_carts` de otro (RLS). Sin
sesión real de navegador para probar el flujo end-to-end del merge al
loguearse — mismo límite que F0-04.

### F4-02 (A113-188) — producto inactivo/eliminado/sin stock en el carrito — sin migración nueva

`js/carrito.js` (`validateCartFreshness`, corre al cargar `carrito.html`,
antes solo confiaba ciegamente en lo guardado en `localStorage`): consulta
`is_active`/`stock`/`price` reales de todos los productos del carrito y:

- Si un producto ya no existe, está desactivado, o tiene `stock <= 0` →
  se quita del carrito.
- Si la cantidad pedida supera el stock disponible → se ajusta al stock
  real (no se quita, se achica).
- Si el precio cambió desde que se agregó → se actualiza al precio actual.

Si hubo algún cambio, guarda el carrito corregido (`saveCart`, que también
sincroniza a la nube vía F4-01) y vuelve a renderizar, avisando con un
toast (prioriza el mensaje de "ya no disponible" sobre el de "precio/
cantidad actualizados" si pasaron ambas cosas). Mismo criterio que
`create_order` en el checkout (nunca confiar en el precio/stock que ya
estaba guardado en el cliente), pero mostrado antes, en la vista del
carrito, no recién al pagar.

Verificado en el navegador: carrito sembrado con un producto inexistente +
uno con cantidad muy superior al stock real → el inexistente se quita
("Ya no están disponibles: ..."), el otro se ajusta a la cantidad real de
stock.

### 29_favorites.sql (F4-03 / A113-189) — aplicado

Extraída de `13_target_data_model.sql` (sección 11) al arrancar esta tarea
de Fase 4. Antes había **dos implementaciones de wishlist sin relación
entre sí**: `cart-utils.js` (localStorage `bl_wishlist`, usado en las
grillas de home/search/comercio) y `product-modal.js` (un botón que solo
togglaba una clase CSS, sin persistir nada — se reseteaba cada vez que se
reabría el modal, ni siquiera compartía estado con el corazón de la
grilla).

`js/cart-utils.js` ahora tiene la única fuente de verdad para toda la app:

- `getFavoriteIds()` — devuelve los IDs favoritos: de la tabla `favorites`
  si hay sesión, de `localStorage` si no (invitados pueden seguir marcando
  favoritos sin cuenta).
- `toggleFavorite(productId, isCurrentlyFavorite)` — agrega/saca de
  `favorites` (con sesión) o del array local (sin sesión).
- `mergeLocalWishlistIntoFavorites(userId)` — al loguearse, sube los
  favoritos marcados como invitado a la tabla (`upsert` con
  `onConflict: 'user_id,product_id'`, no duplica si ya estaban) y limpia el
  localStorage; la DB pasa a ser la única fuente para ese usuario de ahí en
  más. Se llama desde `initCartSync` (mismo punto de entrada de F4-01,
  "sincronizar todo al loguearse", una vez por pestaña).
- `initWishlist()` (ya existía, ahora async): en vez de leer/escribir
  `localStorage` directo, usa las dos funciones de arriba.

`js/product-modal.js`: el botón de favorito del modal ahora usa las mismas
`getFavoriteIds`/`toggleFavorite` — muestra el estado real al abrir el
modal (antes siempre arrancaba "no favorito") y persiste el toggle.

`js/perfil.js` (`loadFavoritos`): leía `localStorage.bl_wishlist` directo
—inconsistente con que la pestaña "Mis favoritos" solo existe logueado—,
ahora lee de la tabla `favorites` por `user_id`.

Verificado: RLS + unique constraint (`user_id`, `product_id`) probados
contra la base real con `BEGIN;...ROLLBACK;` (insertar duplicado rechazado,
un usuario no ve los favoritos de otro); el patrón de upsert compuesto +
delete que usa `mergeLocalWishlistIntoFavorites`/`toggleFavorite` probado
igual (upsert repetido no duplica, delete saca exactamente la fila
correcta). En el navegador: como invitado, tocar el corazón de una card
guarda el ID en `localStorage.bl_wishlist` correctamente. Sin sesión real
para probar el merge al loguearse ni el botón del modal con sesión — mismo
límite que F0-04.

### F5-02 (A113-192) — CRUD completo de productos — sin migración nueva

`js/vender.js`: el form de alta ("Publicar nuevo producto") pasa a servir
también para editar. `openEditProductForm(id)` trae el producto (con
`categories(slug)` embebido para el `<select>`), precarga los inputs y
setea `editingProductId`; el submit del form rama a `UPDATE` en vez de
`INSERT` cuando `editingProductId` no es null (y no toca `seller_id`, así
que la policy RLS de update sigue cumpliéndose igual que antes). Botón
activar/desactivar por fila (`is_active`, RLS ya lo permitía, solo faltaba
el botón). Verificado: import sin errores de consola; sin sesión de
vendedor real para probar el flujo completo en el navegador — mismo límite
que F0-04.

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

### 19_confirm_simulated_payment_rpc.sql (F2-03 / A113-175) — aplicado

RPC `confirm_simulated_payment(p_order_id)`, `SECURITY DEFINER`, revocado de
`anon`/`public` (solo `authenticated`). Deliberadamente separado de
`create_order`: crear la orden y "pagarla" son pasos distintos, igual que en
un checkout real contra una pasarela — así el frontend los orquesta detrás
de una interfaz común (`js/payment-providers.js`, `getPaymentProvider(method)
→ { name, pay(orderIds) }`) sin que `create_order` necesite saber nada de
métodos de pago. Providers futuros (F2-04 transferencia, F2-07 MercadoPago)
se agregan ahí sin tocar `create_order` ni este RPC.

Solo marca como pagada una orden que sea del cliente que la llama
(`auth.uid() = orders.client_id`), con `payment_method = 'simulado'` (nunca
`'transferencia'`/`'mercadopago'`, que necesitan confirmación del vendedor o
de la pasarela) y todavía `pending`; es idempotente (si ya está `paid`,
devuelve `already_paid: true` en vez de fallar, para que un doble-click no
rompa nada). Testeado con `BEGIN;...ROLLBACK;` contra la base real, creando
una orden real con `create_order` dentro de la misma transacción: pagar la
orden propia la deja `paid` con un `payment_id` generado; confirmar dos veces
es idempotente; confirmar una orden inexistente o ajena se rechaza. Wireado
en `carrito.js`: tras `create_order`, llama al provider del método elegido
(hoy siempre `'simulado'`) antes de vaciar el carrito y mostrar el total.

### 20_create_order_delivery_fee.sql (F2-05 / A113-177) — aplicado

`create_order` dejaba `delivery_fee` en `null` (pendiente, ver nota en
`18_create_order_rpc.sql`). Esta migración reemplaza la función completa
(mismo cuerpo + el cálculo real de `delivery_fee`): política unificada de
envío — gratis en `'pickup'`; en `'delivery'`, $350 por tienda salvo que el
subtotal de esa tienda (ya con el cupón aplicado) supere $5000, en cuyo caso
es gratis. Los mismos números viven espejados en `js/carrito.js`
(`FREE_SHIPPING_THRESHOLD`/`FLAT_SHIPPING_FEE`) para que el resumen del
carrito muestre exactamente lo que se cobra en el servidor.

`pages/carrito.html`: la sección "Calcular costos de envío" era un stub
visual sin lógica — ahora tiene radio buttons Retiro/Envío + un input de
dirección que aparece solo con envío. `carrito.js` (`calculateShippingByStore`)
agrupa el carrito por tienda (campo `item.shop`) para mostrar el mismo
envío que va a cobrar el RPC, ya que un carrito puede tener productos de
varios comercios (cada uno se factura en una orden separada, ver F2-01).
Validación client-side de dirección antes del checkout (el servidor también
la exige — nunca confiar solo en el cliente).

Testeado con `BEGIN;...ROLLBACK;` contra la base real: carrito con Tienda A
(subtotal $17.000, ≥ $5000) + Tienda B (subtotal $1.350, < $5000) en
`'delivery'` → Tienda A con `delivery_fee: 0`, Tienda B con
`delivery_fee: 350` (total $1.700); el mismo carrito en `'pickup'` →
`delivery_fee: 0` siempre. Verificado también en el navegador: elegir
"Envío a domicilio" muestra el input de dirección, cambia la etiqueta y el
total pasa de $1.350 a $1.700 — coincide exacto con lo que calculó el RPC
en la prueba SQL.

### 21_order_items_title_snapshot.sql (F2-06 / A113-178) — aplicado

Agrega `order_items.title` (texto, snapshot igual que `price`) y actualiza
`create_order` para completarlo desde `_order_cart_items` (ya trae el título
leído de `products` al momento del checkout, no hace falta una query extra).
Motivo: el historial de pedidos en `perfil.html` necesitaba mostrar qué
productos tenía cada orden, y un join en vivo a `products(title)` se rompe
por RLS si el vendedor después desactiva o borra el producto
(`products_select_public_active` solo permite `is_active = true`) — un
recibo de compra no debería "perder" el nombre del producto así. Testeado
con `BEGIN;...ROLLBACK;`: crear una orden real guarda el `title` correcto en
`order_items`.

`js/perfil.js` (`loadCompras`/`buildCompraItem`): reconstruida para mostrar,
por orden, la tienda, fecha, método de envío/pago, la lista de productos
comprados (desde `order_items.title`, ya no un join a `products`) y el
estado con badge de color (reutiliza `.compra-status--*` ya definido en
`perfil-custom.css`). Reconstruida con DOM API (`createElement`/`textContent`,
nunca `innerHTML`) porque el nombre de la tienda y el título de cada
producto los define el vendedor — mismo criterio anti-XSS de F1-01.

### 22_transfer_payment_proofs.sql (F2-04 / A113-176) — aplicado

`payment_proofs` (tabla + RLS) ya existía desde
`17_fase2_order_payment_columns.sql`, sin usarse todavía. Acá se agrega lo
que faltaba:

- **Bucket de storage `payment-proofs`, privado** (a diferencia de
  `products`/`stores`, que son públicos) — un comprobante de transferencia
  es información sensible, se accede con signed URLs, no por URL directa.
  Convención de paths: `{order_id}/{archivo}`; las policies de
  `storage.objects` resuelven a qué orden pertenece un objeto con
  `storage.foldername(name)[1]`, sin necesitar una tabla intermedia. Insert:
  solo el cliente dueño de esa orden, y solo si `payment_method='transferencia'`.
  Select: el cliente dueño, el vendedor de la tienda, o admin.
- **Trigger `payment_proofs_validate_order`**: un `payment_proof` solo puede
  insertarse para una orden `transferencia` que siga `pending` (la policy de
  insert de la tabla ya exige que sea del cliente, pero no chequeaba
  `payment_method`/`payment_status` — más simple un trigger que reescribir
  esa policy). La función del trigger quedó marcada por `get_advisors` como
  ejecutable vía RPC pública (no debería, es solo para el trigger) — se le
  revocó `EXECUTE` de `anon`/`authenticated`/`public`, mismo criterio que
  `handle_new_user` en F1-02.
- **RPC `confirm_transfer_payment(p_proof_id, p_approve)`**, `SECURITY
  DEFINER`, revocado de `anon`/`public`: solo el vendedor de la tienda del
  pedido (o admin) puede confirmar/rechazar. Al confirmar, la orden pasa a
  `paid` (mismo destino final que el pago simulado, F2-03). Al rechazar, la
  orden queda `pending` para que el cliente pueda subir un comprobante nuevo
  (el proof rechazado no se borra, queda de auditoría).

Testeado con `BEGIN;...ROLLBACK;` contra la base real: crear una orden
`transferencia` + subir un comprobante como el cliente → OK; el mismo
intento sobre una orden `simulado` → rechazado por el trigger; el propio
cliente intentando confirmar su comprobante → rechazado por el RPC (no es
vendedor); el vendedor dueño de la tienda confirmando → orden pasa a
`payment_status: paid, status: paid, proof_status: confirmed`.

Frontend: `pages/carrito.html`/`js/carrito.js` — nueva sección "Método de
pago" (simulado/transferencia, antes estaba fijo en simulado);
`js/payment-providers.js` — nuevo provider `transferencia` cuyo `pay()` no
confirma nada en el momento (a diferencia de `simulado`), solo le avisa al
checkout que quedó `pending` para mostrar el mensaje correcto y redirigir a
"Mis compras" en vez de a `home.html`. `js/perfil.js`
(`buildPaymentProofSection`) — para una orden `transferencia` todavía
`pending`, muestra el estado del último comprobante (enviado/rechazado) y un
`<input type="file">` para subir uno nuevo a `payment-proofs/{order_id}/...`
(nombre de archivo saneado contra `/`/`..` antes de armar el path). `js/vender.js`
(`renderPendingPayments`/`buildPendingPaymentRow`) — nueva sección "Pagos por
confirmar" en el dashboard del vendedor: lista las órdenes de su tienda con
un comprobante sin revisar, con "Ver comprobante" (signed URL, 60s de
validez) y botones Confirmar/Rechazar que llaman `confirm_transfer_payment`.

Nota de alcance: el panel del vendedor no muestra el email/nombre del
cliente (`profiles_select_own` en `profiles` solo deja ver la fila propia —
ampliar eso es una decisión de privacidad aparte, no se tomó acá); alcanza
con el ID corto de la orden y el comprobante para poder confirmar o
rechazar.

### 23_fix_handle_new_user_role_escalation.sql (CRÍTICO / A113-238) — aplicado

Hallazgo de seguridad encontrado investigando F3-01 (onboarding de
repartidor). `handle_new_user()` (redefinida en `10_fix_auth_triggers.sql`)
leía `raw_user_meta_data ->> 'account_type'` y asignaba directamente
`profiles.role = 'vendedor'/'repartidor'/'admin'` según lo que mandara el
cliente — `raw_user_meta_data` es 100% controlado por quien llama a
`supabase.auth.signUp()` (`options.data`), así que cualquiera con la anon
key pública podía autoasignarse cualquier rol, sin pasar por
`approve_seller_request` ni ningún control.

Por qué no era explotable para escrituras (mitigación parcial que ya
existía): esta función nunca actualizaba `raw_app_meta_data`, así que el
JWT (`auth.jwt() -> 'app_metadata' ->> 'role'`) seguía dando `'cliente'` —
todas las policies RLS de escritura sensible y los RPCs `SECURITY DEFINER`
chequean el JWT, no `profiles.role`. Pero `profiles.role` sí es lo que lee
`guardPage({requireRole})` (gate client-side de `admin.html`) y
`vender.js`/`checkSellerState` — un admin/vendedor autoasignado vería esas
pantallas protegidas igual, y rompía por completo el flujo D6 (aprobación
manual + CUIT) para vendedores.

Auditado antes de aplicar: `select * from profiles where role != 'cliente'`
devolvió 0 filas — el bug no había sido explotado en producción, no hizo
falta limpiar datos.

Fix: `handle_new_user()` ahora asigna siempre `role = 'cliente'`, sin leer
`account_type` en ningún lado. Subir a vendedor/repartidor/admin es
exclusivamente vía un RPC de aprobación explícito (`approve_seller_request`
para vendedor; el de repartidor es F3-01, con el mismo patrón). Verificado
con `pg_get_functiondef` tras aplicar: la función ya no referencia
`account_type` en ninguna parte. `get_advisors` después: sin hallazgos
nuevos.

### 24_fix_role_approval_trigger_block.sql (CRÍTICO / A113-239) — aplicado

Hallazgo funcional crítico encontrado construyendo F3-01: `prevent_role_update_on_profile`
(trigger BEFORE UPDATE en `profiles`) chequeaba `auth.role() IN ('authenticated', 'anon')`
para bloquear que un cliente se cambie el rol — pero esa función lee
`request.jwt.claim.role` (GUC de sesión que setea PostgREST), que vale
`'authenticated'` para CUALQUIER llamada de un usuario logueado, **incluida**
una a un RPC `SECURITY DEFINER` como `approve_seller_request` (`SECURITY
DEFINER` cambia el rol de Postgres efectivo para permisos, pero no toca esa
GUC). Resultado: `approve_seller_request` nunca pudo actualizar
`profiles.role` — ningún admin pudo aprobar un vendedor real jamás.

Verificado contra la base real, en `BEGIN;...ROLLBACK;`: llamar
`approve_seller_request` sobre la única solicitud pendiente real ("Test
Bakery", `3de4c235-0414-44e5-ab56-dec53ec0ca74`) con un JWT de admin
simulado fallaba con "No está permitido modificar el rol...". Coincide con
que esa solicitud sigue `pending` desde 2026-06-19.

Fix: el trigger ahora chequea una bandera de transacción explícita
(`current_setting('app.role_change_authorized', true)`) en vez de la GUC de
sesión. `approve_seller_request` (recreada acá) hace
`set_config('app.role_change_authorized', 'true', true)` justo antes de
tocar `profiles.role` — el `is_local=true` la resetea sola al terminar la
transacción, y un cliente normal no tiene forma de setearla (no hay ningún
RPC de `set_config` expuesto), así que la protección contra que un cliente
se cambie el rol directo sigue intacta (verificado en el mismo test:
intentar `UPDATE profiles SET role='admin'` como cliente normal sigue
rechazado). Re-testeado con `BEGIN;...ROLLBACK;`: `approve_seller_request`
sobre "Test Bakery" ahora sí crea la tienda con `status: 'approved'`.

### 25_delivery_requests.sql (F3-01 / A113-181) — aplicado

Onboarding del repartidor, mismo patrón que `seller_requests`/
`approve_seller_request` (D6): tabla `delivery_requests` (`full_name`,
`phone`, `vehicle_type` en `bicicleta`/`moto`/`auto`, `vehicle_plate`
opcional, `status`) con RLS (insertar/ver la propia, admin ve y actualiza
todas) + RPC `approve_delivery_request(req_id)` (`SECURITY DEFINER`, solo
admin, mismo patrón de bandera de transacción que `approve_seller_request`
tras el fix de A113-239). Rechazar sigue siendo un `UPDATE` directo desde
`admin.js` vía la policy de admin — no hace falta RPC para eso.

Subir a `'repartidor'` es SOLO a través de este RPC, nunca al signup (ver
A113-238, el bug que este mismo patrón evita repetir). Testeado con
`BEGIN;...ROLLBACK;`: el propio usuario intentando auto-aprobarse su
solicitud → rechazado; un admin real aprobándola → `profiles.role` pasa a
`'repartidor'`, `raw_app_meta_data` se actualiza, la solicitud queda
`approved`. `get_advisors` después: solo la advertencia esperada
("`authenticated` puede ejecutarla", intencional).

Frontend: `pages/repartidor.html` + `js/repartidor.js` (nuevo) — formulario
de alta (nombre, teléfono, vehículo, patente si no es bicicleta) y una
vista de estado (pendiente/rechazada/ya aprobado — el panel de pedidos en
sí es F3-02). `admin.js`/`admin.html` — nueva tabla "Solicitudes de
Repartidores" en el panel de admin, mismo patrón que la de comercios
(aprobar llama al RPC, rechazar es un update directo). Agregado
`repartidor` a `vite.config.js` (`rollupOptions.input`) y enlaces en
`home.html` (dropdown de categorías + footer "Vendé").

### 26_deliveries_and_claim.sql (F3-02 / A113-182) — aplicado

Tabla `deliveries` extraída de `13_target_data_model.sql` (sección 7), con
el `insert` cambiado a propósito: el diseño original la pensaba para que la
tienda/admin **asigne** un repartidor; acá el repartidor se **auto-asigna**
("toma" el pedido), así que el insert lo hace un RPC (`claim_delivery`) en
vez de una policy directa — necesita lógica (chequear que el pedido esté
disponible, serializar contra otro repartidor tomándolo al mismo tiempo)
que una policy sola no expresa bien.

`orders` no tenía ninguna policy que dejara a un repartidor ver órdenes
ajenas — se agregó `orders_select_repartidor`: ve órdenes `delivery_method
= 'delivery'` y `payment_status = 'paid'` (nunca antes de que el pago esté
confirmado). `claim_delivery(p_order_id)` (`SECURITY DEFINER`, solo
`repartidor`): bloquea la fila de la orden con `for update`, valida que sea
`delivery`+`paid`, chequea que no exista ya un `deliveries` para esa orden
(y además atrapa el `unique_violation` por si dos repartidores lo intentan
al mismo tiempo — la constraint `unique` en `order_id` es la que realmente
serializa la carrera, el chequeo previo es solo para el mensaje de error
lindo), inserta la fila con `status: 'assigned'`.

Testeado con `BEGIN;...ROLLBACK;` contra la base real: cliente crea y paga
(simulado) un pedido con envío → un repartidor lo ve como disponible →
`claim_delivery` lo toma con éxito → tomarlo de nuevo falla ("ya fue
tomado") → un cliente común (no repartidor) intentando tomarlo también
falla.

### 27_deliveries_visibility_fix.sql (F3-02 / A113-182) — aplicado

Ajuste encontrado armando el panel: `deliveries_select_participants` solo
dejaba ver una fila al repartidor asignado a **ella**, no a repartidores en
general — así que al armar la lista de "pedidos disponibles", ningún
repartidor podía ver si un pedido YA estaba tomado por otro (esa fila de
`deliveries` le quedaba oculta por RLS), y el pedido seguía apareciendo
como disponible para todos. Fix: cualquier repartidor puede ver cualquier
fila de `deliveries` (no es información sensible — `order_id`/
`repartidor_id`/`status` — y es operativamente necesaria).

Frontend (`js/repartidor.js`): agregado el panel real para repartidores ya
aprobados (antes mostraba un placeholder "en construcción") — "Pedidos
disponibles" (con botón "Tomar pedido") y "Mis entregas" (lo ya tomado).
`loadAvailableOrders()` cruza `orders` (delivery+paid) contra todas las
filas de `deliveries` para excluir lo ya tomado, ya que `orders_select_repartidor`
no filtra eso por sí sola. Verificado sin errores de consola en el
navegador (sin sesión de repartidor real para probar el flujo completo de
"tomar pedido" en UI — mismo límite que F0-04; la lógica del RPC ya se
probó a fondo contra la base real).

### 28_delivery_status_flow.sql (F3-03 / A113-183) — aplicado

RPC `update_delivery_status(p_delivery_id, p_new_status)` (`SECURITY
DEFINER`, revocado de anon/public): transiciones válidas, solo hacia
adelante y de a una — `assigned → picked_up` ("en camino") y `picked_up →
delivered` ("entregado"); solo el repartidor asignado a esa entrega puede
avanzarla (nadie más). Al avanzar, sincroniza `orders.status`:
`picked_up → 'shipped'`, `delivered → 'completed'`.

`'cancelled'` sigue en el `CHECK` de `deliveries.status` (modelo futuro)
pero a propósito sin wireear: qué pasa con el pedido al cancelar una
entrega (¿vuelve a estar disponible para otro repartidor? ¿interviene el
vendedor o el admin?) es una decisión de producto fuera del alcance de
esta tarea — no se inventó ese flujo.

Testeado con `BEGIN;...ROLLBACK;` contra la base real: cliente crea y paga
un pedido con envío → repartidor lo toma → intentar saltar directo a
`delivered` sin pasar por `picked_up` se rechaza → avanzar en orden
(`picked_up` → `delivered`) funciona y deja `orders.status = 'completed'`.

Frontend (`js/repartidor.js`): en "Mis entregas", cada tarjeta muestra un
botón para avanzar al siguiente estado ("Marcar en camino" / "Marcar
entregado") según el estado actual; al llegar a `delivered` no queda
ningún botón (estado final).

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

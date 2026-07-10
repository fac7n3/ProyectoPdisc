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
30. `30_compare_at_price.sql` — `products.compare_at_price` (F5-05, ver nota abajo).
31. `31_store_profile_columns.sql` — `stores.description`/`zone`/`hours` (F5-08, ver nota abajo).
32. `32_product_images.sql` — tabla `product_images` (F5-04, ver nota abajo).
33. `33_product_variants.sql` — tabla `product_variants` (F5-03, ver nota abajo).
34. `34_admin_moderation.sql` — moderación de Fase 6: `products_select_public_active` ahora exige comercio aprobado, RPCs `admin_set_product_active`/`admin_set_repartidor_suspended`, `profiles.is_suspended`, `profiles_select_admin`, `claim_delivery`/`update_delivery_status` bloquean repartidores suspendidos, `categories_delete_admin` (F6-02/F6-04, ver nota abajo).
35. `35_products_select_admin.sql` — policy `products_select_admin`: el admin puede ver cualquier producto (activo o no) para poder moderarlo (F6-04, ver nota abajo).
36. `36_reviews.sql` — tabla `reviews` + RPC `report_review` (F7-01/F7-03, ver nota abajo).
37. `37_conversations_messages.sql` — tablas `conversations`/`messages` (F7-02, ver nota abajo).
38. `38_notifications.sql` — tabla `notifications` + triggers + eventos en RPCs existentes (F8-01, ver nota abajo).

No hubo migración nueva para F5-07 (`A113-197`) — solo consultas nuevas
sobre `orders` ya existente. `js/vender.js` (`loadDashboardStats`): "Ventas
Hoy" (cantidad de órdenes `payment_status='paid'` creadas hoy) e "Ingresos
del Mes" (suma de `total_price` de las pagadas del mes en curso), ambas
filtradas por `store_id`. De paso corregido un bug menor: "Productos
Activos" contaba TODOS los productos de la tienda (`products.length`),
sin filtrar por `is_active` — ahora sí filtra.

### 31_store_profile_columns.sql (F5-08 / A113-198) — aplicado

`stores.description`/`zone`/`hours` (extraída de `13_target_data_model.sql`
sección 4). Resuelve de paso un bug histórico ya documentado (F0-08):
`comercio.js` leía `store.description` sin que la columna existiera nunca,
así que siempre caía al fallback "Sin descripción disponible." — ahora
existe la columna y ese código (sin cambios) ya funciona bien.

Nueva sección "Perfil de mi comercio" en el dashboard de `vender.js`: logo
(URL), dirección, teléfono, zona, horarios (texto libre) y descripción —
`fillStoreProfileForm`/`setupStoreProfileForm`, un simple `UPDATE` sobre
`stores` filtrado por `id` (la policy `stores_update_own` ya lo permitía,
no hizo falta ninguna policy nueva). `hours` se guarda como un string
simple dentro de la columna `jsonb` (ej. `"Lunes a viernes 9 a 18hs"`) en
vez de una estructura por día — más simple para esta primera versión, sin
cerrarle la puerta a un formato estructurado más adelante. Deliberadamente
no se puede editar `name`/`cuit`/`status` desde acá — son datos que ya
pasaron por la aprobación del admin (D6), cambiarlos sin re-validación
sería otra decisión de producto.

Verificado: import sin errores de consola; `get_advisors` sin hallazgos
nuevos. Sin sesión de vendedor real para probar el guardado end-to-end en
el navegador — mismo límite que F0-04.

### F5-06 (A113-196) — gestión de pedidos del vendedor — sin migración nueva

Sección "Mis pedidos" en el dashboard de `vender.js`: lista las últimas 50
órdenes de la tienda con estado y método de entrega (antes solo existían
vistas parciales: "Pagos por confirmar" de F2-04 y "Envíos en curso" de
F3-04, ninguna daba una vista completa de todos los pedidos).

El flujo de `delivery_method='delivery'` lo maneja el repartidor
(`claim_delivery`/`update_delivery_status`, F3-02/F3-03) — acá el vendedor
solo lo ve, no lo modifica. Para `delivery_method='pickup'` sí gestiona
directo (`UPDATE` simple sobre `orders.status`, la policy
`orders_update_store_or_admin` ya lo permitía, sin RLS ni migración nueva):
"Listo para retirar" (`paid → ready_for_pickup`) y "Marcar entregado"
(`ready_for_pickup → completed`). Cualquier pedido en `pending`/`paid`
también se puede cancelar (con confirmación).

Verificado contra la base real con `BEGIN;...ROLLBACK;`: cliente crea y
paga un pedido pickup → el vendedor dueño de la tienda lo marca
`ready_for_pickup` → el `UPDATE` pasa la RLS sin problema.

### 32_product_images.sql (F5-04 / A113-194) — aplicado

Tabla `product_images` (extraída de `13_target_data_model.sql` sección 2).
El bucket de storage `products` ya existía, público, con policy de upload
para `vendedor`/`admin` desde `03_ecommerce_schema.sql` — no hizo falta
tocar storage, solo la tabla que guarda las URLs subidas. RLS: select
público si el producto padre está activo (o siempre para su dueño/admin);
insert/update/delete solo el dueño del producto padre o admin (mismo
patrón que `product_variants`/`product_images` ya diseñado en F0-08).

`js/vender.js`: el form de producto ahora tiene un
`<input type="file" multiple>` para fotos adicionales. Al guardar
(alta o edición), si hay archivos elegidos, se suben al bucket `products`
bajo `{productId}/{timestamp}-{nombre saneado}` (mismo criterio anti
path-traversal que en el comprobante de transferencia, F2-04) y se
inserta una fila en `product_images` por cada una con `getPublicUrl()`
(el bucket es público). Al editar un producto, se listan sus fotos ya
subidas como miniaturas con botón de borrado (`renderExistingProductImages`).

`js/producto.js` (detalle de producto): si el producto tiene
`product_images`, se muestra una fila de miniaturas debajo de la imagen
principal — click en una miniatura cambia la imagen grande. La primera
miniatura es siempre `image_url` (la "foto de portada", ya usada en toda
la app — grillas, carrito, etc.); las demás son las de `product_images`.

Verificado contra la base real con `BEGIN;...ROLLBACK;`: el dueño del
producto puede insertar una fila en `product_images`; otro vendedor
(no dueño de ese producto) es rechazado por RLS. En el navegador: sin
errores de consola en `vender.js`/`producto.js`; un producto sin fotos
extra se ve igual que antes (sin fila de miniaturas) — sin regresión.

### 33_product_variants.sql (F5-03 / A113-193) — aplicado

Tabla `product_variants` (extraída de `13_target_data_model.sql` sección 1):
`name`/`price`/`stock`/`sku` propios por variante, mismo patrón de RLS
ownership que `product_images` (select público si el producto padre está
activo o es del dueño/admin; write solo dueño del producto padre o admin).

**Alcance a propósito acotado** (documentado también en el comentario de
la migración): esta tarea NO integra variantes al carrito/checkout — eso
implicaría rediseñar `cart-utils.js`/`carrito.js`/`create_order`/
`order_items` para llevar un `variant_id` por línea (hoy solo referencian
`product_id`), un cambio de fondo al núcleo de compra de Fase 2. El
vendedor puede cargar variantes con su propio stock como referencia;
comprar "por variante" de verdad queda para una tarea futura fuera del
roadmap tal como está redactado ("con stock por variante", no "con
checkout por variante").

`js/vender.js`: nueva sección "Variantes (talle/color/peso)" dentro del
form de producto, oculta por defecto y visible solo editando un producto
ya existente (`editingProductId` seteado — una variante necesita un
`product_id` real, igual que las fotos extra de F5-04). Lista las
variantes cargadas con botón de borrado (`renderVariantsManager`) y un
mini-form inline de nombre/precio/stock para agregar (`btn-add-variant`,
reusa `isValidPrice`/`isValidStock` ya existentes).

`js/producto.js`: si el producto tiene `product_variants`, se muestra un
bloque informativo "Opciones disponibles" (nombre, precio, stock) debajo
de la descripción, con una nota de "consultá con el vendedor" — puramente
de lectura, no cambia el flujo de "Agregar al carrito" (que sigue
agregando el producto base, sin variante).

Verificado contra la base real con `BEGIN;...ROLLBACK;` (hecho al aplicar
la migración): el dueño del producto inserta una variante correctamente;
un vendedor no dueño de ese producto es rechazado por RLS. En el
navegador: sin errores de consola en `vender.js`/`producto.js`; un
producto sin variantes se ve igual que antes (bloque no se renderiza) —
sin regresión.

### F5-09 (A113-199) — UI diferenciada del vendedor — sin migración

Solo CSS/HTML dentro de `pages/vender.html` (estilos inline propios de esa
página, no se tocó `Assets/styles/home.css` compartido con las páginas de
cliente). Se agregó una variable de acento propio del panel de vendedor,
`--bl-vendor-accent: #0e7490` (cyan/teal oscuro, dentro de la misma
familia fría que `--bl-primary` #2563eb, pero un tono distinto para que
se note que es "otro modo" sin salirse de la paleta azul del sitio):

- Badge "Modo Vendedor" en el navbar (oculto en mobile ≤768px, donde el
  navbar ya está apretado con logo + botón volver).
- Borde superior de 4px con el acento en `.vender-container`.
- `.form-btn`, `.btn-outline`, `.stat-card h3` y el foco de `.form-input`
  pasan de `--bl-primary` a `--bl-vendor-accent`.

Deliberadamente acotado a color/identidad visual, sin tocar estructura,
layout ni el flujo de ningún formulario — es la interpretación más simple
de "UI diferenciada... dentro de la paleta azul, con acentos propios" tal
como está redactado en el roadmap (🟡, ítem subjetivo). Verificado: build
sin errores, carga de `vender.html` sin errores de consola (redirige a
login por no haber sesión real de vendedor en este entorno — mismo límite
de siempre); no se pudo ver el resultado renderizado con una sesión real.

## Fase 6 — Panel de administración

### F6-01 (A113-201) — aprobar/rechazar comercios + validar CUIT — ya estaba hecho

`admin.js` ya aprobaba/rechazaba `seller_requests` mostrando el CUIT (desde
F1-04/F3-01). Lo único del roadmap sin cubrir es "notificar resultado" —
no hay sistema de notificaciones todavía (Fase 8), así que queda diferido:
cuando exista `notifications`, agregar un insert al aprobar/rechazar acá y
en `approve_delivery_request`/`rejectDeliveryRequest`.

### 34_admin_moderation.sql + 35_products_select_admin.sql (F6-04 / A113-204) — aplicado

Auditoría previa (antes de escribir la migración) encontró que:
- `stores_update_own` YA permite a un admin actualizar cualquier `stores`
  directo desde el cliente (RLS lo permitía desde siempre) — no hizo falta
  RPC para suspender un comercio, alcanza con
  `supabase.from('stores').update({status:'suspended'})`.
- `products_update_seller`/`products_update_own_seller_or_admin` exigen
  `seller_id = auth.uid()` siempre, sin excepción para admin — sí hizo
  falta una RPC (`admin_set_product_active`) para que el admin apague el
  producto de OTRO vendedor.
- `products_select_public_active` solo miraba `products.is_active`, nunca
  el estado del comercio dueño — suspender un comercio no ocultaba sus
  productos en home/búsqueda/detalle. Se corrigió agregando
  `exists (select 1 from stores where id=store_id and status='approved')`
  a esa policy — no destructivo: no toca el `is_active` que cada vendedor
  ya eligió, así que al reactivar el comercio sus productos vuelven a
  aparecer tal como estaban, sin guardar/restaurar ningún estado.
- `profiles_select_own` (`auth.uid() = id`) no alcanzaba para que el admin
  liste repartidores → nueva policy `profiles_select_admin`.
- Ídem para productos: ni `products_select_own` ni
  `products_select_public_active` cubren "admin viendo un producto
  desactivado de OTRO vendedor" → migración 35, `products_select_admin`.

Nuevo: `profiles.is_suspended` (default false) + RPC
`admin_set_repartidor_suspended(user_id, suspended)` (valida que el target
sea `role='repartidor'`). `claim_delivery`/`update_delivery_status` ahora
rechazan si `profiles.is_suspended = true` para el repartidor que llama —
defensa en profundidad: no libera automáticamente las entregas ya
asignadas de un repartidor recién suspendido, eso queda a criterio manual
del admin/soporte (fuera de alcance de esta tarea).

`categories_delete_admin`: faltaba policy de DELETE en `categories` (hoy
bloqueado para todos). `products.category_id` es `ON DELETE SET NULL`, así
que borrar una categoría en uso es seguro (los productos quedan sin rubro).

`admin.js` nuevo: tabla de comercios con botón Suspender/Reactivar (update
directo), buscador de productos por nombre con botón Suspender/Reactivar
(vía `admin_set_product_active`), tabla de repartidores con
Suspender/Reactivar (vía `admin_set_repartidor_suspended`), y tabla de
comprobantes de transferencia pendientes de TODOS los comercios (antes
`vender.js` solo mostraba los del comercio propio) reusando la RPC
existente `confirm_transfer_payment` (ya soportaba aprobación por admin).

Verificado: DDL completo corrido dentro de `BEGIN;...ROLLBACK;` sin tocar
ninguna fila real (solo se confirmó que las policies/funciones se crean
sin error) — no se llegó a simular el flujo completo con datos falsos por
fricción con el clasificador de auto-modo de esta sesión (una transacción
de prueba con datos sintéticos quedó bloqueada dos veces seguidas por
verse como reintento de una acción ya denegada). `get_advisors` corrido
después de aplicar: los únicos hallazgos nuevos son del tipo
"SECURITY DEFINER callable by authenticated" para las 2 RPCs nuevas — el
mismo patrón ya aceptado para `approve_seller_request`/`claim_delivery`/etc
(la función se autoprotege con el chequeo de rol adentro; revocar
`authenticated` rompería el uso real). Sin errores de consola al cargar
`admin.html` en el navegador (redirige a login, sin sesión admin real en
este entorno — mismo límite de siempre).

### F6-02 (A113-202) — CRUD de categorías — sin migración nueva de tabla

`insert`/`update` de `categories` ya tenían policy admin desde
`03_ecommerce_schema.sql`; solo faltaba `delete` (agregado en la migración
34). `admin.js`: sección nueva con form inline (nombre/slug/ícono) +
tabla con botón de borrado.

### F6-03 (A113-203) — CRUD de cupones — sin migración nueva

`coupons_all_admin` (`for all to authenticated using role='admin'`) ya
daba CRUD completo desde `08_coupons_schema.sql` — solo faltaba la UI.
`admin.js`: form inline (código/descuento %/vencimiento) + tabla con
activar/desactivar y borrar.

### F6-05 (A113-205) — métricas globales — sin migración nueva

`admin.js` (`loadGlobalMetrics`): usuarios totales y por rol
(vendedores/repartidores), comercios por estado (aprobados/suspendidos),
ventas totales (`orders.total_price` sumado donde `payment_status='paid'`),
entregas en curso (`assigned`+`picked_up`) y completadas. Todo con queries
directas — RLS ya permitía admin en `orders`/`deliveries`/`stores`;
`profiles` necesitó la policy `profiles_select_admin` de la migración 34.

## Fase 7 — Social: reseñas y chat

### 36_reviews.sql (F7-01 / F7-03) — aplicado

Tabla `reviews` (extraída de `13_target_data_model.sql` sección 8, con
`is_hidden`/`report_reason`/`reported_at` agregados de entrada para no
tener que volver sobre la tabla en F7-03): `target_type` (`product`/`store`)
+ `target_id`, `rating` 1-5, `comment`, `unique(target_type,target_id,client_id)`
(un cliente edita su reseña, no la duplica). RPC `report_review` — reportar
una reseña ajena no se puede vía `UPDATE` directo (`reviews_update_own`
exige ser el autor o admin), así que es una RPC `SECURITY DEFINER` aparte.

`js/reviews-utils.js` (nuevo, compartido): `renderReviewsSection(container,
targetType, targetId)` arma todo (promedio+estrellas, lista, form propio)
con DOM API (nada de innerHTML con comentarios de usuarios). Integrado en
`producto.js` (`target_type='product'`) y `comercio.js`
(`target_type='store'`). Simplificación a propósito: no se resuelve el
nombre del autor de la reseña — se muestra "Cliente" genérico, porque
`reviews.client_id` referencia `auth.users` y ningún otro lugar del
proyecto embebe nombres desde esa FK (haría falta un patrón nuevo,
fuera de alcance de esta tarea).

Verificado en el navegador: `producto.html`/`comercio.html` cargan la
sección de reseñas sin errores de consola, muestran "Todavía no hay
reseñas" + el form de alta correctamente.

### 37_conversations_messages.sql (F7-02) — aplicado

Tablas `conversations`/`messages` (extraídas de `13_target_data_model.sql`
sección 9), con un cambio respecto al diseño original: se agregó
`product_id` (nullable) a `conversations` para el "contexto de producto"
que pide el roadmap — se mantiene un solo hilo por (cliente, comercio)
en vez de un hilo por producto, y `product_id` guarda de qué producto
partió la charla como dato informativo.

Página nueva `pages/mensajes.html` + `js/mensajes.js` (agregada a
`vite.config.js`): lista de conversaciones + hilo de mensajes + responder,
usable tanto por cliente como por vendedor (misma tabla; la RLS ya
distingue el rol por `client_id`/`store_id`). Botón "Contactar al
vendedor" en `producto.js`/`comercio.js`: busca o crea la conversación
(`client_id`+`store_id` es `unique`) y redirige a `mensajes.html`.

Alcance a propósito acotado: sin Supabase Realtime (mismo criterio que
"Envíos en curso"/pagos por confirmar — se actualiza al recargar/reabrir
el hilo, no hay push en vivo); sin adjuntar imágenes al chat.

Verificado en el navegador: `mensajes.html` carga sin errores de consola
(redirige a login por no haber sesión — mismo límite de siempre, no hay
credenciales de cliente/vendedor real en este entorno).

### F7-03 (moderación de reseñas) — sin migración nueva adicional

`js/reviews-utils.js`: botón "Reportar" en cada reseña de la lista pública,
llama a `report_review` (RPC ya definida en la migración 36). `admin.js`:
sección nueva "Reseñas reportadas" (`report_reason is not null`) con botón
Ocultar/Mostrar sobre `reviews.is_hidden` (`UPDATE` directo, la policy
`reviews_update_own` ya incluye la excepción de admin desde la migración
36). Moderación de mensajes de chat deliberadamente fuera de alcance —
son conversaciones privadas entre 2 partes, menor necesidad de moderación
pública que las reseñas (que son visibles para cualquier visitante).

## Bug de datos encontrado y corregido: productos con store_id NULL

Durante la verificación en el navegador de F7-01, `producto.js` reveló que
8 de los 64 productos (`is_active=true`) tenían `store_id = NULL` — causaba
el fallback "Tienda" genérico ya documentado como bug conocido de
`home.js`. Investigación: estos 8 productos son un lote de seed **huérfano**
del 2026-06-02 (mismo `created_at` exacto en los 8), distinto y anterior a
los seeds documentados en `04_seed_mock_data.sql`/`06_seed_10_stores_and_products.sql`
(del 2026-06-19) — no corresponden a ningún script del repo (grepeado, cero
coincidencias). Sin `category_id` y con un `seller_id` que es dueño de las
14 tiendas de seed a la vez (el usuario de test usado para correr los
seeds), no hay ninguna señal relacional para reconstruir a qué tienda
pertenecía cada uno. 4 de los 8 (`Dulce de Leche Artesanal 1kg`,
`Galletitas de Agua Pack x3`, `Leche Entera 1L`, `Café Molido Premium 500g`)
son duplicados exactos (mismo título y precio) de productos ya sembrados
correctamente el 19/06, con tienda válida.

Consultado con el usuario (imposible adivinar la tienda real con certeza):
se optó por desactivarlos (`UPDATE products SET is_active = false WHERE
store_id IS NULL`) en vez de asignarles una tienda al azar o borrarlos —
reversible, no se pierde ningún dato. Verificado: 0 productos activos con
`store_id` nulo después del fix; `producto.html`/`comercio.html` muestran
el nombre real de la tienda para los productos que quedaron activos.

## Fase 8 — Notificaciones

### 38_notifications.sql (F8-01) — aplicado

Tabla `notifications` (extraída de `13_target_data_model.sql` sección 10,
tal cual estaba diseñada): sin policy de `INSERT` para `authenticated` a
propósito — las notificaciones las crea el backend (funciones
`SECURITY DEFINER` / triggers), nunca el cliente directo. Solo `select`/
`update` de las propias.

`create_notification(user_id, type, payload)` — helper interno
`SECURITY DEFINER`, `EXECUTE` revocado de `public`/`anon`/`authenticated`
(solo lo llaman otras funciones `SECURITY DEFINER` o triggers, nunca un
cliente). Eventos conectados:

- **Nueva reseña** (`reviews_notify_new`, trigger `AFTER INSERT`) → notifica
  al dueño del comercio (o del comercio del producto reseñado).
- **Nuevo mensaje** (`messages_notify_new`, trigger `AFTER INSERT`) →
  notifica al otro participante de la conversación (cliente↔vendedor).
- **Pedido creado** (parche en `create_order`) → notifica al vendedor de
  cada tienda del carrito.
- **Pedido pagado** (parche en `confirm_simulated_payment` y
  `confirm_transfer_payment`, rama aprobada) → notifica al vendedor (pago
  simulado) o al cliente (transferencia aprobada por el vendedor/admin).
  `confirm_transfer_payment` rechazada → notifica al cliente
  (`payment_rejected`).
- **Envío en camino / entregado** (parche en `update_delivery_status`) →
  notifica al cliente.

`js/notifications-utils.js` (nuevo, compartido): `renderNotificationsSection`
con DOM API — lista de notificaciones, "marcar como leída"/"marcar todas",
sin resolver nombres de quién generó el evento (mismo criterio que
`reviews-utils.js`: simplificación a propósito). Integrado como pestaña
nueva "Notificaciones" en `perfil.html` (cliente) y sección nueva en el
dashboard de `vender.js` (vendedor). El repartidor no recibe notificaciones
en esta tarea — ningún evento conectado lo tiene como destinatario, fuera
de alcance de F8-01 tal como está redactada.

Bug propio encontrado y corregido antes de aplicar para real: `get_advisors`
marcó `notify_new_review`/`notify_new_message` como invocables directo vía
RPC (`/rest/v1/rpc/notify_new_review`) — al ser funciones de trigger
`SECURITY DEFINER`, Postgres/PostgREST expone un endpoint igual que
cualquier otra función si no se revoca `EXECUTE` explícitamente. Corregido
revocando `EXECUTE` de `public`/`anon`/`authenticated` en ambas (ya estaba
hecho para `create_notification`, se me pasó en las dos de trigger).
Re-verificado con `get_advisors`: sin hallazgos nuevos.

**F8-02 (Email/Resend) y F8-03 (WhatsApp Cloud API) — bloqueados.** Ambos
canales necesitan credenciales de un proveedor externo (API key de Resend,
token de WhatsApp Business Cloud API) que no existen en este entorno de
desarrollo. La columna `notifications.channel` ya soporta `'email'`/
`'whatsapp'` (además de `'in_app'`) para cuando se sumen, sin tener que
tocar el esquema de nuevo — el trabajo pendiente es enteramente de
Edge Functions + credenciales, no de modelo de datos. No se movieron a
"En curso" en Jira (no hay trabajo real posible sin acceso a esas cuentas).
F8-04 (notificaciones in-app/push nativas) sigue marcado "Futuro" en el
roadmap — depende de que exista una app de celular.

Verificado: DDL completo corrido dentro de `BEGIN;...ROLLBACK;` sin tocar
datos reales (solo se confirmó que tabla/función/triggers se crean sin
error) antes de aplicar. `get_advisors` limpio tras el fix del bug propio.
Sin errores de consola al cargar `perfil.html`/`vender.html` en el
navegador (redirige a login, sin sesión real — mismo límite de siempre).

## Fase 9 — UX/UI, identidad y PWA (sin migración nueva — todo frontend)

### F9-03 (A113-218) — home con ofertas reales

`js/home.js` (`loadProducts`) no pedía `compare_at_price` en el `select` —
agregado. Bug más importante: el link "Ofertas" del nav (construido en
`home.js`/`search.js`) redirigía a `search.html?cat=ofertas`, y
`js/search.js` (`applyFilters`) trataba "ofertas" como un slug real de
`categories` (`.eq('categories.slug', filterState.category)`) — como esa
categoría no existe en la tabla, el filtro nunca traía nada. Fix: rama
nueva en `applyFilters` — si `filterState.category === 'ofertas'`, filtra
`.not('compare_at_price', 'is', null)` en vez de por categoría.

Verificado en el navegador: `search.html?cat=ofertas` corre sin errores de
consola, muestra "0 resultados" / "No se encontraron productos con estos
filtros" — correcto, porque hoy ningún producto real tiene
`compare_at_price` cargado (confirmado por SQL: `count = 0`); antes daba
0 resultados igual pero por la razón equivocada (filtro roto, no falta de
ofertas reales). El día que un vendedor cargue una oferta desde
`vender.js` (F5-05), va a aparecer acá correctamente.

### F9-02 (A113-217) — PWA instalable

Sin build plugin (`vite-plugin-pwa` no está instalado — decisión
consciente de no sumar una dependencia de build nueva sin que el usuario
lo pida). Todo servido como archivos estáticos en `public/` (Vite los
copia tal cual a la raíz de `dist/`):

- `public/manifest.webmanifest` — nombre, `start_url`, `theme_color`
  (`#2563eb`, el mismo `--bl-primary`), `display: standalone`, ícono.
- `public/icon.svg` — el mismo isotipo (casita/blob azul) que ya se usa
  inline en el navbar de cada página, exportado como archivo propio. Un
  solo ícono SVG con `sizes: "any"` — cubre Chrome/Android para
  instalación; Safari/iOS no soporta SVG como ícono de "Agregar a
  inicio" (usaría `apple-touch-icon`, que necesita un PNG cuadrado real)
  — límite conocido, no se generó un PNG por no tener una herramienta de
  conversión de imágenes en este entorno.
- `public/sw.js` — service worker sin lista de precache: los nombres de
  archivo de Vite llevan hash y cambian en cada build, así que precachear
  una lista fija no tiene sentido sin integración de build. Cachea en
  runtime: navegación (HTML) → red primero, cache como respaldo offline;
  assets con extensión estática (`.js/.css/.png/...`) → cache primero (
  seguro porque un build nuevo genera un nombre de archivo distinto, nunca
  sirve una versión vieja). Nunca intercepta pedidos a otro origen
  (Supabase, CDNs) — se corta apenas `url.origin !== self.location.origin`.
- Registro: `navigator.serviceWorker.register('/sw.js')` agregado al final
  de `js/auth-utils.js` (el único módulo que prácticamente todas las
  páginas importan) — no hizo falta tocar cada página individualmente
  para esto.
- `<link rel="manifest">` + `<meta name="theme-color">` + `<link
  rel="icon">` agregados al `<head>` de las 15 páginas HTML (`index.html`
  + 14 en `pages/`), justo después de la etiqueta `<title>` de cada una.

Verificado en el navegador: `fetch('/manifest.webmanifest')` → 200, JSON
válido con el contenido esperado; `fetch('/sw.js')` → 200;
`navigator.serviceWorker.getRegistrations()` → `["activated"]`.
`fetch('/icon.svg')` → 200.

### F9-04 (A113-219) — accesibilidad (acotado, no una auditoría completa)

Se investigó primero cuánto faltaba realmente en vez de asumir: la
mayoría de los `outline: none` del CSS del proyecto YA tenían un
reemplazo visual (`border-color`/`box-shadow` en `:focus`) — no eran bugs.
Se encontraron y corrigieron los 2 casos genuinamente rotos (foco
invisible al navegar con teclado, sin ningún reemplazo):

- `.password-toggle-btn` (`auth.css`, el ojito de mostrar/ocultar
  contraseña en login/registro) — agregado `:focus-visible` con outline
  propio.
- `.pm-quantity__value` (`product-modal.css`, el input numérico de
  cantidad en el modal rápido de producto) — `product-modal.css` ya tenía
  un bloque `:focus-visible` completo para sus botones (`.pm-topbar__btn`,
  `.pm-quantity__btn`, etc.), solo le faltaba este input a la lista.

El resto de accesibilidad (ARIA en paneles dinámicos de `admin.js`,
`<label>` faltantes puntuales, contraste AA completo) queda para una
auditoría dedicada — fuera de alcance de esta pasada acotada.

### F9-05 (A113-220) — responsive (gaps reales, no rediseño completo)

Se relevó qué páginas no tenían NINGÚN `@media` en su `<style>` inline
antes de tocar nada: `pages/admin.html` y `pages/repartidor.html` no
tenían cero cobertura mobile. Agregado un breakpoint `@media (max-width:
768px)` a cada una: menos padding/margin en el contenedor principal,
encabezados con `flex-wrap` (antes podían desbordar en pantallas angostas
con un `justify-content: space-between` sin wrap), tablas más compactas
en `admin.html`. De paso, mismo ajuste de contenedor en `pages/vender.html`
(comparte el mismo patrón `.vender-container`/`.vender-header`, ya tenía
un breakpoint pero solo para ocultar el badge de F5-09).

`pages/mensajes.html` ya tenía un breakpoint razonable (columna única en
mobile) desde que se creó en F7-02 — sin cambios ahí.

### F9-07 — identificado, diferido a propósito

Investigando el modal rápido de producto (`js/product-modal.js`) para
F9-04/F9-05 se encontró que **no consulta Supabase en absoluto** — arma
todo leyendo el DOM de la tarjeta ya renderizada (`extractProductData`).
El stock que muestra es **fabricado**: `stockSeed = suma de charCodes del
id; stock = stockSeed % 40 + 5` — un número pseudoaleatorio determinístico
por producto, no el `stock` real de la tabla `products`. El rating
tampoco es real: lee `.product-card__stars`, un elemento que ninguna de
las grillas (`home.js`/`search.js`/`comercio.js`) genera hoy, así que
siempre da 0 estrellas.

No es un problema de integridad — el checkout (`create_order`) revalida
todo contra la base real, nadie puede comprar aprovechando el stock
inventado. Pero sí es información falsa mostrada al usuario en la
interfaz. Arreglarlo bien requiere reemplazar la extracción por DOM por
un fetch real a Supabase (`stock`, `product_variants`, resumen de
`reviews` vía `fetchReviewsSummary` de `reviews-utils.js`) — un cambio de
alcance bastante más grande que el resto de los ítems de esta tanda de
Fase 9 (toca el flujo entero de apertura del modal, no un CSS puntual).
Se documenta acá para la próxima sesión en vez de apurar un parche a
medias.

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

## Fase 11 — Deploy y lanzamiento

Documentación de despliegue, guía de usuario y arquitectura ahora viven en
archivos propios en vez de seguir creciendo acá: [DEPLOY.md](DEPLOY.md),
[GUIA_USUARIO.md](GUIA_USUARIO.md), [ARQUITECTURA.md](ARQUITECTURA.md).

Checklist go-live (F11-05) corrido contra la base real: RLS activa en las
22 tablas de `public` (verificado con `pg_class.relrowsecurity`, no solo
mirando policies sueltas), buckets con políticas correctas, sin secretos
reales en el repo. `get_advisors` (security): único hallazgo genuino de 15
fue `is_valid_cuit` sin `search_path` fijo — corregido (migración
`fix_is_valid_cuit_search_path`, sin archivo numerado en `db/schema/` porque
es un fix de una sola función ya definida en `16_input_validation_constraints.sql`,
no un cambio de esquema nuevo). El resto de los hallazgos son RPCs
`SECURITY DEFINER` invocables por `authenticated` a propósito (la superficie
real de la app — cada uno valida el permiso adentro). Pendiente: activar
"Leaked Password Protection" (toggle manual en el dashboard). El proyecto
de Supabase está en plan **Free** — sin backups automáticos ni PITR;
consultado con el usuario, decidió quedarse en Free por ahora (decisión de
costo consciente, no un descuido — revisar si el volumen de ventas crece).

## F2-07 (A113-179) — Mercado Pago real (Checkout Pro)

Primera vez que el proyecto usa **Supabase Edge Functions** (hasta acá todo
pasaba por RPCs de Postgres) — necesarias porque una función SQL no puede
hacer un `fetch` HTTP a la API de Mercado Pago, y el Access Token (secreto)
no puede vivir en el frontend.

- `supabase/functions/mp-create-preference/index.ts` (`verify_jwt: true`):
  se invoca desde `carrito.js` con la sesión del cliente. El cliente Supabase
  interno se crea reenviando el header `Authorization` del que llama (no
  service role) — así las RLS existentes de `orders` (`orders_select_own`)
  son las que deciden qué órdenes puede pagar, mismo criterio de "nunca
  confiar en datos del cliente" que `create_order`. Arma un line-item por
  orden (usa `total_price`, ya validado server-side por `create_order`) y
  crea la preferencia contra `https://api.mercadopago.com/checkout/preferences`.
- `supabase/functions/mp-webhook/index.ts` (`verify_jwt: false` a propósito
  — Mercado Pago llama anónimo, no tiene un JWT de Supabase). La seguridad
  acá no es la firma del webhook (no configurada todavía, ver hardening
  pendiente abajo) sino **nunca confiar en el payload**: siempre se
  re-consulta el pago real vía `GET /v1/payments/{id}` con el Access Token
  antes de tocar una orden — un webhook falso con un ID inventado nunca pasa
  esa verificación (o da 404, o el pago no es `approved`). Marca `paid` solo
  filas `payment_method='mercadopago'` + `payment_status='pending'`
  (idempotente, mismo criterio que `confirm_simulated_payment`), y dispara
  `create_notification` para el vendedor.
- `js/payment-providers.js`: provider `mercadopago` nuevo. A diferencia de
  `simulado`/`transferencia`, `pay()` no confirma nada sincrónicamente —
  llama a `mp-create-preference` y redirige el navegador a `init_point`
  (nunca `sandbox_init_point`: con el modelo actual de MP, las credenciales
  de **prueba** ya usan el prefijo `APP_USR-` igual que producción — lo que
  importa es estar parado en la pestaña "Credenciales de prueba" del
  dashboard, no un prefijo `TEST-` como en versiones viejas del panel).
  `carrito.js` maneja el caso `redirecting` (no muestra el toast de
  "pagado", el navegador ya está por salir de la página).
- **Secret** `MP_ACCESS_TOKEN`: seteado a mano en el dashboard de Supabase
  (Project Settings → Edge Functions → Secrets) — no hay tool de MCP para
  setear secrets de Edge Functions, y la CLI local no está logueada en este
  entorno (`npx supabase login` requiere un browser interactivo). Nunca
  tocó el repo ni el frontend.
- Bug propio encontrado probando el flujo real en el navegador:
  `initPaymentMethodEvents()` (código de antes de F2-07, en `carrito.js`)
  solo sabía leer los radios `simulado`/`transferencia`
  (`transferenciaRadio.checked ? 'transferencia' : 'simulado'`) — elegir
  "Mercado Pago" en la UI pagaba silenciosamente como simulado sin que el
  usuario se diera cuenta. Corregido para que reconozca los 3 métodos y
  sincronice con el radio marcado por default al cargar la página (antes
  solo se actualizaba en el evento `change`).

**Verificado de punta a punta contra producción real** (no solo
`BEGIN;...ROLLBACK;`, un caso más): creé una preferencia de prueba
directo contra la API de MP con el Access Token (confirmando que el
secret funciona), confirmé que la Edge Function rechaza sin sesión (401)
y valida ownership de la orden vía RLS (403); el usuario completó un pago
real con el usuario comprador de prueba de Mercado Pago — el webhook
llegó (`200`, logueado), la orden pasó a `payment_status='paid'` con el
`payment_id` real de MP, y se creó la notificación `order_paid` para el
vendedor.

**Hardening pendiente, no bloqueante**: verificar la firma `x-signature`
del webhook (Mercado Pago la expone en la config de Webhooks del panel)
en vez de solo re-confirmar contra la API — ya es seguro sin eso (un
payload falso nunca pasa la re-consulta), pero es una capa extra
recomendada por MP contra abuso/spam del endpoint.

**Para lanzar de verdad**: reemplazar `MP_ACCESS_TOKEN` por el de
**producción** (mismo nombre de secret, no requiere tocar código ni
volver a desplegar las funciones).

## Fase 10 — Calidad, testing y performance

### F10-03 (A113-226) — bug encontrado: imágenes rotas en producción + WebP

Optimizando imágenes se encontró que **la mayoría de las fotos de producto y
logos de tienda daban 404 en producción**, no relacionado con el peso de los
archivos: `products.image_url`/`stores.logo_url` guardaban rutas relativas
tipo `../Assets/images/mockups/prod_x.png` (pensadas para resolver relativas
a `pages/*.html`), pero esos PNG **nunca se copiaban a `dist/`** — Vite solo
empaqueta lo que aparece estático en HTML/JS (así es como `hero_banner.png`/
`logoazulpng.png` sí llegaban a `dist/assets/`, por estar en un `<img src>`
de HTML), y estas rutas solo existían como *dato* insertado por los seeds SQL,
invisible para el bundler. Confirmado con `find dist -iname "*mockup*"` →
vacío. Bonus: `../Assets/images/products/meat.png` (usado por "Asado Especial
x 1kg") y `../Assets/images/default-product.png`/`placeholder.png` (fallbacks
en 5 archivos JS) **nunca existieron como archivo**, ni siquiera en `Assets/`
fuente — rotos desde que se escribieron. El fallback externo de
`vender.js` (`https://via.placeholder.com/50`) tampoco funcionaba: no está en
el `img-src` de la CSP (`'self' data: https://*.googleusercontent.com
https://*.supabase.co`), bloqueado silenciosamente.

Fix: `scripts/optimize-images.mjs` (usa `sharp`, devDependency nueva)
convierte los 24 PNG fuente (mockups + fotos de producto) a WebP
(~9.9 MB → ~0.9 MB, resize a 1000px de ancho) en `public/img/*.webp` —
Vite copia `public/` verbatim a la raíz de `dist/`, y rutas absolutas
(`/img/x.webp`) no dependen de la profundidad de la página (a diferencia
de la convención `../Assets/...` original, que fue la causa raíz real del
bug). `public/img/no-image.svg` (placeholder genérico dibujado a mano, sin
depender de ningún archivo fuente) reemplaza los 3 fallbacks rotos.
`hero_banner.png` (708 KB) también convertido a `.webp` (84 KB), referenciado
directo desde `pages/home.html` igual que antes.

Migración `39_fix_broken_image_paths.sql` (aplicada): `UPDATE` idempotente
que repunta cada fila con la ruta vieja a la nueva (56 productos + 10
tiendas). Verificado con `BEGIN;...ROLLBACK;` antes de aplicar para real, y
de nuevo con un `SELECT count(*)` después de aplicar (0 filas con ruta
vieja). Seeds `04`/`06`/`07` actualizados para que una base nueva ya nazca
con las rutas correctas. Además: `loading="lazy"` agregado a las miniaturas
que no lo tenían (`vender.js`, `carrito.js`); `producto.js`/imagen principal
queda `eager` (probable LCP de esa página).

Verificado en el navegador (preview): home muestra fotos reales de producto
y logos de tienda, 0 solicitudes fallidas de imagen, sin errores de consola.

### F10-04 (A113-227) — manejo de errores y estados de red consistentes

`renderErrorState(container, message, onRetry)` nuevo en `cart-utils.js`:
reemplaza los divs de error con estilos inline duplicados en
`home.js`/`search.js`/`comercio.js`/`producto.js` (cada uno tenía su propia
copia) por un estado visual único con botón "Reintentar" (CSS en
`home.css`, clase `.bl-error-state`). Detecta `navigator.onLine === false`
para mostrar un mensaje específico de "sin conexión" en vez del genérico.

Banner global de "sin conexión" en `auth-utils.js` (mismo patrón
self-contained que el `showToast`/`initToastContainer` ya existente ahí —
estilos inline inyectados por JS, no depende de qué hoja de estilos cargue
cada página): escucha `online`/`offline` del navegador, visible en
cualquier página que importe `auth-utils.js` (prácticamente todo el sitio).

### F10-05 (A113-228) — SEO básico + Open Graph + favicon

`public/apple-touch-icon.png` (180×180, generado con `sharp` desde
`icon.svg`) agregado a las 16 páginas — cierra el gap documentado en F9-02
("Safari/iOS no soporta ícono SVG para Agregar a Inicio"). `public/og-image.png`
(512×512) + tags `og:title`/`og:description`/`og:image`/`twitter:card` en
las 6 páginas de contenido público (home, producto, comercio, search, info,
terminos) — no hay SSR, así que el contenido es genérico de sitio, no
por-producto (un crawler de redes sociales no ejecuta el JS que carga el
producto real). `meta name="description"` agregado donde faltaba.
`public/robots.txt` nuevo: permite todo salvo las páginas privadas
(login/register/perfil/carrito/vender/admin/repartidor/mensajes).

**F10-02 (E2E con Playwright) — no implementado, explícitamente opcional
en el roadmap.** No hay framework de testing instalado en el proyecto;
agregarlo es una decisión de mantenimiento a futuro (quién corre los tests,
en qué CI) más que un fix puntual — queda para cuando el equipo lo pida.

**Fase 10 completa** salvo F10-02 (opcional, ver arriba). Checklist de
testing manual por rol: [docs/TESTING_CHECKLIST.md](TESTING_CHECKLIST.md).

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

### 30_compare_at_price.sql (F5-05 / A113-195) — aplicado

`products.compare_at_price` (extraída de `13_target_data_model.sql` sección
3), nullable, `check (compare_at_price is null or compare_at_price > 0)`.
`js/cart-utils.js` (`buildPriceRow`, nuevo, compartido): arma la fila de
precio de una product-card — si `compare_at_price > price`, agrega el
precio tachado (clase `.product-card__price-old`, ya existía en el CSS sin
usarse) y un badge de `-N%` (clase `.product-card__discount`, ídem). Antes
había 3 copias casi idénticas de este bloque en `home.js`/`search.js`/
`comercio.js` — ahora las 3 llaman a la misma función. `vender.js`: campo
"Precio anterior (opcional)" en el form de alta/edición de producto,
validado (entero, mayor al precio actual) y guardado como
`compare_at_price` (o `null` si se deja vacío).

`producto.js` (detalle de producto) queda **sin tocar a propósito**: usa su
propio markup (`.product-price`, sin CSS de "tachado" definido en ningún
lado) — agregarle la oferta ahí necesitaría diseño nuevo, fuera del
alcance contenido de esta tarea; los 3 lugares donde se navega/compra
(home, search, comercio) ya muestran la oferta.

Verificado en el navegador: sin errores de consola en las 4 páginas
tocadas; productos existentes (sin `compare_at_price`, todos `NULL`) se ven
igual que antes — sin regresión.

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

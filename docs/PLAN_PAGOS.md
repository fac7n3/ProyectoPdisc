# Plan de pagos — auditoría y hoja de ruta

> Escaneo completo del área de pagos de Baradero Local (checkout, órdenes, Mercado Pago,
> transferencia, cupones, envío, conciliación) contrastado contra la base de producción
> (`otzhdwuaffcplrveuadc`) el **2026-09-16**. Todos los números de esta página salen de
> consultas reales, no de estimaciones.

---

## 0. El titular

**El área de pagos está construida pero no está cobrando.**

| | |
|---|---|
| Pedidos creados en total | **51** |
| Pedidos efectivamente pagados | **4** (3 son `simulado`, o sea test interno) |
| Pagos reales de Mercado Pago | **1**, el 2026-07-10 |
| Comprobantes de transferencia subidos | **0** (tabla `payment_proofs` vacía) |
| Pedidos pendientes que nunca se cobraron | **47** — $506.960 |
| Pagos rechazados registrados | **0** |

Desde el 2026-07-10 no se acreditó **ni un solo pago**. Agosto: 3 intentos por Mercado Pago de
3 clientes distintos, 0 cobrados. Septiembre: 2 intentos, 0 cobrados. No es falta de tráfico —
hay gente llegando al checkout y saliendo sin poder pagar.

Que `rejected` esté en 0 es el dato que más dice: si el webhook estuviera corriendo, alguno de
esos 38 intentos fallidos tendría que haber quedado marcado como rechazado. No hay ninguno.

---

## 1. Cómo está armado hoy (mapa del área)

```
carrito.js ──> create_order (RPC, SECURITY DEFINER)   [migr. 18 → 20 → 42]
                 · relee precio/stock del server
                 · una orden por tienda
                 · aplica cupón y envío por tienda
                 · DESCUENTA STOCK          ← ver 2.1
                 └─> orders (pending / pending)
                          │
        ┌─────────────────┼──────────────────────┐
        │                 │                      │
   simulado          mercadopago            transferencia
   confirm_          mp-create-preference    (sin RPC: queda
   simulated_        → Checkout Pro          pending hasta que
   payment           → mp-webhook            suban comprobante)
   [migr. 19]        [Edge Functions]        confirm_transfer_payment
                     mp-oauth-callback        [migr. 17 + 22]
                     (split, sin UI)
                     [migr. 56]
```

| Pieza | Archivo | Estado real |
|---|---|---|
| Checkout | `js/carrito.js` (1382 líneas) | Funciona |
| Abstracción de providers | `js/payment-providers.js` | Funciona, buen diseño |
| Crear orden | `db/schema/42_...sql` (última versión) | Funciona |
| Pago simulado | `db/schema/19_...sql` | Funciona (solo testing) |
| Transferencia | `db/schema/22_...sql` + `perfil.js` + `vender.js` | **Nunca se usó** |
| Mercado Pago | `supabase/functions/mp-*` (3 funciones, ACTIVE) | **1 pago en 2 meses** |
| Split por vendedor | `mp-oauth-callback` + migr. 56 | **Backend listo, sin pantalla** |
| Cupones | migr. 08 / 42 / 57 | Funciona, sin límites de uso |
| Conciliación / comisión | — | **No existe** |

---

## 2. Bugs en producción (P0 — arreglar antes que nada)

### 2.1 El stock se descuenta y nunca vuelve

`create_order` descuenta stock en el momento de crear la orden. **Ningún camino lo devuelve**:
ni el pago rechazado (`mp-webhook` solo escribe `payment_status='rejected'`), ni el checkout
abandonado, ni `request_order_revocation` (migr. 40), ni una cancelación del vendedor.

Medido hoy contra producción:

- **141 unidades** descontadas de **11 productos** sin que nadie pagara
- **$506.960** de mercadería inmovilizada
- **2 productos ya están en stock 0** — invisibles en el catálogo, imposibles de comprar,
  únicamente por checkouts que nadie completó

Es el bug más caro del área: le está sacando mercadería real a los dos comercios reales.

**Fix propuesto**

1. Columna `orders.stock_released_at timestamptz` (idempotencia).
2. RPC `release_order_stock(p_order_id)` que devuelva `order_items.quantity` a `products.stock`
   y selle la columna. Sin la columna, un doble llamado duplicaría el stock.
3. Llamarla desde `mp-webhook` en `rejected` / `cancelled`.
4. Job de expiración (`pg_cron`) que pase a `cancelled` + libere los `pending` con más de N horas
   (sugerido: 24 h para Mercado Pago, 72 h para transferencia — la transferencia bancaria es
   lenta por naturaleza).
5. Limpieza puntual de los 47 pedidos históricos, previa confirmación del usuario de que ninguno
   se cobró por fuera del sistema.

**Decisión pendiente del usuario:** reservar (lo de arriba) vs. descontar recién al pagar. Reservar
es más trabajo pero evita vender algo que ya no hay; descontar al pagar es más simple pero permite
sobreventa. Recomendación: reservar, es lo que ya hace la estructura actual — solo falta el retorno.

---

### 2.2 No hay forma de reintentar un pago

Si el cliente vuelve de Mercado Pago sin pagar, la orden queda `pending` **para siempre**.
`js/carrito.js:1130` promete literalmente *"el cliente la puede reintentar después (ver historial,
F2-06)"* — pero no existe: `mp-create-preference` no tiene ningún llamador fuera del checkout
inicial. Los 39 pedidos de Mercado Pago pendientes son exactamente eso.

**Fix:** botón "Pagar ahora" en las tarjetas de *Mis compras* con `payment_status='pending'` y
`payment_method='mercadopago'`, que reinvoque `mp-create-preference` con ese `order_id`. La Edge
Function ya lo soporta sin cambios — recibe un array de `order_ids` y valida por RLS que sean del
llamador.

---

### 2.3 El carrito muestra un total menor al que después cobra

`calculateShippingByStore()` (`carrito.js:78`) y `groupShippingState()` (`carrito.js:116`) aplican
`currentDiscount` al subtotal de **todas** las tiendas del carrito. Pero `create_order` (migr. 42)
aplica un cupón de vendedor **solo a la tienda dueña del cupón**.

En un carrito multi-tienda con un cupón de vendedor, el resumen descuenta de más y encima puede
anunciar "Envío gratis" en una tienda que el servidor sí va a cobrar.

**Ejemplo con datos reales** (cupón `GOGOG1`, 15%, de *gogo*; `delivery_fee` 340 en gogo, 350 en
la otra tienda; umbral $5.000 en ambas; método "envío a domicilio"):

| | Pantalla | Servidor |
|---|---|---|
| gogo ($4.800) | −15% → 4.080 · envío 340 | −15% → 4.080 · envío 340 |
| otra tienda ($4.800) | −15% → 4.080 · envío 350 | **−0%** → 4.800 · envío 350 |
| **Total** | **$8.850** | **$9.570** |

El cliente paga **$720 más** de lo que decía el carrito.

**Fix:** que `calculateShippingByStore` reciba el `store_id` del cupón (ya lo devuelve
`validate_coupon_code`) y aplique el descuento únicamente a esa tienda, igual que el servidor.
Lo mismo en `groupShippingState` y en la fila "Descuento" del resumen.

---

### 2.4 Transferencia: 16 de 17 comercios no tienen dónde cobrar

`stores.transfer_info` está cargado en **una sola tienda** (*gogo*). La migración 69 arregló la UI
del carrito (A113-299), pero nadie cargó el dato.

El caso más grave es **`facu.cells`**, el otro comercio real: no tiene `transfer_info` **ni**
Mercado Pago vinculado. Puede recibir pedidos por Mercado Pago, pero ese dinero entra a la cuenta
de la plataforma (hoy con credenciales de prueba) y no hay ningún camino por el que le llegue.

**Fix:**
- Deshabilitar el radio "Transferencia bancaria" (no solo mostrar un cartel) para carritos cuyas
  tiendas no tengan `transfer_info`, igual que ya se hace con Mercado Pago en `updateMpAvailability()`.
- Pedir el dato en el alta de vendedor, o alertarlo en el panel mientras falte.

---

## 3. Seguridad e integridad (P0–P1)

### 3.1 Un vendedor puede marcar sus propios pedidos como pagados

El rol `authenticated` tiene `UPDATE` sobre **todas** las columnas de `orders` —incluidas
`payment_status`, `total_price`, `payment_id`— y las dos policies de UPDATE
(`orders_update_store_or_admin`, `orders_update_staff`) tienen **`WITH CHECK = null`**.

Es decir, esto funciona hoy desde el navegador de cualquier dueño de comercio o de cualquier
empleado suyo:

```js
supabase.from('orders')
  .update({ payment_status: 'paid', status: 'paid' })
  .eq('id', '<pedido de su tienda>')
```

Saltea `confirm_transfer_payment` y el webhook por completo. Los permisos por empleado
(`store_staff.permissions`, migr. 83) son solo UI, no frenan esto.

**Severidad hoy: media.** No hay ninguna cuenta con rol `vendedor` en producción (13 clientes +
4 admins), y no hay plata real circulando. Pero invalida las métricas del panel del vendedor
(que se calculan sobre `payment_status='paid'`) y **es fraude directo el día que haya comisión o
split**. Hay que cerrarlo antes de onboardear vendedores reales.

**Fix:**
```sql
revoke update (payment_status, total_price, payment_id, client_id, store_id, delivery_fee)
  on public.orders from authenticated;
```
El avance de estado logístico (`shipped`, `ready_for_pickup`, `completed`) queda por RPC con su
propia validación de transiciones.

---

### 3.2 Cupones de seed activos en producción, sin límite de uso

`BIENVENIDO10` (10%) y `VERANO20` (20%) siguen **activos, globales y sin vencimiento**. Son los
que sembró `08_coupons_schema.sql` como datos de prueba.

No hay `max_uses`, ni `uses_count`, ni límite por cliente, ni monto mínimo: **el mismo cliente
puede usarlos infinitas veces**. Y el descuento sale del bolsillo del comercio — `total_price` es
lo que el comercio recibe —, no de la plataforma, sin que el vendedor lo haya autorizado.

Encima `orders` **no guarda qué cupón se usó**, así que ni siquiera se puede medir el daño a
posteriori.

Agravante: el advisor de Supabase marca que `validate_coupon_code` es ejecutable por **`anon`**.
Los códigos se pueden probar sin tener cuenta.

**Fix:**
1. Desactivar `BIENVENIDO10` y `VERANO20` ya (`update coupons set is_active=false`).
2. Migración: `coupons.max_uses`, `coupons.uses_count`, `coupons.min_purchase`,
   `coupons.per_user_limit` + tabla `coupon_redemptions (coupon_id, client_id, order_id)`.
3. Registrar `orders.coupon_code` y `orders.discount_amount`.
4. Revocar `execute` de `validate_coupon_code` a `anon` (para usar un cupón hay que estar logueado
   igual).

---

### 3.3 El webhook no valida ni el monto ni la firma

`mp-webhook` hace bien lo importante: re-consulta el pago contra la API de Mercado Pago en vez de
confiar en el payload. Pero después:

- **nunca compara `payment.transaction_amount`** contra la suma de `total_price` de las órdenes del
  `external_reference`
- **no chequea `currency_id`**
- **no valida el header `x-signature`** que manda Mercado Pago (HMAC)

Un pago de $1 acreditado contra un `external_reference` de $100.000 marcaría todo como pagado.
No es un agujero trivialmente explotable (haría falta poder fijar el `external_reference`), pero
es la validación estándar de cualquier integración de pasarela y hoy no está.

**Fix:** exigir `transaction_amount >= suma de totales` y `currency_id === 'ARS'` antes de escribir
`paid`; validar el HMAC de `x-signature` con `MP_WEBHOOK_SECRET`.

---

### 3.4 Policy `orders_select_repartidor` viva después de borrar el rol

El 2026-09-16 se sacó todo el frontend del rol `repartidor` sin tocar la base (decisión registrada
en CLAUDE.md). La policy sigue ahí:

```sql
orders_select_repartidor: role = 'repartidor'
  AND delivery_method = 'delivery' AND payment_status = 'paid'
```

Da `SELECT` sobre **todos los pedidos pagados con envío, de todos los comercios** —dirección,
total, cliente— a cualquier JWT con ese rol. Verificado: hoy no existe ninguna cuenta con
`role='repartidor'`, así que no hay exposición real. Pero es superficie muerta sobre datos
financieros y personales.

**Fix:** `drop policy orders_select_repartidor on public.orders;`. Las tablas `deliveries` /
`delivery_requests` pueden quedarse como están, por si se retoma la fase de logística.

---

## 4. El modelo de negocio no está conectado (P1)

### 4.1 A113-274 — por qué el split no anda: nunca se cableó la pantalla

El pendiente en CLAUDE.md dice *"falta diagnosticar el motivo (revisar `redirect_uri`,
`MP_CLIENT_ID`/`MP_CLIENT_SECRET`, permisos de la app)"*. **No es nada de eso.**

`mp-oauth-callback` **está desplegada y ACTIVE, pero no tiene ningún llamador en el frontend.**
`grep` sobre todo el repo (fuera de `dist/`) da cero resultados: `vender.js` lee
`mp_collector_id`/`mp_split_pilot` en su `STORE_SELECT_COLUMNS`, pero no hay botón "Vincular
Mercado Pago", ni redirect a `auth.mercadopago.com`, ni manejo del `?code=` de vuelta en
`vender.html` — que es exactamente el `REDIRECT_URI` que la función espera.

La prueba de que el backend funciona: la única credencial que existe se cargó a mano el 2026-07-15
sobre "Tienda Test Split P06", y **sigue válida hasta 2027-01-11**. El intercambio OAuth y el
refresh están bien. **Falta la pantalla.**

De paso: `facu.cells` quedó con `mp_split_pilot = true` pero sin `mp_collector_id`. Es inofensivo
(el carrito lo trata como tienda sin split y cobra con el token global), pero es un estado a medias
que conviene limpiar.

**Fix:** construir el flujo de vinculación en el panel del vendedor —
botón → `auth.mercadopago.com/authorization?client_id=…&redirect_uri=…&state=<store_id>` →
al volver, `vender.js` lee `?code=` e invoca `mp-oauth-callback`. Estimado: chico, el backend ya está.

---

### 4.2 La plataforma no cobra nada

`MP_MARKETPLACE_FEE_PCT` tiene default `0` y **solo se aplica en el camino de split**, que no está
en uso. Con todo el volumen entrando a la cuenta de la plataforma, no hay comisión ni conciliación:
no existe una sola columna que diga cuánto le corresponde a cada comercio.

**Oportunidad:** definir la comisión antes del lanzamiento y guardarla **por orden**
(`orders.platform_fee`), no solo como variable de entorno. Así se puede liquidar a mano aunque el
split no esté listo, y queda el histórico si la comisión cambia.

---

### 4.3 `orders` no permite desglosar ni liquidar

Columnas actuales: `total_price`, `delivery_fee`. Nada más.

No hay `subtotal`, `discount_amount`, `coupon_code`, `platform_fee`. Sin eso no se puede liquidar a
un comercio, ni medir qué cupón funcionó, ni auditar un total. (AFIP/facturación está fuera de
alcance por decisión de producto — el desglose no lo está.)

---

### 4.4 Credenciales de prueba en producción

`MP_ACCESS_TOKEN` sigue siendo de **prueba** (ya registrado en CLAUDE.md). Esa sola línea explica
por qué ningún pago real puede acreditarse hoy. Es cambiar el secret en Supabase, sin tocar código.

---

## 5. Oportunidades de producto

Ordenadas por impacto sobre el problema real (nadie termina de pagar):

| # | Oportunidad | Por qué |
|---|---|---|
| 1 | **Pago en efectivo al retirar** | Es comercio de proximidad: "retiro en el local" ya existe como método de entrega, pero no hay forma de pagar en el local. Probablemente el método más natural para Baradero **y el más barato: 0% de comisión**. Necesita un `payment_method='efectivo'` + confirmación del vendedor (el RPC es casi idéntico a `confirm_transfer_payment`). |
| 2 | **Checkout Bricks en vez de redirect** | La redirección a Mercado Pago es justo donde se pierden los 39 pedidos. Pagar sin salir del sitio saca el salto de dominio del medio. |
| 3 | **Panel de conciliación para el admin** | El estado `needs_review` existe (migr. 56) y la notificación existe, pero **no hay ninguna pantalla donde resolverlo**. Tampoco hay una vista de pedidos pendientes por antigüedad. |
| 4 | **Avisar al cliente cuando el pago se acredita** | Hoy `mp-webhook` solo notifica al vendedor (`order_paid`). El cliente no se entera de nada. |
| 5 | **Cuotas** | Mercado Pago permite fijar `installments` / `payment_methods` en la preferencia. Hoy no se configura nada — se toma el default. |
| 6 | **`date_of_expiration` + `binary_mode`** | Preferencias que expiran solas (se enlaza con 2.1) y sin estados intermedios ambiguos. |

---

## 6. Plan por fases

### Fase A — Parar la hemorragia *(1 sesión)*
Nada de esto necesita decisiones de producto ni credenciales nuevas.

- [ ] Devolver stock: columna + `release_order_stock` + llamada desde el webhook **(2.1)**
- [ ] Job de expiración de pedidos `pending` **(2.1)**
- [ ] Limpieza de los 47 pedidos históricos y su stock **(2.1 — confirmar con el usuario primero)**
- [ ] Desactivar `BIENVENIDO10` / `VERANO20` **(3.2)**
- [ ] `revoke update` de las columnas de dinero en `orders` **(3.1)**
- [ ] `drop policy orders_select_repartidor` **(3.4)**

### Fase B — Que se pueda cobrar *(1–2 sesiones)*
- [ ] Botón "Pagar ahora" en Mis compras **(2.2)**
- [ ] Corregir el descuento por tienda en el resumen del carrito **(2.3)**
- [ ] Bloquear transferencia sin `transfer_info` + pedirlo en el alta **(2.4)**
- [ ] Validar monto, moneda y firma en el webhook **(3.3)**
- [ ] **Reemplazar `MP_ACCESS_TOKEN` por las credenciales de producción (4.4)** ← el usuario

### Fase C — Que la plataforma cobre *(1–2 sesiones)*
- [ ] Pantalla de vinculación de Mercado Pago en el panel del vendedor **(4.1)** — cierra A113-274
- [ ] Limpiar el `mp_split_pilot` de `facu.cells` **(4.1)**
- [ ] Desglose en `orders`: `subtotal`, `discount_amount`, `coupon_code`, `platform_fee` **(4.3)**
- [ ] Definir y aplicar la comisión **(4.2)** ← decisión del usuario

### Fase D — Producto *(a priorizar con el usuario)*
- [ ] Pago en efectivo al retirar **(5.1)**
- [ ] Panel de conciliación del admin **(5.3)**
- [ ] Notificar al cliente cuando se acredita **(5.4)**
- [ ] Límites de uso en cupones **(3.2)**
- [ ] Checkout Bricks / cuotas / expiración de preferencia **(5.2, 5.5, 5.6)**

---

## 7. Lo que está bien y no hay que tocar

Para que el plan no se lea como si todo estuviera mal:

- **`create_order` es sólido.** Relee precio y stock del servidor, nunca confía en el cliente,
  bloquea filas con `FOR UPDATE` contra checkouts concurrentes, y todo el cuerpo corre en una
  transacción implícita.
- **`mp-webhook` no confía en su propio payload** — re-consulta contra la API de Mercado Pago.
  Es la decisión correcta y la difícil de acertar.
- **La abstracción `PaymentProvider`** (`js/payment-providers.js`) está bien pensada: agregar
  "efectivo" no toca el checkout.
- **`store_mp_credentials` con RLS sin policies** a propósito, accesible solo por service role.
  Correcto; el advisor lo marca como INFO pero es un falso positivo.
- **El manejo del carrito al volver de Mercado Pago** (no vaciarlo hasta que el pago se apruebe)
  ya tiene resuelto un bug sutil, y está documentado en el código.

---

*Última actualización: 2026-09-16. Datos de producción verificados contra `otzhdwuaffcplrveuadc`
en esa fecha.*

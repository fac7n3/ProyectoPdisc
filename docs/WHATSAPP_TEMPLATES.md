# Plantillas de WhatsApp (F8-03) — listas para cuando esté la cuenta de Meta

> Preparadas de antemano mientras se resuelve el trámite de WhatsApp Business (ver explicación
> en el chat: cuenta de Meta Business + verificación + Access Token permanente). Ninguna de estas
> plantillas está cargada en Meta todavía — hay que darlas de alta en **Meta Business Manager →
> WhatsApp Manager → Plantillas de mensajes** una por una, y esperar la aprobación de Meta (suele
> tardar minutos a un par de días). Una vez aprobadas, el `name` de cada una es el identificador
> que usa la Edge Function para enviarlas.

## Cómo están armadas

- **Categoría `UTILITY`** en todas — son notificaciones de cuenta/pedido, no marketing. Esto
  importa: la categoría equivocada es el motivo más común de rechazo de Meta, y `UTILITY` tiene
  reglas de entrega más simples que `MARKETING`.
- **Idioma**: `es_AR` (si Meta no lo ofrece en tu cuenta, usar `es` genérico — el texto no cambia).
- Las variables (`{{1}}`, `{{2}}`, ...) están numeradas en el orden en que hay que pasarlas al
  mandar el mensaje.
- El **nombre de cada plantilla coincide con el `type` de `notifications`** (columna real de la
  tabla, ver `db/schema/38_notifications.sql` y siguientes) — así el día que se conecte el canal,
  mapear tipo→plantilla es directo, sin inventar nombres nuevos.
- Los datos de cada variable salen del `payload` (jsonb) que ya arma cada trigger — están
  verificados contra el código real, no inventados. Cuando el payload no alcanza (ej. nombre de
  tienda, nombre de producto en algunos casos), se aclara qué join adicional hace falta antes de
  mandar el mensaje.

---

## Notificaciones al cliente

### `order_created` → en realidad es al vendedor (ver más abajo). El cliente no tiene una plantilla
de "pedido creado" separada — la confirmación de compra al cliente llega en el momento (checkout),
no como notificación async.

### `order_paid_cliente`
Cuando se confirma el pago de su pedido (transferencia aprobada por el vendedor, o Mercado Pago).

```
Categoría: UTILITY
Nombre: order_paid_cliente
Idioma: es_AR

Cuerpo:
¡Tu pago fue confirmado! 🎉 Tu pedido #{{1}} en Baradero Local ya está en preparación.

Botón (URL): Ver mis compras → https://[DOMINIO]/pages/perfil.html
```
**Variables:** `{{1}}` = `order_id` (payload) recortado a los primeros 8 caracteres (mismo criterio
que `shortId` en `perfil.js`/`vender.js`: `order.id.split('-')[0].toUpperCase()`).

### `payment_rejected`
Cuando el vendedor rechaza el comprobante de transferencia subido.

```
Categoría: UTILITY
Nombre: payment_rejected
Idioma: es_AR

Cuerpo:
Tu comprobante de pago para el pedido #{{1}} fue rechazado. Subí uno nuevo desde "Mis compras" para no perder tu pedido.

Botón (URL): Subir comprobante → https://[DOMINIO]/pages/perfil.html
```
**Variables:** `{{1}}` = `order_id` recortado.

### `order_shipped`
Cuando el repartidor marca "en camino" (`update_delivery_status`, transición a `picked_up`).

```
Categoría: UTILITY
Nombre: order_shipped
Idioma: es_AR

Cuerpo:
🚚 Tu pedido #{{1}} salió de reparto. Llega pronto a tu domicilio.

Botón (URL): Seguir mi pedido → https://[DOMINIO]/pages/perfil.html
```
**Variables:** `{{1}}` = `order_id` recortado.

### `order_delivered`
Cuando el repartidor marca "entregado".

```
Categoría: UTILITY
Nombre: order_delivered
Idioma: es_AR

Cuerpo:
✅ Tu pedido #{{1}} fue entregado. ¡Gracias por comprar en Baradero Local! Si querés, dejá tu reseña del comercio o del repartidor.

Botón (URL): Calificar → https://[DOMINIO]/pages/perfil.html
```
**Variables:** `{{1}}` = `order_id` recortado.

### `stock_alert`
Volvió el stock de un producto que el cliente pidió que le avisen (`stock_alerts`).

```
Categoría: UTILITY
Nombre: stock_alert
Idioma: es_AR

Cuerpo:
¡Buenas noticias! Volvió el stock de "{{1}}", el producto que estabas esperando.

Botón (URL): Ver producto → https://[DOMINIO]/pages/producto.html?id={{2}}
```
**Variables:** `{{1}}` = `product_title` (payload) · `{{2}}` = `product_id` (payload, para el link).

### `favorite_price_drop`
Bajó de precio (entró en oferta real) un producto que el cliente tiene en favoritos.

```
Categoría: UTILITY
Nombre: favorite_price_drop
Idioma: es_AR

Cuerpo:
📉 "{{1}}" bajó de precio: ahora ${{2}} (antes ${{3}}). Es uno de tus favoritos en Baradero Local.

Botón (URL): Ver producto → https://[DOMINIO]/pages/producto.html?id={{4}}
```
**Variables:** `{{1}}` = `product_title` · `{{2}}` = `price` formateado en pesos (usar el mismo
`formatPrice()` de `cart-utils.js`, sin decimales) · `{{3}}` = `compare_at_price` formateado ·
`{{4}}` = `product_id`.

### `revocation_requested` → es al vendedor, ver abajo. El cliente no recibe una plantilla de esto
(la acción la inicia él mismo desde "Mis compras", ya ve la confirmación en pantalla).

### `support_ticket_status_change`
El estado de su reclamo cambió (admin/moderador lo actualiza).

```
Categoría: UTILITY
Nombre: support_ticket_status_change
Idioma: es_AR

Cuerpo:
Tu reclamo "{{1}}" cambió de estado: ahora está {{2}}.

Botón (URL): Ver mi reclamo → https://[DOMINIO]/pages/perfil.html
```
**Variables:** `{{1}}` = `subject` (payload) · `{{2}}` = estado traducido (mapear `status` del
payload con `SUPPORT_TICKET_STATUS_LABELS` de `notifications-utils.js`: abierto/en progreso/resuelto).

### `new_message`
Le llegó un mensaje nuevo en el chat comprador-vendedor. **A propósito no se manda el contenido
del mensaje** (privacidad, y WhatsApp no lo tiene disponible en el payload — solo `conversation_id`
y `message_id`) — solo el aviso.

```
Categoría: UTILITY
Nombre: new_message
Idioma: es_AR

Cuerpo:
Tenés un mensaje nuevo de {{1}} en Baradero Local.

Botón (URL): Ver conversación → https://[DOMINIO]/pages/mensajes.html
```
**Variables:** `{{1}}` = nombre del comercio o "un cliente" — **requiere un join adicional** en el
momento de mandar el mensaje (el payload solo tiene IDs, no el nombre; resolverlo contra
`stores.name` o `profiles.full_name` antes de armar el mensaje).

---

## Notificaciones al vendedor

### `order_created`
Le llegó un pedido nuevo a su comercio.

```
Categoría: UTILITY
Nombre: order_created
Idioma: es_AR

Cuerpo:
🛒 Nuevo pedido #{{1}} por ${{2}} en tu comercio. Revisalo en tu panel de vendedor.

Botón (URL): Ver pedido → https://[DOMINIO]/pages/vender.html
```
**Variables:** `{{1}}` = `order_id` recortado · `{{2}}` = `total_price` (payload) formateado en pesos.

### `order_paid_vendedor`
Un pedido de su comercio fue pagado (mismo evento que `order_paid` pero destinado al vendedor —
la función que lo dispara es la misma, `confirm_transfer_payment`/webhook de MP, notifica a los
dos lados por separado).

```
Categoría: UTILITY
Nombre: order_paid_vendedor
Idioma: es_AR

Cuerpo:
💰 Se confirmó el pago del pedido #{{1}}. Ya podés prepararlo para entregar o retirar.

Botón (URL): Ver pedido → https://[DOMINIO]/pages/vender.html
```
**Variables:** `{{1}}` = `order_id` recortado.

### `revocation_requested`
Un cliente pidió el arrepentimiento de una compra (Ley 24.240).

```
Categoría: UTILITY
Nombre: revocation_requested
Idioma: es_AR

Cuerpo:
⚠️ Un cliente solicitó el arrepentimiento de su compra del pedido #{{1}}. Coordiná la devolución desde tu panel.

Botón (URL): Ver pedido → https://[DOMINIO]/pages/vender.html
```
**Variables:** `{{1}}` = `order_id` recortado.

### `new_review`
Recibió una reseña nueva (de un producto o de su comercio).

```
Categoría: UTILITY
Nombre: new_review
Idioma: es_AR

Cuerpo:
⭐ Recibiste una nueva reseña de {{1}} estrellas en tu {{2}}.

Botón (URL): Ver reseñas → https://[DOMINIO]/pages/vender.html
```
**Variables:** `{{1}}` = `rating` (payload, 1 a 5) · `{{2}}` = "producto" o "comercio" según
`target_type` del payload (`product` → "producto", `store` → "comercio").

---

## Notificaciones al vendedor/repartidor sobre su solicitud de alta

Estas cuatro comparten estructura (aprobación/rechazo de vendedor o repartidor) — se arma una
plantilla por combinación porque el texto cambia bastante entre "aprobado" y "rechazado", y entre
"vendedor" y "repartidor".

### `seller_request_approved`
```
Categoría: UTILITY
Nombre: seller_request_approved
Idioma: es_AR

Cuerpo:
🎉 ¡Tu solicitud para vender en Baradero Local fue aprobada! Ya podés cargar tus productos.

Botón (URL): Ir a mi panel → https://[DOMINIO]/pages/vender.html
```

### `seller_request_rejected`
```
Categoría: UTILITY
Nombre: seller_request_rejected
Idioma: es_AR

Cuerpo:
Tu solicitud para vender en Baradero Local no fue aprobada esta vez. Podés volver a intentarlo revisando los datos enviados.

Botón (URL): Volver a intentar → https://[DOMINIO]/pages/vender.html
```

### `delivery_request_approved`
```
Categoría: UTILITY
Nombre: delivery_request_approved
Idioma: es_AR

Cuerpo:
🎉 ¡Tu solicitud para repartir en Baradero Local fue aprobada! Ya podés tomar entregas disponibles.

Botón (URL): Ir a mi panel → https://[DOMINIO]/pages/repartidor.html
```

### `delivery_request_rejected`
```
Categoría: UTILITY
Nombre: delivery_request_rejected
Idioma: es_AR

Cuerpo:
Tu solicitud para repartir en Baradero Local no fue aprobada esta vez. Podés volver a intentarlo revisando los datos enviados.

Botón (URL): Volver a intentar → https://[DOMINIO]/pages/repartidor.html
```
**Variables:** ninguna — el `payload` de estas 4 solo tiene `request_id` (no hace falta mostrarlo).

---

## Pendiente para cuando se conecte el canal (fuera de esta plantilla)

- **`[DOMINIO]`**: hoy sería `proyectopdisc.vercel.app` — actualizar todos los botones cuando se
  compre el dominio propio (F11-04, ya documentado como pendiente separado).
- **Ventana de 24hs / plantillas vs. mensajes libres**: WhatsApp solo deja mandar mensajes libres
  (sin plantilla) dentro de las 24hs de la última respuesta del usuario. Fuera de esa ventana,
  **toda** notificación proactiva tiene que ser una plantilla aprobada — por eso estas 15 cubren
  el 100% de los tipos que ya emite el sistema (`db/schema/38, 40, 41, 45, 46, 52`), no es opcional.
- **Números de teléfono**: hoy `profiles`/`stores` no tienen un teléfono confirmado *verificado*
  para WhatsApp específicamente — `profiles.phone` (F12-05) ya existe pero es de texto libre, sin
  validar formato E.164 (`+549...`). Antes de mandar el primer mensaje real hay que normalizar/
  validar ese campo (o pedirlo de nuevo en un flujo de opt-in explícito para WhatsApp).
- **Opt-in**: buena práctica (y a veces requisito de Meta) pedir consentimiento explícito antes de
  mandar plantillas de WhatsApp a un número — considerar un checkbox "Quiero recibir avisos por
  WhatsApp" en el perfil, ligado a un nuevo campo tipo `profiles.whatsapp_opt_in`.

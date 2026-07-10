# Arquitectura — Baradero Local

> F11-07. Resumen de cómo está armado el sistema — para el historial detallado
> de cada decisión (con fechas y verificaciones), ver [RUN_LOCAL.md](RUN_LOCAL.md)
> y [CLAUDE.md](../CLAUDE.md). Este documento es la foto general, no el diario.

## Stack

- **Frontend**: Vite 8 multipágina (una entrada HTML por ruta, sin router de SPA) + JS vanilla ES6, sin framework. Cada página tiene su propio módulo en `js/` que se importa desde el `<script type="module">` del HTML.
- **Backend**: todo vive en Supabase — no hay servidor propio.
  - **Postgres** con **RLS activa en las 22 tablas de `public`**: cada tabla decide quién puede leer/escribir qué fila directamente en la base, no en el frontend.
  - **RPCs `SECURITY DEFINER`** para toda operación que necesita revalidar algo server-side que el cliente no puede validar solo (precio real de un carrito, aprobar un vendedor, etc.) — cada una hace su propio chequeo de permisos adentro, y tiene `EXECUTE` revocado de los roles que no deberían llamarla directo.
  - **Edge Functions** (Deno) para lo único que ni RLS ni una función SQL pueden hacer: llamar a una API externa (Mercado Pago) sin exponer un secreto al navegador.
- **Pagos**: Mercado Pago (Checkout Pro) + transferencia bancaria con comprobante + pago simulado (testing).

## Por qué RLS + RPCs en vez de un backend propio

Todo el frontend habla directo con la API REST autogenerada de Supabase (PostgREST). Eso significa que **la única barrera de seguridad real es RLS** — si una policy está mal escrita, no hay una capa de backend que lo tape. Por eso el patrón repetido en todo el proyecto es: *nunca confiar en un dato que mande el cliente si se puede revalidar en el servidor*. Ejemplos:

- `create_order` no recibe el precio del carrito — vuelve a leer `products.price` en el momento de la compra.
- `mp-create-preference` (Edge Function) arma el cliente de Supabase con el JWT de quien llama, no con la service role key, para que las RLS de `orders` decidan qué puede pagar.
- `mp-webhook` nunca confía en el payload que manda Mercado Pago — siempre re-consulta el pago real con el Access Token antes de marcar algo pagado.

## Modelo de datos (resumen)

| Tabla | Para qué |
|---|---|
| `profiles` | Rol de cada usuario (`cliente`/`vendedor`/`repartidor`/`admin`) — el rol real que manda es el del **JWT** (`app_metadata.role`), no esta tabla directamente (ver más abajo). |
| `stores`, `products`, `product_variants`, `product_images` | Catálogo. |
| `orders`, `order_items` | Pedidos — una orden por tienda si el carrito tenía productos de varios comercios. |
| `payment_proofs` | Comprobantes de transferencia (bucket privado). |
| `deliveries`, `delivery_requests` | Flujo de repartidor. |
| `seller_requests` | Aprobación de vendedores (CUIT validado). |
| `reviews`, `conversations`/`messages` | Reseñas y chat comprador-vendedor. |
| `notifications` | Centro de notificaciones in-app. |
| `favorites`, `user_carts` | Favoritos y carrito, ambos sincronizados a la nube si hay sesión. |
| `coupons`, `categories` | Configuración del catálogo. |

## Roles y permisos

El rol de un usuario vive en dos lugares a propósito:

1. **`app_metadata.role`** (dentro del JWT) — esto es lo que leen las RLS policies y los RPCs. Solo se puede cambiar server-side (nunca lo controla el usuario).
2. **`profiles.role`** — una copia de lectura rápida que usa el frontend para decidir qué pantalla mostrar (`guardPage({requireRole})`).

Subir de rol (cliente → vendedor/repartidor/admin) es **siempre** a través de un RPC de aprobación explícito (`approve_seller_request`, `approve_delivery_request`), nunca en el registro — un bug real encontrado y corregido en este proyecto (`handle_new_user` asignaba el rol que pedía el cliente en el signup) es la razón de este diseño.

## Pagos: arquitectura de providers

`js/payment-providers.js` define una interfaz común (`{ name, pay(orderIds) }`) para que `carrito.js` no necesite saber nada del método de pago elegido:

- **`simulado`**: confirma al instante (solo testing).
- **`transferencia`**: no confirma nada — la orden queda `pending` hasta que el cliente sube el comprobante y el vendedor lo aprueba.
- **`mercadopago`**: redirige al checkout hospedado de Mercado Pago; la confirmación llega después, de forma asíncrona, vía webhook.

Agregar un nuevo método de pago en el futuro (ej. otro proveedor) es agregar un provider más acá, sin tocar `create_order` ni el resto del checkout.

## PWA y offline

Service worker (`public/sw.js`) con estrategia mixta: red-primero para navegación (HTML, con cache como respaldo offline) y cache-primero para assets con hash de Vite (nunca quedan viejos, un build nuevo siempre genera un nombre de archivo distinto). Un banner global avisa cuando el navegador pierde la conexión (`auth-utils.js`, escucha los eventos `online`/`offline`).

## Decisiones deliberadas que pueden sorprender

- **`dist/` se versiona en git**: no es un descuido, permite ver el resultado del build sin correrlo. Vercel igual reconstruye desde cero en cada deploy (no sirve este `dist/` directamente).
- **`.env` se versiona en git**: las claves que tiene (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) son públicas por diseño de Supabase — terminan igual embebidas en el JS que se sirve al navegador. Lo que nunca se versiona es una service role key o el Access Token de Mercado Pago.
- **Sin Supabase Realtime**: todos los paneles (admin, pagos por confirmar, envíos en curso) se actualizan al recargar la página, no con suscripciones en vivo — decisión consciente para no meter un patrón de suscripción/limpieza sin poder probarlo a fondo.

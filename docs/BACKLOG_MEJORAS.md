# Backlog de Mejoras Post-Lanzamiento

> Lista consolidada a partir del feedback del usuario (2026-07-14).
> Cada ítem referencia el punto original (`#NN`) de la lista del usuario.
> Estados: `pendiente` · `en_curso` · `hecho` · `bloqueado` (necesita input del usuario o decisión de negocio).

Rama de trabajo: `mejoras-post-lanzamiento` (cambios ya mergeados a `main` en commit `790b7aa`).

---

## ✅ Hecho (sesión 2026-07-14)

| # | Punto original | Tarea |
|---|---|---|
| P0-1 | #17 | Fix upload comprobante transferencia (error handling mejorado — falta repro del usuario para ver el error real) |
| P0-2 | #14b | Multi-address book (migración 55 `user_addresses`, UI en perfil + selector en carrito, auto-migración de la dirección vieja) |
| P0-3 | #28 | Devolución/arrepentimiento verificado end-to-end (migración 40 + perfil.js + vender.js, sin cambios) |
| P0-4 | #29 | Términos cláusulas 4, 6, 7 actualizadas (sacado pago simulado, aclarado distancia aplica a retiro también, conciliación manual + detección de incumplimientos) |
| P0-5 | #14x-soporte | Soporte hilo tipo chat (migración 54 `support_ticket_messages`, admin responde, usuario cancela reclamo) |
| P1-1 | #19 | Sacado pago simulado del carrito |
| P1-2 | #24 | Sacado cierre del modal al clic afuera (accesibilidad) |
| P1-8 | #20 | Selector de direcciones guardadas en carrito (parte de P0-2) |
| P1-11 | #14x-soporte | Usuario puede cancelar reclamo (parte de P0-5) |

**Migraciones aplicadas a producción**: 54 (support_ticket_messages), 55 (user_addresses).

## ✅ Hecho (sesión 2026-07-16)

| # | Punto original | Tarea |
|---|---|---|
| P1-6 | #16a | Cupones de un vendedor puntual ya no se listan en bloque a `anon`/`authenticated` (migración 57) |
| P1-7 | #16b | UX cupón carrito: aplica solo con escribir (debounce), botón pasa a "Quitar" con un cupón puesto |

**Migración 57 aplicada a producción**: `coupons_select_public` restringida a solo cupones
globales (`store_id is null`); nueva `coupons_select_own_store` (el dueño ve todos los suyos,
activos o no — corrige de paso un bug latente: sin esta policy, un cupón que el vendedor
desactivaba desaparecía de "Mis cupones" en vez de solo perder vigencia pública); nueva RPC
`validate_coupon_code(p_code)` (`SECURITY DEFINER`, una fila por código exacto, no una lista) para
que `carrito.js` siga pudiendo validar un código que el usuario ya escribió sin necesitar una
policy de lectura amplia. `renderActiveCoupons()` (`cart-utils.js`, home + carrito) ahora solo
consulta cupones globales. Verificado contra la base real (`BEGIN;...ROLLBACK;`, `SET ROLE anon`
y `SET ROLE authenticated` + `set_config('request.jwt.claim.sub', ...)`): `anon` sigue viendo los
2 cupones globales existentes pero 0 de vendedor; la RPC resuelve por igual un código global y uno
de vendedor; el dueño de la tienda ve su propio cupón inactivo, un extraño no. `get_advisors`: un
solo hallazgo nuevo, esperado y ya aceptado en el proyecto (`validate_coupon_code` invocable por
`anon`, mismo patrón intencional que `validate_cart_prices`).

**P1-7**: sin migración, 100% frontend (`js/carrito.js`, `initCouponEvents`). Antes había que
escribir el código y clickear "Aplicar" (o Enter) — ahora un listener de `input` con debounce de
500ms lo valida solo con escribir (reutiliza la misma `applyCoupon()` de siempre, vía la RPC
`validate_coupon_code` de P1-6). "Borrar" era ambiguo (¿alcanza con limpiar el input? ¿hace falta
re-aplicar vacío?): el botón "Aplicar" ahora pasa a decir "Quitar" (con color de aviso,
`.coupon-btn--remove` en `Assets/styles/carrito.css`) en cuanto un cupón queda aplicado — un solo
click limpia el input y resetea el descuento al instante, sin esperar el debounce. **No verificado
en el navegador** (la extensión de Chrome no estaba conectada en esta sesión) — cubierto con
revisión de código exhaustiva del flujo de eventos (debounce/clear/keydown/click no pisan estados
entre sí) en su lugar; recomendable una pasada visual rápida en la próxima sesión con navegador
disponible.

## ✅ Hecho (sesión 2026-07-16, agentes en paralelo)

| # | Punto original | Tarea |
|---|---|---|
| P1-13 | #11 compl. | Sacados Vender y Repartir del mega-menú de categorías (`nav-utils.js`) — ya están en perfil.html > Mis datos > Accesos rápidos, sobraban ahí (ese menú es solo para categorías de productos + Ofertas) |
| P1-5 | #7 | Campanita de notificaciones (`initNotificationsBell`, antes solo en home) extendida a search/comercio/producto/carrito/vender/repartidor/perfil/mensajes — el mismo `<div id="nav-notifications-wrap">` a la izquierda de `#nav-profile` (o del botón "Volver" en las páginas sin link a perfil) |
| P1-4 | #22 | Página nueva `pages/comercios.html` + `js/comercios.js`: listado real de comercios `status='approved'` (nombre, logo con fallback, zona, rubro más común). Footer "Comercios" (home.html/search.html) actualizado de `./search.html` a `./comercios.html` |
| P1-10 | #11/#12 | "Quiero repartir" agregado a Accesos rápidos en `perfil.html` (junto a "Quiero vender", que ya estaba) |

**P1-13**: sin migración, 100% frontend. La tira de acceso rápido scrolleable nunca tuvo
Vender/Repartir (solo el mega-menú), así que no hizo falta tocarla.

**P1-5**: en vender.js/repartidor.js/mensajes.js se llama recién dentro del callback `onReady` de
`guardPage` (una vez que ya se sabe si hay sesión), igual que hace `home.js` en su
`DOMContentLoaded`. `perfil.html` convive con su pestaña interna "Notificaciones"
(`renderNotificationsSection` en `#notificaciones-container`) sin duplicar IDs — son containers
distintos. `info.html`/`privacidad.html`/`terminos.html` quedan afuera a propósito: no tienen
navbar completa (sin `#nav-profile` ni buscador), solo un botón "Volver al Inicio".

**P1-4**: sin migración — la RLS pública de `stores` (`stores_select_public`, `status='approved'`)
ya alcanzaba. El rubro más común se calcula client-side desde un solo embed
`products(categories(name))` (RLS de `products` ya filtra a solo activos para `anon`). Todo con DOM
API, sin `innerHTML` para datos de la tienda. **No verificado visualmente en el navegador** (sin
herramientas de navegador conectadas en esta sesión) — cubierto con `npm run build` exitoso y
revisión de código; recomendable una pasada visual en la próxima sesión.

---

## ✅ Hecho (sesión 2026-07-17)

| # | Punto original | Tarea |
|---|---|---|
| P0-6 | #18 | Split payments con Mercado Pago Marketplace (modo piloto) — **resuelto end-to-end**, confirmado por el usuario. OAuth de vinculación + creación de preferencia con split + pago real + webhook, todo verificado. El bloqueo que quedaba pendiente de la sesión 2026-07-15 (botón "Pagar" deshabilitado dentro del checkout de MP, sin causa aislada) se destrabó solo al reintentar — no hizo falta ningún cambio de código. Detalle completo en skill `progreso-baradero-local`. |

## Pendiente — P1 (media prioridad)

Sin ítems pendientes por ahora — P1-3, P1-4, P1-5, P1-9, P1-10, P1-12 y P1-13 se resolvieron
en la sesión 2026-07-16 (ver tablas "Hecho" arriba).

## ✅ Hecho (sesión 2026-07-15, agente en paralelo)

| # | Punto original | Notas |
|---|---|---|
| P2-8 | #13 | Sacado el botón "Aplicar filtros" de `pages/search.html` (`filters-apply-btn`) y su listener en `js/search.js`. Los filtros (búsqueda, categoría, precio, orden) ya llamaban `commit()` al cambiar — mismo patrón que el cupón de P1-7 — así que el botón era redundante; en mobile el cierre del panel sigue con el botón "X" (`filters-sidebar-close`) que ya existía. También se sacó la regla CSS `.filters-sidebar__apply` ahora sin uso en `Assets/styles/home.css`. |
| P2-1 | #27 | Agregado botón "Volver" (`navbar__action-circle` con flecha, mismo patrón que `vender.html`/`repartidor.html`/`mensajes.html`) apuntando a `home.html`, en `pages/comercio.html` y `pages/perfil.html` (ninguna de las dos lo tenía). No requirió inventar un patrón nuevo. **No verificado visualmente** (sin navegador disponible en esta sesión). |
| P2-6 | #1 | Revisado `Assets/styles/home.css`: `.value-strip`, `.farmacia-turno`, `.stores-carousel-section` (carrusel de "Locales Destacados", el que el usuario llama "negocios recomendados") y `.products` ya usaban el mismo `max-width: 1320px` + gutter de `1.5rem` — no había desalineado entre esas dos secciones puntuales. Se encontró y corrigió una inconsistencia real en la sección vecina de cupones (`.coupons-section` tenía `padding: 0 1rem` en vez de `1.5rem` como el resto de la columna). **No verificado visualmente** — si el usuario sigue viendo un desalineado después de este fix, hace falta una captura de pantalla para identificar la causa real (posiblemente perceptual, no de CSS). |

## ✅ Hecho (sesión 2026-07-16, agentes en paralelo)

| # | Punto original | Notas |
|---|---|---|
| P1-3 | #21 | Modal rápido (`product-modal.js`): cada apertura de producto empuja un `history.pushState` con su propia profundidad (`pmDepth`); un listener de `popstate` reabre el producto de ese estado en el mismo modal. Cerrar de verdad (X/Atrás/ESC/click afuera) pasa por `requestCloseModal()`, que deshace de una sola vez todo lo empujado con `history.go(-depth)` en vez de obligar a apretar "atrás" una vez por producto visto. |
| P1-9 | #14a | Favoritos con 2 secciones (Productos/Comercios) en `perfil.js`, sub-pestañas + filtro de texto client-side. Tabla nueva `favorite_stores` (migración 59, mismo patrón RLS que `favorites`/F4-03) + `getFavoriteStoreIds()`/`toggleFavoriteStore()` en `cart-utils.js` + botón de favorito en `comercio.js`. La 3ra sección ("servicios") queda **fuera de alcance a propósito** — no existe esa feature en la app (sin tabla ni concepto de "servicio" todavía). Revisando el link a `producto.html` desde favoritos no se encontró un bug de navegación reproducible (el href ya era correcto). |
| P1-12 | #15 | `stores.accepts_contact` (migración 58, default `true`). Checkbox nuevo "Permitir que los clientes me contacten" en "Perfil de mi comercio" (`vender.js`). El botón "Contactar al vendedor" se oculta en `producto.js`/`comercio.js` cuando el vendedor lo desactiva. Sin RLS nueva (`stores_update_own` ya cubría el caso). |

## ✅ Hecho (sesión 2026-07-16, 5 agentes en paralelo vía worktrees)

| # | Punto original | Notas |
|---|---|---|
| P2-9 | #25 | Las tarjetas de producto (`search.js`, `home.js`, `comercio.js` — 3 lugares duplicados, sin función compartida) tenían su propio botón "Agregar" que no miraba `stock` (a diferencia de `producto.js`/`product-modal.js`, que ya lo hacían bien). Ahora las 3 deshabilitan el botón y muestran "Sin stock" cuando `product.stock <= 0`, mismo criterio visual que ya usaba `product-modal.js`. El resto de la cadena (revalidación de carrito, RPC `create_order`) ya estaba bien protegido, no se tocó. |
| P2-3 | #6 | `js/comercio.js` armaba la sección de reseñas con un `max-width: 700px` inline inventado. Ahora usa la misma clase `.store-products` (`max-width: 1200px`) que ya usa la grilla de productos de la tienda, quedando alineada con el resto del contenido. |
| P2-7 | #3 | `.pm-related__scroll` (relacionados del modal rápido, `product-modal.css`) no tenía padding-top suficiente para el `translateY(-3px)` + sombra del hover de las tarjetas — quedaban recortadas arriba. Sumado padding. Además, sin scrollbar visible ni handler de rueda, una PC de escritorio sin touchpad no tenía forma de scrollear horizontal — agregado un listener `wheel` en `product-modal.js` que traduce scroll vertical a horizontal cuando el gesto es predominantemente vertical (no pisa el scroll horizontal nativo de touchpad). |
| P2-5 | #9 | `pages/comercio.html` tenía `<main id="main-content">` vacío en el HTML estático seguido directo del `<footer>` — mientras `comercio.js` hacía el fetch async, el `<main>` colapsaba y el footer aparecía pegado arriba. El patrón de skeleton de `perfil.js` (`removeSkeleton`) no aplicaba (esa página tiene layout fijo pre-marcado; `comercio.html` arma todo dinámico). Se agregó un spinner (mismo estilo visual que `.auth-loading-spinner` de `auth.css`, reimplementado inline con las variables `--bl-*` de la página) con `min-height: 60vh` para que el `<main>` tenga altura real durante la carga. |
| P2-2 | #8 | El logo del navbar en `vender.html`/`repartidor.html` (y también `mensajes.html`, no reportado por el usuario pero con el mismo problema) era un SVG inline con azul hardcodeado (`#2d4a7c`), distinto de la imagen real de marca (`logoazulpng.png`) que usa el resto del sitio. Unificado a la misma `<img>` que usa `home.html`. El "verde agua" que mencionó el usuario resultó ser `.vendor-mode-badge` (`--bl-vendor-accent: #0e7490`) — un acento intencional de "modo vendedor" (comentario `F5-09` ya en el código), no una inconsistencia del navbar; no se tocó. Tipografía y el patrón "flecha volver" ya estaban consistentes (mismas clases CSS, sin overrides). |

## Pendiente — P2 (consistencia visual / navegación)

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P2-4 | #5 | pendiente | "Envío gratis" solo aparece dentro del producto, no afuera |
| P2-10 | #23 | pendiente | Registro vendedor: permitir elegir más de un rubro (hoy `category_slug` único) |
| P2-11 | #10 | pendiente | Arreglar en general cómo se ve tienda (pasada estética global de comercio.html) — requiere criterio de diseño del usuario |

## Pendiente — P3 (estético / capricho)

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P3-1 | #4 | pendiente | "Envío gratis" borroso y hecho con IA — versión plana simple |
| P3-2 | #2 | pendiente | Sacar cupones del inicio |
| P3-3 | #10 compl. | pendiente | Arreglar en general cómo se ve tienda (solapa con P2-11) |

## Pendiente — P4 (features nuevas grandes)

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P4-1 | #26 | pendiente | Cargar producto por escaneo de código de barras (requiere proveedor de datos externo) |

---

## Preguntas abiertas para retomar

- **P0-6 (#18)**: MP Marketplace — usuario confirmó que ya tiene cuenta. Faltan 4 decisiones:
  1. ¿Modo Split Payment automático o conciliación vía API?
  2. ¿Comisión (% fijo, 0% al inicio, monto fijo)?
  3. ¿Vendedores sin MP vinculado pueden vender con MP o solo transferencia?
  4. ¿Hay que armar el OAuth flow para vincular vendedores o ya tienen collector_ids cargados?
  Pregunta hecha en la sesión, descartada por el usuario antes de cerrar — retomar al abrir.

## Notas operativas

- **P0-1**: el fix mejora el error handling del upload del comprobante (muestra `storage`/`db`/`unknown` + el mensaje real). Hace falta repro del usuario: cuando pruebe transferencia y falle, el toast ahora va a decir exactamente qué falló — con eso podemos fixear el root cause.
- **P0-3**: el flujo de arrepentimiento ya estaba bien implementado (migración 40), solo se verificó end-to-end.
- **Migraciones 54/55 ya aplicadas a producción** (confirmado en el mensaje del commit `790b7aa`).

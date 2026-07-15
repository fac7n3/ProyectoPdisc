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

---

## Pendiente — P0 (alta prioridad)

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P0-6 | #18 | **arquitectura implementada, falta activación** | Split de plata con MP Marketplace (2026-07-15). Decisiones: split automático vía OAuth, comisión 0% al arrancar (`MP_MARKETPLACE_FEE_PCT`, subible sin migración), vendedor sin MP vinculado solo cobra por transferencia, piloto con 1-2 vendedores (`stores.mp_split_pilot`) antes de abrir a todos. Migración 56 aplicada, 3 Edge Functions desplegadas (`mp-oauth-callback` nueva, `mp-create-preference`/`mp-webhook` reescritas). **Falta para poder probarlo**: (1) cargar `MP_CLIENT_ID`/`MP_CLIENT_SECRET`/`MP_MARKETPLACE_FEE_PCT=0` en Supabase Edge Function Secrets — se consiguen en el panel de Mercado Pago Developers, sección de la app de Marketplace; (2) cargar `VITE_MP_CLIENT_ID` (público) en `.env`/Vercel; (3) activar el piloto a mano por SQL para 1-2 tiendas de prueba: `update public.stores set mp_split_pilot = true where id = '<store_id>';`; (4) probar con las credenciales de prueba de MP (vendedor de prueba), NO con plata real, hasta confirmar que el webhook reconoce bien el pago (hay un supuesto sin verificar 100% documentado: que el `user_id` del webhook identifica al vendedor — ver nota en `supabase/functions/mp-webhook/index.ts`). Simplificación a propósito del piloto: si el carrito mezcla más de una tienda, Mercado Pago no se ofrece como opción (transferencia/simulado siguen andando) — MP no permite dividir un pago entre varios vendedores. |

## Pendiente — P1 (media prioridad)

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P1-3 | #21 | pendiente | Atrás en producto relacionado va al producto anterior (manejar historial) |
| P1-4 | #22 | pendiente | Footer "Comercios" lleva a productos — necesita página nueva de listado de comercios |
| P1-5 | #7 | pendiente | Campanita notificaciones en todas las páginas (solo está en home) |
| P1-9 | #14a | pendiente | Favoritos 3 secciones (productos/comercios/servicios futuro) + buscar/filtrar + corregir vista producto desde favoritos. Requiere tabla `favorite_stores` nueva. |
| P1-10 | #11/#12 | pendiente | Mis datos: agregar Vender y Repartir en accesos rápidos |
| P1-12 | #15 | pendiente | Vendedor configura si quiere ser contactado (toggle botón "Contactar al vendedor") |
| P1-13 | #11 compl. | pendiente | Sacar Vender y Repartir del mega-menú de categorías |

## Pendiente — P2 (consistencia visual / navegación)

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P2-1 | #27 | pendiente | Botón retroceder intuitivo en tienda y usuario |
| P2-2 | #8 | pendiente | Nav de vender y repartir distinto al resto (logo, tipografía, flecha vs botón, color verde agua) |
| P2-3 | #6 | pendiente | Reseñas desalineadas en tienda |
| P2-4 | #5 | pendiente | "Envío gratis" solo aparece dentro del producto, no afuera |
| P2-5 | #9 | pendiente | Footer se ve mientras carga tienda + animación de carga |
| P2-6 | #1 | pendiente | Alinear barra de farmacia y "negocios recomendados" con el resto |
| P2-7 | #3 | pendiente | Productos relacionados: hover cortado + sin scroll horizontal en compu |
| P2-8 | #13 | pendiente | Sacar botón "Aplicar filtros" en búsqueda |
| P2-9 | #25 | pendiente | Carrito/comprar bloquear si no hay stock (F5-02 ya tiene toggle de producto) |
| P2-10 | #23 | pendiente | Registro vendedor: permitir elegir más de un rubro (hoy `category_slug` único) |
| P2-11 | #10 | pendiente | Arreglar en general cómo se ve tienda (pasada estética global de comercio.html) |

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
- **P1-4**: el link del footer "Comercios" apunta a `search.html` porque no hay página de listado de comercios. Fixearlo implica armar esa página nueva.
- **Migraciones 54/55 ya aplicadas a producción** (confirmado en el mensaje del commit `790b7aa`).

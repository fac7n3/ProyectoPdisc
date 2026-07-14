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

---

## Pendiente — P0 (alta prioridad)

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P0-6 | #18 | **bloqueado** — necesita respuesta del usuario | Split de plata con MP Marketplace. Usuario confirmó que ya tiene cuenta MP Marketplace. Faltan decidir: modo (Split Payment automático vs conciliación), comisión (% fijo / 0% / monto fijo), qué pasa con vendedores sin MP vinculado, y si hay que armar el OAuth flow o ya tiene vendedores vinculados. Pregunta hecha, descartada por el usuario antes de cerrar sesión — retomar al abrir. |

## Pendiente — P1 (media prioridad)

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P1-3 | #21 | pendiente | Atrás en producto relacionado va al producto anterior (manejar historial) |
| P1-4 | #22 | pendiente | Footer "Comercios" lleva a productos — necesita página nueva de listado de comercios |
| P1-5 | #7 | pendiente | Campanita notificaciones en todas las páginas (solo está en home) |
| P1-6 | #16a | pendiente | Cupones solo visibles a quien corresponden (RLS `coupons_select_public` hoy deja a `anon` ver todos) |
| P1-7 | #16b | pendiente | UX cupón carrito: aplicar al escribir + borrar intuitivo (hoy botón "Aplicar" + borrar raro) |
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

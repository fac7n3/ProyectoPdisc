# Backlog de Mejoras Post-Lanzamiento

> Lista consolidada a partir del feedback del usuario (2026-07-14).
> Cada ítem referencia el punto original (`#NN`) de la lista del usuario.
> Estados: `pendiente` · `en_curso` · `hecho` · `bloqueado` (necesita input del usuario o decisión de negocio).

Rama de trabajo: `mejoras-post-lanzamiento`.

---

## P0 — Bugs funcionales y legal (bloqueantes para lanzamiento)

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P0-1 | #17 Transferencia bancaria no funciona en carrito | pendiente | Reproducir y fixear el flujo F2-04. |
| P0-2 | #14b Direcciones guardadas "no figuran cuando agrego una" | pendiente | Bug de guardado/vista; el dato está en `profiles.address`/`address_details` pero no se ve. |
| P0-3 | #28 Revisar devolución y botón de arrepentimiento | pendiente | Ya implementado (migración 40); confirmar flujo end-to-end + texto legal. |
| P0-4 | #29 Legal: Términos cláusulas 4, 6 (distancia, ¿aplica?) y 7 (cómo detecta admin incumplimiento) | pendiente | Texto legal recién escrito; revisar 3 puntos. |
| P0-5 | #14x-soporte Admin puede abrir reclamo y enviar respuesta + usuario puede cancelar reclamo | pendiente | F12-11 implementó solo cambio de estado; falta hilo de respuesta bidireccional. |
| P0-6 | #18 ¿Cómo se divide la plata entre vendedores con MP/transferencia? | pendiente | Decisión de negocio; confirmar modelo antes de lanzar. |

## P1 — UX funcional rota

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P1-1 | #19 Sacar pago simulado del carrito | pendiente | Era para testing interno (F2-03); ocultar radio en producción. |
| P1-2 | #24 Clic afuera del modal cierra el producto → quitar | pendiente | Accesibilidad para gente mayor. |
| P1-3 | #21 Atrás en producto relacionado salta a la primera pantalla | pendiente | Manejar historial/navigation. |
| P1-4 | #22 Botón "Comercios" del footer lleva a productos, no a comercios | pendiente | Link mal apuntado. |
| P1-5 | #7 Campanita de notificaciones desaparece en carrito/perfil/producto | pendiente | Solo está en home; replicar. |
| P1-6 | #16a Cupones: solo accesibles a quien corresponden | pendiente | Hoy `coupons_select_public` deja a `anon` ver todos los cupones activos; restringir. |
| P1-7 | #16b UX cupón en carrito: aplicar automáticamente al escribir + borrar intuitivo | pendiente | Hoy hay botón "Aplicar" y borrar es raro. |
| P1-8 | #20 Envío a domicilio: elegir entre direcciones cargadas o aplicar una nueva | pendiente | Hoy solo input libre. |
| P1-9 | #14a Favoritos: 3 secciones (productos / comercios / servicios futuro) + buscar/filtrar + corregir vista del producto desde favoritos | pendiente | Requiere `favorite_stores` nueva. |
| P1-10 | #11/#12 Mis datos del usuario: agregar "Vender" y "Repartir" en accesos rápidos | pendiente | Cambio de accesos rápidos en perfil. |
| P1-11 | #14x-soporte Usuario puede cancelar su reclamo | pendiente | Complemento de P0-5. |
| P1-12 | #15 Vendedor puede configurar si quiere ser contactado | pendiente | Toggle del botón "Contactar al vendedor". |
| P1-13 | #11 complemento Sacar "Vender" y "Repartir" del mega-menú de categorías | pendiente | Se mueven a Mis datos (P1-10). |

## P2 — Consistencia visual / navegación

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P2-1 | #27 Botón retroceder intuitivo en tienda y usuario | pendiente | Hoy solo el logo del nav. |
| P2-2 | #8 Nav de `vender` y `repartir` distinto al resto | pendiente | Logo, tipografía, flecha vs botón volver, color verde agua difiere → unificar. |
| P2-3 | #6 Reseñas desalineadas en tienda | pendiente | `comercio.js` render de reviews. |
| P2-4 | #5 "Envío gratis" solo aparece dentro del producto, no afuera | pendiente | Visible en grillas/card. |
| P2-5 | #9 Footer se ve mientras carga tienda + agregar animación de carga | pendiente | Skeleton/spinner. |
| P2-6 | #1 Alinear barra de farmacia y "negocios recomendados" con el resto | pendiente | Tamaños desalineados. |
| P2-7 | #3 Productos relacionados: hover cortado + sin scroll horizontal en compu | pendiente | CSS + scroll horizontal. |
| P2-8 | #13 Sacar botón "Aplicar filtros" en búsqueda | pendiente | Se aplican automáticamente. |
| P2-9 | #25 Carrito/comprar: bloquear si no hay stock (o vendedor desactiva cuando sin stock) | pendiente | F5-02 ya tiene toggle; falta gate en la card. |
| P2-10 | #23 Registro vendedor: permitir elegir más de un rubro | pendiente | Hoy `category_slug` único. |
| P2-11 | #10 Arreglar en general cómo se ve tienda | pendiente | Pasada estética global de `comercio.html`. |

## P3 — Estético / capricho

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P3-1 | #4 "Envío gratis" borroso y hecho con IA — versión plana simple | pendiente | Capricho estético. |
| P3-2 | #2 Sacar cupones del inicio | pendiente | Agregado en F12-07; ahora se saca. |
| P3-3 | #10 complemento Arreglar en general cómo se ve tienda | pendiente | Solapa con P2-11. |

## P4 — Features nuevas grandes (futuras)

| # | Punto original | Estado | Notas |
|---|---|---|---|
| P4-1 | #26 Cargar producto por escaneo de código de barras | pendiente | Requiere proveedor de datos externo. |

---

## Preguntas abiertas (ver también el chat de la sesión)

- **P0-6 (#18)**: Modelo de split de plata entre vendedores con MP/transferencia.
- **P0-4 (#29)**: ¿"Distancia" aplica a todas nuestras ventas? (incluso las de retiro en local).
- **P0-2 (#14b)**: ¿Multi-address book o solo arreglar prefill de la dirección única?
- **P0-5 (#14x-soporte)**: ¿Hilo de respuesta bidireccional, respuesta única del admin, o thread tipo chat?
- **P1-9 (#14a)**: ¿Agregamos `favorite_stores` table para favoritos de comercios?

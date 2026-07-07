# 🗺️ Roadmap Completo — Baradero Local

> Plan de ingeniería de punta a punta: desde el estado actual hasta un **marketplace de delivery real, desplegado y en producción**.
> Documento vivo. Fuente de verdad del plan para todas las sesiones.
> Creado: **2026-07-07** · Última actualización: **2026-07-07** (tras definir el alcance con el equipo).

---

## 0. Cómo usar este roadmap

- Tareas agrupadas en **fases** (F0–F11) ordenadas por dependencia. Dentro de cada fase, respetá el orden salvo que diga "en paralelo".
- Cada tarea tiene **ID** (`F1-03`), **prioridad** (🔴 crítica / 🟠 alta / 🟡 media / 🟢 baja) y **criterio de aceptación**.
- Marcá progreso con `[x]`. Cada commit se registra solo en Jira (proyecto `A113`).
- El **alcance** está fijado en la sección [Decisiones del proyecto](#3-decisiones-del-proyecto-tomadas). El [cronograma](#13-cronograma-y-milestones) mapea las fases a los ~3,5 meses disponibles.

---

## 1. Visión del producto

**Baradero Local** es un **marketplace de comercio de proximidad con delivery** para la ciudad de Baradero: los vecinos compran a comercios locales y reciben el pedido (envío a domicilio por un **repartidor**) o lo retiran en el local. Objetivo: **lanzamiento real en producción**.

**4 roles:** `cliente` · `vendedor` · `repartidor` · `admin`.

---

## 2. Estado actual (diagnóstico honesto)

El proyecto **parece más terminado de lo que está**: la UI y la navegación están muy avanzadas, pero **el flujo de compra y varias integraciones están rotas o incompletas**.

### ✅ Ya funciona
- **Auth** completo: email/contraseña, Google OAuth, recuperar contraseña, términos, `guardPage()`.
- **Roles y RLS base** (rol vía JWT `app_metadata`, trigger anti-escalada).
- **Catálogo dinámico** (todo desde Supabase): home, búsqueda con filtros/orden, detalle de producto, página de comercio.
- **Vendedor**: registro de solicitud + dashboard que lista productos.
- **Admin**: aprobar/rechazar comercios (RPC `approve_seller_request`).
- **Cupones**: validación visual en el carrito.

### ⚠️ A medias / con bugs
- **Alta de producto** (`vender.js`): no setea `seller_id` (`NOT NULL` + RLS) → **falla**. Semántica de `price_cents` confusa.
- **Carrito**: mezcla UUIDs reales con IDs falsos (+ un producto de prueba pre-cargado). Precios leídos del DOM.
- **XSS**: `producto.js`, `comercio.js`, `admin.js` usan `innerHTML` con datos de la DB.

### ❌ Falta por completo
- **Checkout real** (crear `orders`/`order_items`, descontar stock), **pagos**, **envíos/delivery**, **rol repartidor**, **reseñas**, **chat**, **notificaciones**, **favoritos persistentes**, **variantes/stock/múltiples fotos de producto**, **subida de imágenes a Storage**, **PWA**, **deploy**.

### 🐛 Bugs de base de datos
- `validate_cart_prices()` usa `products.price`/`products.name` (no existen → falla; son `price_cents`/`title`).
- `handle_new_user()` castea `'repartidor'` al enum, que no lo tiene → **se resuelve agregando `'repartidor'` al enum** (ver Decisión D6).

---

## 3. Decisiones del proyecto (TOMADAS)

| # | Tema | Decisión |
|---|------|----------|
| **D1** | Objetivo | **Lanzamiento real** en producción (Baradero). |
| **D2** | Pagos | **Simulado ahora** (testing) con **arquitectura de métodos enchufables**. Futuro: **pagos reales** + **transferencia con comprobante**. |
| **D3** | Confirmación de transferencia | **El vendedor confirma** que recibió la transferencia (admin puede auditar). |
| **D4** | Entrega | **Ambos**: retiro en local **y** envío a domicilio. |
| **D5** | Logística de envío | **Rol `repartidor` dentro de la app** (marketplace de delivery). |
| **D6** | Verificación de vendedor | **Aprobación manual del admin + validación de CUIT** (formato y dígito verificador). |
| **D7** | Diseño | **Mantener la paleta azul actual**, pero darle vida/personalidad ("dopamina"). |
| **D8** | Funcionalidades | **Todas**: reseñas/calificaciones, chat comprador-vendedor, notificaciones, favoritos persistentes. |
| **D9** | Modelo de negocio | **Sin comisión por ahora** (dejar arquitectura lista para sumarla). |
| **D10** | Notificaciones | **WhatsApp + Email** ahora; **in-app** cuando exista la app de celular. |
| **D11** | Equipo | Es un **equipo**; en Jira **todo se asigna a Facundo** (registro centralizado). |
| **D12** | Datos | **Mezcla**: seed para desarrollo, comercios reales al lanzar. |
| **D13** | Plataforma | **Web + PWA instalable** (paso previo a la futura **app nativa**). |
| **D14** | Producto | **Stock, variantes (talle/color/peso), ofertas (precio tachado), varias fotos** por producto. |
| **D15** | Plazo | **~3,5 meses**, sin presión (objetivo: fines de octubre / principios de noviembre 2026). |

---

## 4. Principios de trabajo (definición de calidad)

1. **Seguridad primero**: nada de `innerHTML` con datos de usuario; RLS validada; secretos fuera del repo.
2. **La base de datos es la fuente de verdad**: precios, stock y totales se validan **en el servidor**.
3. **Una semántica de precio única**: `price_cents` = **centavos** en toda la app; helper `formatPrice()` central.
4. **El carrito referencia UUIDs reales** de producto/variante.
5. **Arquitectura enchufable** para pagos y notificaciones (hoy simulado/email, mañana MercadoPago/WhatsApp sin reescribir).
6. **Accesible, responsive y PWA** por defecto (mobile-first).
7. **Commits atómicos** (se registran en Jira).

---

## 5. Modelo de datos objetivo

Sobre el esquema actual (`profiles`, `products`, `categories`, `stores`, `orders`, `order_items`, `seller_requests`, `coupons`, `user_carts`), hay que **agregar/ajustar**:

| Tabla / cambio | Para |
|----------------|------|
| `app_role` **+ `'repartidor'`** | Rol de repartidor (D5). |
| `product_variants` (product_id, nombre, price_cents, stock, sku) | Variantes talle/color/peso (D14). |
| `product_images` (product_id, url, orden) | Varias fotos por producto (D14). |
| `products` **+ `compare_at_price_cents`** | Precio tachado / ofertas (D14). |
| `stores` **+ `description`, horarios, zona** | Perfil de comercio completo. |
| `orders` **+ `delivery_method`, `payment_method`, `payment_status`, `delivery_fee_cents`** | Retiro/envío + método de pago (D2, D4). |
| `payment_proofs` (order_id, url_comprobante, confirmado_por, estado) | Transferencia con comprobante (D2, D3). |
| `deliveries` (order_id, repartidor_id, estado, asignado_at, entregado_at) | Flujo de reparto (D5). |
| `reviews` (target, client_id, rating, comentario) | Reseñas y calificaciones (D8). |
| `conversations` + `messages` | Chat comprador-vendedor (D8). |
| `notifications` (user_id, tipo, payload, leída, canal) | Centro de notificaciones + email/WhatsApp (D8, D10). |
| `favorites` (user_id, product_id) | Favoritos persistentes (D8). |

> Cada tabla nueva necesita **RLS** desde el día uno.

---

## 6. FASE 0 — Estabilización y "que funcione de verdad" 🔴

> Bloquea casi todo. Objetivo: núcleo de datos + alta de productos funcionando end-to-end.

- [ ] **F0-01** 🔴 Conectarse a la Supabase real (MCP) y **auditar qué SQL está aplicado** vs `db/schema/*.sql`. Documentar estado real.
- [ ] **F0-02** 🔴 **Agregar `'repartidor'` al enum `app_role`** y arreglar `handle_new_user()` para mapearlo bien.
- [ ] **F0-03** 🔴 Arreglar `validate_cart_prices()`: usar `price_cents`/`title`, comparar en centavos, validar stock.
- [ ] **F0-04** 🔴 Arreglar **alta de producto**: setear `seller_id = auth.uid()`, precio en centavos, `category_id` correcto.
- [ ] **F0-05** 🔴 Unificar semántica de `price_cents` (input/storage/display) + helper `formatPrice()`.
- [ ] **F0-06** 🔴 Arreglar **integridad del carrito**: siempre UUID real; eliminar el producto de prueba y tarjetas sin UUID.
- [ ] **F0-07** 🟠 Consolidar migraciones SQL en flujo idempotente y documentar el orden en `docs/RUN_LOCAL.md`.
- [ ] **F0-08** 🟠 Diseñar el **modelo de datos objetivo** (sección 5) como migraciones nuevas con RLS.

---

## 7. FASE 1 — Seguridad 🔴 (en paralelo con F0)

- [ ] **F1-01** 🔴 Eliminar **XSS**: reemplazar `innerHTML` con datos de DB por DOM API/sanitización (`producto.js`, `comercio.js`, `admin.js`).
- [ ] **F1-02** 🔴 Auditar **RLS** con `get_advisors` (MCP). 0 advisories críticos.
- [ ] **F1-03** 🟠 Test manual: un `cliente` no puede cambiar su `role` desde la consola.
- [ ] **F1-04** 🟠 **Validación de inputs** (CUIT con dígito verificador, email, precios, longitudes) cliente + servidor.
- [ ] **F1-05** 🟡 Headers de seguridad también en producción (no solo dev de Vite).

---

## 8. FASE 2 — Compra: checkout, órdenes y pagos 🔴

> Depende de F0. Pagos con **arquitectura enchufable** (D2).

- [ ] **F2-01** 🔴 **RPC `create_order`** (`SECURITY DEFINER`, transaccional): revalida precios/stock, crea `orders` + `order_items`, descuenta stock, aplica cupón, guarda `delivery_method`/`payment_method`.
- [ ] **F2-02** 🔴 Conectar el checkout real (reemplazar el stub del carrito).
- [ ] **F2-03** 🔴 **Método de pago: Simulado** (marca la orden pagada) detrás de una interfaz `PaymentProvider` para enchufar otros después.
- [ ] **F2-04** 🟠 **Método de pago: Transferencia + comprobante**: el cliente sube el comprobante (`payment_proofs`), el **vendedor confirma** (D3), la orden pasa a `paid`.
- [ ] **F2-05** 🟠 Elegir retiro/envío en el checkout + calcular `delivery_fee_cents` (política unificada de envíos).
- [ ] **F2-06** 🟠 **Historial de pedidos** del cliente (en `perfil.html`).
- [ ] **F2-07** 🟢 (Futuro) Provider **MercadoPago** (sandbox → real) implementando la misma interfaz.

---

## 9. FASE 3 — Delivery y rol repartidor 🟠

> El diferencial del proyecto (D5). Depende de F2.

- [ ] **F3-01** 🟠 Onboarding del **repartidor** (registro/alta del rol, datos de contacto/vehículo).
- [ ] **F3-02** 🟠 **Panel del repartidor**: ver pedidos disponibles para entregar y tomarlos.
- [ ] **F3-03** 🟠 Flujo de estados de `deliveries`: `pendiente → asignado → en_camino → entregado`; sincronizado con el estado de la orden.
- [ ] **F3-04** 🟡 Vista del cliente y del vendedor del **estado del envío** en tiempo real.
- [ ] **F3-05** 🟢 (Futuro) Ubicación/seguimiento del repartidor, zonas y tarifas por distancia.

---

## 10. FASE 4 — Carrito robusto y favoritos 🟠

- [ ] **F4-01** 🟠 Sincronizar carrito en la nube (`user_carts`) + merge local↔nube al loguear.
- [ ] **F4-02** 🟠 Manejo de producto/variante inactivo, eliminado o sin stock dentro del carrito.
- [ ] **F4-03** 🟠 **Favoritos persistentes** en DB (`favorites`); unificar las 2 implementaciones actuales de wishlist (D8).

---

## 11. FASE 5 — Experiencia del vendedor 🟠

- [ ] **F5-01** 🟠 **Validación de CUIT** (formato + dígito verificador) en el registro (D6).
- [ ] **F5-02** 🟠 **CRUD completo de productos**: crear/editar/activar-desactivar.
- [ ] **F5-03** 🟠 **Variantes** de producto (talle/color/peso) con stock por variante (D14).
- [ ] **F5-04** 🟠 **Varias fotos** por producto + **subida a Supabase Storage** (buckets ya existen) en vez de URL (D14).
- [ ] **F5-05** 🟠 **Ofertas**: `compare_at_price_cents` (precio tachado) (D14).
- [ ] **F5-06** 🟠 **Gestión de pedidos** del vendedor: ver pedidos, confirmar pago por transferencia, cambiar estado, coordinar envío/retiro.
- [ ] **F5-07** 🟡 **Estadísticas reales** del dashboard (ventas del día, ingresos, productos activos) desde `orders`.
- [ ] **F5-08** 🟡 Edición del **perfil de la tienda** (logo, descripción, dirección, horarios, zona).
- [ ] **F5-09** 🟡 **UI diferenciada** del vendedor (dentro de la paleta azul, con acentos propios).

---

## 12. FASE 6 — Panel de administración 🟡

- [ ] **F6-01** 🟠 Aprobar/rechazar comercios + validar CUIT + notificar resultado.
- [ ] **F6-02** 🟡 CRUD de **categorías**.
- [ ] **F6-03** 🟡 CRUD de **cupones** desde la UI.
- [ ] **F6-04** 🟡 **Moderación**: suspender productos/comercios; auditar comprobantes de pago; gestionar repartidores.
- [ ] **F6-05** 🟢 Métricas globales (usuarios, comercios, ventas, entregas).

---

## 13. FASE 7 — Social: reseñas y chat 🟡

- [ ] **F7-01** 🟠 **Reseñas y calificaciones** (`reviews`) de productos y/o comercios (estrellas + comentario); promedio en el catálogo (D8).
- [ ] **F7-02** 🟠 **Chat comprador–vendedor** (`conversations`/`messages`) con contexto de producto (D8).
- [ ] **F7-03** 🟡 Moderación básica de reseñas/mensajes (reportar, ocultar).

---

## 14. FASE 8 — Notificaciones 🟠

> Arquitectura enchufable de canales (D10).

- [ ] **F8-01** 🟠 Centro de notificaciones (`notifications`) + eventos clave (pedido creado/pagado/enviado/entregado, nueva reseña, nuevo mensaje).
- [ ] **F8-02** 🟠 Canal **Email** (Supabase + Resend o similar) vía Edge Function.
- [ ] **F8-03** 🟠 Canal **WhatsApp** (API de WhatsApp Cloud o proveedor) para estados de pedido.
- [ ] **F8-04** 🟢 (Futuro) Notificaciones **in-app/push** cuando exista la app de celular.

---

## 15. FASE 9 — UX/UI, identidad y PWA 🟠

- [ ] **F9-01** 🟠 **Sistema de diseño** sobre la **paleta azul actual**: más contraste, calidez y personalidad ("dopamina") sin cambiar la identidad (D7).
- [ ] **F9-02** 🟠 **PWA instalable**: manifest, service worker, íconos, offline básico, "Agregar a pantalla de inicio" (D13).
- [ ] **F9-03** 🟠 **Home** con destacados/ofertas reales desde la DB.
- [ ] **F9-04** 🟠 **Accesibilidad** (a11y): `<form>`/`<label>`, ARIA, foco, contraste AA.
- [ ] **F9-05** 🟠 **Responsive** mobile-first en todas las páginas.
- [ ] **F9-06** 🟡 Micro-interacciones, estados vacíos, skeletons, manejo de error consistente.
- [ ] **F9-07** 🟡 Optimizar el **modal de producto** (galería, variantes, reseñas).

---

## 16. FASE 10 — Calidad, testing y performance 🟡

- [ ] **F10-01** 🟠 **Checklist de testing manual** por rol (cliente/vendedor/repartidor/admin) y flujo.
- [ ] **F10-02** 🟡 (Opcional) **E2E** de flujos críticos con Playwright / "Claude in Chrome".
- [ ] **F10-03** 🟠 **Performance**: optimizar imágenes (los PNG de IA son pesados), lazy-load, code splitting, cache. Lighthouse ≥ 85 mobile.
- [ ] **F10-04** 🟡 Manejo de errores y estados de red consistentes.
- [ ] **F10-05** 🟢 **SEO** básico + Open Graph + favicon.

---

## 17. FASE 11 — Deploy y lanzamiento 🟠

- [ ] **F11-01** 🟠 Elegir hosting (Vercel/Netlify) + build de Vite multi-página.
- [ ] **F11-02** 🔴 Variables de entorno en prod + **callbacks de Google OAuth** para el dominio real.
- [ ] **F11-03** 🟠 Configurar Edge Functions (email/WhatsApp/pagos) en prod.
- [ ] **F11-04** 🟡 Dominio propio.
- [ ] **F11-05** 🟠 **Checklist go-live**: RLS activa, secretos seguros, buckets con políticas, backups.
- [ ] **F11-06** 🟠 Cargar **comercios reales** (D12) y datos de producción.
- [ ] **F11-07** 🟠 **Documentación final**: README, guía de usuario por rol, guía de deploy, doc técnica.
- [ ] **F11-08** 🟡 **Limpieza**: quitar mocks/seeds, `console.log`, código muerto; decidir versionado de `dist/`.

---

## 18. Cronograma y milestones

Runway: **~2026-07-07 → fines de octubre / principios de noviembre 2026** (~16 semanas). Sin presión, con buffer.

| Milestone | Fecha objetivo | Contenido | Resultado |
|-----------|----------------|-----------|-----------|
| **M1 — Cimientos** | fin de julio | F0 + F1 | Todo funciona y es seguro (bugs resueltos, sin XSS). |
| **M2 — Compra + Vendedor** | fin de agosto | F2 + F5 | Se puede **comprar** (pago simulado/transferencia) y el vendedor gestiona productos (variantes/stock/fotos) y pedidos. |
| **M3 — Delivery + Carrito** | mediados de septiembre | F3 + F4 | Rol **repartidor** operativo; carrito en la nube + favoritos. |
| **M4 — Admin + Social + Avisos** | fin de septiembre | F6 + F7 + F8 | Admin completo, reseñas, chat y notificaciones (email/WhatsApp). |
| **M5 — Diseño + PWA + Calidad** | mediados de octubre | F9 + F10 | Identidad visual, PWA instalable, accesible, performante y testeado. |
| **M6 — Lanzamiento** | fin de octubre | F11 | **Desplegado en producción**, con comercios reales y documentación. |

---

## 19. Definición de "terminado" (Definition of Done)

1. Un **cliente** se registra, explora, compra (pago simulado o transferencia con comprobante), elige retiro o envío, ve su historial, reseña y chatea.
2. Un **vendedor** se registra (CUIT validado), es aprobado, publica productos con variantes/fotos/ofertas/stock, gestiona pedidos y confirma pagos.
3. Un **repartidor** toma pedidos y gestiona entregas.
4. Un **admin** aprueba comercios, gestiona categorías/cupones, modera y ve métricas.
5. **Notificaciones** por email y WhatsApp en los eventos clave.
6. **Seguridad**: sin XSS, RLS validada, sin secretos en el repo, sin escalada de privilegios.
7. **Calidad**: accesible, responsive, **PWA instalable**, performante, testeado.
8. **Desplegado** en producción con OAuth funcionando, comercios reales y documentación completa.

---

## 20. Alcance futuro (post-lanzamiento)

- 📱 **App nativa** de celular (la web ya es PWA como puente).
- 💰 **Pagos reales** (MercadoPago) con el provider ya preparado.
- 🧾 **Comisión / suscripción** de comercios (arquitectura ya prevista).
- 📍 Seguimiento en vivo del repartidor, zonas y tarifas por distancia.

---

## 21. Referencias

- Contexto general: [`docs/CONTEXTO-PROYECTO.md`](CONTEXTO-PROYECTO.md)
- Auditorías: [`oportunidades.md`](../oportunidades.md) · [`docs/analysis_results.md`](analysis_results.md)
- Pendientes originales: [`Problematiccas proyecto.txt`](../Problematiccas%20proyecto.txt)
- Registro de trabajo: Jira **A113** (`baraderolocal.atlassian.net`)

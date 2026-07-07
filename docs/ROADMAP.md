# 🗺️ Roadmap Completo — Baradero Local

> Plan de ingeniería de punta a punta: desde el estado actual hasta un proyecto **terminado y desplegado**.
> Documento vivo. Fuente de verdad del plan para todas las sesiones.
> Creado: **2026-07-07** · Autor técnico: asistente de ingeniería.

---

## 0. Cómo usar este roadmap

- Las tareas están agrupadas en **fases** ordenadas por dependencia. Dentro de cada fase, respetá el orden salvo que se indique "en paralelo".
- Cada tarea tiene un **ID** (ej. `F1-03`), **prioridad** (🔴 crítica / 🟠 alta / 🟡 media / 🟢 baja) y **criterio de aceptación**.
- Marcá el progreso con `[x]`. Cada cambio significativo → commit (se registra solo en Jira, proyecto `A113`).
- **Decisiones bloqueantes** (pagos, envíos, verificación) están en la sección [Decisiones pendientes](#8-decisiones-pendientes-bloqueantes). Resolvelas antes de las fases que dependen de ellas.

---

## 1. Estado actual (diagnóstico honesto)

El proyecto **parece más terminado de lo que está**: la UI y la navegación están muy avanzadas, pero **el flujo de compra y varias integraciones de datos están rotos o incompletos**.

### ✅ Lo que YA funciona
- **Autenticación** completa: email/contraseña, Google OAuth, recuperar contraseña, aceptación de términos, manejo de errores en español, `guardPage()` para proteger rutas.
- **Roles y RLS base**: enum `cliente/vendedor/admin`, políticas RLS leyendo el rol del JWT (`app_metadata`), trigger anti-escalada de rol.
- **Catálogo dinámico** (todo desde Supabase): home (productos + categorías), búsqueda con filtros/orden (`search.html`), detalle de producto (`producto.html`), página de comercio (`comercio.html`).
- **Vendedor**: registro de solicitud (`seller_requests`), dashboard que lista productos de la tienda.
- **Admin**: aprobar/rechazar comercios vía RPC `approve_seller_request` (crea la tienda, cambia rol, actualiza `app_metadata`).
- **Cupones**: validación visual en el carrito contra la tabla `coupons`.
- **Perfil** como SPA.

### ⚠️ Lo que está a medias o con bugs
- **Alta de producto** (`vender.js`): no setea `seller_id` (columna `NOT NULL` + RLS) → **el insert falla**. Además la semántica de `price_cents` está confusa (el vendedor escribe pesos, se guarda como "centavos", se muestra dividido /100 en unos lados y sin dividir en otros).
- **Carrito**: mezcla IDs reales (UUID de producto) con IDs falsos (tarjetas viejas / producto de prueba pre-cargado). Los precios se leen del DOM.
- **XSS**: `producto.js`, `comercio.js` y `admin.js` renderizan datos de la DB con `innerHTML` (un vendedor podría inyectar `<script>` en el título/descr. de un producto).

### ❌ Lo que falta por completo
- **Checkout real**: no se crean `orders`/`order_items`, no se descuenta stock. El botón "Proceder al pago" solo muestra un toast.
- **Pagos**: sin integración (ni sandbox).
- **Envíos**: indefinidos e **inconsistentes** (en `carrito.js` $350 y gratis > $5.000; en `search.js` $1.500 y gratis > $20.000).
- **Historial de pedidos** (cliente) y **gestión de pedidos** (vendedor).
- **Subida de imágenes** a Supabase Storage (hoy se pega una URL a mano; los buckets ya existen).
- **Sincronización del carrito en la nube** (`user_carts` definido pero no usado).

### 🐛 Bugs de base de datos detectados
- `validate_cart_prices()` (09) usa `products.price` y `products.name`, pero la tabla tiene `price_cents` y `title` → la RPC **falla**.
- `handle_new_user()` (10) castea `'repartidor'` al enum `app_role`, que solo tiene `cliente/vendedor/admin` → **excepción**.

---

## 2. Principios de trabajo (definición de calidad)

1. **Seguridad primero**: nada de `innerHTML` con datos de usuario; RLS validada; secretos fuera del repo.
2. **La base de datos es la fuente de verdad**: los precios, stock y totales se validan **en el servidor**, nunca se confía en el cliente.
3. **Una semántica de precio única**: `price_cents` = **centavos** en TODA la app. Se muestra con un helper `formatPrice()` central.
4. **El carrito siempre referencia UUIDs reales** de producto.
5. **Commits atómicos** y descriptivos (se registran en Jira automáticamente).
6. **Accesible y responsive** por defecto (mobile-first, `<form>` + `<label>`, ARIA).

---

## 3. FASE 0 — Estabilización y "que funcione de verdad" 🔴

> Objetivo: dejar el núcleo de datos y el alta de productos funcionando end-to-end. **Bloquea casi todo lo demás.**

- [ ] **F0-01** 🔴 Conectarse a la Supabase real (MCP) y **auditar qué scripts SQL están aplicados** vs. los `db/schema/*.sql`. Documentar el estado real. *Aceptación: lista de tablas/funciones/policies existentes confirmada.*
- [ ] **F0-02** 🔴 Arreglar `validate_cart_prices()`: usar `price_cents` y `title`; comparar precios **en centavos**; validar stock. *Aceptación: la RPC devuelve `valid/total/items` correctos con datos reales.*
- [ ] **F0-03** 🔴 Arreglar `handle_new_user()` (enum `'repartidor'`): o quitar la rama, o agregar `'repartidor'` al enum si se va a usar. *Aceptación: registro de usuario nunca lanza excepción por el rol.*
- [ ] **F0-04** 🔴 Arreglar **alta de producto** (`vender.js`): setear `seller_id = auth.uid()`; convertir el precio a centavos (`pesos * 100`); mapear `category_id` correctamente. *Aceptación: un vendedor crea un producto y aparece en su tienda y en el catálogo.*
- [ ] **F0-05** 🔴 Unificar la **semántica de `price_cents`** en input, storage y display. Crear helper `formatPrice()` compartido. *Aceptación: un producto de $2.850 se ve "$2.850" en catálogo, detalle, carrito y dashboard.*
- [ ] **F0-06** 🔴 Arreglar **integridad del carrito**: guardar siempre `{ id: <uuid>, price_cents, qty }`; eliminar el producto de prueba (`PRODUCTO_PRUEBA` / `seedCartIfEmpty`) y cualquier tarjeta sin UUID. *Aceptación: todo item del carrito tiene un UUID válido de `products`.*
- [ ] **F0-07** 🟠 Consolidar/ordenar las migraciones SQL en un flujo idempotente y documentar el orden de ejecución en `docs/RUN_LOCAL.md`. *Aceptación: correr los scripts en orden en una DB limpia deja el esquema completo sin errores.*

---

## 4. FASE 1 — Seguridad 🔴 (en paralelo con Fase 0)

> Objetivo: cerrar las vulnerabilidades antes de sumar funcionalidad.

- [ ] **F1-01** 🔴 Eliminar **XSS**: reemplazar `innerHTML` con datos de DB por DOM API o sanitización en `producto.js`, `comercio.js`, `admin.js`. (Ver `oportunidades.md` SEC-01.) *Aceptación: inyectar `<img src=x onerror=...>` en un título de producto no ejecuta código.*
- [ ] **F1-02** 🔴 Auditar **RLS** con `get_advisors` (MCP Supabase): confirmar políticas, `security definer` con `search_path`, y que `authenticated` solo acceda a lo suyo. *Aceptación: 0 advisories críticos.*
- [ ] **F1-03** 🟠 Verificar (con un test manual) que un `cliente` **no puede** cambiar su `role` desde la consola del navegador. *Aceptación: el trigger `prevent_role_update_on_profile` bloquea el intento.*
- [ ] **F1-04** 🟠 **Validación de inputs** server-side y client-side: CUIT (formato), email, precios (> 0), longitudes de texto. *Aceptación: datos inválidos son rechazados con mensaje claro.*
- [ ] **F1-05** 🟡 Confirmar que no hay secretos en el repo y que los **headers de seguridad** (hoy solo en el dev server de Vite) se apliquen también en producción (config del hosting). *Aceptación: headers presentes en la respuesta de producción.*

---

## 5. FASE 2 — Flujo de compra completo (checkout + órdenes) 🔴

> Objetivo: que un cliente pueda **comprar de verdad**. Depende de Fase 0 y de la [decisión de pagos](#8-decisiones-pendientes-bloqueantes).

- [ ] **F2-01** 🔴 **RPC de checkout** (`create_order`, `SECURITY DEFINER`, transaccional): revalida precios/stock, crea `orders` + `order_items`, descuenta `stock`, aplica cupón. *Aceptación: la orden queda en la DB con el total correcto y el stock actualizado, todo atómico.*
- [ ] **F2-02** 🔴 Conectar el botón de checkout del carrito a `create_order` (reemplazar el stub actual). *Aceptación: "Proceder al pago" crea una orden real.*
- [ ] **F2-03** 🔴 Integrar **pasarela de pago** (según decisión: MercadoPago Checkout Pro sandbox, o "pago simulado" para el MVP académico). *Aceptación: se completa un pago de prueba y la orden pasa a `paid`.*
- [ ] **F2-04** 🟠 **Historial de pedidos** del cliente (en `perfil.html`): lista de órdenes con estado y detalle. *Aceptación: el cliente ve sus compras.*
- [ ] **F2-05** 🟠 **Gestión de pedidos** del vendedor: ver pedidos de su tienda y cambiar estado (`paid → shipped/ready_for_pickup → completed`). *Aceptación: el vendedor gestiona el ciclo del pedido.*
- [ ] **F2-06** 🟠 Unificar **política de envíos** (hoy inconsistente). Implementar retiro en local y/o envío con un costo/umbral únicos, definidos en un solo lugar. *Aceptación: el costo de envío es idéntico en catálogo, carrito y orden.*
- [ ] **F2-07** 🟡 Aplicar cupones en la **orden real** (server-side), no solo visualmente. *Aceptación: el descuento queda registrado en la orden.*

---

## 6. FASE 3 — Carrito robusto y sincronización 🟠

- [ ] **F3-01** 🟠 Sincronizar carrito en la nube (`user_carts`) para usuarios logueados; hacer **merge** local ↔ nube al iniciar sesión. *Aceptación: el carrito persiste entre dispositivos.*
- [ ] **F3-02** 🟠 Manejo de **producto inactivo/eliminado/sin stock** dentro del carrito (avisar y ajustar). *Aceptación: el carrito nunca deja comprar algo sin stock.*
- [ ] **F3-03** 🟢 Favoritos persistentes en DB (tabla `wishlist`) en vez de solo `localStorage`; unificar las 2 implementaciones actuales de wishlist. *Aceptación: los favoritos se conservan al reloguear.*

---

## 7. FASE 4 — Experiencia del vendedor 🟠

- [ ] **F4-01** 🟠 **Verificación de comercio** (CUIT): validar formato y dígito verificador; definir nivel de verificación (ver decisión). Flujo de aprobación en admin. *Aceptación: no se aprueban comercios con CUIT inválido.*
- [ ] **F4-02** 🟠 **UI diferenciada de vendedor** (tema naranja, según el pizarrón). *Aceptación: el vendedor tiene una interfaz visualmente distinta del cliente.*
- [ ] **F4-03** 🟠 **CRUD completo de productos**: editar, activar/desactivar, gestionar stock (hoy solo alta rota + baja). *Aceptación: el vendedor administra todo el ciclo de vida del producto.*
- [ ] **F4-04** 🟠 **Subida de imágenes** a Supabase Storage (buckets `products`/`stores` ya existen) en vez de pegar URLs. *Aceptación: el vendedor sube una foto y se ve en el catálogo.*
- [ ] **F4-05** 🟡 **Estadísticas reales** del dashboard (ventas del día, ingresos, productos activos) calculadas desde `orders`. *Aceptación: los números reflejan datos reales, no placeholders.*
- [ ] **F4-06** 🟡 Edición del **perfil de la tienda** (logo, dirección, teléfono, descripción, horarios). Agregar columna `description` a `stores`. *Aceptación: el vendedor edita los datos de su comercio.*

---

## 8. FASE 5 — Panel de administración 🟡

- [ ] **F5-01** 🟠 Pulir aprobación/rechazo de comercios + notificar al vendedor (email/estado). *Aceptación: el vendedor se entera del resultado.*
- [ ] **F5-02** 🟡 CRUD de **categorías** desde la UI de admin.
- [ ] **F5-03** 🟡 CRUD de **cupones** desde la UI de admin (hoy solo por SQL).
- [ ] **F5-04** 🟡 **Moderación**: suspender productos/comercios (`status = 'suspended'`).
- [ ] **F5-05** 🟢 Métricas globales (usuarios, comercios, ventas totales).

---

## 9. FASE 6 — UX/UI y diseño ("dopamina") 🟠

> Feedback del dueño: *"le falta esencia, le falta dopamina, parece inmobiliaria o de viajes"*. Acá se le da identidad.

- [ ] **F6-01** 🟠 **Sistema de diseño**: identidad visual, paleta, tipografía y tokens propios de "comercio local/barrial" (cálido, cercano). *Aceptación: la app deja de verse genérica.*
- [ ] **F6-02** 🟠 **Home con destacados/ofertas reales** desde la DB (productos destacados, tiendas cercanas, ofertas). *Aceptación: la home muestra contenido real y atractivo.*
- [ ] **F6-03** 🟠 **Accesibilidad** (a11y): `<form>` semánticos, `<label class="sr-only">`, ARIA, foco visible, contraste AA. (Ver `docs/analysis_results.md`.) *Aceptación: navegable por teclado y lector de pantalla.*
- [ ] **F6-04** 🟠 **Responsive audit** mobile-first en todas las páginas. *Aceptación: sin roturas de layout en 360px–1440px.*
- [ ] **F6-05** 🟡 Micro-interacciones, **estados vacíos**, skeletons/loaders y manejo de error consistente. *Aceptación: nunca se ve una pantalla en blanco sin feedback.*
- [ ] **F6-06** 🟡 Verificar/cerrar el bug del **icono de perfil "u"** en carrito (commit `2720003` lo tocó; confirmar). *Aceptación: el navbar del carrito muestra el icono correcto.*
- [ ] **F6-07** 🟡 Optimizar el **modal de producto** y sus pestañas (del pizarrón). *Aceptación: info clara y completa en el modal.*

---

## 10. FASE 7 — Calidad, testing y performance 🟡

- [ ] **F7-01** 🟠 **Checklist de testing manual** por rol (cliente/vendedor/admin) y por flujo (registro → compra → gestión). *Aceptación: checklist documentado y ejecutado.*
- [ ] **F7-02** 🟡 (Opcional) **E2E** de los flujos críticos con Playwright / "Claude in Chrome". *Aceptación: los flujos clave pasan automatizados.*
- [ ] **F7-03** 🟠 **Performance**: optimizar imágenes (los PNG de IA son pesados), `loading="lazy"`, code splitting, cache. *Aceptación: Lighthouse Performance ≥ 85 en mobile.*
- [ ] **F7-04** 🟡 Manejo de errores y **estados de red** (offline, timeouts) consistente. *Aceptación: errores manejados con toasts, sin `console.error` silenciosos al usuario.*
- [ ] **F7-05** 🟢 **SEO básico**: `<title>`/meta por página, Open Graph, favicon, `robots.txt`. *Aceptación: previews correctos al compartir un link.*

---

## 11. FASE 8 — Deploy y entrega 🟠

- [ ] **F8-01** 🟠 Elegir hosting (Vercel/Netlify) y configurar el **build de Vite** (multi-página). *Aceptación: build de producción sin errores.*
- [ ] **F8-02** 🔴 Variables de entorno en producción + **callbacks de Google OAuth** para el dominio real (Supabase Auth + Google Cloud Console). *Aceptación: login con Google funciona en producción.*
- [ ] **F8-03** 🟡 Dominio propio (opcional). *Aceptación: la app responde en el dominio.*
- [ ] **F8-04** 🟠 **Checklist de go-live**: RLS activa, secretos seguros, buckets con políticas correctas, backups. *Aceptación: checklist firmado.*
- [ ] **F8-05** 🟠 **Documentación final**: `README` actualizado, guía de usuario, guía de deploy, doc técnica; para lo académico, el **informe/entrega**. *Aceptación: cualquiera puede levantar, usar y entender el proyecto.*
- [ ] **F8-06** 🟡 **Limpieza**: quitar mocks/seeds de prueba, `console.log`, código muerto; decidir si se sigue versionando `dist/`. *Aceptación: repo limpio y profesional.*

---

## 12. Decisiones pendientes (bloqueantes)

Estas decisiones definen el alcance. Conviene resolverlas antes de las fases que dependen de ellas.

| # | Decisión | Opciones | Bloquea |
|---|----------|----------|---------|
| **D1** | **Medio de pago** | (a) MercadoPago Checkout Pro **sandbox** (realista, Argentina) · (b) **Pago simulado** (más simple, suficiente para lo académico) | Fase 2 |
| **D2** | **Envíos** | (a) Solo **retiro en local** · (b) Envío con costo fijo dentro de Baradero · (c) Ambos | Fase 2 |
| **D3** | **Verificación de vendedores** | (a) Solo validar **formato de CUIT** · (b) Validar contra **padrón AFIP** (API) · (c) Aprobación **manual** por admin | Fase 4 |
| **D4** | **¿Pagos reales?** | Para un proyecto académico casi seguro alcanza **sandbox/simulado**. Confirmar. | Fase 2, Fase 8 |

---

## 13. Milestones sugeridos

- **🥉 Milestone 1 — "Compra funcional" (MVP real)**: Fases 0, 1 y 2. Un cliente puede registrarse, navegar, agregar al carrito y **comprar** (pago sandbox/simulado), y el vendedor puede **publicar productos**. *Este es el salto más importante.*
- **🥈 Milestone 2 — "Marketplace completo"**: Fases 3, 4 y 5. Sincronización, experiencia de vendedor completa (imágenes, CRUD, stats) y panel de admin.
- **🥇 Milestone 3 — "Producto pulido y en producción"**: Fases 6, 7 y 8. Diseño con identidad, accesibilidad, performance, testing y **deploy**.

---

## 14. Definición de "terminado" (Definition of Done del proyecto)

El proyecto se considera terminado cuando:
1. Un **cliente** puede registrarse, explorar el catálogo real, comprar con pago (sandbox/simulado) y ver su historial de pedidos.
2. Un **vendedor** puede registrarse, ser aprobado, publicar productos con imágenes y gestionar sus pedidos.
3. Un **admin** puede aprobar comercios, gestionar categorías/cupones y moderar.
4. **Seguridad**: sin XSS, RLS validada, sin secretos en el repo, sin escalada de privilegios.
5. **Calidad**: accesible, responsive, con buen performance y manejo de errores.
6. Está **desplegado** en producción con OAuth funcionando y documentación completa.

---

## 15. Referencias

- Contexto general: [`docs/CONTEXTO-PROYECTO.md`](CONTEXTO-PROYECTO.md)
- Auditoría de seguridad: [`oportunidades.md`](../oportunidades.md) · [`docs/analysis_results.md`](analysis_results.md)
- Pendientes originales: [`Problematiccas proyecto.txt`](../Problematiccas%20proyecto.txt)
- Registro de trabajo: Jira proyecto **A113** (`baraderolocal.atlassian.net`)

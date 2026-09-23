# CLAUDE.md — Baradero Local (Proyecto-Pdisc)

> Contexto del proyecto para Claude Code. Se auto-carga cada sesión y **viaja con el repo**
> (sirve para trabajar desde cualquier computadora). **Mantener actualizado al completar cada tarea.**
> Última actualización: 2026-09-23. Estado: M1-M11 completos; Fase 12 completa salvo F12-18
> (facturación/AFIP, fuera de alcance). Las 18 mejoras de A113-266 (rama `feature/mejorasGrupo`)
> ya mergeadas a `main`. Detalle línea por línea de cada fase/tarea (F0-F12, bugs
> corregidos, decisiones de diseño, gotchas de RLS/triggers): skill `progreso-baradero-local`
> (se carga solo cuando hace falta consultar el historial). Pendientes que sí necesitan quedar
> siempre visibles: ver sección "Pendientes activos" más abajo.

> ## ⚠️ PRIMERA ACCIÓN DE CADA SESIÓN
> **Antes de cualquier otra cosa, correr `git pull`.** El repo se trabaja desde
> varias máquinas/sesiones — el local puede estar varios commits atrás de
> `origin/main` sin que se note (pasó el 2026-08-05: 23 commits de diferencia,
> incluyendo todo el trabajo de identidad de marca). Si hay cambios locales sin
> commitear, evaluar antes de pull (stash si hace falta).

## ✅ Reglas esenciales antes de trabajar
1. **`git pull` en `main`** siempre primero (ver aviso arriba).
2. **Una rama nueva por tarea**, creada desde el `main` recién actualizado — nunca commitear directo en `main`:
   `git checkout -b A113-XXX-slug-corto` (clave de Jira de la subtarea + descripción corta, ej. `A113-201-checkout-envio`).
3. Al terminar: mergear esa rama a `main` (o PR si el cambio es grande/riesgoso) y borrarla. El commit que cierra la tarea debe incluir la clave `A113-XXX` (hook `post-commit`, ver "Flujo de trabajo y tracking"). **Ojo:** cada push a `main` dispara deploy automático a producción en Vercel — mergear solo cuando la tarea esté realmente terminada, no a mitad de camino.
4. Si `git pull` trae conflicto con cambios locales sin commitear: `git stash -u` antes de pull, nunca `git checkout .` ni `reset --hard` para "sacárselos de encima".

## Qué es
**Baradero Local**: e-commerce de comercio de proximidad para Baradero (Argentina).
Objetivo definido: **lanzamiento real**. Roles: `cliente`, `vendedor`, `admin`.
Contexto largo: [docs/CONTEXTO-PROYECTO.md](docs/CONTEXTO-PROYECTO.md) · Plan completo: [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack y convenciones
- **Vite 8** multipágina + **Supabase** (Postgres/Auth/Google OAuth/Storage/RLS) + **JS vanilla ES6**.
- `dist/` **se versiona** en git. El rol se lee del **JWT** (`app_metadata.role`). Precios: ver "Decisiones".
- **Supabase project_id:** `otzhdwuaffcplrveuadc`. Idioma del proyecto: **español**.
- **Hosting:** Vercel, proyecto `proyectopdisc` (team `baradero-local`), conectado a este repo (`fac7n3/ProyectoPdisc`, rama `main`). Cada push a `main` dispara deploy automático a producción.
- **`.env` YA NO se versiona en git** (revertido 2026-07-14, a pedido del usuario — hasta esa fecha era decisión intencional). Sigue teniendo solo `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, públicas por diseño de Supabase (protegidas por RLS, no por secreto) — pero se sacó del repo igual para reducir superficie expuesta. No rompe nada: Vercel ya tiene estas mismas variables cargadas aparte en su propio panel (Project Settings → Environment Variables, confirmado funcionando desde F11-02) y construye desde esas, no desde el `.env` commiteado; en local hace falta crear el archivo a mano (ver `docs/RUN_LOCAL.md`). El commit que lo agregó (`07bcadd`) sigue en el historial de git (no se reescribió el historial — el contenido nunca fue un secreto real, no ameritaba un rewrite destructivo con force-push). Nunca versionar acá una service role key ni tokens de Jira (esos sí quedan en `.jira.env`, gitignoreado).

## Decisiones de producto (definidas)
- **Pagos:** ✅ Mercado Pago real (Checkout Pro, F2-07) + transferencia con comprobante + simulado (solo para testing interno). Credenciales de **prueba** cargadas como secret `MP_ACCESS_TOKEN` en Supabase Edge Functions — para lanzar de verdad falta reemplazarlas por las de **producción** (mismo nombre de secret, no requiere tocar código).
- **Envíos:** ambos (retiro en local + envío dentro de Baradero).
- **Verificación de vendedor:** aprobación manual del admin **+** validar CUIT.
- **Precios:** **PESOS enteros** en todo el sistema (sin centavos). ✅ DB migrada a `price`/`total_price` (pesos) en F0-03 (migración 12); `price_cents` ya no existe.

## Identidad de marca
Sistema de identidad de marca vivo, construido 2026-08-03 con las marketing skills instaladas
(`product-marketing`, `marketing-council`, `brand`) — mergeado a `main` el 2026-08-05 (rama
`feature/marketing-skills` ya integrada, incluyendo el proyecto Remotion completo en `video/`). Se
apoya en el sistema visual ya en producción (`Assets/styles/styles.css`), no lo reemplaza. Detalle
completo del proceso y de las decisiones: skill `progreso-baradero-local`.
- **[`.agents/product-marketing.md`](.agents/product-marketing.md)** — contexto de producto/audiencia/voz (marketplace de dos lados: cliente vecino / vendedor comerciante).
- **[`docs/brand-guidelines.md`](docs/brand-guidelines.md)** — paleta, tipografía, logo, voz, imágenes, componentes, prompts de IA. Tokens legibles por máquina en `Assets/design-tokens.json`/`.css`.
- **[`video/BRAND.md`](video/BRAND.md)** — identidad en movimiento para el proyecto Remotion de `video/` (formatos, principios de animación con nombre, ritmo, checklist para historias nuevas). Usar esto antes de producir cualquier video/historia nueva.
- Decisión central: categoría = **"comercio de proximidad"**, nunca "tienda online"/"marketplace" de cara al cliente. Color ancla de marca: `#284175`. Voz: vecinal, cálida, directa, nunca "corporativa/inmobiliaria".
- **Mantenerlo vivo:** si una tarea cambia algo que estos documentos describen (paleta, tagline, una nueva feature de cara al usuario, una pieza de video nueva), actualizar el documento correspondiente en esa misma tarea — no dejarlos desactualizados. Es el mismo criterio que "Al completar cada tarea" más abajo.

## Flujo de trabajo y tracking (IMPORTANTE)
- **Jira A113** (baraderolocal.atlassian.net) es el tablero de progreso. **M1** = Fase 0 (padre `A113-134`) + Fase 1 (padre `A113-153`), subtareas `A113-135`…`A113-163` — **completo**. **M2 en adelante** (Fases 2-11) ya tiene tablero creado: `A113-172`…`A113-237`, con prefijo del roadmap (`F2-01a`…).
- Estados: `Tareas por hacer` → `En curso` → `Finalizada`.
  - **Empezar** una tarea: `node scripts/jira-move.mjs A113-XXX progress`
  - **Terminar**: incluir la clave `A113-XXX` en el **mensaje del commit** → el hook `post-commit` la pasa a Finalizada.
- Credenciales Jira en `.jira.env` (gitignoreado; falta poner el token en cada máquina nueva).
- **Regla:** commitear + pushear a GitHub cuando el cambio supere ~150 líneas.
- **Al completar cada tarea**: agregar el detalle al skill `progreso-baradero-local` (`.claude/skills/progreso-baradero-local/SKILL.md`) y, si abre o cierra algo que necesite quedar siempre visible, actualizar "Pendientes activos" acá abajo.
- Entre sesiones, para saber por dónde se quedó: consultar Jira A113 (subtareas no Finalizadas), la sección "Pendientes activos" acá abajo, o el skill `progreso-baradero-local` para el detalle completo.

## Entorno de herramientas (multi-máquina)
Para que cualquier máquina/sesión trabaje con las mismas herramientas, según cómo se sincroniza cada una:
- **Skills de proyecto** (`.claude/skills/`, incluye `progreso-baradero-local` + el paquete de marketing skills): viven en el repo, se sincronizan solas con `git pull`. Nada que instalar a mano.
- **Plugins de marketplace** (`ponytail`, `engram`): declarados en `.claude/settings.json` (`enabledPlugins` + `extraKnownMarketplaces`, trackeado en git). Claude Code los detecta solo al abrir el proyecto en una máquina nueva y ofrece instalarlos — no requiere paso manual aparte de aceptar el prompt.
- **`codebase-memory-mcp`** (el "cerebro" de grafo de código): es una herramienta **por máquina**, no exportable por git — el índice vive en `~/.cache/codebase-memory-mcp/` local a cada usuario. Para tenerlo en una máquina nueva:
  1. Instalar el binario `codebase-memory-mcp` (ver pendiente abajo — falta documentar de dónde se bajó originalmente).
  2. Correr `codebase-memory-mcp install` — auto-detecta Claude Code/Gemini CLI/Cursor y se registra en la config de usuario (`~/.claude.json`, `~/.claude/.mcp.json`), no toca el repo.
  3. Reiniciar la sesión de Claude Code y correr `index_repository` una vez sobre este proyecto.
- **Conectores de cuenta** (Jira/Atlassian, Gmail, Google Drive, Supabase, Vercel, Canva, MercadoPago, Claude-in-Chrome): son OAuth **por cuenta de Claude**, se configuran a mano en Settings → Connectors — no existe archivo para exportarlos. Lo exportable es a qué recurso compartido apuntar cada conector, para que todos trabajen contra lo mismo:
  - Jira: `baraderolocal.atlassian.net`, tablero `A113`.
  - Supabase: project_id `otzhdwuaffcplrveuadc`.
  - Vercel: team `baradero-local`, proyecto `proyectopdisc`.
  - Gmail/Drive: cuenta `proyectopdisc@gmail.com`.
- `.mcp.json` en la raíz del repo está en `.gitignore` a propósito: ninguna de las herramientas de arriba lo usa (codebase-memory-mcp se registra a nivel usuario, los conectores son de cuenta) — no hace falta crearlo.

## Pendientes activos
Historial completo de cómo se llegó a cada uno: skill `progreso-baradero-local`.
- **Resuelto 2026-09-23** — **Transferencia bancaria con datos copiables**, a
  pedido del usuario. Después de "Iniciar pago" con transferencia ya no hay
  toast + redirect: el carrito se reemplaza por el paso "Transferí"
  (`showTransferStep()` en `js/carrito.js`), una tarjeta por comercio con
  monto exacto, alias, CBU/CVU, titular, banco, "Pedido #XXXX" para el
  motivo, teléfono y WhatsApp ("Avisar que transferí"), cada dato con botón
  "Copiar". La tarjeta vive en `js/transfer-details.js` (lógica pura +
  tests en `js/transfer-details-utils.js`) y la reusa "Mis compras".
  Migración **106** (aplicada a producción): `stores.transfer_alias`/
  `transfer_cbu`/`transfer_holder`/`transfer_bank` con checks de formato;
  `transfer_info` queda como "Otros datos". El vendedor los carga en
  "Perfil de mi comercio → Transferencia bancaria" (4 campos nuevos). **Hoy
  solo Beruru tiene datos cargados** (alias copiado del texto libre por el
  backfill): conviene avisarle a los comercios reales que completen alias/CBU.
- **Resuelto 2026-09-23** — el texto de ayuda de los **estados vacíos del panel
  de profesional/técnico** salía descentrado (reportado con captura en
  "Servicios y precios"). `.of-sub` trae `max-width: 60ch` para no hacer
  renglones larguísimos, y con `margin: 0` esa caja quedaba pegada a la
  izquierda: el `text-align: center` del bloque centra el texto **dentro** de la
  caja, no la caja. Medido en el navegador: el título a 0px del centro y el
  párrafo de abajo a **-175px**. Arreglado con `.of-empty .of-sub
  { margin-inline: auto; }` (regla scopeada: `.of-sub` fuera de un estado vacío
  sigue alineada a la izquierda como corresponde a un subtítulo de sección), más
  la normalización de los márgenes de los `<p>`. Afectaba a los **cinco**
  estados vacíos del panel (servicios, fotos, consultas, reseñas, estadísticas)
  — los cinco verificados en 0px. El panel de vendedor no tenía el mismo
  problema: su `.pub-empty__sub` no lleva `max-width`.
- **Resuelto 2026-09-23** — el sidebar del panel de vendedor tenía **dos
  entradas que llevaban a la misma sección**: "Pedidos" y "Ventas", las dos con
  `data-section="pedidos"`, cambiando solo la pestaña (`all` vs `completed`).
  A pedido del usuario queda **solo "Pedidos"** — no se pierde nada, la pestaña
  "Completados" sigue adentro junto al resto. De paso se sacó una línea de
  `setPedidosTab()` que apagaba el resaltado del sidebar según la pestaña: hacía
  falta para desempatar entre las dos entradas, y con una sola **apagaba
  "Pedidos" apenas mirabas una pestaña que no fuera "Todos"** (el resaltado lo
  maneja el shell por `data-section`). Entrar desde el sidebar ahora siempre
  muestra la lista completa. La tarjeta "Ventas para calificar" del Resumen
  sigue llevando a la pestaña Completados, y los permisos por empleado no se
  tocan (van por la clave `pedidos`, no por botón). 6 checks de Playwright.
- **Resuelto 2026-09-23** — auditoría de **performance** con el advisor de
  Supabase (sin pedido puntual del usuario, mismo criterio que las
  auditorías de seguridad "por áreas"). Se agregaron los 20 índices que
  faltaban en columnas de foreign key (`unindexed_foreign_keys`), puramente
  aditivo -- sin un índice, cada policy de RLS que filtra por
  tienda/cliente/pedido hacía seq scan; no se nota con los catálogos chicos
  de hoy pero conviene tenerlo resuelto antes de que el volumen real lo
  vuelva visible. Migración **103**, aplicada a producción.
  **Ampliado a pedido del usuario en la misma sesión:** también se resolvió
  `auth_rls_initplan` (WARN, 115 hallazgos) -- las policies de RLS llamaban
  `auth.uid()`/`auth.jwt()` directo, así que Postgres las re-evaluaba fila
  por fila en vez de una sola vez por consulta. Migración **104**: un `DO`
  block que genera y ejecuta el `ALTER POLICY ... USING (...) WITH CHECK
  (...)` para cada policy de `public`, reemplazando cada llamada por
  `(select auth.uid())`/`(select auth.jwt())` (mecánico, sin cambio de
  semántica -- mismo valor durante toda la consulta). Verificado con
  `EXPLAIN`: el filtro pasó a resolverse como `InitPlan` en vez de por fila.
  **Resuelto también en la misma sesión, a pedido del usuario:**
  `multiple_permissive_policies` (49 WARN). Migración **105**: consolida,
  tabla por tabla, todas las policies PERMISSIVE que se superponían para el
  mismo rol+acción (ej. la del dueño + la del admin, o una policy `ALL` de
  admin superpuesta con las específicas de SELECT/INSERT/UPDATE/DELETE) en
  una sola por acción, uniendo sus condiciones con OR -- matemáticamente
  idéntico a lo que Postgres ya hacía evaluando varias, solo que ahora se
  evalúa una vez. Una policy `ALL` que se fusionaba con otra en algunas
  acciones se partió en sus 4 acciones (donde no había nada que fusionar,
  queda igual de sola pero como policy propia de esa acción). Encontrado y
  corregido **antes** de aplicar: la primera versión perdía el `WITH CHECK`
  implícito que Postgres le da a una policy `UPDATE` sin `WITH CHECK` propio
  (usa su propio `USING`) al no incluirlo en la fusión -- confirmado contra
  `pg_policy.polwithcheck`, no solo la documentación --, lo que habría
  bloqueado a un vendedor identificado por `auth.jwt()` (en vez de la tabla
  `profiles` o `store_staff`) actualizando su propio producto. Verificado
  con `get_advisors` (0 hallazgos, contra 49 antes) y con pruebas contra la
  base real en transacciones con ROLLBACK (anon no ve cupones privados,
  ningún cliente ajeno ve cupones de otro comercio). Detalle completo,
  incluida la lista de las 26 tablas tocadas y por qué es seguro para el rol
  `anon`, en el skill `progreso-baradero-local`.
- **Resuelto 2026-09-22** — **Opciones de producto** (color, sabor, talle…),
  a pedido del usuario: el comerciante las carga y el cliente elige antes de
  comprar. Migración **102** (aplicada a producción): `product_options` +
  `product_option_values` + `order_items.selected_options`, y `create_order`
  valida la elección **del lado del servidor**. Tres decisiones de producto,
  confirmadas antes de escribir nada: el **stock sigue siendo del producto**
  (el vendedor marca una opción como agotada a mano, no lleva la cuenta color
  por color) — por eso **no hay tabla de variantes ni de combinaciones**;
  un producto puede tener **varios grupos a la vez** (Color + Talle); y la
  opción **no cambia el precio** (si algún día cambia, el lugar es una columna
  en `product_option_values` + `create_order` + `js/cart-totals.js`).
  **Reemplaza al stub de F5-03**: existía un editor de "variantes"
  (nombre/precio/stock) que **no se integraba con el carrito** — el cliente
  solo veía una lista con un "consultá con el vendedor". `product_variants`
  estaba **vacía en producción** (0 filas, nadie la usó), así que no hubo nada
  que migrar; la tabla se deja sin uso (mismo criterio que las de
  `repartidor`) y ya no la lee ningún archivo.
  **El carrito manda ids de valores, nunca texto** — si viajara el texto el
  cliente podría inventar una opción que el comercio no vende; el nombre
  legible lo arma el RPC leyendo la base, igual que ya hacía con el precio.
  Lógica compartida en **`js/product-options-utils.js`** (24 asserts).
  **Dos bugs encontrados al construir esto, los dos verificados en el
  navegador:** (1) `mergeCarts` (sincronización del carrito con la nube)
  agrupaba por `item.id`, así que la misma remera en rojo y en azul se fusionaba
  en **una línea con la cantidad sumada y el color de la última** — el cliente
  terminaba comprando dos veces el mismo color sin pedirlo; ahora agrupa por
  clave de línea. (2) `validateCartFreshness` recortaba el stock **por línea**
  y no por producto: dos líneas de la misma remera pasaban cada una con el
  stock completo y `create_order` (que sí suma por producto) rechazaba el
  checkout entero. **Gotcha del panel del vendedor:** todavía **no existe la
  vista de detalle del pedido** ("llega pronto"), así que la fila de Pedidos es
  el único lugar donde ve qué le pidieron — por eso ahora lista los ítems con
  su opción ahí, hasta 3 y después un conteo.
  **El formulario de publicación arranca con un selector** ("Un solo
  producto" / "Variantes de un mismo producto", radio con descripción), a
  pedido del usuario: quien sube un producto simple no ve nada de opciones.
  Es solo de interfaz — **no se guarda en la base**, el dato real es si el
  producto tiene filas en `product_options`, y al editar el modo se deduce de
  eso. Dos detalles que no son obvios: (1) volver a "Un solo producto" con
  opciones cargadas **las borra**, con aviso previo, porque ocultarlas dejaría
  un producto "simple" que igual le pide al cliente elegir un color; (2) un
  alta nueva en modo Variantes **no cierra el formulario al guardar** — las
  opciones se guardan contra el `product_id`, que recién existe ahí, así que
  el form queda abierto en modo edición para cargarlas en el momento.
  Verificado con 9 + 7 checks de Playwright sobre el build real (selector,
  chips agotados, validación de lo que falta, dos líneas separadas, el payload
  exacto que recibe el RPC, y el selector de modo mostrando/escondiendo el
  bloque) más las pruebas del RPC contra la base real.
- **Resuelto 2026-09-22** — la etiqueta de rubro de la tarjeta de un comercio
  (página "Comercios") **no era la que el dueño elige en su panel**: cambiar
  "Perfil de mi comercio → Categoría" no se reflejaba nunca en el público.
  `js/comercios.js` nunca leía `stores.category_slug` (la columna que guarda
  el panel, migración 71) -- **contaba las categorías de los PRODUCTOS del
  comercio y mostraba la más repetida**. Caso reportado por el usuario y
  reproducido contra producción: *Beruru* tiene `category_slug='ropa'` y
  6 de sus 10 productos en Tecnología, así que la tarjeta decía "Tecnología"
  por más veces que cambiara el chip. Ahora la tarjeta sale de
  `category_slug`, resuelto a nombre con `getCategories()`.
  **El conteo por productos quedó solo como respaldo para `category_slug` en
  NULL**, que en producción son exactamente las 14 tiendas de seed (F11-06):
  se insertaron a mano sin pasar por `approve_seller_request`, que es quien
  copia el rubro desde la solicitud, y el backfill de la migración 71 no las
  alcanzó porque no tienen `seller_requests`. Sin ese respaldo esas 14
  tarjetas se habrían quedado sin etiqueta -- se arreglan solas en cuanto su
  dueño guarde el perfil una vez (el formulario exige elegir categoría).
  Verificado en el navegador con los datos reales mockeados (6 checks). Nota:
  la **ficha** del comercio (`comercio.html`) ya leía bien `category_slug`;
  los resultados de búsqueda no muestran rubro (nunca lo mostraron) y se
  dejaron igual.
- **Resuelto 2026-09-17** — **Panel de autogestión del profesional/técnico**, en
  página propia `pages/profesional.html` (+ `js/profesional.js` y seis módulos
  `js/profesional-*.js`, uno por sección). Reemplaza al mini panel que vivía
  adentro de `vender.html`, que solo dejaba pausar la publicación y editar
  oficio/descripción/teléfono/WhatsApp/redes -- **no la foto, el nombre ni el
  rubro**: para corregir la foto había que escribirle a Soporte. Ahora tiene
  Resumen, Mis datos (todo editable, con vista previa de cómo lo ve un vecino),
  Servicios y precios, Horarios y zona, Fotos de trabajos (ordenables y con
  pie), Consultas, Reseñas (con respuesta pública), Estadísticas,
  Notificaciones y Soporte. Reusa el shell del panel del vendedor
  (`js/vender-shell.js`, que ya era genérico) y sus clases, copiadas a
  `Assets/styles/profesional.css`; el acento es el ámbar del modo Oficios en su
  tono oscuro (`#b45309`, porque el de marca no llega a AA con texto blanco
  encima). Migraciones **89-94**, todas aplicadas a producción. **Ojo con dos
  cosas al tocar esto:** (1) `increment_professional_metric` lo llama un
  visitante anónimo, así que valida adentro el tipo de evento y que el
  profesional esté activo, y la tabla de métricas no tiene policy de escritura
  para nadie; (2) el trigger de `reviews` corta en los dos sentidos porque
  `reviews_update_own` ya dejaba al autor editar su fila -- sin ese chequeo
  podía escribirse él mismo la "respuesta del profesional". De paso se arregló
  que "Sumate al directorio" cayera en el formulario de comercio
  (`vender.html?tipo=servicio`). **Lo que quedó sin probar:** el recorrido
  logueado de punta a punta, porque el navegador del entorno no llega a
  Supabase -- hay tests de la lógica con filo
  (`professional-hours-utils`, `professional-service-utils`) y se verificó el
  diseño, pero el flujo real conviene caminarlo una vez a mano.
- **Resuelto 2026-09-17** — El botón "Vender" de la fila de accesos del home
  pasa a decir **"Panel"** para quien ya tiene uno: vendedor, empleada de un
  comercio, profesional publicado en "Contratar", admin y moderador. Con un
  solo panel es el mismo link de siempre apuntando adonde corresponda
  (`vender.html`, `profesional.html` o `admin.html`); con los dos
  —vendedor/profesional que **además** es admin— el botón abre un menú chico
  con las dos opciones, etiquetadas según esa cuenta ("Panel de vendedor"
  **o** "Panel de profesional/técnico", más "Panel de administrador" / "Panel
  de moderación"). El auto-redirect al panel que se había hecho el 2026-09-16
  ahora reconoce también a la **empleada** de un comercio (`store_staff`, no
  tiene rol propio) y **deja de aplicarse a quien tiene panel de admin**: con
  dos paneles posibles, elegir uno por su cuenta sería adivinar, así que esa
  cuenta se queda en el home y elige desde el botón. La puerta de vuelta al
  home dejó de depender solo de `document.referrer`: el click en el logo del
  navbar marca la intención en `sessionStorage` (`bl_home_intent`, listener
  en `auth-utils.js`, que corre en todas las páginas), y no se limpia al
  leerla — una vez que la persona pidió ver el inicio, recargar o volver con
  el botón de atrás no la rebota de nuevo al panel. Toda la detección de
  paneles quedó en **`getPanelAccess()`** (`js/auth-utils.js`), que devuelve
  `{ isAdmin, seller }`; `sellerPanelPage()` y el mapa `SELLER_PANEL_PAGES`
  (qué página es el panel de cada uno) salen de ahí. Verificado en el
  navegador (20 checks de Playwright sobre el build real, con la sesión y las
  consultas mockeadas; harness en el scratchpad de la sesión, no versionado).
- **Resuelto 2026-09-16** — Auditoría del carrito y el checkout (`js/carrito.js`
  + `js/cart-utils.js`). Lo grave: **el total que mostraba el carrito no era el
  que cobraba `create_order`**. El RPC aplica el descuento del cupón **tienda
  por tienda** (solo donde `coupon.store_id` es null o coincide), pero el
  carrito guardaba únicamente el porcentaje y se lo restaba al subtotal
  entero. Con dos comercios en el carrito y un cupón de uno solo, la
  diferencia no era de centavos: **con $10.000 en cada comercio y un cupón del
  20% de uno de ellos, el resumen mostraba $16.000 y se cobraban $18.000**
  (reproducido de punta a punta en la página real). Segundo, más chico: el RPC
  redondea el subtotal con descuento de **cada tienda** y recién ahí suma el
  envío; el carrito redondeaba una sola vez al final, lo que corría unos pesos
  con varios comercios. Y tercero, el umbral de envío gratis de una tienda se
  calculaba con el descuento de un cupón que podía no ser suyo, así que podía
  mostrar envío cobrado donde el RPC daba envío gratis.
  La cuenta se sacó a **`js/cart-totals.js`** (puro, sin DOM, con
  `node js/cart-totals.test.mjs` — 17 casos que fijan la aritmética contra la
  del RPC, incluida la comparación del umbral **sin redondear**, que es como
  la hace Postgres). `carrito.js` ahora guarda `couponPercent` + `couponStoreId`
  en vez de un `currentDiscount` global, y el resumen, el chip de envío de cada
  comercio y el botón de pagar salen todos de la misma función.
  Dos arreglos menores de paso: **las ofertas vencían tres horas antes de
  tiempo todas las noches** — `new Date().toISOString().slice(0,10)` da el día
  **UTC**, y Argentina va 3 horas atrás, así que de 21:00 a medianoche una
  oferta que vencía ese mismo día ya se mostraba sin tachado (estaba igual en
  `cart-utils.js` y en `product-modal.js`; ahora los dos usan `localIsoDate()`,
  mismo criterio que `isoDate()` de `farmacias.js`). Y la lista de cupones
  públicos ahora filtra explícito por activo + no vencido: la policy pública ya
  lo hacía, pero la del admin (cmd `ALL`) no, así que una cuenta admin veía
  cupones que `create_order` después rechazaba.
- **Resuelto 2026-09-16** — Auditoría de las tres páginas de directorio
  (`js/contratar.js`, `js/farmacias.js`, `js/servicios.js`). Lo principal:
  **las URLs que carga a mano un comercio o un profesional (redes sociales,
  sitio web) iban derecho a un `href` sin validar ni normalizar**, y lo mismo
  el `maps_url` de una farmacia. Dos consecuencias, las dos medidas en el
  navegador: (1) **el caso de todos los días** — quien escribe
  "instagram.com/mitienda" (sin `https://`, que es como lo escribe
  cualquiera) generaba un link **relativo**, así que el ícono de Instagram
  llevaba a `proyectopdisc.vercel.app/pages/instagram.com/mitienda`, un 404
  del propio sitio; el input es `type="text"` y la columna es `text` pelada,
  no había validación en ningún lado. (2) un `javascript:...` guardado en ese
  campo se dibujaba como link clickeable. **Medido:** con el `target="_blank"`
  + `rel="noopener noreferrer"` que ponen `contratar.js` y `comercio.js`,
  Chromium abre una pestaña nueva y **no** llega al origen del sitio; sin
  `target="_blank"` sí ejecuta (la CSP no lo frena, `script-src` tiene
  `'unsafe-inline'`). O sea: no era un XSS guardado explotable hoy, pero lo
  único que lo separaba de serlo eran dos atributos en el call site. Se
  resolvió en `js/store-contact-utils.js` con `safeExternalUrl()` (completa el
  `https://` que falta, descarta todo lo que no sea http/https), que usa
  `getVisibleSocialLinks()` — **arregla de una las dos páginas que lo
  consumen, contratar y comercio**, más el `maps_url` de farmacias. Con tests
  (`node js/store-contact-utils.test.mjs`).
  Otros tres arreglos: en `contratar.js`, **las reseñas dejaban de cargar para
  siempre** si se abría una tarjeta y después se filtraba la lista (el Set
  `loadedReviewSections` guardaba ids de un DOM que el re-render ya había
  tirado — reproducido y verificado en el navegador); las tres páginas
  mostraban un hueco en blanco mientras cargaban (ahora usan el bloque con el
  spinner de 6 puntos); y `contratar`/`servicios` ahora filtran explícito por
  `is_active` — la policy pública ya lo hacía, pero la del admin (cmd `ALL`)
  no, así que una cuenta admin veía en las páginas públicas las publicaciones
  pausadas y los contactos dados de baja.
  **Contradicción documentada, no resuelta:** la migración 67 dice que
  `pharmacy_shifts.closes_at` se interpreta **SIEMPRE** como del día
  siguiente, pero `js/farmacias.js` solo lo pasa al día siguiente cuando
  `closes_at <= opens_at` (un turno "8:00 a 22:00" lo toma del mismo día). Se
  dejó el comportamiento del código a propósito — es el conservador, y el
  criterio del archivo es "ante la duda, NO mostrar el dato" — y se documentó
  la divergencia en el JSDoc de `shiftWindow`. Con los turnos reales de
  Baradero (8:00 a 8:00) las dos lecturas coinciden, así que hoy no cambia
  nada. **Si alguna vez hay que cargar turnos que no sean de 24hs, la salida
  correcta es una columna explícita `closes_next_day`, no adivinar por las
  horas.** El formulario del admin son dos inputs de hora sin ninguna
  aclaración sobre esto.
- **Resuelto 2026-09-16** — Auditoría de las 4 Edge Functions
  (`supabase/functions/`), que mueven plata y borran cuentas y **no tenían ni
  un test**. Lo más grave, en `mp-webhook`: **nunca se verificaba el monto
  cobrado**. Alcanzaba con que Mercado Pago dijera `approved` para marcar la
  orden como pagada, sin comparar `transaction_amount` contra lo que suman las
  órdenes — un pago de $100 marcaba pagado un pedido de $50.000 (reproducido
  en test). Ahora, si lo cobrado no cubre el total, las órdenes van a
  `needs_review` y se le avisa al vendedor; nunca a `paid`. Segundo: una
  **devolución o contracargo** (`refunded`/`charged_back`/`in_mediation`)
  dejaba la orden en `paid` para siempre y el vendedor despachaba una venta
  que ya no existía — ahora vuelve a `needs_review` con aviso. Tercero: un
  `external_reference` que no fueran uuids hacía explotar el `.in()`, caía en
  el catch y devolvía 500, y **MP reintenta un webhook con 500 durante días**
  — ahora se filtra por forma de uuid y responde 200. Cuarto: se sacó el N+1
  que pedía el `owner_id` de a una orden por vez.
  En **`delete-account`**: la función implementa el derecho de supresión (Ley
  25.326) pero solo limpiaba el bucket `avatars` — las **capturas de los
  reclamos** (`support-attachments/{uid}/`, que suelen traer dirección, mail o
  medio de pago) quedaban ahí para siempre después de una baja. Ahora se
  borran las dos carpetas, paginando (`list()` corta en 100 y no avisa que hay
  más). `payment-proofs` se deja a propósito: sus paths son `{order_id}/` y el
  pedido sobrevive anonimizado, es el respaldo del cobro del comercio.
  Además se reordenó: primero la baja, después los archivos y sin tirar —
  antes, si el `deleteUser` fallaba, la persona se quedaba con la cuenta pero
  ya sin su foto de perfil.
  En **`mp-oauth-callback`**: no dejaba vincular la misma cuenta de MP a dos
  tiendas (`stores.mp_collector_id` no tiene unique, y con dos filas el
  webhook no sabe con qué token leer el pago, se cae al global y la venta no
  se confirma nunca, en silencio). En **`mp-create-preference`**: se valida el
  `order_ids` que llega en el body (uuids, sin duplicados, con tope) para
  devolver un 400 claro en vez de un 500, y se protege
  `MP_MARKETPLACE_FEE_PCT` de un valor inválido que se colaba como NaN.
  Tests nuevos en **`supabase/functions/_tests/`** (24 asserts, corren con
  `npm test`, sin Deno ni red): transpilan el `index.ts` real y lo corren
  contra un Supabase en memoria. Contra el código de `main` fallan 8.
  **Dos pendientes que salieron de esto y NO se tocaron** (ver abajo).
- **Resuelto 2026-09-22** — el hueco de prioridad ALTA de `orders_insert_own`
  (2026-09-16): la policy era solo `with check (client_id = auth.uid())`, así
  que cualquier usuario autenticado podía insertar una orden por la API REST
  **salteándose el RPC `create_order`** con el `total_price`, `store_id` y
  `payment_method` que quisiera (y con `order_items_insert_own`, precio de
  ítem inventado). Migración `db/schema/96_lock_down_direct_order_inserts.sql`,
  **aplicada en producción** vía el MCP de Supabase: revoca el `INSERT` de
  `orders`/`order_items` para `authenticated`/`anon` y borra las dos policies
  de insert. No rompe `create_order()` — es `SECURITY DEFINER` y su dueño
  (`postgres`) es también dueño de las dos tablas, así que bypassea RLS y
  grants igual; el RPC sigue siendo el único camino para crear un pedido,
  ahora sin forma de saltearlo. Verificado post-aplicación contra
  `information_schema.role_table_grants` y que no hay ningún
  `.from('orders').insert(...)` en el cliente. Detalle completo en el skill
  `progreso-baradero-local`.
- **Resuelto 2026-09-22** — mismo bug de popup bloqueado que ya se había
  arreglado en `js/support-utils.js` el 2026-09-16, ahora también en el botón
  "Ver comprobante" de una transferencia en `js/vender.js` y `js/admin.js`:
  `window.open(signedUrl, ...)` se llamaba después del `await` de
  `createSignedUrl`, y Safari/Firefox bloquean en silencio un `window.open()`
  que ya perdió el gesto del usuario. Se abre la pestaña en blanco antes del
  `await` y se navega después.
- **Resuelto 2026-09-22** — auditoría de seguridad del panel de profesional/
  técnico (sector elegido al azar a pedido del usuario). El panel en sí está
  bien construido (RLS de las 7 tablas verificada contra la base real, sin
  `innerHTML` con datos de la persona, sin la clase de bug de
  `approve_seller_request`). Encontrado y arreglado:
  `professional_requests_insert_own`/`seller_requests_insert_own` no
  restringían la columna `status` al insertar -- un usuario podía
  autoinsertar su solicitud ya "aprobada", que no le daba ningún privilegio
  real (publicarse sigue exigiendo el insert admin-only en
  `professionals`/`stores`) pero la desaparecía de la cola de revisión del
  admin. Migración `db/schema/97_lock_down_request_status_on_insert.sql`,
  aplicada en producción: el `with check` ahora exige `status = 'pending'`
  en el insert de las dos tablas. Detalle completo, incluido lo revisado que
  no tenía problemas, en el skill `progreso-baradero-local`.
- **Resuelto 2026-09-22** — auditoría de seguridad del flujo de login/
  registro/recuperación de contraseña (segundo sector al azar). Encontrado y
  arreglado, severidad ALTA: `js/error-logger.js` (el logger global de
  errores no manejados, corre en todo el sitio) mandaba
  `window.location.href` **completo, hash incluido** a `error_logs`. Los
  links de recuperación de contraseña, confirmación de email y el callback
  de Google OAuth vuelven con `#access_token=...&refresh_token=...` en el
  hash, y supabase-js tarda un momento (async) en detectarlo y limpiar la
  URL -- un error no relacionado que disparara en esa ventana dejaba el
  token de sesión de la persona en texto plano en una tabla que los 4 admins
  pueden leer, suficiente para tomar la cuenta con
  `supabase.auth.setSession(...)`. Verificado contra la base real que no hay
  ningún token ya filtrado (una sola fila en `error_logs`, sin `access_token`
  ni `#`). Fix: `sanitizeUrlForLogging()` en `js/error-logger.js` (con test)
  saca el hash entero y cualquier parámetro sensible de la query string antes
  de loguear. Cambio de cliente, sin migración. Detalle completo en el skill
  `progreso-baradero-local`.
- **Resuelto 2026-09-22** — auditoría de seguridad del panel de admin
  (tercer sector al azar). El panel en general está bien construido (sin
  `innerHTML` con datos de la persona, RPCs sensibles con chequeo de rol
  adentro). Encontrado y arreglado, severidad media-alta: el trigger
  `protect_review_owner_reply()` eximía a `moderador` de todo chequeo de
  columna en `reviews` -- ese rol es deliberadamente acotado por diseño
  (`50_moderador_role.sql`: "nada financiero ni de configuración", solo
  ocultar/mostrar reseñas reportadas), pero sin el chequeo podía en los
  hechos reescribir el rating/comentario/autor de **cualquier reseña del
  sitio**, no solo ocultarla. Migración
  `db/schema/98_reviews_moderador_only_hides.sql`, aplicada en producción:
  ahora cualquier cambio de moderador que no sea `is_hidden` tira excepción.
  `admin` no se tocó (ya tiene acceso total consistente en el resto del
  proyecto, y las 4 cuentas admin ya pueden hacer lo mismo desde el SQL
  Editor). No había cuentas `moderador` asignadas en producción -- se cerró
  antes de que hubiera alguien con ese rol para explotarlo. Detalle completo
  en el skill `progreso-baradero-local`.
- **Resuelto 2026-09-22** — auditoría de seguridad de "Mi perfil" (cuarto
  sector al azar). En general está bien construido (sin `innerHTML` con
  datos de usuario, subida de comprobantes cubierta en dos capas
  server-side). Encontrado y arreglado, severidad ALTA:
  `profiles_update_own` no restringe columnas, y `profiles.is_suspended`
  (pensada para suspender repartidores) no tenía la misma protección que
  `role` -- cualquier cuenta podía des-suspenderse a sí misma con un update
  directo (`supabase.from('profiles').update({ is_suspended: false })`),
  sin pasar por `admin_set_repartidor_suspended`. No es hipotético: aunque
  el frontend de `repartidor` se sacó el 2026-09-16, `claim_delivery`/
  `update_delivery_status` -- las RPCs que de verdad usan `is_suspended`
  como gate -- siguen con `EXECUTE` otorgado a `authenticated` en
  producción. Migración `db/schema/99_protect_is_suspended_on_profile.sql`,
  aplicada: el trigger `prevent_role_update_on_profile` ahora protege
  `role` **e** `is_suspended` bajo la misma bandera de transacción, y
  `admin_set_repartidor_suspended` la setea antes de su propio update.
  Verificado con pruebas en transacciones con ROLLBACK contra la base real
  (bloqueo sin la bandera, éxito con la bandera, sin regresión en `role`).
  Sin cambios de `js/`. Detalle completo en el skill
  `progreso-baradero-local`.
- **Resuelto 2026-09-22** — auditoría de seguridad del panel de vendedor
  (quinto sector al azar). Primero un susto que resultó falsa alarma pero
  quedó anotado: `orders_update_staff`/`orders_update_store_or_admin` no
  tienen `with check` propio, así que a simple vista parecía el mismo hueco
  que `orders_insert_own` (dueño/empleado reescribiendo `payment_status`/
  `total_price` por fuera de `confirm_transfer_payment`). Probado contra la
  base real: **ya está bloqueado**, pero no por RLS -- `authenticated` solo
  tiene privilegio de columna `UPDATE` sobre `status` en `orders`, ninguna
  otra columna, y ese grant **no está documentado en ningún archivo de
  `db/schema/`** (se armó fuera del historial de migraciones). No se tocó
  -- ya está bien, solo quedó sin registrar; si algún día hay que
  reconstruir la base desde cero con los archivos del repo, esta protección
  específica no va a estar.
  Encontrado y arreglado, severidad media: la policy de INSERT del bucket
  público `products` (storage) solo chequeaba el rol (`vendedor`/`admin`),
  a diferencia de TODOS los demás buckets del proyecto, que exigen que el
  primer segmento del path sea del dueño de verdad. Cualquier vendedor
  podía subir archivos arbitrarios a `products/{product_id ajeno}/archivo`
  -- hosting público no autorizado bajo el dominio del proyecto (no
  defacement directo: la galería se arma desde la tabla `product_images`,
  nunca listando el storage). Migración
  `db/schema/100_products_bucket_folder_ownership.sql`, aplicada: ahora
  exige que el primer segmento del path sea un producto que la cuenta
  puede escribir de verdad (dueño o empleado del comercio). Verificado con
  inserts simulados contra `storage.objects` en transacciones con ROLLBACK.
  Revisado sin problemas: `add_store_staff` valida dueño antes de agregar
  un empleado, `coupons` excluye a los empleados a propósito (ya
  documentado), y el sistema de `store_staff.permissions` es explícitamente
  solo de UI (ya razonado en su propia migración). Detalle completo en el
  skill `progreso-baradero-local`.
- **Resuelto 2026-09-22** — auditoría de seguridad "por áreas" (no al azar,
  a pedido del usuario, cubriendo lo que quedaba del proyecto de forma
  sistemática). El hallazgo de mayor impacto de toda la sesión de
  auditorías: el pago **`'simulado'`** (documentado como "solo testing
  interno", sacado del checkout real hace tiempo) **seguía totalmente
  operativo del lado del servidor sin ningún chequeo de rol** --
  `create_order()`/`confirm_simulated_payment()` aceptaban ese método de
  cualquier usuario autenticado llamando al RPC directo por fuera de la UI.
  A diferencia de todos los demás hallazgos de esta sesión (que requerían
  un rol delegado o ya estaban mitigados en otra capa), este lo podía
  explotar **cualquier cliente común contra cualquier vendedor real**:
  comprar productos de verdad y marcarlos pagados sin pagar un peso.
  Migración `db/schema/101_restrict_simulated_payment_to_admin.sql`,
  aplicada en producción: las dos funciones ahora exigen rol admin.
  Verificado con pruebas en transacciones con ROLLBACK contra la base real
  (cliente bloqueado en simulado, sin regresión en mercadopago, admin sigue
  pudiendo usarlo). También cubiertas sin hallazgos: `search.js`,
  `comercios.js`, `producto.js` (con la tabla `stock_alerts`, nunca antes
  revisada, bien resuelta), `panel-redirect-utils.js`, `storage-utils.js`.
  Detalle completo en el skill `progreso-baradero-local`.
- **Pendiente (2026-09-16) — `mp-oauth-callback` no usa `state` (OAuth CSRF).**
  Nada ata el `code` que llega a la persona que arrancó la vinculación: si a un
  vendedor logueado se le hace disparar la función con un `code` ajeno, su
  comercio queda vinculado a la cuenta de MP del atacante y todos los cobros
  van ahí. Hoy no es explotable porque **ninguna página llama a esa función**
  (la vinculación está pausada, ver A113-274), pero hay que resolverlo
  **antes** de cablearla. Anotado también en el encabezado del archivo.
- **Resuelto 2026-09-16** — La sección "Contactar a soporte" (Mi perfil y panel
  de vendedor) se veía rota en producción: el commit `3a3e6a3` que sumó los
  adjuntos reescribió `js/support-utils.js` entero (+552 líneas: tarjeta,
  dropzone, lista de archivos, chips, fila plegable) **sin tocar ni un archivo
  de CSS**. Quedaron 34 clases `tkt-*` usadas por el JS sin una sola regla, así
  que el selector de adjuntos, la tarjeta del formulario y los chips salían sin
  estilo, y cada fila de la lista mostraba asunto + mensaje + fecha pegados en
  un solo renglón corrido. Agregadas las 34 reglas a `Assets/styles/home.css`
  (junto al bloque `tkt-` que ya estaba) y reparadas las que el rediseño había
  dejado desfasadas: `.tkt-item__top` pasó de `<div>` a `<button>` y le faltaba
  el reset (ancho, padding, `font`, alineación), `.tkt-empty` pasó de `<p>` a
  bloque con ícono, y `.tkt-item__msg`/`.tkt-item__date` habían quedado muertas
  (borradas). **Gotcha para el futuro:** el chequeo que caza esta clase de bug
  es comparar las clases del JS contra las del CSS —
  `grep -oE "tkt-[a-zA-Z0-9_-]+" js/support-utils.js | sort -u` contra
  `grep -rhoE "\.tkt-[a-zA-Z0-9_-]+" Assets/styles/ | sed 's/^\.//' | sort -u`;
  al 2026-09-16 las dos direcciones dan 0.
  De paso, 8 arreglos en `js/support-utils.js`: (1) abrir un adjunto no
  funcionaba en Safari/Firefox — `window.open()` iba después del `await` de
  `createSignedUrl` y el bloqueador de popups lo frenaba sin avisar; ahora la
  pestaña se abre antes y se navega después (**el mismo bug sigue en
  `js/vender.js:2599` y `js/admin.js:891`, con los comprobantes de
  transferencia** — no se tocaron por estar fuera de esta tarea); (2) el
  `required` del navegador dejaba mandar un reclamo con asunto de solo
  espacios, que quedaba como una fila en blanco; (3) cancelar un reclamo
  avisaba "Reclamo cancelado" aunque la RLS rechazara el update (Supabase no
  tira error, devuelve cero filas — ahora se chequea con `.select()`); (4) si
  fallaba la consulta del hilo se mostraba "Todavía no hay respuestas", que es
  mentira; (5) fuga de los objectURL de las miniaturas al redibujar la sección;
  (6) bloque de carga con el spinner de 6 puntos mientras se piden los
  reclamos, que antes era un hueco mudo; (7) el campo de respuesta no tenía
  nombre accesible y el encabezado plegable no declaraba `aria-controls`;
  (8) parpadeo del resaltado al arrastrar archivos sobre la zona. `dist/`
  reconstruido.
- **Resuelto 2026-09-16** — Se sacó por completo el rol `repartidor` y todo
  su apartado, a pedido del usuario: la logística de entregas queda para
  más adelante. Borrados `pages/repartidor.html` y `js/repartidor.js`
  (panel propio con alta, toma de pedidos y avance de estado de entrega) y
  su entrada en `vite.config.js`/`robots.txt`. Sacado de todos los lugares
  donde aparecía: link "Repartir" del menú de cuenta (`nav-utils.js`), link
  "Sumate como repartidor" del footer del home, badge de rol y calificación
  post-entrega en "Mis compras" (`perfil.js`), sección "Envíos en curso"
  completa del panel de vendedor (nav + card de resumen + permisos por
  empleado, `vender.js`/`vender.html` -- quedaba 100% atada al repartidor
  que gestionaba el estado, así que no tenía sentido dejarla mostrando
  siempre "vacío"), las dos secciones de admin ("Solicitudes de
  repartidores" y "Moderación · Repartidores", con sus métricas del
  resumen global) y los tipos de notificación asociados (incluidos
  `courier_added`/`delivery_assigned`/`provider_approved`, restos sueltos
  de la rama de logística de terceros que nunca se terminó, apuntaban a
  `repartidor.html`/`logistica.html`). Términos y condiciones, "Mi perfil"
  y varios comentarios de código actualizados para no seguir mencionando el
  rol. **No se tocó la base de datos**: las tablas `delivery_requests`/
  `deliveries` y sus RPCs (`claim_delivery`, `update_delivery_status`,
  `approve_delivery_request`, `admin_set_repartidor_suspended`) siguen ahí
  sin uso por si se retoma la fase de logística más adelante -- no había
  repartidores reales en producción (el rol nunca pasó de "planeado"), así
  que sacar el frontend no afecta a ningún usuario ni pedido existente.
  `dist/` reconstruido. Detalle completo: skill `progreso-baradero-local`.
- **Resuelto 2026-09-16** — Limpieza de ramas sueltas: 34 ramas remotas
  revisadas una por una. 29 sin trabajo propio (ya mergeadas o superadas por
  trabajo posterior en otra rama) se borraron sin tocar código. Las 5 con
  contenido real se mergearon a `main` (conflictos solo en `dist/`, resueltos
  quedándose con la versión de `HEAD` y con un rebuild único al final, mismo
  patrón que la limpieza del 2026-09-07): fix de "Mi perfil" que dejaba
  guardar fecha de nacimiento/documento vacíos como si se hubiera completado,
  traducción de "cancelled" en notificaciones de reclamos de soporte, el
  nombre del producto en "Mis compras" ahora abre el modal en vez de
  `producto.html`, alineación del borde inferior del banner de aguas del
  mosaico del home, y un spinner nuevo de 6 puntos (reemplaza el ring simple)
  en pantallas de carga (guard de auth, "Cargando tu comercio", grilla de
  búsqueda, modal rápido de producto). Más la eliminación del rol
  `repartidor` (ver entrada de arriba, era una de esas 5 ramas).
- **Resuelto 2026-09-15** — Plantillas con marca para los emails de
  confirmación de registro y de recuperar contraseña, activas en producción.
  Supabase mandaba esos dos emails con una plantilla genérica por defecto;
  ahora tienen la identidad de marca (isotipo + wordmark sobre `#284175`, CTA
  en píldora, remate con el manifiesto de footer "Mientras otras plataformas
  conectan personas lejanas, nosotros conectamos vecinos."), fuente en
  `supabase/templates/confirmation.html` y `supabase/templates/recovery.html`
  (y cableadas en `supabase/config.toml` bajo `[auth.email.template.confirmation]`
  / `[auth.email.template.recovery]`, para que un futuro `supabase config push`
  no las pise con la plantilla default). El logo se copió a
  `public/img/logo-baradero-local.png` (ruta estable, sin hash de build — Vite
  hashea todo lo que está bajo `Assets/`, y un email no puede depender de una
  URL que cambia en cada build) para poder referenciarlo con URL absoluta
  (`https://proyectopdisc.vercel.app/img/...`) como exige un cliente de
  correo. **Se activaron pegando el HTML directo en el dashboard**
  (Authentication → Emails → Confirm signup / Reset Password), no con
  `supabase config push` (esta sesión no tenía credenciales interactivas de
  Supabase CLI) — si en el futuro alguien corre `config push` desde otra
  máquina, sincroniza sin pisar nada distinto porque el `config.toml` ya
  apunta a los mismos archivos.
- **Pendiente (2026-09-16)** — el remitente de los emails de Auth (confirmación
  de registro, recuperar contraseña) sigue mostrando **"Supabase"** en vez de
  "Baradero Local", aunque el cuerpo del email ya tiene la marca (ver punto de
  arriba). No se puede cambiar solo con código: el servicio de email por
  defecto de Supabase (el que se usa hoy, sin SMTP propio) no permite
  personalizar el nombre del remitente — hace falta configurar **Custom SMTP**
  con un proveedor externo (Resend recomendado, o SendGrid/Postmark/otro) y
  cargar `sender_name = "Baradero Local"` + credenciales en el dashboard
  (Authentication → Emails → SMTP Settings), reflejando después esas mismas
  claves en `supabase/config.toml` bajo `[auth.email.smtp]` (hoy comentado).
  Mismo bloqueante que **F8-02/F8-03** más abajo (falta credenciales de un
  proveedor externo) — cuando se resuelva uno, conviene resolver el otro con
  el mismo proveedor. Usuario avisado 2026-09-16, decidió dejarlo pendiente
  para retomar después de elegir proveedor.
- **Resuelto 2026-09-10** — El profesional/técnico ahora carga sus redes
  sociales desde su mini panel (mismas 6 redes que un comercio: Instagram,
  Facebook, TikTok, X, YouTube, sitio web), con switch en vez de checkbox y
  un diseño propio (tarjetas) distinto al del comercio (filas), aunque
  comparten el mismo componente de switch. Se muestran como íconos en su
  tarjeta de "Contratar". Migración `87_professionals_social.sql` (ya
  aplicada a producción).
- **Resuelto 2026-09-10** — Panel de profesional/técnico ampliado: aparece
  también en el menú de cuenta de la navbar (sección "Profesional/Técnico",
  antes solo estaba en "Mi perfil"), "Mi perfil" muestra un tag
  "Profesional/Técnico · \<categoría\>" junto al badge de rol, y el mini panel
  de vender.html deja de ser solo fotos: ahora puede pausar/reactivar su
  publicación y editar especialidad/descripción/teléfono/WhatsApp sin pasar
  por Soporte. Migración `86_professionals_update_own.sql` (ya aplicada a
  producción): agrega la policy de UPDATE por dueño que le faltaba a
  `professionals` (antes solo el admin podía escribir esa tabla).
- **Resuelto 2026-09-10** — Acceso al panel desde "Mi perfil" ampliado más
  allá de admin/moderador: la fila "Tipo de cuenta" ahora también muestra el
  link para vendedor/empleada de un comercio ("Panel de vendedor" ->
  vender.html) y para quien está publicado en "Contratar" ("Mi panel de
  profesional" -> vender.html). Ese mini panel de profesional es nuevo: antes
  solo mostraba un texto fijo ("escribinos por Soporte para cambiar algo");
  ahora puede cargar/borrar sus propias fotos promocionales (tabla nueva
  `professional_promos` + bucket `professional-promos`, migración
  `85_professional_promos.sql`, ya aplicada a producción), que se muestran en
  su tarjeta de contratar.html al desplegarla (debajo de Llamar/WhatsApp),
  cada una abrible en un lightbox simple (click para abrir, X/click
  afuera/Esc para cerrar).
- **Resuelto 2026-09-10** — "Mi perfil" muestra, junto al badge de rol
  existente, un tag "Empleado de \<tienda\>" por cada comercio del que la
  cuenta es `store_staff`, y "Dueño de \<tienda\>" solo si es dueña de una
  única tienda (evita mostrar 14 tags falsos en cuentas con tiendas de
  seed/test como owner_id -- ver nota debajo sobre las 14 tiendas de
  prueba). Genérico para cualquier perfil, confirmado el diseño con el
  usuario antes de implementar. Contexto: de las 17 tiendas en producción,
  solo **gogo** y **facu.cells** son reales -- las otras 14 son datos de
  seed con `owner_id` apuntando a la cuenta `bianberayra@gmail.com`
  (admin) por cómo se corrió el seed en su momento, no una relación de
  propiedad real; esa cuenta es en verdad empleada (`store_staff`) de
  `gogo`. No se tocó la data de esas 14 tiendas ni el acceso de nadie --
  solo la UI del tag.
- **Resuelto 2026-09-10** — El dueño de un comercio ahora elige, por
  empleado, qué secciones del panel ve (Publicaciones/Pedidos/Envíos en
  curso/Pagos por confirmar/Notificaciones/Soporte -- las exclusivas del
  dueño siguen sin ofrecerse). Migración `83_store_staff_permissions.sql`
  (columna `store_staff.permissions`, default todo en `true`), ya aplicada a
  producción. De paso, corregido el panel de vendedor que aparecía en
  blanco para cuentas con más de una tienda (`stores.owner_id` repetido,
  caso real: la cuenta de seed con las 14 tiendas de prueba) -- `.single()`/
  `.maybeSingle()` en `loadDashboard()`/`checkSellerState()`
  (`js/vender.js`) tiraban error de coerción con 2+ filas y cortaban la
  carga antes de cablear el sidebar. Detalle completo en el skill
  `progreso-baradero-local`.
- **Resuelto 2026-09-09** — Se eliminó el chat interno (`mensajes.html`,
  tablas `conversations`/`messages`) a pedido del usuario. "Contactar al
  vendedor" ahora abre teléfono (`tel:`) o WhatsApp (`wa.me` con mensaje
  prellenado "Hola! Quería realizar una consulta ... te escribo desde
  Baradero Local") directo, según lo que el vendedor elija en su panel
  (`stores.contact_method`: teléfono/WhatsApp/ninguno). Se agregó también
  una sección de redes sociales (Instagram/Facebook/TikTok/X/YouTube/sitio
  web, cada una con su link + check "Mostrar") que aparece como íconos en la
  página del comercio. Migraciones `81_remove_in_app_messaging.sql` y
  `82_store_contact_and_social.sql`, ya aplicadas a producción.
- **Resuelto 2026-09-08** — "Contratar" (botón del home) dejó de ser un
  placeholder "muy pronto" y pasó a ser el **directorio de profesionales y
  técnicos** de Baradero, informativo por WhatsApp/teléfono (sin catálogo ni
  pedidos). **Actualizado el 2026-09-17:** dejó de ser solo informativo -- la
  tarjeta ahora muestra servicios con precio de referencia, horarios y zonas, y
  el vecino puede pedir un presupuesto desde la plataforma (tabla
  `professional_inquiries`). Sigue sin haber carrito ni pagos: el trabajo se
  arregla entre las dos personas. Alta desde `vender.html` (nuevo selector "Vender productos" /
  "Ofrecer un servicio" arriba del formulario), con aprobación manual del
  admin — mismo flujo que un comercio, pero sin RPC `SECURITY DEFINER`
  porque publicarse no cambia el rol de la cuenta. Tablas nuevas
  `professional_requests`/`professionals` (migración `77_professionals.sql`,
  aplicada a producción), sección nueva "Profesionales" en el panel de
  admin. **Ampliado el mismo día** (migración `78_professionals_extras.sql`,
  también aplicada): categoría fija (6 valores, chips arriba de
  `contratar.html`), foto/logo opcional (bucket `professional-photos`,
  subida en el propio alta), calificación por estrellas reutilizando la
  tabla `reviews` ya existente (`target_type='professional'`, mismo patrón
  que `repartidor` en la migración 44 — cero tabla nueva, cero JS nuevo para
  reseñas), tarjetas expandibles con reseñas, mini-sección "Profesionales
  destacados" en el home (los mejor calificados) y resultados de
  profesionales en el buscador principal (`search.html`, igual que ya pasa
  con comercios). Detalle completo en el skill `progreso-baradero-local`.
- **Resuelto 2026-09-08** — el botón "Ayuda" de la fila de acciones del home
  (Vender / Contratar / Ayuda) pasó a ser **"Servicios"** y lleva a una página
  nueva (`pages/servicios.html`) con números de emergencia de Baradero
  agrupados por tipo (Emergencias: policía/hospital/ambulancia/etc. ·
  Veterinarias: de turno o de urgencias). Tabla nueva `emergency_contacts`
  (migración `76_emergency_contacts.sql`, aplicada a producción), con el
  mismo patrón de RLS que `pharmacies` (lectura pública, escritura solo
  admin). El admin los carga/edita desde una sección nueva "Servicios" en el
  panel. Detalle completo, incluido por qué es una sola tabla y no dos como
  farmacias, en el skill `progreso-baradero-local`.
- **Resuelto 2026-09-07** — Se mergearon a `main` las 7 ramas con trabajo real
  que quedaban sueltas (5 `claude/*` de otras sesiones/worktrees + 2 `A113-*`):
  el parche de seguridad de `approve_seller_request` (ver entrada de abajo),
  flechas del carrusel de comercios separadas de las tarjetas, dropdown propio
  en vez de `<select>` nativo en el filtro de notificaciones, ubicación de
  "Comercios cerca tuyo" persistida en sessionStorage, y el saludo del
  resumen del vendedor sin emoji. Otras 9 ramas locales/remotas resultaron
  redundantes (contenido ya mergeado a `main` por otro camino, ej. la misma
  foto de portada del hero llegó por PR #24 mientras la rama
  `A113-home-banner-foto-portada` seguía sin mergear con el mismo cambio) o
  simplemente viejas (branch sin commits propios, ya ancestro de `main`) --
  se borraron sin tocar nada. **Gotcha:** todos los conflictos de merge caen
  en `dist/` (hashes de build no deterministas, ver
  [[project-dist-merge-conflicts]] en memoria) -- se resuelven quedándose con
  la versión de `HEAD` y reconstruyendo el build una sola vez al final, nunca
  mergeando `dist/` rama por rama. **Gotcha 2:** dos ramas mergeadas en
  paralelo (esta tarea y `A113-store-logo-upload`) habían usado el mismo
  número de migración `74` para cosas distintas -- la de seguridad se
  renombró a `75_fix_approve_seller_request_admin_check.sql` al mergear
  (el archivo ya estaba aplicado en producción bajo el nombre viejo, el
  rename es solo prolijidad del repo, no hace falta reaplicarlo).
- **Resuelto 2026-09-06** — Auditoría de seguridad con el advisor de Supabase:
  `approve_seller_request()` (RPC `SECURITY DEFINER`) no verificaba el rol del
  que llama -- cualquier usuario autenticado podía auto-aprobarse como
  vendedor invocando el RPC directamente, saltando la aprobación manual del
  admin. Parcheado en producción y en `db/schema/75_fix_approve_seller_request_admin_check.sql`
  (renombrada de 74 a 75 al mergear, ver entrada de arriba) con el mismo
  chequeo de rol que ya usan `admin_set_product_active` /
  `approve_delivery_request`. De paso se confirmó que el aislamiento
  dueño-vendedor (uno no puede editar el comercio de otro) ya estaba bien
  resuelto por RLS (`stores_update_own`, `products_update_seller`,
  `store_staff`) -- no dependía solo de ocultar botones en el cliente. El
  resto del advisor (varias funciones `SECURITY DEFINER` marcadas WARN,
  `store_mp_credentials` con RLS sin policies) se revisó una por una: todas
  tenían su propio chequeo de rol/dueño adentro o son de acceso exclusivo por
  service role -- falsos positivos del linter genérico, no hace falta tocarlos.
  Pendiente aparte (no de código): activar "Leaked Password Protection" en
  Supabase Auth (Dashboard → Authentication → Policies), deshabilitado hoy.
- **Resuelto 2026-09-06** — En `perfil.html` (sección "Tus datos son tuyos")
  se sacó el botón "Descargar mis datos" a pedido del usuario -- queda solo
  "Eliminar mi cuenta" (con su lógica completa en `perfil.js`, sin cambios:
  Edge Function `delete-account`, fallback a ticket de soporte si esa función
  no está desplegada). Primer intento de la tarea lo había dejado al revés
  (sacó "Eliminar mi cuenta" y dejó "Descargar mis datos") por una lectura
  apresurada del pedido original -- corregido en el mismo día.
- **Resuelto 2026-09-06** — `vender.html` mostraba un flash del formulario
  "Crear mi tienda" (o ambas vistas superpuestas) al entrar, incluso para
  cuentas que ya tenían comercio: `register-view`/`dashboard-view` no tenían
  un estado inicial oculto y `guardPage` revela `#contenido-principal` antes
  de que `checkSellerState()` (js/vender.js) termine de consultar la DB.
  Se agregó un spinner "Cargando tu comercio…" (`#vender-state-loading`) que
  tapa esa transición.
- **Resuelto 2026-09-06** — Se completaron los links de la fila "Vender /
  Contratar / Ayuda" del home (`category-bar__inner--home-actions`, ya
  construida en CSS/HTML pero sin destino). Vender → `vender.html`, Ayuda →
  `info.html` (mismo destino que "Ayuda" del footer), Contratar → página
  nueva `contratar.html` ("muy pronto", todavía no existe una sección de
  servicios separada de productos).
- **Resuelto 2026-09-01** — Las 18 subtareas [MEJORA] de **A113-266** (rama
  `feature/mejorasGrupo`, mergeada a `main` el 2026-09-02 junto con el resto de
  las ramas `claude/*` pendientes), una por una con
  commit y push individual. Con código nuevo: badge de rol en el perfil
  (269), redirect post-login del vendedor a `vender.html` (270), botón
  "Aplicar filtros" reemplazado por auto-apply + "Actualizando
  resultados..." (289), menú de usuario de la navbar reorganizado en
  dropdown por secciones (290), botón "Volver" (history.back() + fallback)
  en Tienda y Usuario (311), skeleton + footer oculto mientras carga la
  sección Tienda (281, con 284/285 cerradas como duplicado exacto), teléfono
  y dirección obligatorios al agregar una dirección (293), pestaña
  "Servicios" visible-pero-deshabilitada en Favoritos (291), toasts nuevos
  de notificaciones abajo a la derecha/abajo en celular -- capa nueva
  `js/toast-utils.js` con polling simple cada 30s sobre `notifications`, no
  hay suscripción realtime en el proyecto todavía (268), y el botón "Quitar"
  del cupón del carrito pasó a ser una X (298, el auto-apply ya existía de
  antes bajo "P1-7"). Las otras 7 ya estaban resueltas bajo otro nombre
  (P1-x/P2-x/F12-x) y solo hizo falta comentar y cerrar en Jira sin tocar
  código: envío gratis en tarjetas de listado (279, ya era P2-4), modal de
  producto no cierra por click afuera (306, decisión de accesibilidad ya
  tomada), toggle de "aceptar contacto" del vendedor (296), multi-rubro en
  el alta de vendedor (305, P2-10), pausar/reactivar producto (309),
  cancelar reclamo + admin responde (295).
- **Resuelto 2026-09-17** — se sacó el botón **"Usar mi ubicación"** de Mi perfil → Direcciones
  (Direcciones de envío), a pedido del usuario. Queda solo "Agregar dirección" + el autocompletado
  manual. Se borró el botón (`pages/perfil.html`) y su handler de geolocalización/reverse geocoding
  contra Nominatim (`js/perfil.js`) — `pickAddressSuggestion()` sigue viva porque también la usa el
  autocompletado al tipear. Había sido agregado el 2026-09-03 (ver historial abajo, entrada superada
  por esta).
- **Resuelto 2026-09-03** — mergeado `claude/location-button-feature-9511de`: botón **"Usar mi
  ubicación"** en Mi perfil → Direcciones (geolocalización del navegador + reverse geocoding contra
  Nominatim). **Gotcha del merge:** la rama llamaba a `addressSuggestionLabel()`, la función que el
  fix del autocompletado había eliminado — git mergeaba limpio (hunks separados) y el botón tiraba
  ReferenceError en runtime. Ahora llama a `pickAddressSuggestion(data)`, así el reverse geocoding
  se comporta igual que elegir una sugerencia: como OSM tampoco trae la altura, deja la calle con
  el cursor al final para que la persona escriba el número.
- **Resuelto 2026-09-03** — **el autocompletado de direcciones (Mi perfil → Direcciones) borraba el
  número de la puerta**. OSM no tiene mapeada la altura de las casas de Baradero: Nominatim devuelve
  la calle sin `house_number` y la repite una vez por cada tramo mapeado, así que "Mitre 1234"
  mostraba dos filas idénticas ("Mitre" y "Mitre") y al elegir cualquiera el input quedaba en
  "Mitre" pelado. Ahora las filas se deduplican por calle + barrio, el número tipeado se conserva al
  elegir y el subtítulo de cada fila es barrio + localidad en vez del `display_name` entero con CP y
  país. Lógica pura en `js/address-suggest-utils.js` (`node js/address-suggest-utils.test.mjs`).
  **Gotcha:** la política de uso de Nominatim desalienta el autocompletado (1 req/s, User-Agent
  identificable) — si algún día empieza a dar 403, hay que mover la búsqueda a otro geocoder.
- **[A113-274](https://baraderolocal.atlassian.net/browse/A113-274) — prioridad ALTA — split de pagos de Mercado Pago sin andar**:
  la vinculación OAuth de la cuenta de MP del vendedor (`mp-oauth-callback`,
  `store_mp_credentials`, `stores.mp_collector_id`, piloto P0-6) se dejó pausada
  porque no se pudo hacer andar. Mientras tanto, **todo pago con Mercado Pago
  entra a la cuenta de la plataforma** (`MP_ACCESS_TOKEN` global en
  `mp-create-preference`), no directo al vendedor. Falta diagnosticar el
  motivo (revisar `redirect_uri`, `MP_CLIENT_ID`/`MP_CLIENT_SECRET`, permisos
  de la app en Mercado Pago) antes del lanzamiento real.
- **Resuelto 2026-09-03** — mergeado `feature/home-restructura` (rediseño del home: buscador en la
  misma fila del navbar, carrusel en el hero, dos mosaicos de promos, mapa de comercios cerca y las
  grillas de Ofertas y Esenciales con paginado de a 4). Venía de ~30 commits atrás; al resolver los
  conflictos **no volvió** el `initFarmaciaLink()` con la farmacia, la dirección y el teléfono
  inventados: el bloque queda dentro del hero pero apunta a `farmacias.html`. La franja de valor de
  F9-01 (envío dentro de Baradero / comercios verificados / apoyo al barrio) se sacó a pedido del
  usuario. La tira de categorías del home la reemplaza la fila de acciones de la rama; el mega-menú
  sigue montado en el navbar (`nav-categories-slot`).
- **Migración 73 sin aplicar** (`db/schema/73_support_ticket_attachments.sql`, 2026-09-03) — agrega
  `support_tickets.attachments` (text[], tope de 5 por check) y el bucket privado
  `support-attachments` con sus policies, para adjuntar capturas/PDF al enviar un reclamo. El
  código es defensivo: las dos consultas de tickets usan `select('*')` y la columna solo viaja en el
  insert si hay archivos, así que **hasta que se aplique la sección de reclamos sigue funcionando
  sin adjuntos** (lo que falla es la subida al bucket). La aplica el usuario, igual que la 66.
- **Migración 66 sin aplicar** (`db/schema/66_cart_hints_preference.sql`, 2026-08-16) — agrega
  `profiles.cart_hints_enabled` para la preferencia "Mostrar ayudas en el carrito". Se dejó escrita
  sin aplicar **a pedido del usuario** (la aplica él). Hasta entonces la preferencia funciona solo
  por dispositivo (cache en localStorage) — la app no se rompe. **Mientras siga pendiente,
  las preferencias nuevas de Ajustes se guardan solo en el navegador a propósito** (ver
  `js/settings-utils.js`): no tiene sentido sumar columnas a `profiles` que tampoco van a
  persistir. **Los números 61-65 están
  reservados por la rama sin mergear `feature/logistica-terceros`**: no reusarlos.
- **Resuelto 2026-09-01** — A113-266: reparados 6 bugs reales de la tarea de corrección de errores
  (el resto de las 12 subtareas de bug ya estaban resueltas en commits previos). Notificaciones sin
  link a su detalle, formato de precios sin pasar por `formatPrice` en `admin.js`, el vendedor veía
  reseña/contactar/carrito en su propio producto, hover de relacionados cortado, favoritos abría
  una vista de producto rota, y transferencia bancaria sin forma de mostrar el CBU/alias del
  comercio (agrega `stores.transfer_info`, migración `69_store_transfer_info.sql`, ya aplicada a
  producción). Detalle en el commit `1e384e6` (rama `feature/logistica-terceros`, cherry-pickeado
  a `main`).
- **Instalación de `codebase-memory-mcp` en máquina nueva** — el paso "correr `codebase-memory-mcp install`" ya está documentado arriba, pero falta documentar de dónde se descarga el binario en sí (`~/.local/bin/codebase-memory-mcp.exe`, versión 0.9.0 al 2026-08-11) — no se encontró referencia en el repo ni en la sesión que lo instaló originalmente.
- **F8-02/F8-03** — Notificaciones por Email/WhatsApp bloqueadas: falta credenciales de un proveedor externo (Resend/Meta Business) **y** escribir el código de integración (verificado 2026-08-03: ninguna edge function llama a Resend ni a la API de WhatsApp/Meta todavía — solo existen las de Mercado Pago). Plantillas de WhatsApp ya redactadas en `docs/WHATSAPP_TEMPLATES.md`.
- **F11-04** — Dominio propio: requiere que el usuario compre un dominio (decisión de costo). Hoy corre en `proyectopdisc.vercel.app`. Pasos para cuando se compre uno, en `docs/DEPLOY.md`.
- **F11-06** — Cargar comercios reales: las 14 tiendas son datos de seed. El conteo de productos es incierto sin acceso a la DB real: los archivos de seed (`db/schema/04_seed_mock_data.sql` + `06_seed_10_stores_and_products.sql`) suman 56, pero la última auditoría contra la base real (2026-07-08, ver skill `progreso-baradero-local`) había medido 64 — probablemente se cargaron productos sueltos a mano después del seed. No se pudo re-verificar en la sesión 2026-08-03 (sin credenciales de Supabase). Falta que vendedores reales se registren y sean aprobados (el flujo ya funciona).
- **Resuelto 2026-08-28** — **`orders.client_id`/`store_id` eran `NOT NULL` pese a estar declaradas `ON DELETE SET NULL`**: la cascada intentaba escribir NULL, la restricción lo rechazaba y el DELETE del padre fallaba entero. O sea que **no se podía borrar una cuenta con ningún pedido, ni una tienda con ningún pedido**. Apareció al probar `delete-account` con una cuenta de descarte (daba 500). Migración `62_orders_nullable_on_delete.sql`. **Gotcha para el futuro:** la consulta que caza esta clase de bug es buscar FK con `confdeltype='n'` cuya columna tenga `attnotnull` — al 2026-08-28 da 0 filas.
- **Resuelto 2026-09-17** — los radios "Cliente / Vendedor" del registro
  **ya hacen algo**. Venían de la migración 23 y eran decorativos: los dos
  terminaban en `home.html`, así que quien marcaba "Vendedor" no notaba
  ninguna diferencia. Ahora quien elige "Vendedor" aterriza en `vender.html`
  (el alta de comercio), que es el flujo real para pedir el rol. **No cambia
  nada de seguridad:** `handle_new_user()` sigue forzando `role='cliente'`
  para toda cuenta nueva a propósito -- dejar que el cliente eligiera su rol
  era una escalada de privilegios --, lo único que cambia es dónde queda
  parada la persona. El destino se resuelve en `paginaPostRegistro()`
  (`js/register.js`) y se aplica en los **tres** caminos de salida del
  registro, que es lo fácil de pasar por alto: la sesión inmediata
  (`window.location.replace`), el `emailRedirectTo` del link de confirmación
  por correo, y el `redirectTo` del OAuth de Google. De paso, la pantalla:
  "Recomendado para nuevos usuarios!" pasó a describir qué hace cada opción,
  y se corrigieron los dos tuteos que quedaban ("Registra tu negocio",
  "¿Ya tienes una cuenta? Inicia sesión aquí") -- el resto del sitio vosea.
- **F12-18** — Facturación/AFIP: fuera de alcance de código desde el principio (ver `docs/ROADMAP.md` sección 17.1).
- **F10-02** — Tests E2E con Playwright: diferido a propósito, opcional en el roadmap.
- **Backlog mencionado por el usuario (2026-07-10), sin abordar aún**: pulido de responsive en detalles sin especificar; apps nativas (App Store/Google Play) recomendadas pero no iniciadas.
- **Resuelto** — sí hay admins asignados en producción: 4 cuentas con `role: admin` en `raw_app_meta_data` (verificado 2026-09-14 contra `auth.users`): `shueywater@gmail.com`, `bianberayra@gmail.com`, `keilakrausnl08@gmail.com`, `alganarasberenice@gmail.com`. Se asignan a mano en el dashboard de Supabase, Authentication → Users → `raw_app_meta_data` → `{"role": "admin"}`.
- **Resuelto 2026-08-05** — color/tipografía oficial decidido: `#284175` (azul oscuro, ya era el "ancla" documentado) + Inter. Se descubrió al resolver esto que `Assets/styles/styles.css` (la supuesta "fuente de verdad") no lo carga ninguna página real — `home.css` sí, y de ahí heredan `admin.css`/`carrito.css`/`product-modal.css` vía `var()`. Se apuntaron esos tokens (`--bl-primary`) y los hex/`rgba()` sueltos de `product-modal.css`/`admin.css`/`auth.css` al ancla; `styles.css` queda sin usar (no se borró). Detalle completo en `docs/brand-guidelines.md` (secciones 1 y 2).
- **Resuelto 2026-08-28** — **baja de cuenta real, probada de punta a punta** con dos cuentas de descarte: guarda de comercio → 409, guarda de pedido pagado → 409, borrado real → 200 y se fue el usuario, el perfil, la identidad, las direcciones y los favoritos, mientras el pedido completado **sobrevivió con `client_id` en NULL** y su total intacto (el comercio conserva la venta). "Eliminar mi cuenta" ya no deja un ticket que nadie procesa; la Edge Function `delete-account` (desplegada, `verify_jwt: true`) borra la cuenta con la service role key. El uid sale siempre del JWT del llamador, nunca del body. Bloquea con 409 si la persona tiene comercio (`stores.owner_id` es CASCADE: se llevaría productos, cupones y credenciales de MP) o pedidos en curso. Los pedidos sobreviven anonimizados (`orders.client_id` es SET NULL), así que el comercio conserva su historial de ventas. Si la función no respondiera, el front cae solo al ticket de antes (`requestDeletionByTicket()` en `js/perfil.js`).
- **Resuelto 2026-08-28** — **fotos huérfanas en Storage**: al quitar una foto de un producto (o borrar el producto entero) ahora se borra también el objeto del bucket `products`, no solo la fila. El parseo de URL pública → ruta del bucket vive en `js/storage-utils.js` (`publicUrlToStoragePath`/`removeStoredObjects`, sin imports, con `node js/storage-utils.test.mjs`) y lo usan tanto `vender.js` como `perfil.js` (avatares). **Gotcha:** no se puede listar la carpeta para limpiar — el bucket `products` no tiene policy de SELECT en `storage.objects`, así que `list()` devuelve vacío sin avisar; por eso se rastrean las URLs que tenía el producto al abrir el formulario (`savedImageUrlsAtLoad`). Las fotos huérfanas **anteriores** a este fix siguen ahí: haría falta una limpieza puntual con service role.
- **Resuelto 2026-08-28** — "Información de tu perfil" pasó de ser tres datos de sólo lectura (nombre, email, rol) a la sección de datos completa: foto de perfil (bucket `avatars` nuevo), nombre, fecha de nacimiento, documento, teléfono, estado de verificación del email, método de ingreso, cambio de contraseña, antigüedad de la cuenta y privacidad (descargar mis datos / pedir la baja). Cada dato se edita en su propia fila, no en un formulario entero. Migración `61_profile_personal_data.sql` (columnas `birth_date`/`doc_type`/`doc_number` + bucket `avatars` con policies por carpeta `{uid}/`). Los campos se declaran en `js/profile-fields.js` (sin DOM, para poder correr `node js/profile-fields.test.mjs`).
- **Resuelto 2026-08-25** — `Assets/styles/perfil-custom.css` (página "Mi perfil") ya no usa su tercer azul propio (`hsl(220, 72%, 46%)`): sus tokens `--bl-perfil-primary`/`--bl-perfil-primary-hover` ahora apuntan a `var(--bl-primary)`/`var(--bl-primary-dark)` (el ancla `#284175`). Se unificó al rediseñar la página como hub de tarjetas estilo Mercado Libre (rama `rediseno-perfil-hub`); de paso se sacaron los `rgba(37,99,235,…)` sueltos y el degradé azul/violeta del badge de rol.
- **Resuelto 2026-08-28** — el link "Términos" del menú superior del footer (distinto del link de abajo, "Términos y condiciones") apuntaba mal a `info.html` en vez de `terminos.html`, en `home.html`, `search.html` y `comercios.html`. Corregido en los tres.
- **Resuelto 2026-08-28** — se borró `docs/BACKLOG_MEJORAS.md` (backlog priorizado P0-P4 post-lanzamiento) a pedido del usuario. El backlog de pendientes vigente queda solo en esta sección ("Pendientes activos"); se limpiaron de paso las referencias muertas al archivo que quedaban en `docs/MIGRACIONES_PENDIENTES.md` y en el skill `progreso-baradero-local`.

## Scripts de tooling

- `scripts/jira-move.mjs <KEY> <progress|done|todo>` — cambia estado de subtareas.
- `scripts/jira-create-subtasks.mjs` — creó el tablero de M1 (Fase 0+1) en Jira.
- `scripts/jira-create-subtasks-m2-m11.mjs` — creó el tablero de M2 en adelante (Fases 2-11) en Jira.
- `scripts/jira-commit-log.mjs` — hook `post-commit`: cierra las subtareas referenciadas en el commit. **Ojo:** el regex busca `A113-\d+` en TODO el mensaje — no escribas un rango tipo "A113-172 a A113-237" en el cuerpo del commit, cierra esas claves literalmente aunque no sea la intención (pasó en esta sesión, hubo que reabrirlas a mano).

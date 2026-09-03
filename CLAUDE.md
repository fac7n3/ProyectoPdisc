# CLAUDE.md — Baradero Local (Proyecto-Pdisc)

> Contexto del proyecto para Claude Code. Se auto-carga cada sesión y **viaja con el repo**
> (sirve para trabajar desde cualquier computadora). **Mantener actualizado al completar cada tarea.**
> Última actualización: 2026-09-02. Estado: M1-M11 completos; Fase 12 completa salvo F12-18
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
Objetivo definido: **lanzamiento real**. Roles: `cliente`, `vendedor`, `repartidor` (planeado), `admin`.
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
- **Radios "Cliente / Vendedor" del registro no hacen nada** (visible desde el arreglo del flujo de registro, 2026-08-15, pero venía de la migración 23): `register.html` muestra el selector de tipo de cuenta, pero `handle_new_user()` fuerza `role='cliente'` para todo usuario nuevo a propósito (era una escalada de privilegios). Elegir "Vendedor" ahí no cambia nada — hay que pedirlo después por el flujo de aprobación. Decidir si se saca el selector o se convierte en un "quiero vender" que abra ese flujo.
- **F12-18** — Facturación/AFIP: fuera de alcance de código desde el principio (ver `docs/ROADMAP.md` sección 17.1).
- **F10-02** — Tests E2E con Playwright: diferido a propósito, opcional en el roadmap.
- **Backlog mencionado por el usuario (2026-07-10), sin abordar aún**: pulido de responsive en detalles sin especificar; apps nativas (App Store/Google Play) recomendadas pero no iniciadas.
- Nadie tiene el rol `admin` asignado todavía en producción (asignar a mano en el dashboard de Supabase, Authentication → Users → `raw_app_meta_data` → `{"role": "admin"}`) — necesario antes de poder usar el panel de admin con una cuenta real.
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

# CLAUDE.md — Baradero Local (Proyecto-Pdisc)

> Contexto del proyecto para Claude Code. Se auto-carga cada sesión y **viaja con el repo**
> (sirve para trabajar desde cualquier computadora). **Mantener actualizado al completar cada tarea.**
> Última actualización: 2026-11-03. Estado: M1-M11 completos; Fase 12 completa salvo F12-18
> (facturación/AFIP, fuera de alcance). Las 18 mejoras de A113-266 (rama `feature/mejorasGrupo`)
> ya mergeadas a `main`. Detalle línea por línea de cada fase/tarea (F0-F12, bugs
> corregidos, decisiones de diseño, gotchas de RLS/triggers): skill `progreso-baradero-local`
> (se carga solo cuando hace falta consultar el historial). Pendientes abiertos y reglas vigentes:
> sección "Pendientes activos" más abajo. **Historial de lo ya hecho: `docs/HISTORIAL-PENDIENTES.md`** (no se carga solo).

> ## ⚠️ PRIMERA ACCIÓN DE CADA SESIÓN
> **Antes de cualquier otra cosa, correr `git pull`.** El repo se trabaja desde
> varias máquinas/sesiones — el local puede estar varios commits atrás de
> `origin/main` sin que se note (pasó el 2026-08-05: 23 commits de diferencia,
> incluyendo todo el trabajo de identidad de marca). Si hay cambios locales sin
> commitear, evaluar antes de pull (stash si hace falta).

## ✅ Reglas esenciales antes de trabajar
1. **`git pull` en `main`** siempre primero (ver aviso arriba).
2. **Todos los cambios van directo a `main`** (decisión del usuario, 2026-10-28: todavía no estamos en producción real, así que no hace falta una rama por tarea ni PR). Si la sesión arranca en una rama propia, se pushea a `main` igual (`git push origin <rama>:main`) una vez que `git fetch` confirma que `main` no tiene commits nuevos; si los tiene, traerlos antes (merge, nunca `reset --hard`). **Volver a una rama por tarea + PR cuando haya usuarios reales.**
3. El commit que cierra una tarea debe incluir la clave `A113-XXX` (hook `post-commit`, ver "Flujo de trabajo y tracking"). **Ojo:** cada push a `main` dispara deploy automático a Vercel (`proyectopdisc.vercel.app`) — pushear cuando la tarea esté terminada y probada, no a mitad de camino.
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
- **Pagos:** ✅ Mercado Pago real (Checkout Pro, F2-07) + transferencia con comprobante + simulado (solo para testing interno). **Desde el 2026-10-16 `MP_ACCESS_TOKEN` es el de PRODUCCIÓN** de la app "Baradero Local" (cuenta de MP `3535220284`, confirmado por el usuario con el sufijo del token y el prefijo de una preferencia real): los cobros con el token global (los combos de "Impulsá tus ventas") mueven **plata real**; las tarjetas de prueba ya no sirven. Antes eran credenciales de prueba (usuario `3534929376`). Revisar que `MP_CLIENT_ID`/`MP_CLIENT_SECRET` sean también los de producción de esa app.
- **Envíos:** ambos (retiro en local + envío dentro de Baradero).
- **Verificación de vendedor:** aprobación manual del admin **+** validar CUIT.
- **Precios:** **PESOS enteros** en todo el sistema (sin centavos). ✅ DB migrada a `price`/`total_price` (pesos) en F0-03 (migración 12); `price_cents` ya no existe.
- **Fotos del Drive para productos (regla permanente, pedido del usuario 2026-10-06):** toda foto
  que se suba al Drive de la cuenta y se use en la página tiene que **coincidir con lo que dice el
  producto**: nombre, descripción y opciones salen de lo que se ve en la foto (marca, variedad,
  cantidad, presentación), no del nombre del archivo ni de lo que "debería" ser. El sufijo del
  nombre del archivo dice el rubro (`panaderia`, `perfumeria`, ...): va a la categoría de ese nombre
  (`perfumeria` -> Perfumería, `limpieza` -> Limpieza). Antes de usar una foto,
  mirarla: se descartan las que tienen marca de agua de otro sitio, las que no muestran lo que
  dice el nombre y las de góndola con muchas marcas. Si una foto muestra variantes (colores,
  fragancias, sabores), van como opciones del producto (`product_options`). Las fotos van al repo
  (`public/img/productos/` + `dist/img/productos/`, webp cuadrado 800 px, más su miniatura con `npm run thumbs`): el CSP no deja cargar
  imágenes de otro host y el sandbox no llega a Supabase Storage.

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
- **Al completar cada tarea**: agregar el detalle al skill `progreso-baradero-local` (`.claude/skills/progreso-baradero-local/SKILL.md`) y, si deja un pendiente abierto o una regla nueva, actualizar "Pendientes activos" acá abajo (**sin agregar entradas "Hecho"**: esas van al skill; este archivo se carga en cada sesión y tiene que seguir corto).
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

> **Historial completo** de cada tarea hecha (153 entradas, 2026-08 a 2026-11-03, texto original):
> [`docs/HISTORIAL-PENDIENTES.md`](docs/HISTORIAL-PENDIENTES.md). Detalle técnico fino por tarea: skill
> `progreso-baradero-local`. **Al terminar una tarea:** detalle al skill, y acá solo si deja un pendiente
> abierto o una regla nueva (no se acumulan entradas "Hecho" en este archivo).

**Última tanda (2026-11-04, auditoría general, tanda 4, migración 156 aplicada):** toda imagen que se sube se comprime en el navegador (`js/image-compress.js`; antes no se achicaba nada y había fotos de 1,3 MB y un logo de 361 KB en el Storage), el conteo de categorías lo hace la base (`featured_category_counts`) y Comercios dejó de traer productos anidados (respuestas 57 -> 8 KB). Detalle: skill, entrada "2026-11-04".

**Tanda anterior (2026-11-03, videos + avisos + home, migraciones 154 y 155 aplicadas):** videos opcionales en productos y en la galería de
profesionales, avisos unificados en `js/notice.js` (una pila arriba a la derecha, diseño plano), comparador "mismo producto en otros
comercios" en la ficha, y home más largo (6 espacios de banner nuevos `mosaic_g..l`, "Seguí descubriendo" con "Ver más productos"). Detalle: skill,
entrada "Videos, avisos unificados...".

**Dos tandas antes (2026-11-03, auditoría general tandas 1 a 3, migraciones 152 y 153 aplicadas):** logger de errores sin ruido de
localhost, Inter y Font Awesome servidos desde el sitio (CSS+fuentes de ~400 KB a ~41 KB), 0 problemas WCAG A/AA en
las páginas públicas, canónica + JSON-LD + `sitemap.xml` en cada build, vista previa propia al compartir un producto
o comercio (`middleware.js`), límite de llamadas anónimas (cupones/vistas/búsquedas/métricas), service worker v2 y
fotos de producto en dos tamaños (`srcset`). Detalle: skill, entradas "2026-11-03".

### Pendientes que necesitan al usuario (no se resuelven con código)
- **Supabase (dashboard):** activar "Leaked password protection" (Authentication -> Policies); activar **TOTP** (Authentication ->
  Multi-Factor) y que las 3 cuentas admin/moderador enrolen, **recién ahí** `update public.security_settings set require_staff_mfa = true, updated_at = now() where id;`;
  aplicar la política de contraseñas de `supabase/config.toml` (P-04).
- **Backups (P-02):** el plan Free no tiene; pasar a Pro o cargar `SUPABASE_DB_URL` + `BACKUP_PASSPHRASE` para `backup-db.yml` (sin probar).
- **Dominio (2026-11-12):** el usuario pidió `baraderolocal.vercel.app`; ya está agregado al proyecto de Vercel (verificado, responde 200) y
  **el viejo `proyectopdisc.vercel.app` sigue andando** (no se redirige). **El código no se tocó**: las Edge Functions de Mercado Pago, el
  sitemap y los mails siguen con el dominio viejo por defecto. Para que login con Google, mails y Mercado Pago vuelvan al nuevo hay que
  cargar `https://baraderolocal.vercel.app` a mano en Supabase (Authentication -> URL Configuration: Site URL y Redirect URLs `.../**`),
  en la app de Mercado Pago (Redirect URL de OAuth `.../pages/vender.html`, igual a `REDIRECT_URI` de las funciones), en el secret/variable
  `SITE_URL` (Supabase y Vercel) y en Google Cloud si corresponde; recién después cambiar los defaults del código. Dominio propio de verdad (F11-04, decisión de costo): pasos en `docs/DEPLOY.md`. Con dominio: crear
  `soporte@...` (P-05) y poner `SITE_URL` en Vercel (sitemap/canónica/vistas previas lo toman solos).
- **Mail con marca:** el remitente de los emails de Auth dice "Supabase": hace falta Custom SMTP con un proveedor (Resend recomendado), y es el
  mismo bloqueante que **F8-02/F8-03** (notificaciones por email/WhatsApp; plantillas en `docs/WHATSAPP_TEMPLATES.md`; ninguna Edge Function las manda todavía).
- **Legales (hardening):** P-06 inscripción en el Registro Nacional de Bases de Datos (AAIP) y P-07 archivar los DPA de Supabase/Vercel/MP
  (`docs/seguridad/HARDENING-SOC2-ISO27701.md`). Los Términos del envío (5.1 a 5.6) los redactó Claude **sin revisión legal**.
- **Comercios reales (F11-06):** las tiendas son de seed/prueba; faltan vendedores reales aprobados. Hoy solo 2 comercios vincularon Mercado Pago
  y casi ninguno cargó alias/CBU o la ubicación del local (son de prueba; avisarles a los reales).
- **Fotos con licencia dudosa:** ya no hay productos con las de jean, medias, collar y asado (el 2026-11-04 se borraron los productos con imágenes genéricas, ver skill). Si vuelve a aparecer alguna foto de repos públicos sin licencia, reemplazarla antes del lanzamiento.

### Pendientes de desarrollo abiertos
- **Impulsá tus ventas: servicios + planes nuevos (migración 160 APLICADA en Supabase el 2026-11-12, en tres partes 160a/160b/160c; Edge Function `mp-create-boost-preference` v7 desplegada):** 9 servicios sueltos (`boost_services`) y planes Base/Intermedio/Pro (`boost_plan_items`) según la planilla de costos; tope por comercio (`max_per_store`) controlado en la base; el admin otorga/quita beneficios por email en "Beneficios de comercios" (`js/admin-beneficios.js`). Salió a `main` después de aplicar la migración y desplegar la función (el frontend nuevo necesita las dos). **Desde el 2026-11-12 "Elegir este combo" / "Comprar" / "Consultar" abren WhatsApp** (`wa.me/<SUPPORT_WHATSAPP>` de `js/support-contact.js`, hoy 5493329123456, el mismo del pie de página) con el mensaje "Hola, soy de <local> y estamos viendo de obtener <combo o servicio>": el pago se coordina por ahí y el equipo activa el beneficio desde Admin -> Beneficios de comercios. Todos los botones quedan habilitados (el equipo decide renovaciones, cambios de combo y topes); la compra con Mercado Pago (`mp-create-boost-preference`, `create_*_purchase`, `mp-webhook`) sigue desplegada pero la pantalla ya no la usa. "Impulsar" tiene pestaña propia en el menú (debajo de Ventas, solo dueño). Plan de vuelta atrás: revertir el merge en `main` y reactivar los combos viejos con `update boost_plans set is_active = true where id in ('local','barrio','baradero')`. **Operación del equipo (2026-11-12, migración 161 aplicada):** Admin -> "Beneficios de comercios" tiene filtros (texto, estado, combo/servicio), tarjeta "Renovaciones: recordales que abonen" (vencen en 3 días o menos o vencieron esta semana; botón para avisar al comercio por WhatsApp con el `stores.whatsapp` y botón "Renovar +30 días" = `admin_extend_benefit`, que es la única forma de registrar una renovación: `admin_grant_benefit` la rechaza por los topes), tarjeta "Redes sociales: historias para resubir", aviso de compras en revisión e insignia en el menú. **El recordatorio de renovación va a los ADMINS, no al comercio** (la renovación se habla en privado): pg_cron `remind-expiring-boosts` todos los días 10:37 (Argentina) -> `remind_expiring_boosts()` deja una notificación `boost_renewal_reminder` a cada admin, una vez por compra y por fecha de fin (`boost_expiry_reminders`); la campanita lleva a `admin.html#benefits`. Automático hoy: "Negocios principales" (fila de locales) y "Productos recomendados" (productos arriba) vía `get_active_benefits`; los banners los asigna el equipo (`home_promos`); Redes sociales, Posicionamientos y Estadísticas Pro los activa el equipo a mano (todavía no cambian nada solos). Supuestos de la planilla: "$2" de Banner chico = tope 2; "-" = **Redes sociales sin tope (confirmado por el usuario 2026-11-10: cada historia que suben la resubimos) y se compra de a 1, sin selector de cantidad (decisión 2026-11-12; la base sigue admitiendo hasta 10 por compra como resguardo)** y 1 en los posicionamientos; 30 días. Pendiente: "métricas pro" (a definir con el usuario). Sin probar con cuentas reales ni con plata.
- **E2E nivel 2 (con login):** el humo (`e2e/humo.spec.mjs`) no cubre comprar, vender, panel de profesional ni admin: hace falta un proyecto o rama de Supabase de prueba con cuentas propias para no ensuciar producción.
  El test del comparador se saltea si hoy ningún producto del home está en más de un comercio.
- **Drive (2026-11-04):** todas las carpetas ya están importadas (la de Ferretería se cargó en la 158; "Kitchen-Live" son documentos de otro proyecto). Quedan solo las ~162 fotos chicas (< ~40 KB) de la tanda 144 que el conector no baja. **Al listar carpetas del Drive, paginar siempre con `nextPageToken`** (la primera página trae solo 5): una carpeta de Ferretería se dio por inexistente por no hacerlo.
- **Videos y banners nuevos, sin probar con cuentas reales:** subir un video como vendedor y como profesional (30 MB, MP4/WebM/MOV; no hay transcodificación, un MOV de
  iPhone puede no verse en todos los navegadores), y que el admin asigne comercios a los espacios `mosaic_g..l` (hoy muestran el cartel fijo). "Seguí descubriendo" ya se probó con el IntersectionObserver real (e2e).
- **Números de migración reservados:** 61-65 los tiene la rama sin mergear `feature/logistica-terceros` (no reusarlos). La 73 (adjuntos de soporte) y la 66 ya están aplicadas.
- **Mercado Pago por tienda (A113-274):** falta elegir el método de pago **por comercio** dentro de un mismo carrito (hoy es uno para todo), verificar que
  `MP_CLIENT_ID`/`MP_CLIENT_SECRET` sean los de producción (`MP_ACCESS_TOKEN` ya lo es) y probar con una cuenta real (vincular, pagar en cadena, que `mp-webhook` confirme).
  Sin probar con plata: combos "Impulsá tus ventas" (cobran con el token global) y compra común tras `mp-webhook` v7.
- **Buscador:** etapa 2 hecha (159: ventas/vistas/reseñas/oferta/stock/diversidad + cercanía); la cercanía no hace nada hasta que los comercios carguen su ubicación (hoy 0 de 32). Falta: etapa 4 (similares, comprados juntos, "para vos"), envío como señal, orden "Más cerca", y la pantalla de `admin_search_report`. Pesos del ranking: ver la 159, ajustarlos mirando ese reporte.
- **Restos sin uso:** columna `stores.free_shipping_threshold` (un frontend viejo en caché aún la pide) y el bucket vacío `store-banners` (hay que borrarlo desde el dashboard/API de Storage: por SQL no deja). `confirm_simulated_payment` y `release_delivery` **siguen en uso** (proveedor simulado de pago y panel del repartidor), no borrarlos. `Assets/styles/styles.css` no lo carga ninguna página pero es la fuente de verdad que citan los documentos de marca: no borrarlo sin actualizar `docs/brand-guidelines.md`, `Assets/design-tokens.*` y `video/`. `product_variants` ya se borró (migración 157).
- **Mejoras identificadas, sin hacer:** en celular (<= 768 px), abrir el mega menú de categorías, la campanita o el menú de cuenta con la página scrolleada hace saltar el navbar fuera de la pantalla (`home.css` ~1275 traba `html` **y** `body`, la misma trampa del `sticky`; hay que probarlo en iOS Safari antes de sacar el `body`), CSS por página (`home.css` + `dark-auto.css` cargan en todas), sacar `'unsafe-inline'` del CSP, partir `vender.js`/`perfil.js`/`admin.js`, prueba de punta a punta de una compra (F10-02), notificaciones web push, mover la base a
  `sa-east-1` (cada pedido desde Argentina suma ~245 ms), apps nativas, F12-18 (facturación/AFIP, fuera de alcance).
- **Sin probar con cuentas reales / en teléfono:** casi todo lo de paneles logueados (vendedor, profesional, repartidor, admin), el GPS del mapa del local,
  MFA con una app de autenticación real, el tope de cupones de punta a punta (el sandbox sale por IPs que rotan), instalar la app en un celular.

### Reglas y gotchas vigentes (resumen; el porqué y el caso en `docs/HISTORIAL-PENDIENTES.md`)
**Base de datos y migraciones**
- **Numerar con cuidado:** mirar `list_migrations` de Supabase **y** `db/schema/` antes de elegir número (colisiones reales: 74/75, 107/108, 117/118, 138/139, 146-151). Último en el repo: **161** (`recordatorio_renovacion_impulsar`, aplicada en Supabase; la 160 `boost_servicios_y_beneficios` se aplicó como 160a/160b/160c; antes la 159) (`search_ranking_senales_y_cercania`; la 158 es `get_cart_catalog`, copia a mano la policy de `products`) (el 154 y el 155 son de la tanda de videos; la 156 se aplicó en Supabase como `154_consultas_livianas`) (la 73 se aplicó el 2026-11-03). Los archivos se
  aplican por el conector, no hay runner: lo que está en producción manda (`pg_get_functiondef`), no el archivo.
- **Conector de Supabase:** `DROP`, `DELETE` y bloques con cosas sensibles piden una confirmación en pantalla y se cortan a los 60 s si nadie la acepta. Salidas: `execute 'de' || 'lete ...'`, aplicar en partes
  (sin `drop`), y probar antes con un `DO` que termina en `raise exception 'RESULTADO %'` (se deshace solo). `apply_migration` de un `create index`/`create or replace` va al instante.
- **Roles:** policies y funciones leen el rol con `public.jwt_role()` / `(select public.jwt_role())`, **nunca** `auth.jwt()->'app_metadata'->>'role'` (MFA aal2). **Para saber QUIÉNES son los admins (ej. a quién mandarle un aviso) se usa `auth.users.raw_app_meta_data->>'role' = 'admin'`, nunca `profiles.role`:** en producción ninguna cuenta admin lo tiene en `'admin'` (son `cliente` o `vendedor`, es un valor de un solo uso por cuenta). `profiles.role` solo cambia con
  `set_config('app.role_change_authorized','true',true)`; `handle_new_user()` fuerza `cliente` a propósito. Una cuenta es comercio **o** profesional.
- **Pedidos:** `create_order` es el único camino para crear uno; `orders.status` no se toca por la API (RPC del flujo); los avisos de pedido los manda el trigger `orders_after_change` (no agregar `create_notification` sueltos).
  Cupones, envío y totales: `js/cart-totals.js` copia la aritmética del RPC (tienda por tienda, redondeo por tienda). Efectivo solo con retiro. Envío gratis no existe (solo `delivery_fee`).
- **Funciones que copian a mano una policy** (`get_product_detail`, `get_cart_catalog`, `get_store_orders`, `get_courier_panel`): si cambia la policy, cambiar la función. Medir consultas **con sesión iniciada** (las policies encadenadas multiplican x10 el plan).
- **Privacidad:** dato personal nuevo = responder las 4 preguntas de `docs/seguridad/POLITICAS-SEGURIDAD.md` §1; si es telemetría, sumarlo a `purge_expired_personal_data()` y a `REGISTRO-TRATAMIENTOS.md`/privacidad. Tabla nueva: RLS activo, sin policies ni grants hasta que haga falta.
- **Cuentas de prueba** (`proyectopdisc+xxx@gmail.com`): la contraseña no está en el repo. Las 14 tiendas de seed tienen `owner_id` de una cuenta admin (por eso "Dueño de..." no aparece en esa cuenta).

**Sitio (frontend)**
- **CSP:** se define UNA vez en `scripts/sync-csp.mjs` (base + extras por página); después de tocarla correr `node scripts/sync-csp.mjs` para volcarla a los 22 HTML (`js/csp.test.mjs` falla si quedaron distintos). `https://` y `wss://` de Supabase son esquemas distintos. No hay fuentes, CSS ni scripts de otros dominios.
- **Colores:** tokens de `home.css`/`dark.css`; los colores fijos de CSS se espejan solos con `node scripts/gen-dark-css.mjs` (`dark-auto.css` es GENERADO: el test falla si quedó viejo); los de JS en línea van con tokens.
  Para **texto** verde/rojo usar `--bl-success-text`/`--bl-danger-text`, estrellas `--bl-star`, texto apagado `--bl-text-muted` (#5f6b7d); `--bl-success`/`--bl-danger` son para fondos. Estilos compartidos del navbar van en `home.css`.
- **Avisos y videos:** un aviso corto = `notify(mensaje, 'success'|'error'|'warning')` de `js/notice.js` (los `showToast` viejos ya delegan ahí); nunca un toast ni un
  `<div id="toast">` propios. Los videos (`products.video_url`, `professional_promos.media_type='video'`) se validan con `videoFileProblem` y se muestran solo con
  `safeVideoUrl`; el CSP de las 22 páginas lleva `media-src 'self' blob: https://*.supabase.co` (`js/csp.test.mjs` lo exige). Sin Python no se pueden sumar íconos de
  Font Awesome: reusar uno que ya esté en `public/vendor/fontawesome/css/all.min.css`.
- **Botón que exige sesión:** si el visitante no inició sesión, llamar `promptLogin(mensaje)` de `js/login-prompt.js` antes de avisar/redirigir; en celular (<= 768 px) muestra el cartel central "Iniciá sesión" y devuelve `true` (cortar ahí), en compu devuelve `false` y sigue el aviso de siempre. Ya conectado en finalizar compra, comercio favorito, avisarme de stock, pedir presupuesto, publicar/reportar reseña. Un botón nuevo con esa condición tiene que usarlo.
- **Detalle largo en pantalla:** un "ver más" que no entra en una tarjeta se abre con `openDetailDialog` de `js/detail-dialog.js` (ventana central sobre fondo oscuro, X/Cerrar/Esc/clic afuera, foco devuelto, scroll del fondo trabado **solo en `html`**; estilos `.bl-detail-*` en `pages/vender.html`). No usar `<details>` que estire la tarjeta. **Nunca poner `overflow` en el `body` para trabar el scroll:** `a11y.css` le da `overflow-x: clip` justo para que no sea contenedor de scroll, y con `hidden` el navbar y el menú lateral (`position: sticky`) se van al principio de la página y desaparecen (`js/detail-dialog.test.mjs` lo vigila). Para probar pantallas del panel usar el shell real (navbar + menú + contenido de `pages/vender.html`), no tarjetas sueltas, y medir el texto desbordado con `scrollWidth > clientWidth`.
- **Avisos programados a cuentas:** tabla de "ya avisado" con RLS activo y sin policies ni grants (guardando la fecha o clave por la que se avisó, así un cambio vuelve a avisar sin borrar filas) + función `SECURITY DEFINER` con `revoke all` + `cron.schedule` con nombre fijo (patrones: migraciones 133, 150 y 161). Las notificaciones nuevas se registran en `js/notifications-utils.js` (etiqueta, tono, detalle y acción por tipo); si el texto necesita lógica, va en una función pura testeable (ese archivo importa el cliente de Supabase y no se puede cargar en Node).
- **Íconos y fotos:** ícono nuevo de Font Awesome = escribirlo y correr `npm run subset-icons` (Python con `fonttools` y `brotli`; el test falla si falta); los de categorías salen de `js/category-icons.js`. Foto nueva en
  `public/img/productos/` = correr `npm run thumbs` (miniatura de 520 px en `s/`; el test falla si falta) y usar `setProductImage` (`js/product-image.js`) al dibujar tarjetas. Fotos del Drive: ver "Decisiones de producto".
- **Páginas nuevas:** `vite.config.js` (input), `scripts/sitemap.mjs` (`STATIC_PAGES`, si es pública), `public/robots.txt` (si es privada), CSP, script de tema en el `<head>` + `dark.css` + `theme.js` (lo exige `npm test`).
- **`dist/` se versiona:** al mergear, conflictos de `dist/` se resuelven con la versión de `HEAD` y se reconstruye una vez al final (`npm run build`, necesita `.env` local con `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`).
- **Vercel:** `middleware.js` (vista previa para robots, solo en producto/comercio) y `vercel.json` (headers, caché, redirect de `/`). `/assets/*` es `immutable`; `/img` 1 día y `/vendor` 7 días con revalidación.
- **Trampas conocidas:** `window.open` después de un `await` lo bloquea el navegador (abrir antes, navegar después); fechas con `localIsoDate()` (no `toISOString()`, que es UTC); `buildStarRating` es solo
  del formulario, para mostrar usar `buildStarsText`; `history.replaceState` en `perfil.js` pasa `window.history.state`; un `data-tooltip` en un botón pegado al borde derecho necesita anclaje; Realtime: los DELETE no se pueden filtrar y
  `user_carts.items` se compara con `canonicalJson`; los tests con `page.routeWebSocket` **no pasan por el CSP**; en `vite preview` Speed Insights no existe (el logger ya ignora localhost).
- **Subidas de imágenes:** toda foto que un usuario sube pasa por `compressImage(file, uso)` (`js/image-compress.js`: WebP, lado máximo por uso, devuelve el original si falla); una subida nueva
  tiene que hacer lo mismo, y comprimir **antes** de validar el peso. Lo ya subido no se achica solo (re-subir desde el panel).
- **Consultas:** no bajar filas para contarlas ni `select *`/embeds que la pantalla no usa (medir con las respuestas de `rest/v1` en la pestaña de red); los conteos van a una función SQL (`featured_category_counts`).
- **Notificaciones/paneles:** el alcance por panel sale de `currentPanelScope()`; el puntero "último aviso" es de toda la cuenta.

**Cómo probar en este entorno**
- El sandbox **sí llega a Supabase** y a `proyectopdisc.vercel.app`, pero sale por un grupo de IPs que rota. Al probar contra producción con Playwright, **bloquear toda escritura** (todo salvo GET y las RPC de lectura:
  `log_*`, `increment_professional_metric`, `report_review` escriben). Para un deploy de prueba de una rama: `get_access_to_vercel_url` da el link con permiso.
- **Pruebas e2e (humo del sitio público):** `npm run test:e2e` (Playwright, carpeta `e2e/`, config `playwright.config.mjs`). Abre las páginas públicas en un navegador real contra
  `vite preview` del `dist/` versionado y falla ante excepciones, `console.error`, violaciones de CSP, respuestas >= 400 o hosts de terceros; **corta toda escritura a Supabase**
  (solo deja pasar GET y las RPC `get_*`/`search_*`/`same_product_offers`/`nearby_*`/`list_*`/`featured_category_counts`; `log_*` se corta sin fallar). Local usa el Chrome instalado (`PW_CHANNEL`); en CI, un job `e2e` aparte.
  Si se prueba algo nuevo del sitio público, sumarlo a `e2e/humo.spec.mjs`. Prueba el `dist/` tal cual está: si se tocó código, reconstruirlo antes.
- `npm test` (`scripts/run-tests.mjs`, anda también en Windows) corre 47 archivos (necesita `npm ci`; no hace falta Python). `pkill -f "vite preview"` mata también la propia shell: cortar por puerto (`lsof -t -i:4173`).

## Scripts de tooling

- `scripts/jira-move.mjs <KEY> <progress|done|todo>` — cambia estado de subtareas.
- `scripts/jira-create-subtasks.mjs` — creó el tablero de M1 (Fase 0+1) en Jira.
- `scripts/jira-create-subtasks-m2-m11.mjs` — creó el tablero de M2 en adelante (Fases 2-11) en Jira.
- `scripts/jira-commit-log.mjs` — hook `post-commit`: cierra las subtareas referenciadas en el commit. **Ojo:** el regex busca `A113-\d+` en TODO el mensaje — no escribas un rango tipo "A113-172 a A113-237" en el cuerpo del commit, cierra esas claves literalmente aunque no sea la intención (pasó en esta sesión, hubo que reabrirlas a mano).

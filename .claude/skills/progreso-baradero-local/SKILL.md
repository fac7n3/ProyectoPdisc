---
name: progreso-baradero-local
description: Historial detallado de todas las fases completadas (F0 a F12) del proyecto Baradero Local — qué se hizo en cada tarea, decisiones tomadas, bugs corregidos, gotchas técnicos (RLS/triggers/SECURITY DEFINER), y qué migración SQL corresponde a cada cambio. Consultar cuando haga falta contexto de por qué algo está implementado de cierta forma, qué ya se probó, o el detalle de una fase/tarea puntual (ej. F2-07, P0-6, migración 53, F12-17).
---

# Historial de fases — Baradero Local

## El selector de tipo de cuenta del registro (2026-09-17)

`register.html` mostraba "Tipo de Cuenta: Cliente / Vendedor" desde la migración
23, pero era **decorativo**: los dos radios terminaban en `home.html`. Quien se
registraba con la intención declarada de vender no recibía ninguna señal de que
esa elección hubiera servido para algo, y tenía que descubrir por su cuenta el
botón "Vender" del home.

**Lo que NO se cambió, a propósito:** el rol. `handle_new_user()` fuerza
`role='cliente'` para toda cuenta nueva porque dejar que el cliente eligiera su
rol en el signup era una escalada de privilegios. Se mantiene la aprobación
manual del admin. Lo único que cambia es **dónde queda parada la persona**
después de registrarse.

**El detalle que es fácil pasar por alto:** el registro tiene **tres** salidas
distintas, y había que tocar las tres, no solo la obvia:

1. `data.session` presente (el proyecto no exige confirmar el correo) →
   `window.location.replace`.
2. Sin sesión, hace falta confirmar el correo → el destino lo decide el
   `emailRedirectTo` que viaja en el `signUp`, no el código de la página.
3. Google OAuth → el `redirectTo` del `signInWithOAuth`.

Las tres salen ahora de `paginaPostRegistro()`, que lee el radio marcado. El
aviso de "revisá tu correo" además aclara que al entrar va a caer en el
formulario de su negocio.

De paso, la pantalla: "Recomendado para nuevos usuarios!" era un consejo raro
cuando la elección no hacía nada, y pasó a describir qué hace cada opción; y se
corrigieron los dos tuteos que quedaban ("Registra tu negocio", "¿Ya tienes una
cuenta? Inicia sesión aquí"), los únicos de una pantalla en un sitio que vosea
en todos lados.

**Verificado en el navegador** que el `querySelector` del radio devuelve
`cliente` por defecto, `vendedor` al elegir esa tarjeta, y vuelve a `cliente`
al deseleccionar. El registro real de punta a punta no se pudo caminar: el
navegador del entorno no llega a Supabase.


## Panel de autogestión del profesional/técnico (2026-09-17) — migraciones 89-94

Convierte "Contratar" de un directorio que el profesional casi no podía tocar en algo que
puede administrar solo. Antes tenía un mini panel adentro de `vender.html`
(`#professional-panel-view`, ~130 líneas de markup y ~315 de `js/vender.js`) que solo
permitía pausar la publicación, editar oficio/descripción/teléfono/WhatsApp + las 12
columnas de redes, y subir hasta 6 fotos sin orden. **No podía cambiar su foto, su nombre
ni su rubro**: la foto se subía una única vez en el alta y después había que escribirle a
Soporte.

### Qué se construyó

Página propia `pages/profesional.html` + `js/profesional.js` (entrada, estado, resumen y
"Mis datos") + seis módulos de sección (`js/profesional-{servicios,disponibilidad,galeria,
consultas,resenas,metricas}.js`). Secciones: Resumen, Mis datos, Servicios y precios,
Horarios y zona, Fotos de trabajos, Consultas, Reseñas, Estadísticas, Notificaciones y
Soporte (las dos últimas embebidas con `renderNotificationsSection` /
`renderSupportSection`, que ya eran plug-and-play).

- **El shell no se reescribió**: `js/vender-shell.js` ya era genérico (opera sobre
  `#mc-sidebar`, `.mc-navitem[data-section]`, `.mc-content .mc-section`), así que se usa tal
  cual. Su `DEFAULT_SECTION` está fijo en `'resumen'`, y por eso la sección inicial del
  panel nuevo se llama igual — no hizo falta tocar el módulo.
- **CSS**: `Assets/styles/profesional.css`. Las clases base (`mc-`, `rs-`, `pf-`, `form-`)
  se extrajeron del `<style>` inline de `vender.html` con un parser por selector (los
  rangos por número de línea se cortaban mal), dejando afuera lo exclusivo del comercio
  (`.store-logo-picker`, `.social-row`, `.staff-perms`). Es una copia a propósito: el
  objetivo era que los dos paneles se vean hermanos sin refactorizar una página que ya está
  en producción.
- **Acento**: ámbar, el que el proyecto ya asocia al modo Oficios (`.oficios-mode-badge`),
  pero en tono **oscuro** `#b45309`. El ámbar de marca (`--bl-accent`) da 2.1:1 contra
  blanco y hay botones con texto blanco encima (`.form-btn`); el oscuro da 5.9:1 (AA).
- **Carga perezosa**: cada sección pide sus datos la primera vez que se muestra
  (`alMostrar(seccion, fn)` en `profesional.js`), no al abrir el panel. Entrar a "Mis datos"
  no dispara las consultas de las otras ocho.
- **Consulta del profesional sin `.maybeSingle()`**: `professionals` no tiene unique por
  `owner_id`, y en este proyecto ya pasó que una cuenta con dos filas rompiera un panel
  entero por el error de coerción (las 14 tiendas de seed, `js/vender.js`). Se usa
  `limit(1)` y se toma `[0]`.

### Migraciones (88-93, todas aplicadas a producción)

- **88** `professional_services`: título, descripción, `price_type` (`fixed`/`from`/`quote`)
  y `price_pesos integer` (pesos enteros, no `numeric`), con CHECK cruzado: "a convenir" no
  lleva número, los otros dos sí y positivo. Ordenables.
- **89** `professional_inquiries`: las consultas de presupuesto. Inserta **solo el vecino
  logueado** (sin captcha, una bandeja anónima sería spam; además hace falta la cuenta para
  mostrarle después "tus consultas"). **RLS no restringe por columna**, así que el "el
  profesional solo mueve el estado" va en un trigger (`protect_inquiry_content`), mismo
  patrón que `prevent_role_update_on_profile`. Trigger `notify_new_inquiry` →
  `professional_inquiry_new`.
- **90** `professional_metrics_daily`: contadores agregados con PK
  `(professional_id, event_type, day)`, **no** una tabla de eventos crudos — el volumen es de
  pueblo chico y solo se muestran totales de 30 días. **Sin policy de INSERT/UPDATE para
  nadie**: se escribe solo por `increment_professional_metric`, un RPC `SECURITY DEFINER`
  que lo llama un visitante **anónimo**, así que valida adentro el tipo de evento contra la
  lista y que el profesional esté activo, y solo hace `+1` (nunca recibe el valor a
  escribir). Es la lección de `approve_seller_request` (migración 75) aplicada.
- **91** `professional_business_hours` (dos franjas por día, para el corte del mediodía) +
  `professional_service_areas` + `professionals.serves_24h`. **No** se creó una función SQL
  de "abierto ahora": los horarios ya viajan al navegador para mostrarlos, así que
  resolverlo del lado del servidor sería la misma regla escrita dos veces.
- **92** `professional_promos` suma `sort_order` y `description`, y el bucket recibe la
  policy `update_own` que le faltaba.
- **93** `reviews.owner_reply` / `owner_replied_at` + `is_owner_of_review_target()`.

### El gotcha importante: falsificar la respuesta a una reseña

`reviews` es la tabla genérica compartida por productos, comercios, repartidores y
profesionales, y **ya tenía `reviews_update_own`**, que deja al **autor** de una reseña
editar su propia fila. El diseño inicial del trigger solo cortaba el caso
`client_id != auth.uid()` — o sea que un cliente podía escribir `owner_reply` en su propia
reseña y **falsificar la respuesta del profesional**. Se verificaron las policies reales en
producción antes de escribir la migración y el trigger quedó cortando en los dos sentidos:

- el dueño de lo reseñado solo puede tocar `owner_reply`,
- el autor puede tocar `rating`/`comment` pero **nunca** la respuesta,
- admin y moderador pasan derecho (necesitan poder moderar una respuesta abusiva),
- `owner_replied_at` lo pone el servidor, nunca el cliente.

`is_owner_of_review_target()` es `SECURITY DEFINER` a propósito: si corriera con los
permisos de quien llama, la RLS de `professionals` podría esconderle su propia fila a un
profesional con la publicación pausada y no podría responder. Se le revocó `EXECUTE` a
`anon` (la policy es FOR UPDATE, que anon nunca ejecuta) porque si no queda publicada como
RPC en `/rest/v1/rpc/` y el advisor de Supabase la marca, con razón.

### Módulos puros con tests

- `js/professional-hours-utils.js` — `estaAbiertoAhora`, `resumenDisponibilidad`,
  `agruparPorDia`, `formatearFranjas`. **Bug que encontró el test**: quien atiende un solo
  día a la semana y ya cerró tiene su próximo turno recién el mismo día de la semana
  siguiente; el bucle iba hasta 6 y devolvía "Cerrado". Ahora llega a 7.
- `js/professional-service-utils.js` — `formatTarifa`, `parsePrecio`, `validarServicio`. El
  formato de pesos está repetido a propósito y no importado de `cart-utils.js`: ese módulo
  importa el cliente de Supabase y este tiene que correr en un test sin credenciales.
- `js/professional-zones.js` — lista fija de zonas. Las cuatro últimas son localidades
  reales del partido; las primeras son divisiones genéricas del casco urbano y **conviene
  repasarlas con alguien que camine el pueblo**.

### En la página pública

`contratar.html` muestra servicios con tarifa, horarios con chip "Abierto ahora", zonas, y
un botón "Pedir presupuesto". Las métricas se registran sin `await` ni toast: si falla, el
visitante no tiene por qué enterarse. El modal de presupuesto **no manda un `?redirect=`** a
login porque el login del proyecto no lo soporta (`resolvePostLoginRedirect` en
`auth-utils.js`) — avisa en el mismo modal en vez de prometer una vuelta que no pasa.

### Qué quedó sin probar

El recorrido logueado de punta a punta: **el navegador del entorno de trabajo no puede
llegar a Supabase** (el proxy lo bloquea; `fetch` a la API tira "Failed to fetch"), así que
no se pudo entrar como profesional y usar el panel de verdad. Sí se verificó: la página
carga y redirige a login sin sesión, el build pasa, los tests de los módulos puros pasan, y
el diseño se revisó con capturas renderizando el panel con datos de muestra. **El flujo real
conviene caminarlo una vez a mano** (cargar un servicio, un horario, pedirse un presupuesto
desde otra cuenta, responder una reseña).


## Farmacias de turno (2026-08-16) — A113-261, rama `feature/farmacias-de-turno`

Reemplaza el `alert()` de `js/home.js` que mostraba una farmacia, dirección y teléfono
**inventados** (`A113-10`, que figuraba Finalizada). Primero se quitó el dato falso y se puso una
página honesta de "en preparación" (rama `fix/farmacia-turno-placeholder`, commit `7fe8ec0`);
después se construyó la página real sobre esa base.

- **Modelo**: dos tablas separadas a propósito (migración 67). `pharmacies` son los datos fijos
  (cambian una vez por año) y `pharmacy_shifts` el turno por día (cambia cada semana). Juntarlas
  obligaría a recargar los datos fijos en cada turno nuevo — la clase de fricción que hace que una
  sección así se quede sin mantener. `unique(shift_date)`: una farmacia de guardia por día.
- **RLS**: lectura pública **incluido `anon`** (es información de utilidad pública, la página tiene
  que servir sin login), escritura solo `admin`. Triggers de auditoría en ambas tablas: cargar mal
  un turno manda gente a la puerta equivocada.
- **La lógica que hay que no romper — el turno cruza la medianoche.** `closes_at` se interpreta
  siempre como del día SIGUIENTE a `shift_date`, así que a las 3 de la mañana la farmacia de turno
  es la de **ayer**. Por eso `loadFarmacias()` consulta desde ayer y elige por ventana
  (`isActiveNow`), no por `shift_date = hoy`. Probado con node contra el archivo real (8 casos,
  incluido "domingo 03:00 con el turno del sábado" y un turno diurno que no cruza medianoche).
- **El mapa NO se embebe.** La CSP del proyecto (`img-src 'self' data: *.supabase.co`) bloquea los
  tiles de Google/OSM. En vez de ampliarla, la tarjeta de ubicación es un link que abre Maps
  afuera — una navegación no la bloquea la CSP. Si `maps_url` está vacío, se arma con la dirección.
- **Gotcha caro**: la tabla `pharmacies` **ya existía** en producción de un intento anterior
  (vacía, sin `whatsapp/pharmacist/insurances/maps_url/updated_at`). El `create table if not exists`
  se salteó la tabla en silencio y la página falló con `column pharmacies.whatsapp does not exist`.
  Lección: para tablas que pueden preexistir, `create` mínimo + `add column if not exists` por
  columna. Ver `docs/MIGRACIONES_PENDIENTES.md`.
- **Estados vacíos, que acá son la funcionalidad principal**: sin turno para el momento actual, la
  página lo dice; sin turnos futuros, lo dice; si el último turno cargado tiene 10 días o más, el
  aviso de "actualizado el X" se degrada a advertencia roja. Nunca se muestra "una farmacia
  cualquiera" para llenar el hueco.
- **Pendiente real, y no es código**: las tablas están vacías. Falta cargar las farmacias de
  Baradero y definir **quién carga los turnos cada semana**. Sin eso la página se vuelve el mismo
  problema que vino a arreglar, más grande.

## Carrito agrupado por comercio + selección por casilla (2026-08-16)
Rama `feature/carrito-seleccion-por-comercio`. El carrito era una lista plana donde lo único que se
podía hacer con un producto que no se quería comprar hoy era borrarlo. Ahora se agrupa por comercio,
cada ítem tiene casilla, y lo destildado queda "pendiente" (sigue en el carrito, no se cobra).
Decisiones del usuario: la selección **persiste** entre sesiones, un producto nuevo entra **tildado**,
"Vaciar carrito" sigue vaciando **todo** pero con confirmación, y las ayudas se pueden apagar.

- **`selected` por ítem, con `undefined` = tildado.** Es el punto más importante de compatibilidad:
  los carritos ya guardados (localStorage y `user_carts`) no tienen el campo, y tratarlos como
  pendientes les vaciaría el total a cualquiera que ya tuviera cosas cargadas. Solo un `false`
  explícito deja algo afuera (`isItemSelected` en `js/cart-utils.js`). La persistencia no necesitó
  camino nuevo: `saveCart()` ya escribe localStorage + `user_carts.items` (jsonb), y el flag viaja
  adentro del mismo objeto. `validateCartFreshness` conserva el flag porque hace `{ ...item }`.
- **El filtro por comercio SOLO oculta.** `storeFilter` es una variable de vista: agrega
  `.is-filtered-out` (display:none) a los grupos que no coinciden y **nunca** escribe `selected` ni
  llama a `saveCart`. Los grupos ocultos igual se renderizan, así los índices de los botones
  +/-/borrar (que son índices del array del carrito) siguen siendo válidos.
- **La trampa que se cubrió a propósito:** con un filtro activo se puede tener seleccionado algo de
  otro comercio que no se ve en pantalla. El resumen lo dice explícito
  (`#cart-hidden-note`: "Ojo: hay N productos seleccionados de otros comercios que el filtro «X» te
  está ocultando. Igual se cobran."). Sin eso es facilísimo pagar de más.
- **Checkout: `payload = selectedItems.map(...)`, no `currentCart`.** Era el bug de plata real: si
  se mandaban los pendientes a `create_order`, se le cobraban al cliente productos que decidió no
  comprar. Además se agregó `clearPurchasedFromCart()` (cart-utils) que reemplaza a `clearCart()`
  después de pagar — vaciar todo borraría los pendientes, que son una decisión explícita del
  usuario. Se usa igual en `js/perfil.js` (retorno de Mercado Pago).
- **Envío por comercio:** `calculateShippingByStore` ahora recibe solo lo tildado, y cada grupo
  muestra un chip con su estado ("Envío gratis" / "Te faltan $X para envío gratis" / "Todo
  pendiente"). **Cuarto estado agregado, "Retirás en el local"**: con `deliveryMethod === 'pickup'`
  no se cobra envío por nada, hablar de umbrales ahí sería un dato falso.
- **Agrupación por NOMBRE de comercio, no por `store_id`.** El id real recién llega con
  `validateCartFreshness` (async): usarlo como clave haría que los grupos —y el filtro activo—
  cambiaran de identidad a mitad de la carga. El `store_id` se sigue usando para resolver la config
  de envío de cada grupo.
- **Guía de ayuda: `js/hints-utils.js` (módulo nuevo, reusable).** No es un sistema de
  notificaciones nuevo: reusa el mismo `#toast` de `showToast`/`showCartToast`. Textos centralizados
  en `CART_HINTS` (los dos del ítem son literales del usuario: "Producto en pendiente, este no se
  agregará a su compra" / "Producto agregado, este se tendrá en cuenta en su compra"), más los de
  casilla maestra y chips de filtro.
- **Preferencia de ayudas: sigue a la cuenta** (`profiles.cart_hints_enabled`, **migración 66,
  PENDIENTE de aplicar**) con cache en `localStorage.bl_cart_hints` para que funcione antes de que
  resuelva el fetch del perfil y para invitados (default: activada). Toggle en Perfil → Mis datos.
  **Los números 61-65 están reservados por `feature/logistica-terceros` (sin mergear).**
- **Vaciar carrito:** modal propio (`.bl-confirm-*` en `carrito.css`), no `confirm()` nativo. Texto
  literal pedido por el usuario, foco atrapado entre los 2 botones, arranca en "Cancelar" (la opción
  segura), Escape cierra y devuelve el foco al botón que lo abrió.
- **El badge del navbar sigue contando TODO** (tildado o no): un pendiente sigue siendo algo que el
  usuario tiene guardado. Por eso el handler de las casillas no llama a `updateCartBadge()`.
- **Verificado en el navegador con datos reales** (dev server 5188, 3 comercios en el carrito):
  agrupación y chips; destildar el Vino de "Bebidas La Esquina" bajó ese grupo de $5.700 a $1.200 y
  el chip pasó de "Envío gratis" a "Te faltan $3.800", con el envío total subiendo de $350 a $700;
  casilla maestra en `indeterminate`; filtro ocultando 2 grupos sin tocar ninguna casilla y con el
  total intacto; F5 conservando `selected:false`; borrar el último producto del comercio filtrado
  devuelve el filtro a "Todos"; modal (Escape/Cancelar/Confirmar); ayudas apagadas = sin toast pero
  la acción se aplica igual; mobile 375px sin desborde horizontal, chips scrolleando y casilla
  arriba a la izquierda. `npm run build` sin warnings. Consola: solo el CSP de Vercel Speed
  Insights (preexistente).
- **Sin verificar en esta tarea:** el checkout de punta a punta y el toggle del perfil logueado
  (requerían sesión real; `perfil.html` redirige a login sin cuenta). La migración 66 se terminó
  aplicando el 2026-08-18 (ver `docs/MIGRACIONES_PENDIENTES.md`).

## Arreglo del flujo de registro/login (2026-08-15)
Rama `fix-flujo-registro-login`. El usuario reportó tres cosas: (1) después de registrarse la app
igual le pedía iniciar sesión, (2) el registro no pedía repetir la contraseña, (3) los Términos y
Condiciones se pedían también en el login, cuando deberían aceptarse solo al registrarse.
- **(1) "me pide iniciar sesión después de registrarme"** — `register.js` hacía siempre lo mismo
  después de un `signUp()` exitoso: toast "revisá tu correo" + `setTimeout(3500)` →
  `login.html`, sin mirar `data.session`. Dos problemas distintos ahí:
  - Si el proyecto **no** exige confirmar el correo, `signUp` devuelve sesión: la cuenta ya quedó
    abierta y mandarlo a login es pedirle la contraseña a alguien que ya está adentro. Ahora
    `if (data?.session)` → `location.replace('../pages/home.html')`. (En la práctica el
    `onAuthStateChange` de `guardPage` ya lo redirigía por el evento `SIGNED_IN` antes de que
    corriera este branch, así que lo que se veía era el toast equivocado y una carrera de
    redirecciones; ahora el destino es explícito.)
  - Si **sí** exige confirmar, se queda en `register.html` con un aviso persistente
    (`.auth-confirm-notice`, insertado después del botón) en vez de rebotar a login — el toast dura
    4s y se perdía. Y se agregó `emailRedirectTo: ${origin}/pages/home.html` al `signUp`: sin eso el
    link del mail caía en el Site URL de Supabase; ahora vuelve a la app y la sesión queda abierta
    ahí mismo (mismo destino que ya usaba el OAuth de Google, o sea que la URL ya estaba en la
    allow-list de Redirect URLs).
- **(2) repetir contraseña** — campo `#register-password-confirm` en `register.html` + validación
  (vacío / no coincide → toast + focus + select). Va después de la validación de fuerza existente
  (8 chars, mayúscula, número).
- **(3) términos solo en el registro** — se sacó el bloque `.auth-terms` de `login.html` y
  `checkTermsAccepted` de `login.js` (el checkbox seguía siendo la misma id `#terms-checkbox` en
  ambas páginas). El CSS `.auth-terms*` queda porque lo usa `register.html`.
- **Dedup de paso**: el botón de ojito estaba copiado en `login.js` y `register.js` y hacía falta una
  tercera copia para el campo nuevo → se movió a `initPasswordToggle(btnId, input)` en
  `auth-utils.js` y las tres lo usan.
- **Limpieza**: `register.js` leía `account_type` de los radios y no lo mandaba a ningún lado
  (variable muerta desde la migración 23, que fuerza `role='cliente'` para todo usuario nuevo) —
  eliminada. **Ojo**: los radios "Cliente / Vendedor" siguen en el HTML y no hacen nada; queda
  anotado como pendiente en CLAUDE.md.
- **Verificación** (vite dev en :5199, herramientas de browser): campo nuevo renderiza; contraseñas
  distintas → toast "Las contraseñas no coinciden" + focus en el campo, sin llamar a `signUp`; las
  dos ramas post-signUp probadas **stubbeando `window.fetch` sobre `/auth/v1/signup`** (para no crear
  usuarios reales en producción): sin sesión → sigue en `register.html` con el aviso y los inputs
  deshabilitados; con sesión (JWT falso armado a mano) → termina en `home.html`. Login sin checkbox
  llega a Supabase y devuelve "Correo o contraseña incorrectos"; ojito ok en ambos sentidos.

## Rediseño del alta de producto (panel vendedor) (2026-08-14)
Rama `rediseno-publicar-producto`. El usuario reportó que "la pestaña cuando el vendedor sube un
producto está muy verde" y pidió rediseñarla entera, con plan previo. Tres decisiones suyas al
plantearle las opciones: (1) el modo vendedor conserva acento propio pero en azul de marca —no
unificar del todo con `--bl-primary`—, (2) el form en tarjetas en la misma página, no modal ni wizard,
(3) subida real de fotos + galería unificada (portada y adicionales juntas, reordenables).

- **El "verde" era `--bl-vendor-accent: #0e7490`** (cyan/teal de F5-09), definido en el `<style>` de
  `pages/vender.html` y usado en 28 lugares de *todo* el panel, no solo en Publicaciones. Cambiado a
  `#2f5aa8` / `#254a8c` (azul saturado, hermano del ancla `#284175`; contraste 6.68:1 sobre blanco,
  necesario porque lleva texto blanco encima). Al ser un token, el cambio arregló las 9 pestañas solo.
- **Gotcha:** cuatro reglas repetían el teal a mano en `rgba()` (`.form-input:focus`,
  `.mc-navitem.is-active`, `.pub-search input:focus`, `.pub-status--ready`) y quedaron verdes después
  de cambiar el token. Se agregó `--bl-vendor-accent-rgb: 47, 90, 168` y todas derivan de ahí. Si se
  agrega un translúcido nuevo, usar ese token — no escribir el `rgb()` a mano otra vez.
- **El form dejó de apilarse debajo del listado.** Antes era `display:none` → `block` +
  `scrollIntoView`. Ahora `.pub-wrap` toma `.is-editing`, que oculta header/toolbar/lista por CSS, y
  el form (`.pubform`, `hidden`) ocupa su lugar con un "← Volver a publicaciones". Los helpers son
  `openProductForm()` / `closeProductForm()` en `js/vender.js`.
- **Estructura en 4 `<fieldset>`** (Fotos · Datos básicos · Precio y stock · Variantes) con clases
  `.pubform__*` en el `<style>` de la página; se sacaron todos los `style="..."` inline del markup.
  Variantes sigue siendo solo-al-editar (limitación de F5-03, sin cambios).
- **Se eliminó el campo "URL de la imagen (temporal)"** (`#prod-image`), que obligaba al vendedor a
  pegar una URL para la foto principal. Junto con `#prod-extra-images` fue reemplazado por una sola
  zona de carga (click / teclado / arrastrar-y-soltar) más una grilla de miniaturas.
- **Contrato de la galería — lo importante para no romper el lado cliente.** `js/producto.js` y
  `js/product-modal.js` ya armaban la galería como `[products.image_url, ...product_images ordenadas
  por position]`. O sea el modelo ya existía: **la portada vive en `products.image_url` y NO como fila
  de `product_images`**, o se ve duplicada en la vista de cliente. Por eso el rediseño **no necesitó
  migración SQL** ni tocar esos dos archivos. `persistProductImages()` es el único lugar que escribe
  esto: sube las nuevas, **borra todas las filas y las reinserta** con `position` = índice, y devuelve
  la portada para que el submit la guarde en `image_url`. Borrar-y-reinsertar en vez de diffear es lo
  que hace que la duplicación sea imposible por construcción y que `position` siempre coincida con el
  orden que ve el vendedor.
- **En un alta hay que subir después del insert**: `product_images.product_id` es NOT NULL y la ruta
  en storage usa el id del producto. Por eso `productData` ya no lleva `image_url` y el submit hace
  insert → `persistProductImages()` → `update({ image_url })`. Las previews antes de guardar salen de
  `URL.createObjectURL` (se revocan al resetear el form).
- **Táctil:** el drag&drop HTML5 no existe en mobile, así que cada foto que no es portada lleva un
  botón "Hacer portada" — sin eso, desde el celular no habría forma de cambiarla.
- Validación nueva en cliente: se rechaza lo que no sea imagen y lo que pase de 5 MB (antes no había
  ninguna y el archivo se subía igual).
- **Verificado**: `npm run build` OK; render, colores computados (`#2f5aa8` en botón/badge/link, cero
  teal), grilla, `.is-editing` ocultando el listado y responsive a 375px sin desborde — todo contra un
  harness estático generado desde el CSS/markup reales (el guard de sesión impide entrar a
  `vender.html` sin cuenta de vendedor). Consola sin errores propios (solo el CSP de vercel
  speed-insights, preexistente en dev). **Sin verificar**: el camino contra la DB real (alta con
  fotos, cambio de portada, no-duplicación en la vista de cliente) — requiere login de vendedor.
- **Storage:** al quitar una foto se borra su fila pero **no** el objeto del bucket (era así antes
  también). Queda como basura acumulable; no se abordó.

## Unificación de color/tipografía oficial + merge a main (2026-08-05)
Seguimiento de la tarea anterior: el usuario pidió pushear todo a `main` (incluida la carpeta
`video/` completa, que había quedado sin commitear) y decidir cuál de los dos sistemas de
color/tipografía era el oficial.
- **Merge a main:** `feature/marketing-skills`/`preview/mejoras-envio-cupones-rubros` mergeado
  (fast-forward) a `main` y pusheado — dispara deploy de Vercel. Se sumaron en el camino: el
  proyecto Remotion completo (antes solo `marca.js`/`BRAND.md` estaban commiteados, faltaba
  `Root.jsx`, historias, `HelloWorld/`, config) y 7 skills de diseño instaladas desde el
  2026-07-13 pero nunca commiteadas (`banner-design`, `brand`, `design`, `design-system`,
  `slides`, `ui-styling`, `ui-ux-pro-max`) — necesarias para que estén disponibles al clonar el
  repo en otra máquina.
- **Decisión de color/tipografía:** `#284175` (azul oscuro, ya era el "ancla" documentado) +
  Inter, ambos oficiales.
- **Hallazgo clave que cambió el diagnóstico previo:** `Assets/styles/styles.css` — el archivo
  que la sesión del 2026-08-03 asumía como "fuente de verdad del sistema visual" — **no lo carga
  ninguna página real** (`grep -rl "styles.css" pages/` no devuelve nada; solo lo referencia el
  comentario de `design-tokens.css`, que tampoco carga ninguna página). El sistema realmente en
  producción es `home.css` (`--bl-primary`, cargado en las 14 páginas reales, heredado vía
  `var()` por `admin.css`/`carrito.css`/`product-modal.css`) + `auth.css` (login/registro, único
  caso que no carga `home.css`, con sus propias `--auth-primary`/`--font-main`). Esto invirtió la
  decisión "obvia": en vez de mover el sitio hacia `styles.css`, se apuntó `home.css` hacia el
  ancla `#284175` ya documentada, porque es el archivo que de verdad renderiza en todas partes.
- **Cambios de código:** `home.css` `:root` (`--bl-primary: #2563eb → #284175`,
  `--bl-primary-dark: #1d4ed8 → #1f3460`) + un gradiente hardcodeado del hero. `product-modal.css`
  y `admin.css`: 11 `rgba(37, 99, 235, *)` (= rgb del `#2563eb` viejo) → `rgba(40, 65, 117, *)` (=
  rgb de `#284175`), más 3 gradientes hex hardcodeados migrados a `var(--bl-primary)`/
  `var(--bl-primary-dark)`. `auth.css`: agregado `@import` de Inter + `--font-main` actualizado
  (antes se quedaba en la pila de sistema porque no carga `home.css`), y 5 hex hardcodeados
  (`#2563eb`/`#1d4ed8` en reglas de términos/checkbox/link) migrados a
  `var(--auth-primary)`/`var(--auth-primary-hover)` (que ya eran `#284175`/`#1f3460` — esas
  reglas puntuales estaban usando un azul distinto al del resto del propio archivo). `npm run
  build` corrido después para regenerar `dist/` (versionado en git). Verificado visualmente con
  Playwright (`npm run dev` + capturas de `home.html` y `login.html`) — sin errores de consola
  nuevos, contraste correcto, gradientes y botones renderizando bien.
- **Por qué no se tocó `Assets/styles/styles.css`:** queda como código muerto, no se borró sin
  que se pida (no era parte de lo pedido).
- **Nuevo hallazgo sin resolver:** `Assets/styles/perfil-custom.css` (página "Perfil de mi
  comercio", rediseño ML del 2026-07-16) usa un **tercer** azul propio
  (`hsl(220, 72%, 46%)` ≈ `#2159ca`), ni `#284175` ni el `#2563eb` viejo — no se tocó por ser un
  rediseño reciente y afinado a propósito, requiere su propia revisión antes de unificar.
- **Otro hallazgo, tangencial:** `docs/brand-guidelines.md` tenía una sección ("Acento serif:
  Georgia") que describía un uso en `.welcome h1`/`.login-card` que no existe en el `auth.css`
  real (`Georgia` solo aparece en el `styles.css` muerto) — corregida a "aspiracional, no uso
  actual" en el mismo commit de docs.
- **Docs actualizados en la misma tarea:** `docs/brand-guidelines.md` (secciones 1 y 2 +
  cabecera, marcado como resuelto con fecha) y `CLAUDE.md` (Pendientes activos: el ítem del
  dual-sistema pasa a resuelto, se agrega el de `perfil-custom.css`).

## Identidad de marca completa + skills de marketing (2026-08-03)
El usuario pidió instalar el repo `coreyhaines31/marketingskills` (47 skills de marketing) y, con
ellas, construir una identidad de marca completa para que a futuro se puedan producir videos/historias
bien hechos con el proyecto Remotion ya existente en `video/`, y que esa identidad se mantenga
actualizada a medida que el proyecto evolucione. Todo en la rama `feature/marketing-skills` (no
mergeada a `main` todavía).
- **Skills instaladas:** las 47 de `marketingskills` copiadas a `.claude/skills/` (cro, copywriting,
  seo-audit, ads, pricing, product-marketing, marketing-council, video, social, etc.), conviven con las
  ya presentes (`brand`, `design`, `design-system`, `banner-design`, `slides`, `ui-styling`, `ui-ux-pro-max`).
- **Descubrimiento previo importante:** ya existía un proyecto Remotion completo y sin commitear en
  `video/` (`video/src/marca.js`, `lib/anim.jsx`, `Root.jsx`, 5 historias en `historias/`) con un
  lenguaje de movimiento propio (fondo que respira, entradas elásticas, texto que se revela palabra por
  palabra, cortina de encadenado, CTA con latido) y un patrón `AGENDA` de una historia de Instagram por
  día de semana. No se tocó el código de las escenas, solo se documentó y se extendió `marca.js` de
  forma aditiva.
- **Proceso:** workflow con un panel de 4 asesores del skill `marketing-council` (April Dunford,
  Seth Godin, Byron Sharp, Rory Sutherland) evaluando posicionamiento/personalidad específicamente para
  Baradero Local, seguido de 3 documentos escritos en cadena (cada uno usa el anterior como contexto).
- **Documentos vivos creados** (se actualizan a mano cuando el proyecto cambie, no son estáticos):
  - `.agents/product-marketing.md` — contexto de producto completo (skill `product-marketing`):
    audiencia de dos lados (cliente vecino / vendedor comerciante), diferenciación, objeciones,
    lenguaje del cliente, voz de marca. Formato del skill pero con headers en español.
  - `docs/brand-guidelines.md` — guía de identidad visual y de voz completa (skill `brand`): paleta,
    tipografía, uso del logo, voz/tono, imágenes, componentes, prompts de generación de imágenes con IA,
    accesibilidad (ratios de contraste calculados).
  - `video/BRAND.md` — spec técnica de identidad en movimiento para Remotion: nombra cada patrón de
    `lib/anim.jsx`, formatos/IDs de `Composition` reales, zonas seguras y ritmo por beats de historias
    de Instagram, checklist paso a paso para agregar una historia nueva siguiendo el patrón `AGENDA`.
  - `Assets/design-tokens.json` + `Assets/design-tokens.css` — tokens legibles por máquina (colores,
    tipografía, spacing, radios). **Ojo:** deliberadamente en `Assets/` con A mayúscula (la carpeta que
    ya existe), no `assets/` — en Windows son la misma carpeta pero en git/Linux no, y el script
    `sync-brand-to-tokens.cjs` del skill `brand` apunta a `assets/` en minúscula; no se usó ese script,
    los tokens se escribieron a mano en la ruta correcta.
- **Decisiones de marca que quedaron fijadas:**
  - Categoría: "comercio de proximidad", nunca "tienda online"/"marketplace" de cara al cliente —
    para no compararse en catálogo/velocidad contra MercadoLibre, donde siempre pierde.
  - Color ancla de marca: `#284175` (el azul más oscuro de la paleta ya existente), no `#3f85ba` —
    más memorizable, menos "azul de fintech genérico".
  - 3 colores semánticos nuevos para estado de pedido (no existían): éxito `#0B6B4D`, advertencia
    `#8F4D00`, error `#A4302A` — paleta cálida/terrosa a propósito, para no verse como el semáforo
    rojo/amarillo/verde de cualquier dashboard genérico.
  - Voz: vecinal, cálida, directa, con nombre propio (nunca "su pedido"/"el usuario"). El riesgo
    explícito a evitar (ya nombrado por un usuario real en el pasado) es sonar "como una inmobiliaria".
  - Remate de cierre para cuando se lance de verdad: reemplazar `CIERRE = "Próximamente"` en
    `video/src/marca.js` por "Conectamos vecinos" (el slogan del footer, convertido en firma de marca).
- **Hallazgo real no buscado, importante:** el sitio corre hoy con DOS sistemas de color/tipografía en
  paralelo. `Assets/styles/styles.css` (`:root`) define la paleta "oficial" (`#3f85ba`/`#284175`,
  Segoe UI/Georgia), pero `Assets/styles/home.css`, `admin.css`, `carrito.css` y `product-modal.css`
  — que alimentan la mayoría de las páginas reales (home, admin, carrito, modal de producto, perfil) —
  usan un token system totalmente distinto (`--bl-primary: #2563eb`, `--bl-success`/`--bl-danger`,
  `--bl-font: 'Inter', ...`), verificado con grep (~70 usos de `--bl-primary` solo en `home.css`). No es
  un bug de esta tarea, es deuda de identidad preexistente — quedó documentada en
  `docs/brand-guidelines.md` (sección 1 y 2) pero **no resuelta**, ver "Pendientes activos" en
  `CLAUDE.md`. Es una decisión de producto (qué azul/fuente es "la" oficial), no algo para resolver sin
  preguntar.

## Fixes de carga del navbar + spinner de búsqueda (2026-07-20)
Reporte del usuario: la campana de notificaciones "titilaba", el menú del navbar (barra de
categorías) "desaparecía" al navegar entre páginas, y pidió un spinner de carga en la búsqueda
(como el de "Verificando sesión"). Causa raíz común: elementos del navbar que se construyen por JS
después de llamadas async (sesión, categorías) sin espacio reservado → aparecen tarde y empujan el
layout en cada navegación (es un multipágina, cada página rehidrata el navbar de cero). Commit
`8df498b`, verificado en producción con Claude-in-Chrome (cuenta facu.cells).
- **Campana titila** (`js/nav-utils.js` `initNotificationsBell` + `Assets/styles/home.css`):
  `initNotificationsBell` esperaba `getSession()` (red) ANTES de dibujar el botón → aparecía tarde.
  Ahora construye el botón sincrónico y resuelve la sesión en paralelo (`sessionReady` promise); solo
  el número del badge y el contenido del dropdown esperan por ella. Además `#nav-notifications-wrap`
  ahora reserva `min-width/height: 2.25rem` (igual que `.navbar__action-circle`) para no empujar el
  layout al aparecer.
- **Barra de categorías desaparece** (`home.css`): `.category-bar__inner` estaba sin `min-height` →
  colapsaba a 0 hasta que cargaban las categorías (fetch). Agregado `min-height: 3rem` para reservar
  la altura. (Nota: NO había ningún bug de comentario CSS `\*` — la salida del grep me lo mostró mal
  escapado, el archivo tenía `/*` válido; verificar siempre con Read, no con el render del grep.)
- **Spinner de búsqueda** (`home.css` + `js/search.js`): nuevo `.bl-spinner` + `@keyframes bl-spin`
  + `.bl-loading-block` reutilizables en `home.css` (mismo lenguaje que `.auth-loading-spinner`).
  `runSearch` reemplaza el texto plano "Buscando..." por el bloque spinner + "Buscando productos...".
  Verificado: `animationName: bl-spin` aplicado, render correcto (la RPC es tan rápida que el estado
  es fugaz en uso real; se verificó inyectando el markup del estado de carga con el CSS deployado).
- **Segunda tanda (mismo día, commit `cad49a3`)**: tras el fix de arriba el parpadeo se fue, pero el
  usuario reportó que al navegar entre páginas "desaparecían" la foto de perfil y el texto de la barra
  de categorías — porque ambos se construyen tras un fetch (avatar via `getUser()`+`profiles`;
  categorías via RPC) y aparecían tarde. Fix con el mismo patrón para los dos: **cachear en
  localStorage y renderizar al instante desde cache, refrescando en background**.
  - Foto de perfil (`js/auth-utils.js` `updateNavbarProfile`): cachea la URL del avatar en
    `bl_avatar_url`, la pinta sincrónico al entrar (antes de resolver `getUser()`), y actualiza/limpia
    la cache según el resultado real (login/logout).
  - Barra de categorías (`js/nav-utils.js`): `initCategoryBar` separada en `renderCategoryBar` +
    cache `bl_catbar_cache` (solo name+slug de categorías y destacadas). Si hay cache, dibuja al
    instante y refresca en background sin re-render (las categorías casi nunca cambian; si cambian se
    ve al siguiente load). Sin cache (primera visita), espera el fetch y dibuja una vez.
  - Verificado en producción (Claude-in-Chrome, facu.cells): tras una primera visita, `bl_avatar_url`
    y `bl_catbar_cache` (14 cats + 6 destacadas) quedan en localStorage; al navegar a otra página, el
    `<img>` del avatar y los 8 items de la barra ya están renderizados de entrada (no vuelven al ícono
    ni quedan en blanco).
- **Tercera tanda (commit `dd0b858`)**: el usuario reportó que al entrar a `perfil.html` (clickeando
  la foto del navbar) la foto GRANDE de la tarjeta de cuenta (`#sidebar-avatar`) "desaparecía hasta
  cargar" — es un elemento distinto al avatar del navbar: arranca como skeleton y `perfil.js`
  (`renderFullProfile`) lo llena recién tras el fetch del perfil a la DB. Fix en `renderQuickProfile`
  (sincrónico, corre antes del fetch): pinta el avatar al instante desde `user.user_metadata`
  (avatar de Google, viene en el JWT) con fallback a la cache `bl_avatar_url`; `renderFullProfile`
  después lo refina con el avatar real de la DB si difiere (p.ej. si el usuario subió uno propio).
  Verificado: bundle deployado contiene el marcador `bl_avatar_url`, y la foto grande se ve
  renderizada (no skeleton).
- **Gotcha operativo**: `curl` a `proyectopdisc.vercel.app` devuelve un **403 "Vercel Security
  Checkpoint"** (protección anti-bot) — no sirve para pollear el estado del deploy ni para leer el
  HTML/bundles servidos. Usar el browser real (Claude-in-Chrome pasa el challenge) o el MCP de
  Vercel (`list_deployments`/`get_deployment`, aunque a veces rate-limitea). Además: **Vercel
  rebuildeaa desde fuente**, así que el hash del bundle en producción (`perfil-D1pbI-Jp.js`) NO
  coincide con el del build local (`perfil-D1ErCTsP.js`) aunque sea el mismo código — para verificar
  qué versión está live, buscar un literal de string del cambio dentro del bundle (los comentarios y
  nombres de variables locales se pierden en la minificación; los string literals como
  `bl_avatar_url` sobreviven).

Migrado desde CLAUDE.md el 2026-07-15 para no cargarlo siempre en contexto (era ~104.000
caracteres de historial, la mayor parte ya cerrado). El estado activo y los pendientes que sí
necesitan estar siempre visibles quedaron en CLAUDE.md, sección "Pendientes activos". Este
archivo es la fuente de verdad para el detalle línea por línea de cada tarea.

## Progreso (Milestone 1)
### ✅ Hecho
- **F0-01** (`A113-135`, `A113-136`) — Auditoría de la base real. Hallazgos abajo.
- **F0-02** (`A113-137`, `A113-138`) — Enum `app_role` ahora incluye `repartidor` (migración 11, aplicada). `handle_new_user` ya lo mapeaba → el registro de repartidor funciona.
- **F0-03** (`A113-139`, `A113-140`) — Migración 12 (aplicada): `price_cents`→`price` y `total_price_cents`→`total_price` en pesos enteros (products/order_items/orders); `validate_cart_prices` recreada con columnas reales (`title`/`price`, filtra `is_active`, `search_path` fijo). Frontend (7 archivos JS) sin `/100` + `dist/` rebuildeado. Verificado: caso ok `valid:true`, precio manipulado `valid:false`.
- **F0-04** (`A113-141..144`) — Alta de producto: `vender.js` no seteaba `seller_id` (NOT NULL + RLS `seller_id = auth.uid()`) → todo alta real fallaba con "new row violates row-level security policy". Fix: obtener `user.id` vía `supabase.auth.getUser()` y setearlo. También faltaba el campo `stock` en el form (quedaba en 0 = invendible) → agregado input `prod-stock` en `pages/vender.html`. `category_id` por slug ya estaba bien resuelto (comentario viejo engañoso, limpiado). Verificado con simulación RLS real en transacción con rollback (cuenta de test existente): reproduje el bug sin el fix y confirmé el insert exitoso con el fix (seller_id/price/category_id/stock correctos). No probado por UI en navegador (no hay credenciales de una cuenta vendedor real).
- **F0-05** (`A113-145`, `A113-146`) — Helper `formatPrice()` central en `cart-utils.js` (pesos AR, separador de miles), unificado en home/search/producto/comercio/carrito/perfil/vender. Antes había 4 formatos distintos conviviendo (`toLocaleString` suelto, `Intl.NumberFormat` con `style:'currency'` en perfil.js que agregaba un espacio, y un caso en vender.js sin separador de miles).
- **F0-06** (`A113-147..149`) — Integridad del carrito: se quitó `PRODUCTO_PRUEBA`/`seedCartIfEmpty` de `carrito.js` (ya no se precarga un producto falso); `initCartButtons` (cart-utils.js) ahora usa `data-product-id`/`dataset.price` en vez de parsear el texto ya renderizado del DOM. Verificado en navegador: id agregado al carrito es el UUID real de Supabase, carrito vacío no se auto-siembra.
- **F0-07** (`A113-150`, `A113-151`) — Idempotencia en `db/schema/01-12`: faltaban `DROP POLICY/TRIGGER IF EXISTS` en 02/03/08/09 (re-correrlos fallaba con "already exists"); `09_user_carts.sql` creaba la tabla sin `IF NOT EXISTS`; `12_price_cents_to_price.sql` ahora guarda cada rename con un chequeo de `information_schema.columns` (si no, re-ejecutarlo dividiría los precios por 100 dos veces); seeds `04`/`06` detectan si ya corrieron. Orden completo documentado en `docs/RUN_LOCAL.md`. **Verificado corriendo los 12 archivos en orden contra la base real**: 0 errores, 0 duplicados (14 stores/64 products/14 categories antes y después), `validate_cart_prices` funcionando.
- **F0-08** (`A113-152`) — Diseñado `db/schema/13_target_data_model.sql`: modelo de datos objetivo (roadmap sección 5) — `product_variants`, `product_images`, `products.compare_at_price`, `stores.description/zone/hours`, `orders.delivery_method/payment_method/payment_status/delivery_fee`, `payment_proofs`, `deliveries`, `reviews`, `conversations`/`messages`, `notifications`, `favorites`, todo con RLS. Validado con `BEGIN;...ROLLBACK;` contra la base real (corre sin errores). **A propósito NO aplicado todavía** — son tablas de fases que no arrancaron (Fase 2/3/5/7/8); aplicar cuando arranque cada una. Nota: `stores.description` ya se leía desde `comercio.js` sin existir en la tabla (bug silencioso, siempre caía al fallback) — se resuelve al aplicar este archivo.
- **F1-01** (`A113-154..157`) — Anti-XSS: `comercio.js`/`producto.js` reconstruidos con DOM API (interpolaban `store.name`/`description`/`product.title` crudos); `admin.js` (shop_name/address/cuit/category_slug del registro de vendedor sin escapar); `perfil.js` (favoritos); `product-modal.js` ya tenía `escapeHTML()` pero el bloque de "productos relacionados" no lo aplicaba (un título con `<img onerror=...>` no ejecutaba en la grilla pero sí al aparecer como relacionado en otro modal — corregido y probado con payload real en el navegador, `xssFired: false`).
- **F1-02** (`A113-158`, `A113-159`) — `get_advisors`: 15→6 hallazgos. **Crítico resuelto**: `approve_seller_request` no validaba rol admin → cualquier autenticado podía aprobarse a sí mismo como vendedor vía RPC directo (D6 bypaseada). Agregado chequeo + revocado `EXECUTE` de `anon`. También: `search_path` fijo en 4 funciones, revocado `EXECUTE` público de `handle_new_user`/`rls_auto_enable` (solo triggers), sacadas policies de listado público de storage. Quedan 2 hallazgos intencionales documentados en RUN_LOCAL.md + "Leaked Password Protection" pendiente (toggle manual en dashboard de Supabase).
- **F1-03** (`A113-160`) — Verificado con sesión simulada: `prevent_role_update_on_profile` rechaza que un cliente se cambie el rol. Sin cambios de código.
- **F1-04** (`A113-161`, `A113-162`) — `js/validation-utils.js`: CUIT (dígito verificador módulo 11) + shop_name/phone/producto, usado en los 2 formularios de `vender.js`. Espejo en SQL (`is_valid_cuit()` + `CHECK` en `seller_requests`) — verificado que JS y SQL dan el mismo resultado.
- **F1-05** (`A113-163`) — `vercel.json` con los mismos 4 headers de seguridad que el dev server de Vite (antes no llegaban a producción). Verificado con fetch real a producción tras el deploy: los 4 headers presentes.

**M1 (Fase 0 + Fase 1) completo.** Bonus de esta sesión: 7 hallazgos de auditoría fuera del roadmap corregidos (`info.html` 404 en build, README desactualizado, CI de build, logging de errores a `error_logs`, Supabase CLI local) — ver claves `A113-165` a `A113-171`. Tablero completo de Jira para Fases 2-11 creado (`A113-172..237`, script `scripts/jira-create-subtasks-m2-m11.mjs`).

**Nota operativa:** el repo debe quedar **público** en GitHub mientras el team de Vercel (`baradero-local`) esté en plan Hobby — causa raíz investigada a fondo el 2026-07-14 (no son permisos del GitHub App, como se sospechaba originalmente): el plan **Hobby** de Vercel bloquea el deploy (`BLOCKED`, sin build logs, es un chequeo de plan/billing previo al build) cuando el repo conectado es privado **y** el proyecto pertenece a un Team (no una cuenta personal) — coincide exactamente con lo observado: bloqueo/desbloqueo instantáneo al cambiar la visibilidad. Con `.env` ya fuera del repo (ver "Decisiones" arriba), ya no hay una razón de exposición de credenciales para poner el repo en privado — si se quiere igual por otro motivo, las 3 opciones son: upgradear el team a Pro, mover el proyecto a una cuenta personal, o reemplazar la integración Git nativa por GitHub Actions + `vercel deploy --prebuilt` (documentado en `docs/DEPLOY.md`).

## Progreso (Fase 2 — Compra: checkout, órdenes y pagos)
### ✅ Hecho
- **F2-01** (`A113-173`) — RPC `create_order` (SECURITY DEFINER, migración 18): revalida `store_id`/precio/stock leyendo `products` en el momento del checkout (ni siquiera recibe el precio del cliente), bloquea filas con `for update`, divide el carrito en **una orden por tienda** (orders.store_id es not null), aplica cupón, descuenta stock real, guarda `delivery_method`/`payment_method` (agregados a `orders` en migración 17 junto con `payment_proofs`, extraídos de `13_target_data_model.sql` — el resto de ese archivo sigue sin aplicar, es de Fases 3/4/5/7/8). Revocado `EXECUTE` de anon/public, solo `authenticated`. Verificado con `BEGIN;...ROLLBACK;` + sesión simulada: carrito de 2 tiendas + cupón `BIENVENIDO10` creó 2 órdenes con totales y stock correctos; stock insuficiente/cupón inválido/envío sin dirección rechazados sin dejar rastro. `get_advisors`: sin hallazgos críticos nuevos.

- **F2-02** (`A113-174`) — `carrito.js`: el botón "Iniciar pago" ahora llama a `create_order` de verdad (antes solo llamaba `validate_cart_prices` y nunca creaba nada). Manda `[{id, qty}]` sin precio (el RPC lo relee del servidor) + el código de cupón ya validado (`appliedCouponCode`, nuevo, separado de `currentDiscount` que es solo para el cálculo visual). `delivery_method` queda fijo en `'pickup'` sin dirección — elegir retiro/envío es F2-05, todavía no tiene UI (el selector "Calcular costos de envío" del sidebar es un stub visual sin lógica detrás). Al crear la(s) orden(es) con éxito: vacía el carrito, toast con el total, redirige a `home.html`. Sin sesión real de vendedor/cliente para loguearse en el navegador (mismo límite que F0-04) — verificado que no hay errores de consola, que el carrito renderiza bien, y que la rama de "no hay sesión" del botón redirige a login (confirmé que `getSession()` da `null` en el preview, por lo que un click ahí nunca llega a invocar `create_order`); la creación de la orden en sí ya se probó a fondo contra la base real en F2-01.

- **F2-03** (`A113-175`) — RPC `confirm_simulated_payment` (migración 19, SECURITY DEFINER, revocado de anon/public): marca `paid` una orden propia con `payment_method='simulado'` y `payment_status='pending'`; idempotente (`already_paid: true` en vez de fallar si ya está pagada). Separado a propósito de `create_order` — crear y pagar son pasos distintos, como en una pasarela real. `js/payment-providers.js` (nuevo): interfaz `getPaymentProvider(method) → { name, pay(orderIds) }`; hoy solo `'simulado'`, los próximos (F2-04 transferencia, F2-07 MercadoPago) se agregan ahí sin tocar `carrito.js` ni `create_order`. `carrito.js` ahora llama al provider después de `create_order`, antes de vaciar el carrito. Verificado con `BEGIN;...ROLLBACK;` (creando una orden real con `create_order` en la misma transacción): pago propio → `paid` + `payment_id`; doble confirmación → idempotente; orden inexistente/ajena → rechazada.

- **F2-05** (`A113-177`) — `create_order` (migración 20) calcula `delivery_fee` real: gratis en `pickup`; en `delivery`, $350 por tienda salvo que el subtotal de esa tienda (con cupón aplicado) supere $5000. `pages/carrito.html`: la sección "Calcular costos de envío" era un stub sin lógica — ahora tiene radios Retiro/Envío + input de dirección (aparece solo con envío). `carrito.js` agrupa por `item.shop` para mostrar el mismo envío que cobra el servidor (un carrito con productos de varias tiendas genera una orden por tienda, F2-01). Verificado con `BEGIN;...ROLLBACK;` (tienda con subtotal ≥$5000 → gratis, tienda <$5000 → $350) y en el navegador (elegir envío muestra la dirección y el total sube de $1.350 a $1.700, igual que en la prueba SQL).

- **F2-06** (`A113-178`) — Historial de pedidos real en `perfil.html`. Agregado `order_items.title` (migración 21, snapshot igual que `price`) porque un join en vivo a `products(title)` se rompe por RLS si el vendedor desactiva/borra el producto después (`products_select_public_active` solo deja ver `is_active=true`) — un recibo no debería perder el nombre del producto. `js/perfil.js` (`loadCompras`/`buildCompraItem`) reconstruida con DOM API (nunca innerHTML, mismo criterio de F1-01: nombre de tienda y título de producto los define el vendedor) mostrando tienda, fecha, método de envío/pago, lista de productos y estado con badge.

- **F2-04** (`A113-176`) — Transferencia + comprobante. Bucket **privado** `payment-proofs` (migración 22, a diferencia de `products`/`stores` que son públicos) con RLS por `storage.foldername(name)[1]` = order_id; trigger `payment_proofs_validate_order` (solo ordenes `transferencia`+`pending`, `EXECUTE` revocado tras aparecer en `get_advisors` — mismo criterio que `handle_new_user` en F1-02); RPC `confirm_transfer_payment` (SECURITY DEFINER, solo el vendedor de la tienda o admin) que marca `paid` al aprobar y deja `pending` (para reintentar) al rechazar. Frontend: `carrito.html`/`carrito.js` con selector de método de pago (antes fijo en simulado); `payment-providers.js` con provider `transferencia` (no confirma nada al momento, solo avisa `pending`); `perfil.js` (`buildPaymentProofSection`) con input de archivo para subir el comprobante desde "Mis compras"; `vender.js` (`renderPendingPayments`) con panel nuevo "Pagos por confirmar" en el dashboard (ver comprobante vía signed URL + Confirmar/Rechazar). Verificado con `BEGIN;...ROLLBACK;`: flujo completo cliente-sube→vendedor-confirma probado de punta a punta contra la base real. Nota de alcance: el panel del vendedor no muestra email/nombre del cliente (RLS de `profiles` solo deja ver la fila propia; ampliarlo es una decisión de privacidad aparte).

- **F2-07** (`A113-179`) — Mercado Pago real (Checkout Pro). Dos Edge Functions nuevas en Supabase (primera vez que el proyecto usa Edge Functions — hasta acá todo pasaba por RPCs de Postgres): `mp-create-preference` (`verify_jwt: true`, se llama desde el navegador con la sesión del cliente; el cliente Supabase interno se crea reenviando el header `Authorization` del que llama, así las RLS existentes de `orders` deciden qué puede pagar — nunca confía en `order_ids` del cliente sin revalidar) y `mp-webhook` (`verify_jwt: false` a propósito, es Mercado Pago llamando anónimo; la seguridad acá es no confiar en el payload del webhook y siempre re-consultar el pago real vía `GET /v1/payments/{id}` con el Access Token antes de marcar algo pagado — un webhook falso con un ID inventado nunca pasa esa verificación). El Access Token vive **solo** como secret de Edge Functions (`MP_ACCESS_TOKEN`, seteado a mano en el dashboard de Supabase — no hay tool de MCP para setear secrets, ni CLI logueada en este entorno); nunca tocó el frontend ni el repo. `js/payment-providers.js`: provider `mercadopago` nuevo, a diferencia de simulado/transferencia no confirma nada sincrónicamente — llama a `mp-create-preference` y redirige el navegador al `init_point` devuelto (la confirmación real llega después, async, vía el webhook). `carrito.js` ajustado para el caso `redirecting` (no muestra el toast de "pagado", el browser ya está por navegar afuera). Bug propio encontrado probando el flujo real en el navegador: `initPaymentMethodEvents()` (código de antes de F2-07) solo sabía leer los radios `simulado`/`transferencia` — elegir "Mercado Pago" en la UI pagaba silenciosamente como simulado. Corregido. Nota de credenciales: en el modelo actual de Mercado Pago las credenciales de prueba también usan el prefijo `APP_USR-` (no `TEST-` como versiones viejas de su panel) — lo que importa es estar parado en la pestaña "Credenciales de prueba" del dashboard, no el prefijo. **Verificado de punta a punta en producción real** (no solo `BEGIN;...ROLLBACK;`, un caso más): orden creada → checkout de Mercado Pago real → pago con usuario comprador de prueba → webhook recibido (`200`) → orden pasó a `paid` con `payment_id` real de MP → notificación `order_paid` creada para el vendedor. Hardening pendiente, no bloqueante: verificar la firma (`x-signature`) del webhook en vez de solo re-confirmar contra la API (ya es seguro sin eso, pero es una capa extra recomendada por MP).

**Fase 2 (Compra: checkout, órdenes y pagos) completa** — F2-01 a F2-07, sin ítems pendientes.

## Hallazgos críticos corregidos (2026-07-09), encontrados construyendo F3-01
- **A113-238** (migración 23) — `handle_new_user()` (desde `10_fix_auth_triggers.sql`) leía `raw_user_meta_data->>'account_type'` (100% controlado por el cliente en `options.data` de `signUp()`) y asignaba directamente `profiles.role = 'vendedor'/'repartidor'/'admin'` sin ninguna aprobación — cualquiera con la anon key pública podía autoasignarse admin. Mitigación parcial que ya existía: la función nunca tocaba `raw_app_meta_data`, así que el JWT seguía dando `'cliente'` y las policies RLS/RPCs sensibles (que chequean el JWT, no `profiles.role`) seguían bloqueando escrituras — pero `guardPage({requireRole})` y `vender.js` sí leen `profiles.role` directo, así que un admin/vendedor autoasignado vería esas pantallas protegidas, y el bug rompía por completo el flujo D6 (aprobación manual + CUIT). Auditado antes de aplicar: 0 profiles con `role != 'cliente'` en producción, no hubo explotación. Fix: `handle_new_user()` ahora siempre asigna `'cliente'`; subir de rol es solo vía RPC de aprobación explícito.
- **A113-239** (migración 24) — Al testear el equivalente de `approve_seller_request` para repartidor, encontré que **ese mismo RPC estaba roto en producción**: `prevent_role_update_on_profile` chequeaba `auth.role()` (GUC de sesión = `'authenticated'` para cualquier llamada logueada, incluida una a un RPC `SECURITY DEFINER`), así que ningún admin pudo aprobar jamás un vendedor real (verificado con `BEGIN;...ROLLBACK;` contra la única solicitud real pendiente, "Test Bakery" — sigue `pending` desde 2026-06-19). Fix: el trigger ahora chequea una bandera de transacción explícita (`app.role_change_authorized`, seteada por las funciones de aprobación con `set_config(..., true)`, `is_local` así se resetea sola) en vez de la GUC de sesión — un cliente no tiene forma de setearla. Re-testeado: `approve_seller_request` ahora sí funciona.

## Progreso (Fase 3 — Delivery y rol repartidor)
### ✅ Hecho
- **F3-01** (`A113-181`) — Onboarding del repartidor, mismo patrón D6 que vendedor: tabla `delivery_requests` (migración 25: nombre, teléfono, vehículo, patente opcional) + RPC `approve_delivery_request` (SECURITY DEFINER, solo admin, con la bandera de transacción del fix de A113-239); subir a `'repartidor'` es solo vía este RPC, nunca al signup (evita repetir A113-238). Frontend: `pages/repartidor.html` + `js/repartidor.js` (formulario + vista de estado pendiente/rechazada/aprobado — el panel de pedidos en sí es F3-02); `admin.js`/`admin.html` con una segunda tabla "Solicitudes de Repartidores" (mismo patrón que comercios). Enlaces agregados en `home.html` (dropdown + footer) y página sumada a `vite.config.js`. Verificado con `BEGIN;...ROLLBACK;`: auto-aprobación rechazada, aprobación real de admin funciona de punta a punta.

- **F3-02** (`A113-182`) — Panel del repartidor. Tabla `deliveries` (migración 26, extraída de `13_target_data_model.sql`) con el `insert` cambiado a propósito: el repartidor se auto-asigna vía RPC `claim_delivery` (bloquea la orden con `for update`, valida `delivery`+`paid`, la unique constraint en `order_id` serializa la carrera si dos repartidores lo intentan a la vez), no una policy de insert directa (ese diseño era para que la tienda/admin asignara). Nueva policy `orders_select_repartidor` (ve órdenes `delivery`+`paid`, nunca antes de que el pago se confirme). Fix de diseño encontrado armando el panel (migración 27): `deliveries_select_participants` solo dejaba ver la fila al repartidor asignado a ella — así ningún repartidor podía saber si un pedido ya estaba tomado por otro, y seguía apareciendo como "disponible" para todos; ahora cualquier repartidor ve cualquier fila de `deliveries`. `js/repartidor.js`: panel real con "Pedidos disponibles" (botón "Tomar pedido") y "Mis entregas". Verificado con `BEGIN;...ROLLBACK;`: flujo completo cliente-crea-y-paga → repartidor-ve-y-toma → segundo intento rechazado → cliente no-repartidor rechazado.

- **F3-03** (`A113-183`) — RPC `update_delivery_status` (migración 28, SECURITY DEFINER): transiciones solo hacia adelante y de a una (`assigned→picked_up→delivered`), solo el repartidor asignado; sincroniza `orders.status` (`picked_up→'shipped'`, `delivered→'completed'`). `'cancelled'` queda en el CHECK constraint pero a propósito sin wireear — qué pasa con el pedido al cancelar (¿vuelve a estar disponible? ¿interviene vendedor/admin?) es una decisión de producto fuera de alcance. `repartidor.js`: botones "Marcar en camino"/"Marcar entregado" en cada tarjeta de "Mis entregas". Verificado con `BEGIN;...ROLLBACK;`: flujo completo hasta `completed`, saltar `picked_up` se rechaza.

- **F3-04** (`A113-184`) — Sin migración nueva, solo consultas sobre tablas ya existentes. `perfil.js`: "Mis compras" muestra el estado del envío (`DELIVERY_STATUS_LABELS`) cuando el pedido es `delivery` y ya tiene un `deliveries` asociado. `vender.js`: sección nueva "Envíos en curso" en el dashboard (`renderShipmentsInProgress`) con los pedidos `delivery` de la tienda en estado `paid`/`shipped` y su estado de entrega. **"En tiempo real" NO implementado como push** (Supabase Realtime) — se actualiza al recargar, igual que el resto de los paneles del proyecto; implementar `postgres_changes` sobre `deliveries` queda como mejora futura, decisión explícita para no meter un patrón de suscripción sin poder probarlo con una sesión real en el navegador.

**Fase 3 (Delivery y rol repartidor) completa** — F3-01 a F3-04. Queda **F3-05** (`A113-185`, ubicación/seguimiento del repartidor + tarifas por distancia) marcado "Futuro" en el roadmap, no bloquea nada.

## Progreso (Fase 4 — Carrito robusto y favoritos)
### ✅ Hecho
- **F4-01** (`A113-187`) — Sincronizar carrito en la nube. `user_carts` ya existía (`09_user_carts.sql`) sin usar — sin migración nueva. `cart-utils.js`: `saveCart()` ahora también hace `pushCartToCloud()` (upsert por `user_id`, fire-and-forget); `initCartSync()` (se ejecuta al importar el módulo, una vez por pestaña vía `sessionStorage`) trae el carrito de la nube si hay sesión y lo mezcla con el local (`mergeCarts`: suma cantidades con tope `MAX_QTY`, usa los datos de display del local por ser el más reciente). Verificado: lógica de merge probada en el navegador (casos solo-local/solo-nube/repetido en ambos); upsert + RLS (un usuario no lee el `user_carts` de otro) probado contra la base real con `BEGIN;...ROLLBACK;`.

- **F4-02** (`A113-188`) — `carrito.js` (`validateCartFreshness`, corre al cargar la página, sin migración nueva): consulta `is_active`/`stock`/`price` reales de los productos del carrito — quita los inactivos/sin stock, ajusta cantidades al stock disponible, actualiza precios desactualizados. Mismo criterio que `create_order` (nunca confiar en lo guardado en el cliente) pero mostrado en el carrito, antes de llegar a pagar. Verificado en el navegador: producto inexistente se quita, cantidad excesiva se ajusta al stock real.

- **F4-03** (`A113-189`) — Favoritos persistentes. Tabla `favorites` (migración 29, extraída de `13_target_data_model.sql`). Antes había **2 implementaciones sin relación entre sí**: `cart-utils.js` (localStorage, grillas de home/search/comercio) y `product-modal.js` (un botón que solo togglaba una clase CSS, sin persistir nada — se reseteaba al reabrir el modal). Ahora `cart-utils.js` es la única fuente: `getFavoriteIds()`/`toggleFavorite()` (DB si hay sesión, `localStorage` si no — invitados pueden seguir marcando favoritos) y `mergeLocalWishlistIntoFavorites()` (al loguearse, sube lo marcado como invitado y limpia el local — llamado desde `initCartSync`, mismo punto de entrada de F4-01). `product-modal.js` y `perfil.js` (`loadFavoritos`, antes leía `localStorage` directo pese a ser una pantalla que solo existe logueado) reescritos para usar lo mismo. Verificado: RLS + unique constraint probados con `BEGIN;...ROLLBACK;`; patrón upsert-compuesto+delete probado igual; en el navegador, marcar favorito como invitado guarda bien en `localStorage`.

**Fase 4 (Carrito robusto y favoritos) completa** — F4-01 a F4-03 (no tiene ítems "Futuro" a diferencia de otras fases).

## Progreso (Fase 5 — Experiencia del vendedor)
### ✅ Hecho
- **F5-01** (`A113-191`) — Ya estaba hecho en F1-04 (mismo alcance duplicado en el roadmap). Cerrado sin trabajo nuevo.
- **F5-02** (`A113-192`) — CRUD completo de productos en `vender.js`: el form de alta ("Publicar nuevo producto") ahora también sirve para editar (`editingProductId`, `openEditProductForm`, botón lápiz por fila precarga título/precio/stock/descripción/imagen/rubro y cambia el submit a UPDATE). Botón activar/desactivar por fila (ícono ojo, togglea `is_active`; filas inactivas se ven atenuadas con badge "(Inactivo)"). Sin migración nueva.
- **F5-05** (`A113-195`) — Ofertas. `products.compare_at_price` (migración 30). `cart-utils.js` (`buildPriceRow`, compartido): precio tachado + badge `-N%` cuando `compare_at_price > price`; reemplaza 3 copias casi idénticas del mismo bloque en `home.js`/`search.js`/`comercio.js`. `vender.js`: campo "Precio anterior (opcional)" en el form, validado. `producto.js` (detalle) queda sin tocar a propósito — usa un markup propio sin CSS de tachado, fuera de alcance contenido. Sin regresión: productos sin oferta se ven igual que antes.

- **F5-07** (`A113-197`) — Estadísticas reales del dashboard, sin migración nueva. `vender.js` (`loadDashboardStats`): "Ventas Hoy" y "Ingresos del Mes" desde `orders` (`payment_status='paid'`, filtradas por `store_id` y fecha). De paso, corregido bug menor: "Productos Activos" contaba TODOS los productos (no filtraba `is_active`).

- **F5-08** (`A113-198`) — `stores.description`/`zone`/`hours` (migración 31). Resuelve de paso un bug histórico: `comercio.js` leía `store.description` sin que la columna existiera, siempre caía al fallback. Sección nueva "Perfil de mi comercio" en `vender.js`: logo, dirección, teléfono, zona, horarios (texto libre) y descripción — `UPDATE` simple sobre `stores`, la policy ya lo permitía. `name`/`cuit`/`status` no editables desde acá a propósito (ya pasaron por aprobación del admin, D6).

- **F5-06** (`A113-196`) — Gestión de pedidos, sin migración nueva. Sección "Mis pedidos" en `vender.js`: lista las últimas 50 órdenes de la tienda (antes solo había vistas parciales: pagos por confirmar F2-04, envíos en curso F3-04). El flujo `delivery` lo maneja el repartidor (F3-02/F3-03) — acá solo se ve. Para `pickup`, el vendedor gestiona directo (`UPDATE` simple, la RLS ya lo permitía): "Listo para retirar" y "Marcar entregado"; cancelar disponible para pending/paid. Verificado con `BEGIN;...ROLLBACK;` contra la base real.
- **F5-04** (`A113-194`) — Tabla `product_images` (migración 32). Bucket `products` ya existía (público, policy de upload vendedor/admin) — no se tocó storage, solo la tabla de URLs. `vender.js`: input de archivos múltiple en el form de producto; al guardar sube a `{productId}/{timestamp}-{nombre saneado}` (mismo criterio anti path-traversal que F2-04) e inserta filas con `getPublicUrl()`; al editar, miniaturas con botón de borrado. `producto.js`: fila de miniaturas debajo de la imagen principal (la primera siempre `image_url`, portada ya usada en toda la app) — clic cambia la imagen grande. Verificado con `BEGIN;...ROLLBACK;`: dueño del producto puede insertar, otro vendedor rechazado por RLS; sin regresión en productos sin fotos extra.
- **F5-03** (`A113-193`) — Tabla `product_variants` (migración 33): `name`/`price`/`stock`/`sku` por variante, mismo patrón de RLS ownership que `product_images`. **A propósito NO integrado al carrito/checkout** — implicaría llevar `variant_id` en `order_items`/`create_order` (hoy solo `product_id`), cambio de fondo al núcleo de compra de Fase 2; queda para una tarea futura. `vender.js`: sección "Variantes" en el form de producto, oculta salvo editando un producto existente (necesita `product_id` real) — lista con borrado (`renderVariantsManager`) + alta inline nombre/precio/stock. `producto.js`: bloque informativo "Opciones disponibles" (solo lectura, no cambia qué agrega "Agregar al carrito"). Verificado con `BEGIN;...ROLLBACK;`: dueño inserta, otro vendedor rechazado por RLS; sin regresión en productos sin variantes.

- **F5-09** (`A113-199`) — UI diferenciada del vendedor, dentro de la paleta azul del sitio pero con acento propio (`--bl-vendor-accent: #0e7490`, cyan/teal oscuro — no compite con `--bl-primary`, que sigue siendo el azul de las páginas de cliente). Solo en `pages/vender.html` (estilos inline propios de esa página, no tocan `home.css` compartido): badge "Modo Vendedor" en el navbar (oculto en mobile ≤768px para no romper el layout), borde superior de acento en `.vender-container`, y `.form-btn`/`.btn-outline`/`.stat-card h3`/focus de inputs ahora usan el acento de vendedor en vez del azul primario. Sin cambios de estructura ni de flujo, solo de color/identidad visual. Sin sesión real para ver el resultado renderizado en el navegador (redirige a login) — verificado por lectura de código + sin errores de consola al cargar la página.

**Fase 5 (Experiencia del vendedor) completa.**

## Progreso (Fase 6 — Panel de administración)
### ✅ Hecho
- **F6-01** (`A113-201`) — Aprobar/rechazar comercios + CUIT visible: ya estaba hecho (F1-04/F3-01). "Notificar resultado" queda diferido a Fase 8 (no hay sistema de notificaciones todavía).
- **F6-04** (`A113-204`) — Moderación (migración 34+35). Suspender comercio: `stores_update_own` ya permitía a un admin actualizar cualquier `stores` directo (sin RPC) — se corrigió `products_select_public_active` para exigir además que el comercio esté `approved`, así que suspender de verdad oculta sus productos en home/búsqueda/detalle (no destructivo: no toca el `is_active` de cada producto). RPC `admin_set_product_active` (moderar un producto puntual de otro vendedor — `products_update_*` exige `seller_id=auth.uid()` sin excepción admin). `profiles.is_suspended` + RPC `admin_set_repartidor_suspended` + `claim_delivery`/`update_delivery_status` ahora bloquean repartidores suspendidos. `categories_delete_admin` (faltaba DELETE). Nuevas policies `profiles_select_admin`/`products_select_admin` (el admin no podía listar profiles ni ver productos ajenos inactivos). `admin.js`: tablas de comercios/repartidores con suspender-reactivar, buscador de productos, comprobantes de transferencia de TODOS los comercios (reusa `confirm_transfer_payment`, ya soportaba admin).
- **F6-02** (`A113-202`) — CRUD de categorías en `admin.js` (insert/update ya eran admin-only; se sumó delete). Sin migración de tabla.
- **F6-03** (`A113-203`) — CRUD de cupones en `admin.js` (`coupons_all_admin` ya daba RLS completa). Sin migración.
- **F6-05** (`A113-205`) — Métricas globales en `admin.js`: usuarios por rol, comercios por estado, ventas totales, entregas en curso/completadas. Sin migración (solo necesitó `profiles_select_admin` de F6-04).

**Fase 6 (Panel de administración) completa.**

## Progreso (Fase 7 — Social: reseñas y chat)
### ✅ Hecho
- **F7-01** (`A113-207`) — Reseñas y calificaciones (migración 36, tabla `reviews`: target_type product/store, rating 1-5, comment, `is_hidden`/`report_reason`/`reported_at` para F7-03). Módulo nuevo `js/reviews-utils.js` (`renderReviewsSection`, compartido): promedio+estrellas, lista de reseñas, form propio (upsert por `unique(target_type,target_id,client_id)` — un cliente edita su reseña en vez de duplicarla). Integrado en `producto.js` (target_type='product') y `comercio.js` (target_type='store'). Simplificación a propósito: no se resuelve el nombre del autor (se muestra "Cliente" genérico) — `reviews.client_id` referencia `auth.users`, no hay ningún otro lugar del proyecto que embeba nombres desde esa FK.
- **F7-02** (`A113-208`) — Chat comprador-vendedor (migración 37, tablas `conversations`/`messages`, extraídas de `13_target_data_model.sql` sección 9 + `product_id` agregado a `conversations` para el contexto de producto que pide el roadmap). Página nueva `pages/mensajes.html` + `js/mensajes.js`: lista de conversaciones + hilo de mensajes + responder, usable tanto por cliente como por vendedor (misma tabla, la RLS ya distingue el rol). Botón "Contactar al vendedor" en `producto.js`/`comercio.js` que crea o encuentra la conversación (`upsert` por `client_id`+`store_id`) y redirige. Sin Supabase Realtime (mismo criterio que el resto del proyecto — se actualiza al recargar/reabrir el hilo).
- **F7-03** (`A113-209`) — Moderación de reseñas: botón "Reportar" en la UI de reseñas (`reviews-utils.js`, llama RPC `report_review` — cualquier usuario puede reportar una reseña ajena, no solo el autor). Sección nueva "Reseñas reportadas" en `admin.js`/`admin.html`: lista las reportadas con botón Ocultar/Mostrar (`reviews.is_hidden`, ya cubierto por la policy `reviews_update_own` con excepción admin). Moderación de mensajes de chat deliberadamente fuera de alcance — son privados entre 2 partes (cliente/vendedor), menor necesidad de moderación pública que las reseñas.

**Bug crítico de datos encontrado y corregido en esta sesión** (no relacionado con Fase 7 directamente, descubierto al verificar `producto.js` en el navegador): 8 productos (de 64) tenían `store_id = NULL` — un lote de seed huérfano del 2026-06-02, anterior y distinto a los seeds documentados (`04`/`06`, del 2026-06-19), sin `category_id` y con un `seller_id` compartido por las 14 tiendas de seed (no servía para inferir la tienda real). 4 de los 8 eran duplicados exactos de productos ya bien sembrados. Nota: gracias a la migración 34 (ver investigación de abajo) estos ya NO se mostraban con el fallback "Tienda" genérico en `home.js` — directamente no aparecían en ninguna grilla pública (`exists(...status='approved')` falla si `store_id` es null); pero seguían `is_active=true`, visibles en el dashboard del vendedor (`products_select_own` no filtra por `store_id`) y rompían al acceder por link directo a `producto.html?id=...`. Sin datos suficientes para reconstruir la tienda real de ninguno — consultado con el usuario, se optó por desactivarlos (`is_active = false`, reversible, no se borró nada) en vez de adivinar una tienda. Verificado: 0 productos activos con `store_id` nulo después del fix.

**Fase 7 (Social: reseñas y chat) completa.**

## Progreso (Fase 8 — Notificaciones)
### ✅ Hecho
- **F8-01** (`A113-211`) — Centro de notificaciones. Migración 38: tabla `notifications` (extraída de `13_target_data_model.sql` sección 10, sin policy de INSERT para `authenticated` a propósito — las crea el backend) + `create_notification()` (helper `SECURITY DEFINER` interno) + triggers `reviews_notify_new`/`messages_notify_new` (nueva reseña/mensaje notifica al otro participante) + `create_order`/`confirm_simulated_payment`/`confirm_transfer_payment`/`update_delivery_status` parcheados para notificar en cada evento clave (pedido creado→vendedor, pagado→vendedor/cliente según el medio, enviado/entregado→cliente). `js/notifications-utils.js` (nuevo, compartido): `renderNotificationsSection` con DOM API. Integrado como pestaña nueva en `perfil.html` (cliente) y sección nueva en el dashboard de `vender.js` (vendedor). Bug propio encontrado y corregido antes de aplicar: los triggers `notify_new_review`/`notify_new_message` habían quedado invocables directo vía RPC (`get_advisors` los marcó) — se les revocó `EXECUTE` de `anon`/`authenticated`, igual que el resto de las `SECURITY DEFINER` internas del proyecto.
- **F8-02**/**F8-03** (`A113-212`, `A113-213`) — Canales Email (Resend) y WhatsApp (Cloud API) — **bloqueados**, necesitan credenciales de un proveedor externo que no existen en este entorno. La columna `notifications.channel` ya soporta `'email'`/`'whatsapp'` para cuando se sumen sin tocar el esquema de nuevo. No movidos a "En curso" en Jira (no hay trabajo real posible sin las credenciales). **Adelantado (2026-07-12)**: [docs/WHATSAPP_TEMPLATES.md](docs/WHATSAPP_TEMPLATES.md) — las 15 plantillas de mensaje (una por cada `type` real de `notifications`) ya redactadas y listas para cargar en Meta Business Manager en cuanto se resuelva la cuenta, con las variables mapeadas 1:1 contra el `payload` jsonb real de cada trigger.
- **F8-04** (`A113-214`) — Marcado "Futuro" en el roadmap (in-app/push cuando exista la app de celular) — no aplica todavía.

## Progreso (Fase 9 — UX/UI, identidad y PWA)
### ✅ Hecho
- **F9-03** (`A113-218`) — Home con destacados/ofertas reales. `js/home.js` (`loadProducts`) no traía `compare_at_price` en el select — aunque F5-05 (Fase 5) ya calculaba el badge de descuento vía `buildPriceRow`, en el home nunca se veía porque el dato ni llegaba. Bug más visible: el link "Ofertas" del nav (`js/home.js`/`js/search.js`) mandaba a `search.html?cat=ofertas`, y `search.js` trataba "ofertas" como si fuera un slug real de `categories` (`.eq('categories.slug', 'ofertas')`) — como esa categoría no existe, el filtro nunca devolvía nada. Fix: `search.js` ahora detecta `filterState.category === 'ofertas'` y filtra `.not('compare_at_price', 'is', null)` en vez de por categoría. Verificado en el navegador: `search.html?cat=ofertas` corre sin errores (hoy da 0 resultados porque ningún producto real tiene oferta cargada todavía — comportamiento correcto, antes daba 0 por la razón equivocada).
- **F9-02** (`A113-217`) — PWA instalable. `public/manifest.webmanifest` (nombre, ícono, `display: standalone`, `theme_color` = `--bl-primary`), `public/icon.svg` (mismo logo/isotipo ya usado en los navbars, reutilizado como ícono de app — sin generar rasters PNG, un solo ícono SVG `sizes: "any"` cubre instalación en Chrome/Android; Safari/iOS no soporta ícono SVG para "Agregar a inicio" pero no rompe nada, queda como límite conocido). `public/sw.js`: service worker sin lista de precache (los nombres de JS/CSS llevan hash de Vite y cambian en cada build; no hay integración con un plugin de build) — cachea en runtime: red-primero para navegación (HTML, con cache como respaldo offline) y cache-primero para assets estáticos con hash (nunca quedan viejos). Registrado desde `js/auth-utils.js` (`navigator.serviceWorker.register('/sw.js')`), que se importa en prácticamente todas las páginas. `<link rel="manifest">`/`theme-color`/ícono agregados al `<head>` de las 15 páginas HTML del sitio. Verificado en el navegador: manifest y sw.js devuelven 200, `getRegistrations()` muestra el worker `activated`.
- **F9-04** (`A113-219`) — Accesibilidad, acotado a lo concreto (no una auditoría completa del sitio). Encontrados y corregidos 2 botones/inputs con `outline: none` sin ningún reemplazo visual (foco invisible al navegar con teclado): `.password-toggle-btn` en `auth.css` (mostrar/ocultar contraseña) y `.pm-quantity__value` en `product-modal.css` (input de cantidad en el modal rápido) — el resto de los `outline: none` del sitio ya tenían un `border-color`/`box-shadow` de reemplazo, no eran bugs. `product-modal.css` ya tenía un bloque `:focus-visible` completo para sus botones — solo le faltaba este input, agregado a la misma lista.
- **F9-05** (`A113-220`) — Responsive, acotado a los gaps reales encontrados (no un rediseño mobile de cada página). `pages/admin.html` y `pages/repartidor.html` no tenían **ningún** `@media` en su `<style>` inline — agregado un breakpoint de 768px a cada una (`admin.html`: menos padding en `.admin-container`, `.admin-header` con `flex-wrap`, tablas más compactas; `repartidor.html`: menos padding en `.vender-container`, `.delivery-card` con `flex-wrap`). De paso, mismo ajuste en `vender.html` (comparte el mismo patrón de contenedor, ya tenía un breakpoint solo para el badge de F5-09, se le sumó lo mismo).
- **F9-07** (`A113-222`) — Modal rápido de producto con datos reales. Antes `js/product-modal.js` armaba todo leyendo el DOM de la tarjeta clickeada: **fabricaba el stock** con una fórmula pseudoaleatoria (`stockSeed % 40 + 5`) y el rating leía `.product-card__stars`, un elemento que las grillas de home/search/comercio nunca generan (siempre 0 estrellas + un "vendidos" inventado multiplicando ese 0 por 2.3). Reescrito: `fetchProductData(productId)` consulta Supabase de verdad (`stock`, `price`/`compare_at_price`/`offer_expires_at` con el mismo criterio de vencimiento que `buildPriceRow`, `product_images`, `product_variants`, `stores.delivery_fee`/`free_shipping_threshold`) + `fetchReviewsSummary('product', id)` (reviews-utils.js, F7-01) para el rating real — si no hay reseñas, dice "Todavía no tiene reseñas" en vez de inventar un promedio. El modal ahora abre con un estado de carga (spinner) y maneja error+reintentar si falla la consulta. Bonus real agregado de paso: galería con miniaturas reales de `product_images` (antes 1 sola imagen fija), bloque de variantes igual al de `producto.js`, pestaña nueva "Reseñas" (carga perezosa de `renderReviewsSection` al abrirla, con formulario propio incluido), "Ver tienda"/nombre del comercio ahora navegan de verdad a `comercio.html` (antes no hacían nada), envío mostrado con el costo real por tienda (F12-04) en vez de un texto genérico sin acción, y stock=0 deshabilita cantidad/acciones en vez de nunca poder ocurrir (el stock fabricado nunca daba 0). Verificado en el navegador con productos reales (nombre/precio/tienda/stock/rating coinciden con la base; pestaña de reseñas renderiza sin errores). No verificado visualmente con un producto real que tenga `product_variants`/`product_images` cargados (ninguno existe todavía en la base) — la lógica espeja el mismo patrón ya probado en `producto.js` (F5-03/F5-04).

- **F9-01** (`A113-216`) y **F9-06** (`A113-221`) — resueltos **provisionalmente** (2026-07-11), a pedido del usuario, mientras llega una vuelta de diseño real. Ver [docs/DISENOS_PROVISIONALES.md](docs/DISENOS_PROVISIONALES.md) para el detalle de qué se tocó (franja de valor con el acento cálido existente, estados vacíos consistentes, micro-interacciones básicas) y qué a propósito no (paleta/tipografía, paneles internos con CSS propio).

**Fase 9 completa** (F9-01 a F9-07, los dos últimos ítems de forma provisional).

## Progreso (Fase 10 — Calidad, testing y performance)
### ✅ Hecho
- **F10-03** (`A113-226`) — Bug crítico encontrado optimizando imágenes: **casi todas las fotos de producto y logos de tienda daban 404 en producción**, sin relación con el peso — `products.image_url`/`stores.logo_url` guardaban rutas relativas (`../Assets/images/mockups/...`) que Vite nunca copiaba a `dist/` (solo empaqueta lo referenciado estático en HTML/JS; estos valores solo existían como dato insertado por los seeds SQL, invisibles para el bundler — así es como `hero_banner.png`/`logoazulpng.png` sí llegaban a `dist/assets/`, por estar en un `<img src>` de HTML). Bonus: `meat.png`/`default-product.png`/`placeholder.png` (usados como fallback en 5 archivos JS) **nunca existieron como archivo**, rotos desde que se escribieron; y el fallback externo `https://via.placeholder.com/50` de `vender.js` ni siquiera está permitido por la CSP (`img-src`), bloqueado silenciosamente. Fix: `scripts/optimize-images.mjs` (nueva devDependency `sharp`) convierte los 24 PNG fuente a WebP (~9.9 MB → ~0.9 MB) en `public/img/*.webp` (rutas absolutas, no dependen de la profundidad de la página, a diferencia de la convención original que causó el bug); `public/img/no-image.svg` como placeholder genérico. Migración `39_fix_broken_image_paths.sql` (idempotente, aplicada: 56 productos + 10 tiendas repunteados) — verificada con `BEGIN;...ROLLBACK;` antes y `SELECT count(*)` después (0 rutas viejas). Seeds `04`/`06`/`07` actualizados para una base nueva. `loading="lazy"` sumado donde faltaba. Verificado en el navegador: fotos e logos reales, 0 solicitudes de imagen fallidas.
- **F10-04** (`A113-227`) — `renderErrorState()` nuevo en `cart-utils.js`: reemplaza los divs de error con estilos inline duplicados en home/search/comercio/producto por un estado único con botón "Reintentar" (detecta `navigator.onLine` para el mensaje de "sin conexión"). Banner global de "sin conexión" en `auth-utils.js` (mismo patrón self-contained que el toast global ya existente ahí — no depende de qué CSS cargue la página), escucha `online`/`offline`.
- **F10-05** (`A113-228`) — `apple-touch-icon.png` (180×180, generado con `sharp`) en las 16 páginas — cierra el gap de Safari/iOS documentado en F9-02. Open Graph + meta description en las 6 páginas de contenido público (home/producto/comercio/search/info/terminos) — sin SSR, contenido genérico de sitio (no por-producto). `public/robots.txt` nuevo (bloquea páginas privadas).
- **F10-01** (`A113-224`) — [docs/TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md): checklist de testing manual por rol (cliente/vendedor/repartidor/admin) cubriendo los flujos reales de Fases 0-9.

### Diferido (a propósito)
- **F10-02** (`A113-225`, E2E con Playwright) — explícitamente opcional en el roadmap. No hay framework de testing instalado; agregarlo es una decisión de mantenimiento a futuro (quién corre los tests, en qué CI), no un fix puntual.

**Fase 10 completa** salvo F10-02 (opcional).

## Progreso (Fase 11 — Deploy y lanzamiento)
### ✅ Hecho
- **F11-01** (`A113-230`) — Hosting ya elegido y funcionando desde el arranque del proyecto: Vercel + build multipágina de Vite. Cerrado sin trabajo nuevo, solo confirmación.
- **F11-02** (`A113-231`) — Variables de entorno en Vercel: confirmadas funcionando (el sitio en producción conecta a Supabase correctamente, lo cual solo pasa si `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` están bien cargadas ahí). Bug real encontrado y corregido esta sesión: el login con Google redirigía a `localhost` con `ERR_CONNECTION_REFUSED` en producción — no era el código (`js/login.js`/`js/register.js` ya arman `redirectTo` dinámico con `window.location.origin`), sino que **Auth → URL Configuration** de Supabase (Site URL + Redirect URLs) seguía apuntando a `localhost` de cuando se armó el proyecto en desarrollo. Corregido a mano por el usuario en el dashboard (Site URL → `https://proyectopdisc.vercel.app`, agregado a Redirect URLs). **Verificado por el usuario en producción real: login con Google funciona.** Documentado en `docs/DEPLOY.md` para no repetir el error si cambia el dominio.
- **F11-05** (`A113-234`) — Checklist go-live corrido: RLS activa en las 22 tablas de `public` (verificado por SQL directo, no solo por policies individuales); buckets con políticas correctas (`payment-proofs` privado + 8 policies de storage cubriendo products/stores/payment-proofs); ningún secreto real en el repo (`.env` solo tiene las claves públicas de Supabase por diseño, `MP_ACCESS_TOKEN` vive solo en Supabase). `get_advisors` (security): corregido `is_valid_cuit` (le faltaba `search_path` fijo, único hallazgo genuino de 15 — el resto son RPCs `SECURITY DEFINER` invocables por `authenticated` a propósito, es la superficie real de la app, cada una valida el permiso adentro). **Backups + "Leaked Password Protection": ambos gateados por el plan Pro de Supabase** (corrección propia — asumí que el segundo era un toggle gratis, no lo es). El proyecto está en plan **Free**; consultado con el usuario, decidió **quedarse en Free hasta que el proyecto facture** y recién ahí upgradear a Pro (destraba las dos cosas de una — no es un descuido, es una decisión de costo consciente y secuenciada).
- **F11-07** (`A113-236`) — Documentación final. `README.md` reescrito completo (el anterior describía la app como si solo tuviera login/vender, de antes de Fases 2-10). Docs nuevos: [docs/DEPLOY.md](docs/DEPLOY.md) (guía de deploy paso a paso, incluye el gotcha de Google OAuth de F11-02), [docs/GUIA_USUARIO.md](docs/GUIA_USUARIO.md) (qué puede hacer cada rol, en lenguaje de usuario final — sirve también para F11-06 cuando lleguen vendedores reales), [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) (resumen técnico del sistema — RLS+RPCs+Edge Functions, modelo de datos, decisiones deliberadas que pueden sorprender a alguien nuevo en el repo).
- **F11-08** (`A113-237`) — Limpieza verificada, sin trabajo nuevo necesario: 0 `console.log` en `js/*.js`, 0 archivos JS sin referenciar desde ninguna página, seeds ya documentados e idempotentes (F0-07), versionado de `dist/` ya decidido y documentado desde el inicio del proyecto.

### Pendiente (necesita acción o decisión del usuario, no autónoma)
- **F11-03** (`A113-232`) — Edge Functions en prod: **pagos** (Mercado Pago) ✅ hecho (F2-07). Email/WhatsApp siguen bloqueados por falta de credenciales externas (F8-02/F8-03, sin cambios). No se cierra el ticket completo hasta que se resuelva esa parte.
- **F11-04** (`A113-233`) — Dominio propio: requiere comprar un dominio (decisión de costo del usuario). Hoy el sitio corre en `proyectopdisc.vercel.app`. Instrucciones para cuando se compre uno están en `docs/DEPLOY.md` (incluye el paso de repetir la config de Google OAuth con el dominio nuevo).
- **F11-06** (`A113-235`) — Cargar comercios reales: las 14 tiendas/64 productos actuales son datos de seed/mock. Hace falta que vendedores reales se registren y sean aprobados (flujo ya funciona, ver F1-04/F3-01) — es un tema de contenido/negocio, no de código.

## Legal (2026-07-10) — términos, privacidad, botón de arrepentimiento
No estaba en el roadmap original como fase propia, pedido directo del usuario tras repasar
qué falta para el lanzamiento. **Disclaimer que le di al usuario y que sigue vigente: no soy
abogado — todo el texto legal es un borrador con criterios generales de la ley argentina,
recomendado que lo revise un abogado antes del lanzamiento real.**

- **`pages/terminos.html` reescrita por completo** — tenía **Lorem Ipsum** desde que se creó (nunca tuvo contenido real, hallazgo encontrado al ir a agregar la política de privacidad al lado). Contenido nuevo: qué es Baradero Local (intermediario, no vendedor), tipos de cuenta, pagos, envío/retiro, **derecho de arrepentimiento** (Ley 24.240 + Res. 424/2020, 10 días hábiles), responsabilidades de los comercios, reseñas, límite de responsabilidad, ley aplicable.
- **`pages/privacidad.html` (nueva)** — qué datos se recolectan (aclarando explícitamente que los datos de tarjeta los procesa Mercado Pago directamente, nunca los servidores propios), para qué se usan, con quién se comparten (Supabase/Mercado Pago/Google/Vercel), derechos del usuario (Ley 25.326), seguridad (RLS), retención. Agregada a `vite.config.js` y enlazada desde el footer de home/search/comercio/info/terminos.
- **Botón de arrepentimiento — implementado de verdad, no solo el texto legal.** Migración `40_order_revocation.sql`: columna `orders.revocation_requested_at` + RPC `request_order_revocation` (`SECURITY DEFINER`): valida ownership, que la orden esté `paid`, que no se haya solicitado antes (idempotente) y el plazo (15 días corridos como buffer conservador que siempre cubre los 10 días hábiles legales, sin necesitar un calendario de feriados completo). No procesa el reembolso en sí — igual que `confirm_transfer_payment`, deja constancia y notifica al vendedor (`create_notification`, tipo `revocation_requested`) para que lo gestione manualmente. Frontend: botón "Solicitar arrepentimiento" en `perfil.js` ("Mis compras", visible en pedidos pagados dentro del plazo), badge de aviso en `vender.js` ("Mis pedidos") cuando hay una solicitud pendiente — el vendedor usa el botón "Cancelar" que ya existía (F5-06) una vez que resolvió la devolución. Verificado con `BEGIN;...ROLLBACK;` simulando `auth.uid()` (3 casos: alta exitosa, idempotencia, rechazo de orden ajena) antes de aplicar para real.
- **`pages/info.html`** — la sección "Políticas de Devolución" no mencionaba el derecho de arrepentimiento (podía leerse como que la devolución dependía solo de cada comercio); corregida para linkear al botón real y a los Términos/Privacidad nuevos.

### Backlog mencionado por el usuario (2026-07-10), no abordado todavía — a propósito
El usuario pidió arrancar por lo legal, pero mencionó varios pendientes más para después:
- **Pulido de responsive**: "detalles que suman" — sin especificar dónde todavía, queda para cuando el usuario los señale o para una pasada dedicada.
- **Interfaces del vendedor + tab de "insights"**: resuelto provisionalmente el 2026-07-11 (ver sección "Diseños provisionales" más abajo y [docs/DISENOS_PROVISIONALES.md](docs/DISENOS_PROVISIONALES.md)) — el usuario todavía va a pasar diseños propios, esto es un placeholder funcional con datos reales mientras tanto.
- **Apps nativas (App Store / Google Play)**: recomendación dada, no iniciada. Google Play: viable barato envolviendo la PWA existente con una Trusted Web Activity (Bubblewrap/PWABuilder, ~USD 25 cuenta de developer). Apple: más difícil, suele rechazar apps que son "solo un sitio envuelto" (guideline 4.2) salvo que tengan algo nativo real — necesitaría Capacitor + alguna función nativa, USD 99/año cuenta de developer. Es un proyecto aparte, no algo para una sesión de pasada.
- El usuario también avisó que "seguramente" hay más cosas que se está olvidando — no hay una lista cerrada, van a ir apareciendo.

## Progreso (Fase 12 — Backlog post-lanzamiento)
Salió de una auditoría pedida por el usuario ("qué le falta al proyecto desde cliente/vendedor/
admin"). Tablero de Jira creado (`A113-240` padre, `A113-241..258` subtareas F12-01 a F12-18,
ordenadas de mayor a menor prioridad — ver `docs/ROADMAP.md` sección 17.1 para el detalle
completo de los 18 ítems, hechos y pendientes).

### ✅ Hecho
- **F12-01** (`A113-241`) — Bug real encontrado en la propia auditoría: `approve_seller_request`/`approve_delivery_request` nunca notificaban al usuario aprobado, y el rechazo (`admin.js`, un `UPDATE` directo, no un RPC) tampoco. Fix con un **trigger genérico** (`notify_request_status_change`, migración `41_notify_request_status.sql`) en `seller_requests`/`delivery_requests` que dispara en cualquier cambio de `status` a `approved`/`rejected` — cubre los dos caminos (RPC de aprobación + update directo de rechazo) sin duplicar la llamada a `create_notification` en cada lugar. Verificado con `BEGIN;...ROLLBACK;` aprobando una solicitud pending real ("Test Bakery").
- **F12-02** (`A113-242`) — Sección nueva "Solicitudes de arrepentimiento" en `admin.js`/`admin.html`: lista todas las órdenes con `revocation_requested_at` seteado, cross-tienda, con un badge "Resuelto"/"Pendiente de resolución" (según si `status='cancelled'`). Es solo de **auditoría** — el admin no resuelve nada acá, eso lo sigue haciendo el vendedor con "Cancelar" (F5-06) una vez coordinada la devolución. RLS de `orders` ya dejaba ver todo al admin (`orders_select_own` incluye un bypass de admin embebido), no hizo falta ninguna policy nueva.
- **F12-03** (`A113-243`) — **Cupones propios por vendedor** (pedido explícito del usuario). `coupons.store_id` (nullable — null = cupón global de admin, no-null = de un vendedor) + 3 policies nuevas (`coupons_insert/update/delete_own_store`, scoped a `exists(stores donde owner_id = auth.uid())`); los cupones globales del admin no se tocan (siguen bajo `coupons_all_admin`). `create_order` reescrita: el descuento ahora se calcula **por tienda dentro del mismo loop** en vez de una vez para todo el carrito — un cupón de vendedor solo descuenta su propia tienda, si el carrito tiene productos de otro comercio ese comercio no se ve afectado. UI nueva "Mis cupones" en `vender.js`/`vender.html` (mismo patrón de filas `<div>` que "Mis pedidos", esta página no usa `<table>`). `carrito.js`: el preview de cupón ahora avisa si el código es de un comercio que no está en el carrito (antes decía "¡aplicado!" igual, aunque terminara descontando 0% en el total real). Verificado con `BEGIN;...ROLLBACK;`: cupón de tienda específica en un carrito de 2 tiendas → solo la tienda dueña del cupón se descuenta (`$1800→$1620`), la otra queda igual (`$600`).
- **F12-04** (`A113-244`) — **Envío configurable por comercio** (mismo commit que F12-03, comparten la reescritura de `create_order`). `stores.delivery_fee`/`free_shipping_threshold` (default 350/5000 — **idénticos a las constantes globales viejas**, ninguna tienda existente ve cambiar su precio de envío sin tocar nada). Inputs nuevos en "Perfil de mi comercio" (`vender.js`/`vender.html`). `carrito.js`: `calculateShippingByStore` ahora agrupa por `store_id` real (antes agrupaba por el *nombre* de la tienda como string — un bug latente si dos tiendas comparten nombre) y usa el `delivery_fee`/`free_shipping_threshold` real de cada una, poblado en `validateCartFreshness` (F4-02, se aprovecha el mismo fetch que ya revalida precio/stock para no duplicar una consulta). Verificado con `BEGIN;...ROLLBACK;`: tienda con umbral bajado a $100 → envío gratis; otra tienda con costo subido a $777 → cobra $777 en vez de $350.

- **F12-05/F12-06** (`A113-245`, `A113-246`) — **Teléfono de contacto y direcciones guardadas del cliente.** Hallazgo grande al auditar esto: `profiles.phone`/`address`/`address_details` **ya existían** en la base real y **ya estaban 100% conectados** de punta a punta en `js/perfil.js` (form "Direcciones" dentro de la pestaña "Mis datos", con prefill + guardado) — mi propio análisis de la sesión anterior estaba desactualizado, no era un hueco real de captura de datos. Dos problemas reales sí encontrados:
  1. **Estas 3 columnas nunca estuvieron en una migración versionada** — se crearon a mano en el dashboard de Supabase en algún momento (el propio comentario en `perfil.js` ya lo advertía: "si la migración SQL no se corrió, tirará error"). Backfileado ahora en `43_client_contact_and_addresses.sql` (idempotente, no cambia nada en la base real).
  2. **Nadie más podía verlas.** Ni el vendedor ni el repartidor tenían ninguna policy que les dejara leer el `profiles` de un cliente ajeno — ni siquiera de uno que les compró de verdad. RLS nueva `profiles_select_order_participants`: un vendedor ve el profile de un cliente con una orden en su tienda; un repartidor ve el de un cliente con una entrega que tiene asignada (nunca acceso general a profiles ajenos). **Importante sobre cómo se verificó esto**: `set_config('request.jwt.claim.sub', ...)` (el truco usado toda la sesión para simular `auth.uid()`) **no alcanza para probar una RLS policy plana** como esta — la conexión de la herramienta de SQL tiene `BYPASSRLS`, así que un primer intento de test dio un falso positivo (mostraba visible algo que debía estar bloqueado). Se corrigió agregando `SET ROLE authenticated;` antes de la simulación — con eso, los dos casos (dueño ve al cliente que le compró ✓, usuario sin relación no ve nada ✗→bloqueado correctamente) se verificaron bien antes de aplicar. Este matiz importa para cualquier test futuro de una policy que NO esté envuelta en una función `SECURITY DEFINER`.
  - Frontend: teléfono del cliente mostrado en `vender.js` ("Mis pedidos") y `repartidor.js` ("Mis entregas", no en "Pedidos disponibles" — recién al tomar el pedido). `orders.client_id` no tiene FK a `profiles` (sí a `auth.users`), así que no se puede embeber en un solo `.select()`; se resuelve con una segunda consulta a `profiles` por los `client_id` distintos de la página.
  - `carrito.js`: `prefillSavedAddress()` (nuevo, corre al cargar la página) precarga `profiles.address`/`address_details` en el campo de dirección de envío si está vacío — sigue siendo editable para esa compra puntual, no es de solo lectura.

- **F12-07** (`A113-247`) — **Cupones/promociones visibles públicamente.** Antes había que saber el código de antemano. La RLS `coupons_select_public` (F0, `08_coupons_schema.sql`) ya dejaba leer cualquier cupón activo/no vencido a `anon` — el hueco era 100% de frontend, sin migración nueva. `renderActiveCoupons(container, {onSelect, emptyHide})` (nuevo, `cart-utils.js`), compartida entre:
  - `home.js`/`home.html`: sección "Cupones activos" (nueva, entre la barra de farmacia y el carrusel de locales), solo informativa — clic copia el código al portapapeles.
  - `carrito.js`/`carrito.html`: fila de chips dentro del desplegable existente "¿Tenés un cupón?" — clic completa `#coupon-input` y dispara `applyCoupon()` directamente.
  - Cada chip muestra código, `-N%`, a qué tienda aplica (o "Todo Baradero Local" si es global, F12-03) y vencimiento si tiene. **Bug propio evitado antes de commitear**: el primer intento controlaba la visibilidad del `<section>` padre vía `container.parentElement.style.display` — funciona en home.html (el padre es la sección misma) pero en carrito.html el padre es el contenido colapsable "¿Tenés un cupón?", así que hubiera quedado *forzado a abierto* apenas cargaran cupones, rompiendo el toggle. Corregido con un parámetro explícito `emptyHide` (default: el propio contenedor) en vez de asumir el padre.
- **F12-08** (`A113-248`) — **Calificar al repartidor.** `reviews.target_type` (F7-01, `36_reviews.sql`) tenía un CHECK limitado a `('product', 'store')` — ampliado a `repartidor` en `44_repartidor_reviews.sql`. Sin cambios de RLS: `reviews_insert_own`/`reviews_select_public` ya son genéricas por `target_type` (ni siquiera product/store validan "compra verificada" a nivel RLS, así que tampoco se agregó esa restricción acá — consistencia con el patrón existente). Verificado con `BEGIN;...ROLLBACK;`: insert con `target_type='bogus'` sigue rechazado; calificar dos veces al mismo repartidor actualiza la fila existente (no duplica), igual que producto/tienda.
  - `perfil.js` ("Mis compras"): `buildRepartidorRatingSection(order, reviewByRepartidorId)` — widget compacto (estrellas + botón, sin comentario a propósito para no sumar una textarea más a cada fila de pedido) que aparece solo si `delivery_method='delivery'` y la entrega asociada está `delivered`. Se califica a la persona, no al pedido puntual (mismo `unique(target_type,target_id,client_id)` que producto/tienda) — si el mismo repartidor entregó 2 pedidos, la segunda calificación actualiza la primera en vez de duplicarla. `reviewByRepartidorId` se prefetchea en bloque dentro de `loadCompras` (mismo patrón que `phoneByClientId` de F12-05) en vez de una consulta por fila.
  - `repartidor.js`: línea "Mi calificación" en el dashboard (`loadMyRating`, nuevo) — reusa `fetchReviewsSummary('repartidor', userId)` de `reviews-utils.js` **sin ningún cambio** (ya era 100% genérica por `target_type`). Precedente: F5-07 ya mostraba stats privados en el dashboard del vendedor (ventas/ingresos) que no están en ninguna página pública — mismo criterio para el repartidor, que ni siquiera tiene página pública.
  - A propósito **no** se agregó ninguna vista para que el admin vea calificaciones de repartidores — no lo pidió el roadmap ni el usuario; si hace falta moderar reseñas de repartidor, el RPC `report_review` (F7-03) ya es genérico por `target_type` y la sección "Reseñas reportadas" de `admin.js` ya las mostraría sin cambios (no verificado en UI, pero la query no filtra por `target_type`).

- **F12-09** (`A113-249`) — **Aviso de "volvió el stock".** Hallazgo de alcance al construir esto: no existía **ningún** estado "Agotado" en todo el sitio — `home.js`/`search.js`/`comercio.js` seleccionan `stock` en la query pero nunca lo usan para nada (columna muerta en el frontend); un producto con `stock=0` se podía agregar al carrito sin ningún aviso (la integridad real ya estaba cubierta por `create_order`/F2-01 y `validateCartFreshness`/F4-02, que igual lo hubieran rechazado/ajustado al pagar, pero el usuario no se enteraba antes). Resuelto **solo en `producto.js`** (la página de detalle, lugar natural para esta acción puntual) — a propósito NO se agregó un badge "Agotado" a las grillas de home/search/comercio, que sería una tarea más grande (tocar el componente de product-card en 3 archivos) y no es lo que pide el roadmap.
  - `db/schema/45_stock_alerts.sql`: tabla `stock_alerts` (`product_id`+`client_id` unique) + trigger `notify_stock_alerts` en `products`, disparado únicamente en la transición exacta `OLD.stock=0 AND NEW.stock>0` (subir de 5 a 8 no dispara nada; un producto que ya se re-agotó y volvió sin que nadie pida de nuevo el aviso tampoco se re-notifica solo — cada alerta es de un solo uso, `notified_at` la "gasta"). `notified_at` solo lo escribe el trigger (`SECURITY DEFINER`) — el cliente no tiene policy de `UPDATE`, no puede marcarse a sí mismo como avisado. Verificado con `BEGIN;...ROLLBACK;`: 4 escenarios (0→5 notifica y marca 2 alertas pendientes; 5→8 no dispara nada; 8→0→3 sin re-registrar no re-notifica las ya gastadas; re-registrar tras agotarse de nuevo sí vuelve a notificar) + RLS ownership (`SET ROLE authenticated`: insertar una alerta a nombre de otro cliente rechazado, cliente ajeno no ve la alerta de otro).
  - `producto.js`: si `product.stock<=0`, el botón "Agregar al carrito" queda deshabilitado (`disabled`+estilo atenuado) y aparece `renderStockAlertWidget()` (nuevo): sin sesión ofrece loguearse (no hay modo invitado como en favoritos F4-03 — el aviso llega después a un `client_id` real, no tiene equivalente en `localStorage`); con sesión, upsert en `stock_alerts` (mismo patrón `onConflict` que `pushCartToCloud`/`submitReview`) con botón "Cancelar aviso" para el que se arrepiente.
  - `notifications-utils.js`: único caso del sistema de notificaciones que interpola datos del `payload` en el label (el resto son todos genéricos, ver arriba) — sin el nombre del producto, un aviso de stock es casi inútil si el cliente tiene varias alertas pendientes en productos distintos. También el único con un link ("Ver producto") — mismo motivo: no hay ninguna otra lista de "productos con stock repuesto" a la que ir.
  - **No verificado visualmente en el navegador** (única excepción a la práctica habitual de esta sesión): no hay ningún producto real con `stock=0`, y forzarlo directamente en la tabla `products` de producción **fue bloqueado por el clasificador de seguridad de Claude Code** (mutación fuera de una transacción `BEGIN;...ROLLBACK;`, correctamente) — no insistí con un workaround. Cubierto en cambio con: revisión de código exhaustiva, 0 errores de consola en una carga real de `producto.html`, confirmación de que el botón normal ("Agregar al carrito") no sufre ninguna regresión en un producto con stock real, y los 4 escenarios + RLS de la migración probados a fondo contra la base real.

- **F12-10** (`A113-250`) — **Panel de admin para `error_logs`.** Sin migración — la tabla y su RLS `error_logs_select_admin` ya existían desde F1/A113-171, 100% frontend. Sección nueva "Errores registrados" en `admin.js`/`admin.html`: fecha, usuario (resuelto vía `profiles.email` con una segunda consulta — `error_logs.user_id` referencia `auth.users`, no `profiles`, mismo patrón que `phoneByClientId` de F12-05; "Invitado" si es null), mensaje y URL (truncados con `title` para ver completo al pasar el mouse), botón "Ver detalle" (`alert()`, mismo estilo que el resto del proyecto) con el stack trace completo. Solo lectura (es telemetría de diagnóstico, no un flujo con estados) y limitado a los últimos 100 (no es un visor de historial completo).
- **F12-11** (`A113-251`) — **Panel de soporte/reclamos.** `db/schema/46_support_tickets.sql`: tabla `support_tickets` (RLS: dueño o admin ven, dueño inserta, **solo admin** actualiza el `status`) + trigger `notify_support_ticket_status_change` (notifica al autor cuando cambia de estado — separado del trigger genérico de F12-01 porque acá el vocabulario de estados es de 3 valores `open/in_progress/resolved`, no el binario `approved/rejected`). `js/support-utils.js` (nuevo, compartido): form "Contactar a soporte" + lista "Mis reclamos" con badge de estado — mismo patrón de reutilización que `reviews-utils.js`/`notifications-utils.js` (un módulo, varios puntos de integración), usado en `perfil.js` (tab nueva "Soporte"), `vender.js` y `repartidor.js` (misma sección al final de ambos dashboards). Admin: sección nueva "Soporte / Reclamos" en `admin.js`/`admin.html`, `<select>` de estado por fila (cambia con RLS `support_tickets_update_admin`). **Alcance a propósito acotado**: no hay hilo de respuesta dentro de la app — el admin sigue respondiendo por email (ahora con el email/asunto/mensaje estructurados en vez de un mail genérico a ciegas); un hilo completo bidireccional repetiría el sistema de chat de F7-02 para un caso de uso distinto. Verificado con `BEGIN;...ROLLBACK;`: notificación al cambiar de estado (no al tocar otro campo), status inválido rechazado por el CHECK, RLS ownership (`SET ROLE authenticated`: insertar/actualizar a nombre de otro usuario rechazado, usuario ajeno no ve tickets de otro).

- **F12-12** (`A113-252`) — **Log de auditoría de acciones de admin.** `db/schema/47_admin_audit_log.sql`: tabla `admin_audit_log` + una única función trigger genérica `log_admin_action()` (mismo patrón de reutilización que `set_updated_at`/`notify_request_status_change`) adjunta a 10 tablas donde el admin puede moderar algo (`stores`, `seller_requests`, `delivery_requests`, `profiles`, `products`, `categories`, `coupons`, `reviews`, `support_tickets`, `orders`). El chequeo clave es `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'` del que ejecuta la escritura -- **no** cambia según qué policy de RLS habilitó el UPDATE, así que distingue correctamente a un vendedor editando su propia tienda (rol `vendedor`, no se registra) de un admin suspendiéndola (rol `admin`, sí se registra), aunque ambos pasen literalmente por la misma policy `stores_update_own` (`owner_id = auth.uid() OR role = 'admin'`).
  - **3 patrones de escritura distintos, los 3 verificados**: (a) RLS con excepción admin embebida en la misma policy (`stores`) -- el UPDATE directo del admin sí pasa la RLS y el trigger AFTER se dispara; (b) RLS admin-only (`categories`, `seller_requests`, `delivery_requests`, `coupons`, `support_tickets`) -- cualquier escritura exitosa ya es necesariamente de un admin; (c) sin ninguna policy de UPDATE que permita al admin escribir directo (`profiles` -- solo existe `profiles_update_own`, `auth.uid() = id`) -- ahí la única vía es la RPC `SECURITY DEFINER` (`admin_set_repartidor_suspended`), que bypasea RLS con los privilegios del dueño de la función pero preserva `auth.jwt()`/`auth.uid()` del llamador real, así que el trigger igual se dispara y loguea correctamente.
  - **Error de metodología encontrado y corregido en el momento**: el primer intento de probar el escenario (c) hizo un `UPDATE public.profiles ...` directo simulando el JWT de admin -- pasó sin error pero **0 filas afectadas** (bloqueado silenciosamente por RLS, no por una excepción) porque no existe ninguna policy de UPDATE que permita a un admin escribir un `profiles` ajeno directo. Recién ejecutando la RPC real (`admin_set_repartidor_suspended`) el escenario se probó de verdad. Lección: un `UPDATE`/`DELETE` que RLS bloquea no siempre lanza una excepción -- puede simplemente afectar 0 filas, y sumado a `SET ROLE authenticated` (ya documentado en F12-05) hay que revisar el *rowcount*, no solo si hubo un error, cuando se simula una escritura vía RLS plano.
  - Verificado con `BEGIN;...ROLLBACK;`: admin suspende una tienda → 1 log; el propio vendedor la edita → 0 logs nuevos; admin crea y borra una categoría → 2 logs (insert+delete); cliente edita su propio teléfono → 0 logs; admin suspende un repartidor vía la RPC real → 1 log. RLS: un no-admin no puede leer `admin_audit_log` (0 filas).
  - **Hallazgo operativo, no de código**: `select * from auth.users where raw_app_meta_data->>'role' is not null` da 0 resultados con `role='admin'` -- **nadie tiene el rol admin asignado en producción todavía**, el panel de `admin.html` nunca fue accedido con una cuenta real (todo el testing de esta fase fue simulando el JWT en SQL). Falta asignarlo a mano desde el dashboard de Supabase (Authentication → Users → editar `raw_app_meta_data` → `{"role": "admin"}`) antes de poder usar cualquiera de las funciones de admin en el navegador real.

- **F12-14** (`A113-254`) — **Vencimiento de ofertas.** `products.offer_expires_at` (migración 48, `date` — el vendedor elige un día en un `<input type="date">`, no una hora exacta; "vence el 30" debe seguir la oferta activa durante todo el 30, por eso `date` y no `timestamptz`). `buildPriceRow()` (`cart-utils.js`, compartida home/search/comercio) ahora ignora el precio tachado si `offer_expires_at` ya pasó — el vendedor no tiene que acordarse de sacarlo a mano, el badge simplemente deja de mostrarse solo. `search.js`: el filtro "Ofertas" (F9-03) ahora también excluye las vencidas (`.or('offer_expires_at.is.null,offer_expires_at.gte.hoy')`). Input nuevo en `vender.js`/`vender.html`, solo se persiste si hay un `compare_at_price` cargado (si el vendedor borra el precio de oferta pero deja una fecha vieja en el form, no queda guardada una fecha huérfana). **Nota de verificación**: no hay ningún producto real con oferta activa en la base — probado con casos sintéticos vía `preview_eval` (import directo de `buildPriceRow` con productos fabricados: sin oferta / sin vencimiento / vigente / vence hoy / vencida ayer, los 5 correctos) en vez de datos reales, y el filtro de `search.js` confirmado sin errores contra la base real (0 resultados, correcto ya que ningún producto tiene oferta hoy).

- **F12-15** (`A113-255`) — **Onboarding para vendedor recién aprobado.** Sin migración, 100% frontend. `renderOnboardingChecklist()` en `vender.js`: banner con 2 pasos (perfil del comercio completo / al menos un producto publicado), cada uno un botón que lleva directo a la acción (scroll al form de perfil, o abre el form de alta de producto vía `btn-show-add-product.click()`). Basado en estado real vía dos variables de módulo (`currentStoreHasProfile`, `currentProductCount`) recalculadas en `fetchProducts()` (cubre alta/edición/borrado de producto, ya se llama desde los 4 lugares que tocan productos) y al guardar el perfil del comercio — no hay una preferencia "descartado" guardada en ningún lado ni una forma de reabrirlo a propósito, simplemente desaparece solo apenas se cumplen los dos pasos y no vuelve a aparecer.

- **F12-16** (`A113-256`) — **Multi-usuario por comercio.** Diseño 100% delegado por el usuario ("vos decidís") ante la ambigüedad del ítem del roadmap. Decisión tomada: el empleado tiene **paridad operativa total** con el dueño para el día a día (productos, pedidos, comprobantes de transferencia) pero **no puede** editar el perfil del comercio, gestionar cupones, ni gestionar otros empleados -- esas 3 son decisiones financieras/de acceso que quedan solo para el dueño. `db/schema/49_store_staff.sql`: tabla `store_staff` (`store_id`+`user_id` unique) + RPC `add_store_staff(p_store_id, p_email)` (SECURITY DEFINER: busca la cuenta por email en `profiles`, valida que quien llama sea el dueño, rechaza auto-alta) + **12 policies nuevas, todas aditivas** (se suman con OR a las que ya protegían al dueño, nunca se tocó ninguna existente) en `products` (select/insert/update/delete), `orders` (select/update), `order_items` (select), `payment_proofs` (select/update). `js/vender.js`: `checkSellerState()` ahora también revisa `store_staff` antes de caer al formulario de registro (un empleado no tiene rol propio de vendedor, no le hace falta); `loadDashboard(user, staffStoreId)` acepta un segundo parámetro opcional para cargar la tienda por id en vez de por `owner_id` cuando quien entra es empleado, seteando `isStoreOwner` (module-level) que oculta 3 secciones (`store-profile-section`/`my-coupons-section`/`store-staff-section`) y salta el checklist de onboarding (F12-15, apunta a acciones que un empleado no puede hacer). Sección nueva "Empleados" (alta por email + "Quitar acceso").
  - **Error de metodología encontrado y corregido en el momento** (variante nueva del ya documentado en F12-05/F12-12): al probar el alta de un empleado, pasé el email de destino como `(select email from profiles where id = v_employee)` evaluado en el **mismo statement** ya bajo `SET ROLE authenticated` con el JWT del dueño -- esa subquery, al no estar envuelta en una función `SECURITY DEFINER`, quedó sujeta a la RLS real de `profiles` (el dueño no tiene ninguna policy que le deje leer el email de OTRO usuario), así que devolvió `NULL` **silenciosamente** (no un error) y ese `NULL` se pasó como argumento a la RPC, que correctamente reportó "no encontramos ninguna cuenta". No era un bug de la función -- era mi propio test mezclando una consulta plana (sujeta a RLS) con una llamada a función privilegiada en el mismo paso. Corregido resolviendo todos los emails de prueba ANTES de simular ningún rol (la conexión de `execute_sql` tiene `BYPASSRLS` por default, así que hacerlo al principio del bloque `do $$` es seguro). Lección: cualquier valor que se le pase a una función `SECURITY DEFINER` como argumento debe resolverse en un contexto sin restricciones, nunca en una subquery evaluada ya bajo el rol/JWT simulado.
  - También encontrado y corregido en el momento: un escenario de prueba asumía que "un extraño no debería poder ver el producto de otra tienda", pero el producto de prueba tenía `is_active = true` en una tienda `approved` -- por diseño, **cualquier** producto activo de una tienda aprobada ya es público para cualquiera (`products_select_public_active`), nada que ver con mi policy de staff nueva. Corregido probando con un producto `is_active = false` en su lugar, que sí aísla correctamente el límite de seguridad real (¿puede un extraño ver un producto inactivo ajeno vía la policy de staff? No).
  - Verificado con `BEGIN;...ROLLBACK;`: alta exitosa, auto-alta rechazada, alta por un no-dueño rechazada, empleado inserta/actualiza un producto de la tienda, extraño no ve un producto inactivo ajeno, empleado no puede editar el perfil de la tienda, empleado no puede quitarse a sí mismo de `store_staff` (solo el dueño puede), empleado ve y (implícito por la misma policy) actualiza pedidos de su tienda, extraño no ve la orden.

- **F12-17** (`A113-257`) — **Roles de admin granulares.** Diseño 100% delegado por el usuario. Dado que en F12-12 se descubrió que **ningún usuario real tiene `app_metadata.role='admin'` asignado todavía**, construir un sistema de permisos completo para un rol que nadie usa hubiera sido desproporcionado — se optó por un solo rol nuevo y acotado: `moderador`, limitado a moderar reseñas reportadas (F7-03) y gestionar reclamos de soporte (F12-11) — las dos únicas tareas de "confianza y seguridad" delegables sin exposición financiera ni de configuración. Todo lo demás (comercios, repartidores, cupones, categorías, comprobantes, métricas, logs) sigue siendo exclusivo de `admin`, sin cambios.
  - **Bug real encontrado y corregido en el camino, no relacionado directamente con "moderador" pero descubierto al diseñar el gate de acceso**: `guardPage({requireRole: 'admin'})` en `auth-utils.js` comparaba contra `profiles.role`, **no** `app_metadata.role` (el campo del JWT que de verdad evalúa toda la RLS de este proyecto, `auth.jwt() -> 'app_metadata' ->> 'role'`). El problema: a diferencia de vendedor/repartidor (que `approve_seller_request`/`approve_delivery_request` sincronizan en AMBOS lugares — `profiles.role` y `raw_app_meta_data` — a propósito), **no existe ningún flujo en la app que setee `profiles.role='admin'`** — la única forma de asignar el rol admin es a mano en el dashboard de Supabase, editando `raw_app_meta_data` (que es lo único que instruí al usuario a hacer). Resultado: incluso si el usuario seguía exactamente esas instrucciones, el gate de `admin.html` lo hubiera rebotado a `home.html` sin explicación, porque `profiles.role` de esa cuenta seguiría siendo `'cliente'` para siempre. Corregido: `guardPage` ahora prioriza `user.app_metadata?.role` (con `profiles.role` como fallback, y se sacó el fallback viejo a `user.user_metadata?.role` -- ese campo es editable por el propio cliente en el signup, el mismo vector que causó A113-238; nunca debió usarse ni como último recurso). También se agregó soporte para pasar un array de roles permitidos (`requireRole: ['admin', 'moderador']`), antes solo aceptaba un string exacto.
  - `db/schema/50_moderador_role.sql`: 4 policies nuevas **aditivas** (`reviews_select_moderador`/`reviews_update_moderador`/`support_tickets_select_moderador`/`support_tickets_update_moderador`) — nunca se tocaron las policies existentes de `admin` en esas tablas. `log_admin_action()` (F12-12) ampliada de `v_role <> 'admin'` a `v_role not in ('admin', 'moderador')` -- ensancha estrictamente qué se audita (las acciones de moderador ahora también quedan en el log), nunca deja de auditar lo que ya auditaba.
  - `admin.js`/`admin.html`: las 14 secciones del panel llevan un atributo `data-section="X"` en su `.admin-header` (sin restructurar el HTML -- las secciones son divs planos hermanos, no wrappeados, así que la función `hideAdminSection()` camina los hermanos siguientes hasta el próximo `.admin-header` para ocultar toda la sección de una). Con rol `moderador`, se ocultan las 12 secciones exclusivas de admin; "Moderación · Reseñas reportadas" y "Soporte / Reclamos" quedan visibles. Verificado parseando el HTML real con `DOMParser` (sin sesión real disponible, mismo límite de siempre): las 12 secciones se encuentran y ocultan correctamente (1-2 elementos hermanos cada una según si tienen un form), las 2 de moderador quedan intactas.
  - Verificado con `BEGIN;...ROLLBACK;`: moderador ve una reseña oculta ajena (un cliente común no), la des-oculta y queda auditado en `admin_audit_log`; moderador ve y actualiza el estado de un reclamo ajeno; moderador **no** puede crear una categoría (rechazado por RLS, ninguna policy nueva se la permite); acceso del admin sin ningún cambio (spot-check: sigue pudiendo crear categorías).

- **F12-13** (`A113-253`) — Insights del vendedor, resuelto **provisionalmente** (2026-07-11):
sección nueva "Insights (provisional)" en `vender.js`/`vender.html` con productos más vendidos
(agrupado por título desde `order_items`, snapshot igual que F2-06) y ventas de los últimos 7
días (barras simples con CSS, sin librería de gráficos). Datos 100% reales, layout deliberadamente
simple -- ver [docs/DISENOS_PROVISIONALES.md](docs/DISENOS_PROVISIONALES.md), se reemplaza cuando
el usuario pase sus propios diseños.

### Pendiente (F12-18)
Ver `docs/ROADMAP.md` sección 17.1. Con F12-13 y F12-17 cerrados, **Fase 12 queda completa** salvo
F12-18 (facturación/AFIP), que ya estaba marcado fuera de alcance de código desde el principio.

## Diseños provisionales (2026-07-11)
A pedido del usuario, se implementaron versiones provisionales (con datos reales, no maquetas)
de los 3 ítems que estaban a la espera de un diseño real: **F9-01** (sistema de diseño -- franja
de valor con el acento cálido ya existente en la paleta), **F9-06** (estados vacíos consistentes +
micro-interacciones básicas) y **F12-13** (insights del vendedor, ver arriba). Detalle completo,
qué se tocó y qué no, en [docs/DISENOS_PROVISIONALES.md](docs/DISENOS_PROVISIONALES.md) -- estos
se reemplazan cuando el usuario traiga sus propios diseños, no son decisiones finales.

## P1-6: cupones de vendedor ya no se listan en bloque públicamente (2026-07-16)
Del backlog de mejoras post-lanzamiento (punto #16a). Antes,
`coupons_select_public` dejaba leer CUALQUIER cupón activo (global o de un vendedor puntual, F12-03)
a cualquier `anon`/`authenticated` — `renderActiveCoupons()` (F12-07) los mostraba todos en el home
a cualquier visitante, sin relación con lo que estuviera comprando; y cualquiera con la anon key
podía listar por API directa el código/% de descuento de todos los vendedores.
- **Migración 57** (`db/schema/57_coupon_visibility_scope.sql`, aplicada): `coupons_select_public`
  restringida a solo cupones globales (`store_id is null`) — siguen 100% públicos. Nueva
  `coupons_select_own_store` (el dueño ve todos los suyos, activos o no — corrige de paso un bug
  latente: sin esta policy, "Mis cupones" (`vender.js`) dependía sin querer de la policy pública,
  así que un cupón desactivado directamente desaparecía de la lista de gestión en vez de solo
  perder vigencia pública). Nueva RPC `validate_coupon_code(p_code)` (`SECURITY DEFINER`, una fila
  por código exacto, nunca una lista) para que `carrito.js` siga validando un código que el usuario
  ya escribió, sin necesitar una policy de lectura amplia — `create_order` no se toca, ya es
  `SECURITY DEFINER` y no depende de estas policies.
- `js/cart-utils.js` (`renderActiveCoupons`, home + carrito): ahora solo consulta cupones globales
  (`store_id is null`) — un cupón de vendedor puntual deja de anunciarse en bloque, solo se puede
  usar si el vendedor lo comunica directamente (o desde su propio panel de gestión). `js/carrito.js`
  (`applyCoupon`): reemplazado el `select` directo a `coupons` por `validate_coupon_code`.
- Verificado contra la base real (`BEGIN;...ROLLBACK;`, `SET ROLE anon`/`authenticated` +
  `set_config('request.jwt.claim.sub', ...)`): `anon` sigue viendo los cupones globales existentes
  pero 0 de vendedor; la RPC resuelve por igual un código global y uno de vendedor; el dueño de la
  tienda ve su propio cupón inactivo, un extraño no. `get_advisors`: único hallazgo nuevo esperado
  (`validate_coupon_code` invocable por `anon`, mismo patrón ya aceptado que `validate_cart_prices`).

## P1-7: UX del cupón en el carrito — aplicar al escribir + borrar intuitivo (2026-07-16)
Del backlog de mejoras post-lanzamiento (punto #16b). Sin migración,
100% frontend (`js/carrito.js`, `initCouponEvents`). Antes había que escribir el código Y clickear
"Aplicar" (o Enter); ahora un listener de `input` con debounce de 500ms lo valida solo con escribir
(reutiliza la misma `applyCoupon()`, ya migrada a la RPC `validate_coupon_code` de P1-6). "Borrar"
era ambiguo — el botón "Aplicar" ahora pasa a decir "Quitar" (`.coupon-btn--remove`, color de aviso
en `Assets/styles/carrito.css`) en cuanto queda un cupón aplicado, un solo click limpia el input y
resetea el descuento al instante sin esperar el debounce. **Verificado en el navegador el
2026-07-15** (Claude in Chrome, contra producción real): escribir `BIENVENIDO10` sin tocar el botón
dispara la validación sola tras el debounce (pasa por "Validando..." → "¡Cupón aplicado!", total
recalculado $11.200→$10.080); el botón pasa a "Quitar" y un clic limpia input/mensaje/total al
instante; un código inexistente muestra "Código inválido o expirado." sin romper nada; 0 errores
de consola en todo el flujo.

## P0-6: Split payments con Mercado Pago Marketplace, modo piloto (2026-07-15)
Del backlog de mejoras post-lanzamiento. Antes, `mp-create-preference`
cobraba TODO con la cuenta de MP de la propia plataforma (`MP_ACCESS_TOKEN` global) — ningún
vendedor recibía la plata directo. Decisiones del usuario: split automático vía OAuth (no
conciliación manual), comisión de la plataforma arranca en **0%** y se sube de a poco con el
tiempo (queda como env var `MP_MARKETPLACE_FEE_PCT`, no columna, para subirla sin migración), un
vendedor sin Mercado Pago vinculado solo puede cobrar por transferencia, y se prueba primero con
1-2 vendedores piloto (`stores.mp_split_pilot`, activado a mano por SQL) antes de abrirlo a todos.

Mercado Pago no permite dividir un solo pago entre varios `collector_id` (verificado contra la
documentación oficial: una preferencia = un solo vendedor) — por eso, si el carrito mezcla más de
una tienda, Mercado Pago directamente no se ofrece como opción (transferencia/simulado siguen
andando); se resuelve el caso multi-tienda encadenando pagos más adelante, no en el piloto.

- **Migración 56** (`db/schema/56_mp_marketplace_split.sql`, aplicada): `stores.mp_collector_id`
  (user_id de MP del vendedor vinculado) + `stores.mp_split_pilot` (gate manual del piloto) +
  `orders.payment_status` con un valor nuevo `needs_review` (el webhook no pudo reconfirmar un pago
  porque el token del vendedor venció y no se pudo refrescar — no se pierde el pago, queda para que
  el admin lo resuelva a mano) + tabla nueva `store_mp_credentials` (access_token/refresh_token por
  vendedor) con **RLS habilitada sin ninguna policy** — ni el dueño de la tienda puede leerla vía
  API, solo las Edge Functions con `SUPABASE_SERVICE_ROLE_KEY` (mismo modelo de confianza que ya
  usaba `mp-webhook`). Primera vez que el proyecto guarda un secreto de terceros en una tabla.
- **Edge Function nueva `mp-oauth-callback`**: intercambia el `code` de la vinculación OAuth del
  vendedor por `access_token`/`refresh_token`, los guarda en `store_mp_credentials`, setea
  `stores.mp_collector_id`. Valida ownership del `store_id` contra el JWT del que llama.
- **`mp-create-preference` reescrita**: agrupa `order_ids` por tienda (rechaza con mensaje claro si
  hay más de una), usa el `access_token` del vendedor (refrescándolo si venció) + `marketplace_fee`
  calculado como % del total, en vez del token global de la plataforma.
- **`mp-webhook` actualizada**: para saber con qué token re-confirmar el pago (`GET
  /v1/payments/{id}`), usa el campo `user_id` que trae el payload del webhook y lo matchea contra
  `stores.mp_collector_id` — **este comportamiento no está 100% confirmado en la documentación
  pública de Mercado Pago**, hay que verificarlo empíricamente con el primer pago real de split en
  el piloto (si no matchea, el fallback al token global de la plataforma simplemente no encuentra
  el pago — sin riesgo de seguridad, solo tarda en confirmarse). Si no matchea ningún vendedor,
  cae al `MP_ACCESS_TOKEN` global (compatibilidad con órdenes `mercadopago` `pending` de antes de
  esta migración).
- **Frontend**: sección nueva "Mercado Pago" en `vender.js`/`vender.html` (oculta salvo
  `mp_split_pilot=true`), botón "Conectar con Mercado Pago" que redirige a la autorización OAuth de
  MP y vuelve a `vender.html?code=&state=`. En `carrito.js`, la opción "Mercado Pago" del checkout
  se deshabilita si el carrito tiene productos de una tienda no vinculada/no piloto, o de más de
  una tienda (`updateMpAvailability`, llamada después de `validateCartFreshness`).
- **Bug propio encontrado de paso** (no relacionado a MP): `initPaymentMethodEvents()` en
  `carrito.js` exigía un `#payment-simulado` en su guard que ya no existe en el HTML desde que se
  sacó el pago simulado del carrito (P1-1 del backlog) — el guard daba `null` siempre, así que la
  función retornaba temprano y **nunca conectaba ningún listener de método de pago** (ni el
  desplegable, ni elegir Mercado Pago/transferencia). Corregido sacando esa condición del guard.
- **Falta para poder probarlo** (no es código, son datos/credenciales que solo el usuario puede
  cargar): `MP_CLIENT_ID`/`MP_CLIENT_SECRET`/`MP_MARKETPLACE_FEE_PCT=0` como Edge Function Secrets
  en Supabase (se consiguen en el panel de Mercado Pago Developers, app de Marketplace);
  `VITE_MP_CLIENT_ID` (público) en `.env`/Vercel; activar el piloto a mano por SQL para 1-2 tiendas
  de prueba (`update public.stores set mp_split_pilot = true where id = '<store_id>'`); probar con
  las credenciales de prueba de Mercado Pago (vendedor comprador de prueba, no plata real) antes de
  confiar en el flujo.

### P0-6 — sesión de testing end-to-end (2026-07-15, continuación)

Destrabado lo que faltaba de la nota anterior: `MP_CLIENT_ID`/`MP_CLIENT_SECRET` cargados como
secrets de Edge Functions **por CLI** (Supabase CLI instalada en la sesión + Personal Access Token
del usuario como `SUPABASE_ACCESS_TOKEN` — no hay tool de MCP de Supabase que gestione secrets,
solo DB/migraciones/edge functions). `VITE_MP_CLIENT_ID` agregado al `.env` local.

**Gotcha de MP nuevo**: la app de Mercado Pago exige que el `redirect_uri` de OAuth esté
registrado **exactamente** en "URLs de redireccionamiento" (panel de la app) — con
`http://localhost:5173/...` cargado, la pantalla de autorización daba un error genérico
("Tenemos un problema y ya estamos trabajando para resolverlo", sin detalle). Con
`https://proyectopdisc.vercel.app/pages/vender.html` cargado en su lugar, funcionó — **MP no
acepta `http://localhost` como redirect_uri**, solo el usuario pudo cargar la URL de producción
desde el panel (el intento de agregar la de localhost fue rechazado por el propio dashboard de
MP, no confirmado por qué).

**Metodología de prueba** (para no arriesgar cuentas/tiendas reales): se creó una cuenta y tienda
de prueba nuevas desde cero (`proyectopdisc+splittest06@gmail.com`, tienda "Tienda Test Split
P06") en vez de usar `facu.cells` (la tienda real del usuario) — el plan original era usar
`facu.cells`, pero se cambió a pedido del usuario a mitad de sesión. La cuenta se registró vía
`register.html` real (no insertada a mano en `auth.users`); el único bypass fue confirmar el
email por SQL (`update auth.users set email_confirmed_at = now()`, autorizado explícitamente por
el usuario) y crear la fila de `stores` directo por SQL con `mp_split_pilot=true` (sin pasar por
`seller_requests`/`approve_seller_request`, para no disparar el guard anti-escalación de rol
`prevent_role_update_on_profile` — la cuenta de prueba quedó con `profiles.role='cliente'`,
suficiente porque `mp-oauth-callback`/`mp-create-preference` verifican *ownership* de la tienda
por `owner_id`, no el rol).

**Verificado con éxito, contra la base real** (tienda/cuenta de prueba, sin tocar nada de
producción real):
1. **`mp-oauth-callback`**: navegando a la URL de autorización de MP (`client_id` + `redirect_uri`
   de producción + `state=store_id`) y logueando con el vendedor de prueba de MP (`create_test_user`
   del MCP de Mercado Pago — el mismo ya usado en F2-07, `TESTUSER218381749661613735` /
   ID `3534929376`), MP redirige con `?code=&state=`. Se invocó la Edge Function a mano (`fetch`
   directo con el JWT de la sesión del navegador vía `javascript_tool`, ya que la cuenta de prueba
   no tenía rol `vendedor` para que `vender.js` dispare `handleMpOauthReturn` sola) → `200
   {"ok":true,"mp_collector_id":"3534929376"}`. Confirmado en la base: `stores.mp_collector_id`
   seteado, `store_mp_credentials.access_token`/`refresh_token` no nulos.
2. **`mp-create-preference`**: `create_order` (RPC, vía fetch directo a PostgREST) con
   `payment_method='mercadopago'` sobre un producto de prueba ($1500) → `mp-create-preference`
   devolvió un `pref_id` con prefijo `3534929376-...` (el collector del **vendedor conectado**, no
   el `MP_ACCESS_TOKEN` global de la plataforma) — confirma que el split arma la preferencia con
   el token correcto.

**No verificado — bloqueado sin causa aislada**: completar el pago real y que `mp-webhook`
confirme la orden. En el checkout de MP (`sandbox`/`Test` mode, banner "Test" visible arriba a la
derecha), el botón "Pagar" quedó **deshabilitado** (`disabled=""` real en el DOM, no un bug de
clicks — confirmado inspeccionando el elemento) tanto pagando con una tarjeta de prueba oficial
(Mastercard `5031 7557 3453 0604`, titular `APRO`, CVV `123`, vencimiento `11/30`) como con
"Dinero disponible" del comprador de prueba (`TESTUSER3668341471645588362` / ID `3534929378`).
Se descartó la causa más obvia (documentada en la guía oficial de MP: "para probar necesitás dos
cuentas, vendedor y comprador — no podés pagarte a vos mismo") porque el bloqueo persistió incluso
logueado como comprador (no el vendedor). Causa real no encontrada — candidatos sin confirmar:
alguna verificación de cuenta pendiente del vendedor de prueba recién conectado vía OAuth (a
diferencia de una cuenta de test "nativa" del flujo de Checkout Pro sin marketplace), o algo
específico del modo "Test" de esta preferencia en particular. **El usuario va a probarlo
manualmente** la próxima vez que tenga tiempo — si vuelve a bloquearse, revisar primero si hay
algún estado de verificación/aprobación pendiente en la cuenta del vendedor conectado (pestaña
"Actividad"/"Seguridad" de esa cuenta de MP), y si el problema persiste, consultar soporte de MP
con el `preference_id` generado.

Nota operativa: en paralelo a este testing se lanzó un subagente para resolver ítems P2 del
backlog (P2-1, P2-6, P2-8) — ver commit local `d6e9a96` (sin push).

### P0-6 — dos regresiones reales encontradas y arregladas (2026-07-16)

El usuario reportó "el botón de pagar con Mercado Pago dejó de andar en el carrito" — nada que
ver con el botón "Pagar" deshabilitado *dentro* del checkout de MP documentado arriba (eso sigue
sin resolver, es un problema distinto). Investigado con 2 tandas de 2 subagentes cada una
(implementa + audita adversarial), ambas confirmaron sin hallazgos:

1. **Regresión de backend** (commit `05d31d7`): el commit del split piloto (`b4b864b`) sacó el
   fallback al `MP_ACCESS_TOKEN` global de la plataforma — dejó un `return 400` obligatorio para
   cualquier tienda sin `mp_split_pilot`/`mp_collector_id`. Como solo "Tienda Test Split P06" tenía
   el piloto activo, **cualquier tienda real rompía el pago por completo** (nunca redirigía a MP).
   Restaurado: si la tienda no tiene split, arma la preferencia con el token global sin
   `marketplace_fee` (comportamiento pre-P0-6); si lo tiene, sigue igual que antes. De paso
   (commit `17d46cd`) se agregó `payer.email/name` a la preferencia — hueco real marcado por el
   `quality_checklist` del MCP de Mercado Pago, tomado del JWT del comprador sin pedir datos nuevos.

2. **Regresión de frontend** (commit `86e7f0e`), la causa real de que el botón siguiera sin
   habilitarse después del fix #1: `js/carrito.js` (`updateMpAvailability`) tenía un gate que
   exigía que **todas** las tiendas del carrito tuvieran split vinculado para siquiera poder
   elegir Mercado Pago como método de pago — quedaba deshabilitado para cualquier tienda real. De
   paso se encontró que el backend también rechazaba sin necesidad **cualquier carrito
   multi-tienda** (`storeIds.length > 1`), algo que nunca existió antes de P0-6 (confirmado
   comparando con `c93422f`, la versión F2-07 original). Regla correcta implementada en ambos
   lados (frontend y backend, debe coincidir exacto): solo es imposible mezclar en una preferencia
   una tienda con split vinculado + otras tiendas (necesitarían tokens distintos); un carrito
   multi-tienda donde ninguna tiene split sigue yendo entero por el token global, como siempre.

### P0-6 — resuelto (confirmado por el usuario, 2026-07-17)

El usuario probó manualmente el paso que había quedado bloqueado (botón "Pagar" deshabilitado
dentro del checkout de MP, sin causa aislada — ver sesión de testing 2026-07-15 arriba) y confirmó
que ya funciona. Causa real nunca confirmada (quedó como candidato sin verificar algún estado de
verificación/aprobación pendiente en la cuenta de vendedor de prueba recién conectada vía OAuth) —
no hizo falta ningún cambio de código para destrabarlo, se resolvió solo (probablemente el estado
de la cuenta de prueba de MP terminó de propagarse/verificarse del lado de Mercado Pago). **P0-6
completo end-to-end**: OAuth de vinculación + creación de preferencia con split + pago real +
webhook, todo verificado. Sacado de "Pendientes activos" en `CLAUDE.md`.

### P2-9/P2-3/P2-7/P2-5/P2-2 — 5 agentes en paralelo vía worktrees (2026-07-16)

Primera vez en el proyecto usando `isolation: "worktree"` del tool Agent para paralelizar fixes
de código real (no solo investigación). **Patrón que funcionó bien, repetir**: cada agente trabaja
en su propio worktree/rama, toca solo archivos fuente (`.js`/`.html`/`.css`), commitea sin push y
**sin correr `npm run build`** — el orquestador mergea las 5 ramas a `main` una por una
(`git merge --no-ff`, conflictos mínimos aunque 2 agentes tocaran el mismo archivo en líneas
distintas — mergeó solo) y recién ahí corre `npm run build` **una sola vez** al final. Correr el
build por separado en cada worktree hubiese generado hashes de archivo (`vite build` con
`[hash]` en el nombre) imposibles de mergear de forma consistente entre ramas independientes.

Hallazgos de cada uno (investigación previa hecha por el orquestador antes de lanzar los agentes,
para no hacerles re-descubrir la causa raíz — prompts con archivo+línea exactos):
- **P2-9**: las tarjetas de producto en grillas (`search.js`, `home.js`, `comercio.js` — 3 copias
  del mismo patrón, sin función compartida) tenían su propio botón "Agregar" sin chequeo de
  `stock`, a diferencia de `producto.js`/`product-modal.js` que ya lo hacían bien. El resto de la
  cadena (revalidación de carrito en `validateCartFreshness`, RPC `create_order` con `raise
  exception` si no alcanza stock) ya estaba sólido — el gap era solo esas 3 tarjetas.
- **P2-3**: `js/comercio.js` armaba la sección de reseñas con `max-width: 700px` inline inventado;
  ahora reusa `.store-products` (1200px), la misma clase que la grilla de productos.
- **P2-7**: `.pm-related__scroll` sin padding-top suficiente para el `translateY(-3px)` + sombra
  del hover (recortaba arriba); sin scrollbar visible ni handler de rueda, un mouse de escritorio
  sin touchpad no tenía forma de scrollear horizontal — agregado listener `wheel` que traduce
  `deltaY`→`scrollLeft` cuando el gesto es predominantemente vertical.
- **P2-5**: `pages/comercio.html` tenía `<main>` vacío en el HTML estático justo antes del
  `<footer>` — mientras `comercio.js` hacía el fetch async, el footer quedaba pegado arriba. El
  patrón `removeSkeleton` de `perfil.js` no aplicaba (esa página tiene layout fijo pre-marcado;
  `comercio.html` arma todo dinámico vía DOM API) — se agregó un spinner nuevo con
  `min-height: 60vh`, mismo estilo visual que `.auth-loading-spinner` de `auth.css`.
- **P2-2**: el logo del navbar en `vender.html`/`repartidor.html` (y también `mensajes.html`, no
  reportado por el usuario pero con el mismo bug) era un SVG inline con azul hardcodeado
  (`#2d4a7c`) en vez de la imagen real de marca. Unificado a la misma `<img>` de `home.html`. El
  "verde agua" que mencionó el usuario resultó ser `.vendor-mode-badge`
  (`--bl-vendor-accent: #0e7490`), un acento intencional de "modo vendedor" con comentario `F5-09`
  ya en el código — no se tocó.

**Sin verificar en navegador real** (mismo caveat que P2-1/P2-6 de la sesión anterior) — los 5
cambios están bien razonados y compilan/buildean limpio, pero valdría una pasada visual.

## Dos bugs reportados por el usuario (2026-07-13)

**1) El carrito se vaciaba al volver desde Mercado Pago sin pagar.**
`carrito.js` llamaba `clearCart()` inmediatamente después de que `payment-providers.js` disparaba
`window.location.href = redirectUrl` hacia el checkout de MP. Como esa navegación es asincrónica
y `window.location.href` no bloquea la ejecución, el `clearCart()` corría YA, antes de que el
usuario llegara siquiera a ver el checkout — si después clickeaba "Volver" en Mercado Pago (vuelve
con `?mp=failure`, `back_urls.failure` de `mp-create-preference`) o cerraba la pestaña, el carrito
ya estaba perdido para siempre, aunque nunca hubiera pagado.
- Fix: `carrito.js` ya no vacía el carrito en la rama `redirecting` — solo lo hace cuando se sabe
  de verdad que la compra se concretó. `perfil.js` ahora maneja `?mp=success`/`?mp=pending`
  (`back_urls.success`/`back_urls.pending`, con `auto_return: "approved"` de por medio) y ahí
  recién vacía el carrito + muestra el toast de éxito. `carrito.js` maneja `?mp=failure` con un
  toast explicando qué pasó, sin tocar el carrito (ya no hace falta, nunca se vació).
- **Bug extra encontrado en el camino**: `validateCartFreshness()` (F4-02) mostraba el toast
  "Actualizamos precios o cantidades..." SIEMPRE que no se sacó nada del carrito, aunque tampoco se
  hubiera ajustado nada de verdad (`adjustedNames` vacío) — un aviso falso en cada apertura normal
  del carrito, que además tapaba el toast nuevo de `?mp=failure` (mismo elemento `#toast`, el
  último `showCartToast()` gana). Corregido: ese toast ahora solo se muestra si `adjustedNames.length > 0`.
- Verificado en el navegador (carrito sembrado con un producto real vía `localStorage`, sin sesión
  real disponible): `?mp=failure` deja el carrito intacto y muestra el toast correcto sin que se
  tape; una carga normal sin `?mp=` no muestra ningún toast falso.

**2) El selector "Cambiar de rol" (F12-17) dejó de aparecer.**
No era un bug de esa función — la cuenta admin del usuario había perdido el rol en el JWT. Causa
raíz encontrada con SQL directo: la cuenta se había registrado como vendedor (para probar
`vender.html`) y la solicitud se aprobó; `approve_seller_request` (migración 24) hace
`raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'vendedor')` **sin mirar qué
rol tenía antes** — un `||` de jsonb pisa la clave `role` sea cual sea su valor, incluido
`admin`/`moderador`. Mismo patrón exacto en `approve_delivery_request` (migración 25).
- **Migración 53**: agrega `and coalesce(raw_app_meta_data ->> 'role', 'cliente') not in ('admin', 'moderador')`
  al `where` de ese `update` puntual en ambas funciones — si la cuenta ya es admin/moderador, el
  update no la toca y el rol elevado queda intacto. `profiles.role` se sigue actualizando siempre
  (la cuenta SÍ es vendedor/repartidor ahora, eso es un hecho real aparte del rol elevado).
  Verificado con `BEGIN;...ROLLBACK;`: cuenta admin aprobada como vendedor/repartidor → JWT sigue
  `admin`, `profiles.role` pasa a `vendedor`/`repartidor`, tienda/solicitud se aprueban normal;
  cuenta común aprobada → sin cambios de comportamiento (JWT y `profiles.role` pasan a `vendedor`
  los dos, como siempre). `get_advisors` sin hallazgos nuevos.
- Restaurado el `app_metadata.role` de la cuenta del usuario a `admin` (estaba en `vendedor` por
  el bug). Recuerda que necesita cerrar sesión y volver a entrar para que el JWT nuevo tenga efecto.

## Selector "Cambiar de rol" en perfil.html (2026-07-12)
Pedido directo del usuario ("desde perfil, poder cambiar de rol de vendedor/cliente a
administrador/moderador, solo si la cuenta está registrada como tal"). Reemplaza el botón suelto
"Panel de administración" (agregado antes en Accesos rápidos) por un `<select>` "Cambiar de rol"
en la tarjeta "Mi cuenta", junto al badge de rol actual — más descubrible y con el nombre correcto
(Administrador/Moderador según corresponda, antes siempre decía "administración").
- **No es un cambio de permisos, es solo navegación.** Elegir una opción del selector únicamente
  hace `window.location.href` a `admin.html` — el gate real sigue siendo `guardPage` (F12-17), que
  ya chequea `app_metadata.role`. La opción "Administrador"/"Moderador" solo se agrega al `<select>`
  si `user.app_metadata?.role` es `'admin'`/`'moderador'` — un cliente o vendedor común nunca ve
  esa opción, ni podría forzarla desde el DOM sin que `guardPage` lo rebote igual.
- La opción "own" (por defecto, sin navegar) muestra el rol base real de `profiles.role`
  (Cliente/Vendedor/Repartidor), resuelto en `renderFullProfile` una vez que llega el fetch a la
  tabla — separado del rol elevado que se resuelve antes, en `renderQuickProfile` (datos del JWT,
  sin esperar ningún round-trip).
- `js/perfil.js`, `pages/perfil.html`. Sin migración — reusa el mismo `app_metadata.role` de
  siempre.

## Optimización navbar de categorías + motor de búsqueda + resultados (2026-07-12)
Pedido directo del usuario ("optimizá el navbar de categorías, el motor de búsqueda y la página
de resultados, con investigación de patrones de e-commerce tipo Mercado Libre"). No es un ítem del
roadmap — mejora ad-hoc, no trackeada en Jira. Se intentó un workflow (ultracode) para la
investigación pero murió por límite de sesión; se implementó directo aplicando patrones conocidos
de ML/Amazon (mega-menú de categorías, autocompletado, chips de filtros, búsqueda insensible a
acentos). Cambios:
- **Backend (migración 51, `search_products` RPC)**: reemplaza la búsqueda vieja de `search.js`
  (solo `.ilike('title')`, case-insensitive pero NO insensible a acentos; y `categories!inner`
  que descartaba de TODA la búsqueda cualquier producto sin categoría). El RPC (extensión
  `unaccent`, `SECURITY INVOKER` → respeta la RLS, no expone nada nuevo) busca insensible a
  acentos y multi-campo (título > nombre de tienda > descripción, con ranking de relevancia),
  con filtros de categoría / pseudo-'ofertas' / zona / rango de precio, ordenamiento y paginación
  (limit/offset + `total_count` vía `count(*) over()`). Verificado en `BEGIN;...ROLLBACK;`: "cafe"
  encuentra "Café", filtros y paginación OK; `get_advisors` sin hallazgos nuevos (es INVOKER +
  `search_path` fijo).
- **`js/nav-utils.js` (nuevo, compartido home+search)**: (a) `initCategoryBar` — mega-menú
  "Categorías" con las 14 categorías en grilla con iconos (Font Awesome por slug) + Ofertas/Vender/
  **Repartir** (antes la reconstrucción dinámica en home.js perdía "Repartir"), más una tira de
  acceso rápido scrolleable; toggle por click con `aria-expanded`, cierra con click-afuera/Escape.
  (b) `initSearchBox` — autocompletado con sugerencias de productos reales (vía `search_products`,
  con thumbnail/precio/tienda), categorías que matchean, y búsquedas recientes (localStorage),
  navegación por teclado (flechas/enter/esc), debounce 220ms. (c) `getCategories` cacheado,
  `initScrollTop`/`initNavbarScroll` compartidos (antes duplicados en ambos archivos).
- **`js/search.js` (reescrito)**: usa el RPC con paginación ("Cargar más", 24 por página);
  encabezado que refleja la consulta ("Resultados para X" / nombre de categoría / "Todos los
  productos"); chips de filtros activos removibles + "Limpiar todo"; filtros funcionales
  (categoría, rango de precio min/max) — se **quitaron Zona y Distancia** (no funcionales: las 14
  tiendas tienen `zone` null y distancia necesita geolocalización; `p_zone` queda en el RPC para
  el futuro); orden alineado al RPC; estado sin resultados con tips de recuperación + "Limpiar
  filtros". La tarjeta de resultado ahora muestra el nombre de la tienda (consistente con home).
- **`js/home.js`**: usa `nav-utils` para la barra de categorías + buscador (modo redirección a
  `search.html?q=`); se borró el código duplicado de categorías/búsqueda/scroll.
- **CSS (`home.css`)**: `.cat-mega*` (mega-menú), `.category-bar__quick` (tira scrolleable),
  `.search-suggest*` (autocompletado), `.filter-chip*`/`.active-filters` (chips), `.results-title`,
  `.price-range`, `.load-more-btn`, `.no-results*`. Verificado en el navegador (desktop + mobile
  375px, sin overflow horizontal): mega-menú, autocompletado acento-insensible, chips, paginación
  24→48→56, sin resultados+recuperación, orden por precio — todo OK, 0 errores de consola.

## Campanita de notificaciones en la navbar (2026-07-12)
Pedido directo del usuario ("un botón de notificaciones a la izquierda del de perfil, con avisos
de descuentos en favoritos, ventas, aprobaciones, reclamos, etc."). Mejora ad-hoc, no trackeada
en Jira. La mayoría de esos avisos **ya existían** desde F8-01 (`notifications` + triggers de
`orders`/`reviews`/`messages`/`support_tickets`/`seller_requests`/`delivery_requests`) — lo nuevo
fue exponerlos en la navbar (antes solo vivían en una pestaña de `perfil.html`/`vender.js`) y sumar
el único aviso que faltaba: descuento en un producto de favoritos.
- **Migración 52**: `notify_favorite_discount()` (mismo patrón que `notify_stock_alerts`, F12-09) —
  dispara solo en la transición false→true de "tiene oferta real" (mismo criterio de `hasDiscount`
  que `buildPriceRow`: `compare_at_price > price` y no vencida), así que una oferta que sigue
  vigente en updates posteriores no re-notifica a cada rato, pero sacarla y volver a ponerla sí
  avisa de nuevo. A diferencia de `stock_alerts` (opt-in explícito), reutiliza `favorites` (F4-03)
  directo — marcarlo favorito ya es la señal de interés. Verificado con `BEGIN;...ROLLBACK;`::
  oferta nueva → 1 notificación; sigue con oferta (ajuste menor de precio) → 0 nuevas; sacar y
  reponer la oferta → 1 más (total 2, no 3). `get_advisors` sin hallazgos nuevos.
- `js/notifications-utils.js`: tipo nuevo `favorite_price_drop` (mismo patrón de título+link a
  "Ver producto" que `stock_alert`, generalizado con `PRODUCT_LINK_TYPES`) + `fetchUnreadCount()`
  (query liviana `count:'exact', head:true` para el badge).
- `js/nav-utils.js`: `initNotificationsBell()` (nuevo) — reutiliza `renderNotificationsSection()`
  tal cual (F8-01) dentro de un dropdown compacto en vez de una sección de página completa; sin
  sesión muestra "Iniciá sesión" en vez del centro de notificaciones. Badge (reusa `.cart-badge`,
  ya cargado vía `carrito.css`) se recalcula al cerrar el dropdown (el usuario pudo haber marcado
  leídas mientras estaba abierto) — mismo criterio "sin tiempo real, se actualiza al interactuar"
  del resto del proyecto.
- `pages/home.html`: `<div id="nav-notifications-wrap">` agregado en `.navbar__actions`, **antes**
  de `#nav-profile` (a su izquierda). Solo en home por ahora, a pedido explícito — extender a
  search/comercio/producto/carrito es una sola línea (`initNotificationsBell()`) cuando se pida.
  Verificado en el navegador: orden correcto en el DOM, estado invitado, dropdown no se corta del
  viewport, cierra con click-afuera y Escape, 0 errores de consola.

## Investigación: "Tienda" genérica en home.js (2026-07-10, no relacionada con F5-05)
Reportado como visto de pasada verificando F5-05 en el navegador: en "Productos recomendados"
(`js/home.js`), algunos productos mostraban el texto genérico `'Tienda'` (fallback de
`product.stores ? product.stores.name : 'Tienda'`, `js/home.js:198`) en vez del nombre real
del comercio. Investigado el join `stores ( name )` de la query de `loadProducts()`
(`js/home.js:172-183`) contra la base real (REST directo con la anon key, misma query que hace
el browser) y en el navegador (preview en `pages/home.html`): **hoy no se reproduce** — los 56
productos activos visibles para `anon` resuelven bien su tienda, 0 joins nulos.

Causa raíz (ya resuelta como efecto colateral, no a propósito): antes de la migración 34
(F6-04), `products_select_public_active` solo chequeaba `is_active = true`, sin mirar el estado
del comercio dueño — así que un producto de un comercio `pending`/`suspended`, o con `store_id`
null (la columna nunca tuvo `not null`), se listaba igual en el home. Pero `stores_select_public`
sí exige `status = 'approved'` (o dueño/admin) — con esa combinación, el producto aparecía pero
el embed a `stores(name)` volvía `null` por RLS → fallback `'Tienda'`. La migración 34 (F6-04,
posterior a cuando se vio el bug) agregó `exists(... s.status = 'approved')` a
`products_select_public_active` — ahora un producto con comercio no aprobado (o `store_id` null)
directamente no se lista, en vez de listarse sin nombre. Mismo criterio de "approved" en ambas
policies → ya no hay combinación posible que produzca el fallback.
**Sin cambio de código.** Si vuelve a aparecer, sospechar de un producto real con `store_id`
apuntando a un comercio `pending`/`rejected` que igual pasa `is_active`, y revisar si
`products_select_public_active` sigue teniendo el chequeo `exists` de comercio aprobado.

## Panel vendedor: rediseño "Mi cuenta" estilo ML (2026-07-16)
Pedido directo del usuario, mejora ad-hoc de UI (no trackeada en Jira). Reemplaza el layout viejo
de `vender.html` (secciones apiladas una debajo de otra en una sola página larga) por un shell de
sidebar + contenido tipo "Mi cuenta" de Mercado Libre, migrando una sección a la vez al estilo ML
completo mientras el resto queda "solo fuente" (movida adentro del shell nuevo, sin rediseñar el
markup interno todavía). Sin migración en ninguno de los 3 commits — 100% frontend.

- **Shell (commit `b9deec5`)**: `js/vender-shell.js` (nuevo) — sidebar fija en desktop / drawer en
  mobile, navegación por `data-section` sincronizada con el hash de la URL (`initVenderShell`,
  llamado al final de `loadDashboard`). Un solo `.mc-section[data-section]` visible por vez; grupos
  colapsables (`.mc-group`) para agrupar ítems del sidebar. `pages/vender.html`: las 9 secciones
  existentes (Resumen, Perfil de mi comercio, Mis cupones, Empleados, Ventas, Notificaciones,
  Soporte, Pagos por confirmar, Envíos en curso, Publicaciones) quedaron movidas tal cual adentro
  del shell nuevo — mismo contenido/ids/lógica, sin retocar su HTML interno todavía. La sección
  "Resumen" sí se rediseñó de una: franja de KPIs (`.rs-strip`) + grilla de cards (`.rs-grid`,
  gráfico de torta de estados de pedido, barras de ventas de los últimos 7 días, lista de pagos
  pendientes/lo más vendido) reemplazando el bloque de estadísticas viejo.
- **Fix de regresión encontrado en el camino (commit `30a7566`)**: `checkSellerState()` solo miraba
  `profiles.role` (puede quedar desincronizado tras un cambio de rol, ver F12-17/migración 53 más
  arriba) y trataba cualquier `seller_request` como pendiente sin mirar su `status` — una cuenta
  con la solicitud ya `approved` seguía viendo el aviso de "pendiente de aprobación" en vez del
  panel real. Corregido: ahora también acepta el rol del JWT (`app_metadata.role`) y filtra por
  `status === 'approved'`.
- **Publicaciones (commit `71e4173`)**: segunda sección migrada al estilo ML completo. Reemplaza la
  tabla de productos por el layout de "Mis publicaciones" de ML — filas (`.pub-row`) con
  miniatura/título/precio (`buildPriceRow`, F5-05, tachado+%off respetando `offer_expires_at`
  vencido)/stock/ventas/estado + menú de acciones `⋮` (Editar/Pausar-Reactivar/Ver/Eliminar,
  reusa `openEditProductForm`/`is_active`/`delete` ya existentes de F5-02); barra de filtros
  (búsqueda + chips Todas/Activas/Pausadas + contador) 100% client-side sobre un cache en memoria
  (`pubProducts`); botón "Publicar" con menú (individual = el form de siempre; masiva = stub
  "Próximamente", sin fuente de datos para escaneo de código de barras todavía, ver P4-1 del
  backlog); estado vacío estilo ML. Conteo de ventas por producto vía una query a `order_items`
  agrupada en memoria (mismo patrón que `renderResumen`). Todo con DOM API, anti-XSS.
- **Ventas (commit `fe2cfe8`)**: tercera sección migrada, mismo patrón que Publicaciones — **reusa
  las clases CSS `pub-*` tal cual** en vez de duplicarlas (fila `.pub-row`, badges `.pub-status`,
  menú `.pub-actions`, chips `.pub-chip`, buscador `.pub-search`), porque es estructuralmente el
  mismo componente de lista (ícono en vez de miniatura, cliente/fecha en vez de stock/ventas,
  badges de estado de pedido en vez de activa/pausada). Badges nuevos agregados al set existente:
  `.pub-status--pending/shipped/ready/cancelled` (antes solo existían `--active`/`--paused`,
  suficientes para productos pero no para los 6 estados de una orden). Menú de acciones por fila
  con las mismas 3 acciones de siempre (Listo para retirar/Marcar entregado/Cancelar, F5-06) pero
  contextual — si un pedido no tiene ninguna acción disponible (p.ej. `completed`), no se muestra
  ningún botón `⋮` vacío. Sacado el botón "Refrescar" (ya no hace falta: `updateOrderStatus`
  siempre re-renderiza solo, mismo criterio que Publicaciones). **Gotcha real encontrado y resuelto
  antes de commitear**: Publicaciones y Ventas comparten la clase `.pub-chip` para sus chips de
  filtro — sin scopear, el listener de clicks de una sección tocaba también los chips de la otra
  (ambos usan `document.querySelectorAll('.pub-chip')`). Solución: cada toolbar tiene su propio id
  (`#pub-toolbar` / `#ventas-toolbar`) y las queries se scopean a `<id> .pub-chip` — mismas clases
  CSS compartidas (sin duplicar ~60 líneas de estilos), sin cruce de eventos.
- **Bugs reales encontrados y corregidos durante la verificación visual con Playwright** (sesión
  siguiente, cuenta real "facu.cells"):
  - **Login/registro con Google no dejaba elegir cuenta** (commit `0c9d740`, `js/login.js` +
    `js/register.js`): si el navegador ya tenía una sesión de Google activa, `signInWithOAuth`
    entraba directo con esa cuenta sin mostrar el selector — agregado
    `queryParams: { prompt: 'select_account' }`.
  - **Resumen mostraba "Bienvenido, tu comercio" en vez del nombre real** (commit `15f3156`,
    `pages/vender.html` + `js/vender.js`): el `<strong>` del saludo no tenía `id`, así que nunca se
    seteaba con `store.name` (el sidebar sí lo mostraba bien, la data estaba disponible). Agregado
    `id="welcome-store-name"` + asignación junto a `dash-shop-name` en `loadDashboard`.
- **Pagos por confirmar (commit `11bc950`)**: reusa el shell `pub-wrap`/`pub-list`, pero las filas
  (`buildPendingPaymentRow`) usan **botones visibles** ("Ver comprobante"/"Confirmar"/"Rechazar") en
  vez del menú `⋮` — a diferencia de Publicaciones/Ventas, acá las 2-3 acciones se usan de entrada
  (no son secundarias), así que esconderlas en un kebab sería peor UX. Mismo criterio aplicado
  después en Empleados ("Quitar acceso").
- **Envíos en curso (commit `2b3c23c`)**: mismo shell, pero **de solo lectura** — sin kebab ni
  botones. El repartidor gestiona el estado desde su propio panel (F3-03); acá el vendedor solo
  hace seguimiento. Badges nuevos: `.pub-status--pending/shipped/ready/cancelled` ya cubrían los
  3 estados de envío (`assigned`→ready, `picked_up`→shipped, `delivered`→active), sin CSS nuevo.
- **Mis cupones (commit `43e7f45`)**: mismo shell; filas con menú `⋮` (Activar/Desactivar, Borrar) —
  misma lógica que Publicaciones, porque alternar `is_active` es una acción secundaria (no se usa
  de entrada como en Pagos). El formulario de creación (`#my-coupon-form`) queda intacto arriba de
  la lista, sin tocar.
- **Empleados (commit `36710c0`)**: mismo shell; única acción ("Quitar acceso") como botón visible,
  mismo criterio que Pagos por confirmar. **Gotcha propio**: al envolver `#my-coupons-section` en
  `.pub-wrap` durante el commit de Mis cupones se perdió el `id="my-coupons-section"` que
  `loadDashboard()` usa para ocultar la sección completa a empleados (`style.display = 'none'` si
  `!isStoreOwner`) — el `if (el)` lo hacía fallar en silencio, no un error visible. Corregido en el
  mismo commit de Empleados: el `id` se mantiene en el div `.pub-wrap`, no hace falta un wrapper
  extra. **Al envolver cualquier sección existente en `.pub-wrap`, revisar primero si el id viejo
  del contenedor lo usa JS para algo más que estilos** (visibilidad condicional, querySelectors,
  etc.) antes de sacarlo.
- **Últimas 3 secciones migradas al estilo ML (2026-07-17)** — a pedido del usuario, con dos
  subagentes en paralelo (worktrees aislados, archivos disjuntos, merge + `npm run build` único al
  final; mismo patrón que el batch P2 del 2026-07-16). Usé la skill `ui-ux-pro-max` para los
  criterios de forms/contraste. Commits `2286c13` (Perfil) + `15c6f3e` (Notif/Soporte), mergeados a
  `main` (`c5cd277`/`63c11bd`) + build `0aa7d36`.
  - **Perfil de mi comercio** (solo `pages/vender.html`, clases nuevas `pf-*` en su `<style>`
    inline): el form plano gris único pasó a 3 cards `.pf-card` (mismo look que `.rs-card`) agrupadas
    por tema — "Datos del comercio", "Contacto y ubicación", "Envíos" — + la card de Mercado Pago
    reusando el shell. Grilla 2col→1col en 640px. **Sin tocar JS**: se preservaron los 13 ids que
    `vender.js` busca (`store-*`, `store-profile-form/section`, `mp-connect-section/container`) con
    sus `type`/atributos; `#store-profile-section` sigue envolviendo todo el form (JS le hace
    `display:none` para empleados, F12-16).
  - **Notificaciones + Soporte** (componentes COMPARTIDOS: `notifications-utils.js` +
    `support-utils.js` reescritos de `style.cssText` inline a clases semánticas `notif-*`/`tkt-*`
    definidas en `Assets/styles/home.css`). Acento `--bl-primary` a propósito (NO
    `--bl-vendor-accent`), porque estas funciones también las usan `perfil.html` (cliente) y
    `repartidor.js` — las 3 páginas + el dropdown de la campanita (`nav-utils.js`) cargan `home.css`,
    así que el rediseño quedó consistente en todas de una sola vez (ya no es "fuera de alcance" como
    se había marcado antes: al ir a clases compartidas, tocar una mejora las tres). Firmas/exports/
    comportamiento intactos (mark-read, mark-all, expandir hilo, cancelar, responder, enviar).
    **Bug latente pre-existente arreglado de paso** en `support-utils.js`: el path "responder" a un
    reclamo referenciaba `thread` (fuera de scope dentro de `renderTicketThread`) → `ReferenceError`
    que hacía fallar el envío de respuestas (el mensaje sí se guardaba, pero el re-render tiraba);
    corregido a `threadEl`.
  - **Verificado en producción (2026-07-17)** — pusheado a `main` (deploy Vercel `dpl_AUrNiSQ...`
    READY) y revisado con Claude-in-Chrome contra la cuenta real **facu.cells** en
    `proyectopdisc.vercel.app/pages/vender.html`: las 3 secciones renderizan bien con datos reales
    (Perfil con cards "Datos del comercio"/"Contacto y ubicación"/"Envíos" + card MP del piloto;
    Notificaciones con realce azul `--bl-primary` en la no leída; Soporte con form en card + empty
    state), **0 errores de consola**, sin overflow horizontal (`scrollWidth 1239 < innerWidth 1254`;
    el "corte" aparente era el `devicePixelRatio 1.25` del navegador), y la media query
    `≤640px → .pf-grid: 1fr` confirmada deployada y activa (desktop 2col `395px 395px`). La LISTA de
    reclamos de Soporte con datos también quedó verificada: se creó un ticket de prueba real vía el
    form "Enviar reclamo" (facu.cells) → renderiza la fila ML con badge "Abierto" + botón "Cancelar
    reclamo" (danger); al expandir el hilo y **enviar una respuesta**, la burbuja propia aparece
    alineada a la derecha en `--bl-primary` sin ningún error — **confirma en vivo el fix del
    `ReferenceError` (`thread`→`threadEl`)** del path "responder" (antes del fix ese re-render
    tiraba y la burbuja no aparecía). Quedó un ticket de prueba "Prueba de diseño — verificación
    panel vendedor" en producción (borrable/cancelable). `perfil.html` (cliente) / `repartidor.html`:
    no revisados en UI pero cargan el mismo `home.css`, mismo componente compartido.
  - **Gotcha operativo de la sesión de verificación**: crear el ticket por SQL (execute_sql) fue
    bloqueado por el clasificador de seguridad (leer `auth.users` + mutar producción) — mismo límite
    ya documentado en F12-09; la vía que sí funciona es el form real vía Claude-in-Chrome. La
    extensión se desconectó a mitad de sesión (service worker suspendido al pasar Chrome a segundo
    plano) y hubo que reinstalarla/reconectarla en una ventana nueva (que arrancó sin sesión → login
    manual del usuario).
- **Pendiente** (quedan "solo fuente", sin rediseñar — y probablemente no lo necesiten): ninguna de
  las secciones originalmente diferidas; sólo restan formularios de configuración que no encajan en
  el patrón de lista si aparecieran nuevos.
- **Verificación visual**: Resumen, Publicaciones, Ventas, Pagos por confirmar y Envíos en curso se
  verificaron con Playwright contra la cuenta real "facu.cells" (screenshots + consola sin errores;
  para Ventas/Envíos con 0 pedidos reales se inyectaron filas de preview vía `browser_evaluate`,
  puramente client-side, nunca tocando la DB, descartadas al recargar). Mis cupones y Empleados
  (último batch) se hicieron sin esa pasada visual — el usuario pidió no seguir gastando tokens en
  verificación; pendiente una revisión visual si se retoma este esfuerzo.

## Hallazgos de la auditoría de DB (2026-07-07)
- **9 tablas**, todas con RLS. (Actualización 2026-07-08: los seeds YA se aplicaron — 64 products, 14 stores, 14 categories, 2 coupons; orders/order_items siguen vacías.)
- No se usan migraciones de Supabase (`list_migrations` vacío); el SQL se aplicó a mano en el SQL Editor.
- `app_role` = {cliente, vendedor, admin} — **falta `repartidor`**.
- ✅ **BUG F0-02 (resuelto):** faltaba `repartidor` en el enum `app_role`; agregado en migración 11.
- ✅ **BUG F0-03 (resuelto):** `validate_cart_prices` leía `products.name`/`products.price` (inexistentes) → fallaba en runtime. Recreada con `title`/`price` en migración 12; columnas migradas de centavos a pesos.
- Funciones en la DB: `approve_seller_request`, `handle_new_user`, `prevent_role_update_on_profile` (protección de rol activa), `rls_auto_enable`, `set_updated_at`, `update_user_carts_modtime`, `validate_cart_prices`.
- `seller_requests` tiene columnas extra (`cuit`, `address`, `category_slug`, `phone`) → migración 05 aplicada.

## Rediseño de "Información de tu perfil" (2026-08-28)

Rama `mi-perfil-info-personal`. Pedido del usuario: rediseñar ese apartado con "todos los
apartados de una página seria, no solo correo nombre y apellido", con diseño orgánico "que no
parezca IA".

**De qué se partía:** el panel `tab-mis-datos` eran dos `.perfil-card` con tres datos de sólo
lectura (nombre, email, rol) y una frase de relleno sobre los beneficios de comprar local. No
había forma de completar ni corregir ningún dato propio desde la app — el teléfono solo se podía
cargar adentro de una dirección, y el nombre solo llegaba desde Google.

**Migración 61 (`61_profile_personal_data.sql`, aplicada y verificada en la base real):**
- `profiles.birth_date` (date), `doc_type` (text), `doc_number` (text).
- CHECKs: `doc_type` en {DNI, LC, LE, CI, Pasaporte}; tipo y número van juntos o ninguno
  (`(doc_type is null) = (doc_number is null)` — un número suelto no identifica a nadie);
  `birth_date` ni futura ni de hace más de 120 años (ataja el dedazo 1902/2002).
- Bucket **`avatars`** nuevo (público, porque la foto se ve en reseñas y navbar) con policies de
  escritura restringidas a la carpeta `{uid}/` — antes solo se podía tener foto entrando con
  Google; quien se registró con email no tenía manera de ponerse una.
- `full_name` se dejó como un solo campo **a propósito**: partirlo en nombre/apellido obligaba a
  migrar datos y tocar navbar, órdenes, reseñas y panel de vendedor para ganar muy poco.

**Estructura nueva** (`pages/perfil.html`): intro + aviso de perfil incompleto con barra de
progreso + grupos "Tu foto", "Datos personales", "Contacto", "Seguridad", "Tu cuenta" y, separado
por una línea al final, "Tus datos son tuyos" (descargar mis datos / eliminar mi cuenta,
Ley 25.326).

**Decisiones de diseño (el pedido de "que no parezca IA"):**
- **Filas con divisores, no una grilla de tarjetas.** Cada dato es una fila con su acción
  discreta a la derecha, como la pantalla de datos de Mercado Libre / Amazon / ajustes de iOS.
  Una grilla de cajas iguales es justo lo que delata una UI generada.
- **Deliberadamente NO se reusa `.perfil-card`.** Esa clase tiene hover-lift, que está bien para
  algo en lo que hacés click entero (las tarjetas del hub) pero mal para una lista donde cada
  fila tiene su propio botón: si el contenedor se mueve, el botón se te escapa del cursor.
- **Títulos de grupo sin ícono**, en gris chico afuera del panel. Los íconos quedan en el hub;
  así el hub y el detalle no compiten.
- **Edición fila por fila** (progressive disclosure), una sola abierta a la vez: abrir un
  formulario de seis campos para corregir el teléfono es pedirle al usuario que revise todo para
  tocar uno. Enter guarda, Escape cancela.
- **Un solo botón primario visible a la vez** (el "Guardar" de la fila abierta).
- Copy rioplatense y concreto ("Para que el comercio o el repartidor te avisen si hay una
  demora"), no genérico tipo "Gestioná la configuración de tu cuenta".

**Verificación** (medida en el navegador, no a ojo): los 10 botones dan exactamente 44px de alto;
inputs en 16px (evita el zoom automático de iOS) y 44px de alto; sin scroll horizontal ni en
1265px ni en 375px; en móvil las filas pasan a columna y la acción baja debajo del dato. Contraste
WCAG AA en todos los estados de color: aviso 7.11, ícono del aviso 4.83, tag "Verificado" 5.21,
título de grupo 5.31, botón primario 9.98, botón "Editar" 9.98, botón de peligro 6.04. El texto de
ayuda usa un gris propio (`--bl-perfil-hint`, ~5.7:1) porque `--bl-perfil-text-sec` llega solo a
~3.5:1 y no pasaba AA para texto que hay que leer.

**Gotchas resueltos:**
- `formatBirthDate` parsea el string a mano en vez de `new Date('1994-03-12')`: eso último es UTC
  y en Argentina (UTC-3) mostraba **el día anterior**. Hay test para esto.
- `syncProfileHeader()` NO repinta el avatar: hacerlo con `profileData.avatar_url` borraba la foto
  de Google, que no vive en esa columna.
- La barra de "perfil completo" cuenta la foto de Google como foto puesta (vía
  `displayedAvatarUrl`), si no mostraba una foto y a la vez "te falta una foto".
- El botón "Quitar" de la foto solo aparece si la foto es una que subimos nosotros — la de Google
  se ve igual pero no es nuestra para borrar.
- `deleteStoredAvatar()` borra el objeto anterior del bucket al reemplazar o quitar la foto, así
  este bucket no arrastra el problema de **fotos huérfanas** que sí tiene el de productos. Sirve
  de modelo para cuando se arregle aquel.

**Baja de cuenta:** borrar de verdad el usuario de `auth.users` necesita la service role key, que
no puede vivir en el navegador (haría falta una Edge Function). Se reusa `submitSupportTicket()`
para abrir un pedido que procesa un admin — mismo canal que ya usa el resto de la app, sin inventar
uno nuevo. **Ojo:** hoy nadie tiene rol admin en producción, así que esos tickets no los está
mirando nadie todavía.

**Descargar mis datos** sí es completo y client-side: junta perfil, direcciones, pedidos (con
items), favoritos y reseñas — todo sale filtrado por RLS, así que cada consulta devuelve solo lo
del propio usuario — y lo baja como JSON.

**`js/profile-fields.js` (archivo nuevo):** los 4 campos editables se declaran una sola vez
(display / inputs / collect / validate) y un único renderer arma tanto la fila de lectura como la
de edición. Escribir las cuatro filas a mano era el mismo bloque copiado cuatro veces, con cuatro
lugares donde olvidarse el `aria-label`. No toca DOM ni Supabase a propósito: eso permite correr
`node js/profile-fields.test.mjs` (16 chequeos con `node:assert`, sin framework — el proyecto
sigue sin runner de tests, F10-02 diferido) sobre lo que se rompe en silencio: el desfase de zona
horaria y los regex de documento y teléfono.

**Limpieza:** se borraron `.detail-list`, `.detail-item`, `.detail-value` y `.level-badge` de
`perfil-custom.css` — esta pantalla era la única que las usaba. Sobrevive `.detail-label`, que
todavía usa el formulario de direcciones.

## Fotos huérfanas de Storage + baja de cuenta real (2026-08-28)

Rama `ajustes-perfil-pendientes`. El usuario pidió tres cosas: sacar la descripción de "fecha de
nacimiento" y arreglar los dos pendientes que habían quedado del rediseño del perfil.

### 1. Descripción de "fecha de nacimiento"
Decía "Algunos comercios la necesitan para venderte productos con restricción de edad". Se sacó
porque la venta de alcohol todavía no está definida (queda para más adelante). `hint` pasó a ser
**opcional** en el renderer de filas — hay guardas en `buildDisplayRow` y en `openRowEditor`, si no
el `textContent` quedaba literalmente en `"undefined"`.

### 2. Fotos huérfanas del bucket `products` (pendiente que venía de 2026-08-14)

Había **dos** caminos que dejaban archivos sueltos, no uno: quitar una foto editando el producto, y
eliminar el producto entero (nunca se tocaba el storage).

**Gotcha importante:** la solución "obvia" era listar la carpeta `{productId}/` y borrar lo que
sobra. **No funciona:** el bucket `products` no tiene policy de SELECT sobre `storage.objects` (se
verificó en `pg_policies` — solo tiene INSERT, UPDATE y DELETE), así que `list()` devuelve vacío
**sin error**. Habría quedado un fix que no hace nada y parece que sí. Por eso se rastrean las URLs
explícitamente: `savedImageUrlsAtLoad` guarda las fotos que el producto tenía al abrir el
formulario, y al guardar se borra la diferencia contra las que quedaron. Para el borrado del
producto, las URLs se leen **antes** del delete (después `product_images` ya se fue en cascada).

El parseo URL pública → ruta se extrajo a **`js/storage-utils.js`** porque `perfil.js` ya hacía lo
mismo para los avatares (era duplicación). No importa nada, ni el cliente de Supabase (se recibe
por parámetro), así que corre con `node js/storage-utils.test.mjs` — 11 chequeos. Vale la pena
testearlo aunque sea corto: es lo que decide **qué archivo se borra**. Cubre que ignore URLs de
otro bucket y externas (la foto de Google), que corte query y fragmento, que decodifique el
porcentaje, que rechace `..`, que no llame a la API si no quedó nada y que un error del storage no
rompa la operación.

Solo se borra lo que se desreferencia de ahora en más. **Las fotos huérfanas anteriores siguen
ahí** — para limpiarlas haría falta una pasada puntual con service role.

### 3. Baja de cuenta de verdad

Se escribió `supabase/functions/delete-account/index.ts`, que borra la cuenta con la service role
key en vez de dejar un ticket que un admin procese a mano.

Antes de escribirla se auditaron los FK contra `auth.users` y `stores`, y ahí apareció lo que
decidió el diseño:
- `orders.client_id` → **SET NULL**: el pedido sobrevive anonimizado, el comercio conserva su
  historial de ventas. `order_items.product_id` y `orders.store_id` también son SET NULL, y
  `order_items` ya guarda `title`/`price` congelados — o sea, el recibo no se rompe.
- `stores.owner_id` → **CASCADE**: borrar a un vendedor **se lleva la tienda entera** (productos,
  cupones, conversaciones, credenciales de MP). Por eso la función **bloquea** la baja si la
  persona tiene un comercio y la deriva a soporte. Segunda guarda: pedidos en `paid`/`shipped`/
  `ready_for_pickup` (no se bloquea por `pending`, que suele ser un carrito abandonado y dejaría la
  cuenta trabada para siempre).

Seguridad: el uid a borrar sale **siempre** del JWT del llamador, nunca del body — no hay forma de
pedir la baja de otra persona. `verify_jwt: true`.

**Desplegada** (v1, `verify_jwt: true`). El primer intento lo bloqueó el clasificador de permisos
de la sesión; no se buscó una vía alternativa a propósito, se le avisó al usuario y él autorizó el
despliegue explícitamente. Verificado contra la función viva: POST sin header → 401
`UNAUTHORIZED_NO_AUTH_HEADER`, POST con JWT inválido → 401 `UNAUTHORIZED_INVALID_JWT_FORMAT`,
OPTIONS → 200 `ok` (esto último prueba que el código propio corre, porque el preflight no pasa por
verify_jwt).

**El camino feliz quedó sin probar**: ejecutarlo borra una cuenta real y es irreversible. Probarlo
con una cuenta de descarte antes de confiar en él.

El front igual mantiene el respaldo: si recibiera 404 cae al pedido manual por ticket
(`requestDeletionByTicket`), así el botón nunca queda roto. Un 409 muestra el motivo real tal cual
("tenés un comercio activo…"): `functions.invoke` **no** parsea el cuerpo del error, lo deja crudo
en `error.context` — de ahí el helper `readFunctionError`, sin el cual el motivo se perdía y todo
se veía como un error genérico.

## Prueba real de `delete-account` → apareció un bug de esquema (2026-08-28)

Rama `fix-orders-nullable`. El usuario pidió probar la baja de cuenta con una cuenta de descarte.
La prueba valió la pena: **el camino feliz estaba roto** y las verificaciones anteriores (401 sin
sesión, 200 en el preflight) no lo tocaban.

### El bug

`orders.client_id` y `orders.store_id` estaban declaradas `ON DELETE SET NULL` —alguien eligió a
propósito que el pedido sobreviva al usuario y a la tienda, para que el comercio conserve su
historial— **pero las dos columnas eran `NOT NULL`**. La cascada intentaba escribir NULL, el
constraint lo rechazaba, y el DELETE del padre fallaba entero:

```
null value in column "client_id" of relation "orders" violates not-null constraint
```

Consecuencia: **no se podía borrar una cuenta que tuviera aunque sea un pedido** (de cualquier
estado, incluso `completed`), ni **una tienda con pedidos**. La función devolvía 500.

El dato estaba a la vista antes de escribir la función (una consulta de columnas NOT NULL había
listado `orders.client_id`) y no se cruzó con la regla SET NULL del FK. Sin probar de verdad,
llegaba a un usuario real.

**Consulta que caza esta clase de bug** (no solo este caso) — debe dar 0 filas:
```sql
select con.conrelid::regclass, att.attname
from pg_constraint con
join unnest(con.conkey) with ordinality k(attnum, ord) on true
join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
where con.contype='f' and con.confdeltype='n' and att.attnotnull;
```

Arreglo: migración `62_orders_nullable_on_delete.sql` (quita el NOT NULL de las dos columnas,
alineándolas con la intención ya declarada en el FK; no se toca el FK). Verificado antes de
aplicar que la app lo tolera: la RLS `orders_select_own` compara `client_id = auth.uid()` y con
NULL da falso (el pedido anonimizado deja de verse del lado cliente, que es lo buscado);
`vender.js` ya hacía `.filter(Boolean)` sobre client_id y leía el teléfono con `|| ''`; `perfil.js`
usa `order.stores?.name || 'Comercio'`.

### Cómo se probó (sirve de receta si hay que repetirlo)

El alta por la API pública **no sirve**: la validación de email rechaza `.invalid` y `example.com`
("email_address_invalid"), el alta manda mail de confirmación (o sea que no devuelve sesión) y a
los pocos intentos corta con 429 `over_email_send_rate_limit`.

Lo que funcionó fue crear el usuario directo en `auth.users` por SQL con `crypt(pw, gen_salt('bf'))`
y `email_confirmed_at = now()`, más su fila en `auth.identities`. **Gotcha:** hay que poner los
campos de token (`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`,
`email_change_token_current`, `phone_change`, `phone_change_token`, `reauthentication_token`) en
`''`, no en NULL — si quedan NULL, el login falla con 500 *"Database error querying schema"*.
Después se saca el JWT con `grant_type=password` contra `/auth/v1/token`.

### Resultado final (cuenta de descarte nº2, ya borrada)

| Escenario | Resultado |
|---|---|
| Con comercio a su nombre | 409 `tiene_tienda`, nombre del comercio en el mensaje |
| Con pedido `paid` | 409 `pedidos_abiertos`, singular bien conjugado |
| Con pedido `completed` | **200 `{"ok":true}"`** |

Tras el 200: usuario, perfil, identidad, direcciones y favoritos en 0; el pedido **sigue
existiendo** con `client_id` en NULL, `store_id` intacto y `total_price` sin tocar. O sea, el
comercio conserva la venta y la persona desaparece — que es exactamente lo que se buscaba.

Las dos cuentas de descarte y sus datos quedaron borrados; se verificó que no quedaran usuarios
`%@baradero-local.test`, tiendas de prueba ni pedidos huérfanos.

## Selector de comprobante personalizado (2026-08-28)

Rama `selector-comprobante`. El usuario pidió sacar el `<input type="file">` nativo (el
"Seleccionar archivo / Ningún archivo seleccionado" del navegador) de la tarjeta de pedido y
reemplazarlo por uno con el estilo del sitio.

**Era el único input de archivo pelado que quedaba**: se buscaron todos y los otros dos (avatar en
`perfil.html`, fotos de producto en `vender.html`) ya estaban `hidden` con disparador propio. O sea
que era un caso aislado de verdad, no la punta de un patrón repetido.

Se reusó el lenguaje visual del dropzone del alta de producto (`.pubform__drop`: borde punteado +
ícono + `role="button"`), pero **compacto**: acá vive adentro de la tarjeta de un pedido, no en un
formulario entero, así que es una fila de 60px en vez de un bloque de 1.75rem de padding.

`buildProofPicker()` en `js/perfil.js` devuelve `{ element, getFile, onChange }`. Dos estados: zona
de arrastre, y "chip" con el archivo elegido (ícono, nombre recortado con ellipsis, peso formateado
y botón de quitar). Lo único que el input nativo aportaba —mostrar qué archivo elegiste— se
conserva; el resto se gana.

De paso:
- **Se agregó tope de 10 MB**, que no existía: antes se podía mandar un archivo de cualquier tamaño
  y fallaba recién en el storage, con un mensaje incomprensible.
- El botón "Subir comprobante" arranca **deshabilitado** hasta que haya archivo, en vez de ser
  apretable para contestar con un toast de reproche ("Elegí un archivo primero").
- Accesibilidad: `role="button"` + `tabIndex=0` + Enter/Espacio (un div con role=button no responde
  solo a esas teclas), `aria-label` en la zona y en el botón de quitar, y el error con `role="alert"`.

**Arreglo adyacente:** `.compra-item` era una fila flex sin regla para pantallas chicas, así que en
un teléfono la info quedaba apretada en ~190px (el detalle del pedido partido en dos líneas, el
selector nuevo ilegible) y el precio flotando al costado. Se agregó el apilado en `max-width: 600px`.
El input nativo sufría lo mismo, no lo causó este cambio.

**Gotcha de verificación:** medir con el panel del navegador oculto da basura —`window.innerWidth`
devuelve 0 y todos los `getBoundingClientRect()` colapsan (la zona "medía" 124px de alto y el
contenedor 151px). Hay que forzar un viewport con `resize_window` antes de medir o de sacar
capturas; con 1100x900 los números dieron bien (zona de 60px, botón de 44px).

## Buscador propio + filtro por categoría en Favoritos (2026-08-28)

Rama `favoritos-filtro-categoria`. El usuario pidió sacar el buscador nativo de "Mis favoritos" y
sumar filtrado por categoría de producto. (De paso confirmó que el apilado en móvil de
`.compra-item` del cambio anterior queda como está.)

**Por qué se veía pelado:** el input era `<input class="form-input">`, pero **`.form-input` solo
existe inline en `vender.html` y `repartidor.html`** — `perfil.html` carga `home.css`,
`carrito.css` y `perfil-custom.css`, ninguna la define. O sea que la clase no aplicaba nada y se
veía el input crudo del navegador. Era el único caso en la página (el formulario de direcciones usa
`.bl-input`, que sí está definida ahí).

Ahora es un campo tipo píldora con lupa a la izquierda y botón de limpiar a la derecha, que aparece
solo cuando hay texto. Se oculta la "x" nativa de `type=search`
(`::-webkit-search-cancel-button { display: none }`) porque cada navegador la dibuja distinto y no
es un objetivo táctil de verdad; la propia mide 36px. Escape también limpia.

**Filtro por categoría** (`renderFavCategoryChips`): chips con la categoría y el conteo, armados
con las categorías que el usuario **realmente tiene** en favoritos, no las 14 del sitio — ofrecer
"Panadería" a alguien sin nada de panadería es mandarlo a un filtro vacío. Ordenados por cantidad
descendente. Decisiones:
- Se ocultan si hay **menos de 2** categorías: con una sola no filtran nada.
- Se ocultan en la pestaña **Comercios**: el filtro es de categoría de producto (lo pedido).
- Los productos sin `category_id` se agrupan en un chip **"Sin categoría"**.
- Volver a tocar la categoría activa la desactiva.
- El texto y la categoría se combinan (AND).
- El mensaje de vacío distingue "no tenés nada" de "tu filtro no dio nada" — decirle "todavía no
  agregaste favoritos" a alguien que sí tiene pero filtrados es mentirle.

El dato sale de `products.category_id` → `categories(name)`, embebido en la query que ya existía
(`categories_select_public` tiene `qual: true`, así que el join no vuelve vacío por RLS).

**Gotcha que se corrigió sobre la marcha:** la rama de "menos de 2 categorías" reseteaba
`favCategory` a 'todas' sin volver a aplicar el filtro. Como `renderFavCategoryChips` corre **al
final** de `applyFavFilter`, eso dejaba la grilla mostrando un recorte y los chips diciendo otra
cosa. Se sacó el reseteo (es inalcanzable hoy, pero era una trampa para el próximo que toque esto).

**Verificado** con los 9 escenarios combinados: filtro por categoría (3 de 7), categoría + texto
(1), cruce vacío con el mensaje correcto, limpiar la búsqueda conservando la categoría, toggle de
la categoría activa, "Sin categoría", y los chips ocultándose al pasar a Comercios y volviendo al
volver. En móvil: 375px sin scroll horizontal, input de 44px con fuente de 16px, chips de 36px
envolviendo en 3 filas. Contraste ≥9.98 en chips activos e inactivos.

**Gotcha de medición (otra vez):** capturar una referencia a un `.fav-chip` **antes** de disparar
un filtrado da medidas en 0 — `applyFavFilter` reconstruye los chips y el nodo viejo queda
desconectado del DOM. Hay que volver a consultarlo después del re-render.

## Selector de categoría del alta de producto (2026-08-28)

Rama `categoria-alta-producto`. Se sacó el `<select id="prod-category">` nativo.

**Decisión: radios nativos estilados, no botones + input oculto.** Son 14 categorías con ícono, así
que una grilla que las muestra todas es más rápida que desplegar una lista. Y usando
`<input type="radio">` de verdad, la plataforma sigue dando gratis: navegación con flechas dentro
del grupo, `required`, `form.reset()` y el anuncio "opción 3 de 14" del lector de pantalla. La
alternativa (botones + un select escondido como fuente de verdad) hubiera obligado a reimplementar
todo eso a mano.

**Gotcha central:** el radio se oculta con `position:absolute; opacity:0`, **nunca `display:none`**.
Con `display:none` sale del orden de tabulación y el navegador no puede enfocarlo para mostrar el
aviso de campo obligatorio — el envío quedaría bloqueado sin que el usuario vea por qué. Verificado
que con esta técnica `checkValidity()` da false y el mensaje nativo es "Selecciona una de estas
opciones".

Estado elegido: borde + fondo tenue + negrita **+ tilde**, para no depender solo del color.
Selección y foco se resuelven con `:has()` en CSS, sin JS.

**De paso se sacó un acoplamiento:** `prod-category` se armaba copiando el `innerHTML` del select
de rubros del alta de comercio (`categorySelect.innerHTML = placeholder + baseCategorySelect.innerHTML`).
Eso ataba un control al otro y dependía de cuál se inicializara primero — si el formulario de
producto se armaba antes de que resolviera el fetch de `loadCategories()`, quedaba solo con el
placeholder. Ahora los dos salen de `categoriesCache` y `loadCategories()` re-dibuja la grilla al
terminar, así que el orden deja de importar.

Tres puntos de lectura migrados: `setProductCategorySlug()` al editar (antes `.value = slug`),
`getProductCategorySlug()` en el submit (antes `.value`), y el armado. El `icon` de la tabla
`categories` se acota con un regex a caracteres de clase CSS antes de meterlo en `className`.

**Móvil:** el mínimo de la grilla es 130px, no 150px. Es el valor más chico que entra dos veces en
un teléfono de 375px sin cortar "Carnicería" (se midió `scrollWidth > clientWidth` con cada valor):
2 columnas y 356px de alto, contra 14 filas y ~730px con una sola columna. En desktop quedan 5
columnas. Una línea en vez de un media query.

**Verificado:** 14 opciones, sin categoría el form es inválido con el mensaje nativo y el radio es
enfocable, con categoría es válido y el submit lee el slug correcto, `form.reset()` desmarca, el
re-dibujado conserva la elegida, y en 375px no hay scroll horizontal con opciones de 44px.

## Rubros con checkbox + comercios en los resultados de búsqueda (2026-08-28)

Rama `rubros-y-comercios-en-busqueda`. Dos pedidos del usuario.

### 1. Select de rubros del alta de comercio

Era `<select multiple required>` con la ayuda "Mantené Ctrl (o Cmd en Mac) para elegir más de uno"
— un patrón que además **no existe en un teléfono**. Pasa a grilla de checkbox, reusando las clases
`.catpick` del selector de categoría de producto (creadas el mismo día): el marcado es idéntico,
solo cambia `type`. Se generalizó a `renderCategoryPicker(gridId, { name, type, required })` en vez
de duplicar los ~30 líneas.

**Gotcha:** los checkbox **no** llevan `required`. En un grupo de checkbox el `required` es por
casilla, o sea que obligaría a marcarlas **todas**. El mínimo de un rubro lo valida el submit, que
ya lo hacía (`categoriesInput.length === 0` → showToast).

De paso, `loadCategories()` ya no deja un "Cargando rubros..." eterno si el fetch falla: escribe un
mensaje de error en las dos grillas.

### 2. Tarjeta de comercio en los resultados de búsqueda

`buildStoreCard` **ya existía** en `comercios.js` y hacía exactamente lo pedido (una
`<a class="product-card">` que va a `comercio.html?id=`). Se movió a `cart-utils.js` —el módulo de
UI compartida, donde ya viven `buildPriceRow`/`renderErrorState`— y ahora la usan las dos páginas,
en vez de duplicarla.

Los comercios se traen una sola vez y se filtran en memoria (son 14): así el filtro puede **ignorar
acentos** con `normalize('NFD')`, cosa que un `ilike` del servidor no hace — buscar "carniceria"
encuentra "Carnicería El Novillo". Hay un `ponytail:` marcando el techo (si algún día son miles, un
RPC con unaccent). Solo se muestran con texto escrito: filtrar comercios por precio o por categoría
de producto no tiene sentido.

Si no hay productos pero **sí** un comercio, el estado vacío ya no dice "Sin resultados" —sería
mentira, hubo resultado, solo que no es un producto— sino "No encontramos productos para X, pero sí
el comercio de arriba".

**BUG ENCONTRADO AL PROBAR (importante):** la tarjeta no navegaba. `initProductModal()` en
`product-modal.js` engancha un listener a cada `.products__grid` y hace `preventDefault()` +
`openProductModal()` sobre cualquier `.product-card` — y la tarjeta de comercio reusa esa clase.
En `comercios.html` nunca se notó porque esa página no carga `product-modal.js`. Arreglo de causa
raíz: el listener ahora ignora los clicks que caen dentro de un `a[href]`, porque un enlace tiene
que navegar. Es seguro: **todas** las tarjetas de producto son `<article>` (home.js, search.js,
comercio.js), solo la de comercio es `<a>`. Verificado que el modal de producto sigue abriendo.

**Gotcha de verificación:** los clicks por coordenada fallaban porque la captura viene **escalada**
(799px de ancho para un viewport de 1200px) y `computer left_click` usa coordenadas de la captura,
no de la página. Los clicks por `ref_N` (de `find`) no tienen ese problema — usar esos.

**Verificado contra la base real** (la búsqueda es pública, no hizo falta sesión): buscar
"carniceria" sin tilde muestra la sección "Comercio (1)" con Carnicería El Novillo arriba de los
productos, y al hacerle click lleva a `comercio.html?id=03738e21…` con su ficha cargada. Los rubros
se probaron en previsualización: 14 checkbox, selección múltiple, desmarcado, el submit lee los
slugs, el re-dibujado conserva lo marcado y sin ninguno el form es válido a nivel navegador (lo
ataja el submit).

## "Ordenar por" sin select nativo (2026-08-28)

Rama `orden-sin-select`. Último `<select>` que quedaba en la página de búsqueda.

**No se inventó un control nuevo:** justo al lado, en el mismo sidebar, ya existía el desplegable
propio de Categoría (`.cat-filter-dropdown`: trigger + menú `role="listbox"`). El de orden reusa ese
marcado y esos estilos, así que los dos filtros se ven y se comportan igual.

Para no tener la mecánica copiada dos veces (abrir, cerrar al click afuera, cerrar con Escape,
marcar la activa eran ~40 líneas dentro de `renderCategoryPills`), se extrajo
`initFilterDropdown({ rootId, triggerId, menuId, labelId, options, getValue, onSelect })`, que
devuelve `{ sync, close, setOptions }`. El de categoría usa `setOptions()` porque sus opciones
llegan de la DB después; el de orden las tiene fijas en `SORT_OPTIONS`.

De paso, al unificar:
- Las opciones ahora llevan **`aria-selected`**. Tenían `role="option"` sin él, que para un lector
  de pantalla no dice cuál está elegida.
- `syncPills()` pasó de manipular el DOM a mano a delegar en los dos desplegables.
- `clearAllFilters()` ya no necesita tocar el select por id.
- Se borraron `.filter-select` y `.filter-select-wrapper` de `home.css`: envolvían a ese select y
  ninguna otra página las usaba.

**Arreglo adyacente (accesibilidad):** el trigger daba 38px de alto y las opciones 33px, por debajo
del mínimo táctil de 44px. Como es CSS compartido, se corrigieron **los dos** desplegables (el de
orden y el de categoría, que ya estaba así de antes). También se les agregó anillo de foco visible.

**Verificado contra la base real** (la búsqueda es pública): 0 `<select>` en la página; el
desplegable de orden abre, lista las 5 opciones, marca la activa con `aria-selected="true"`, cierra
al elegir y escribe `?sort=precio-desc` en la URL; el orden **realmente reordena** (65000 → 55000 →
42000 → 35000). El de categoría sigue intacto tras el refactor: 15 opciones, filtra a "Bebidas",
combina con el orden en la URL, y cierra con Escape y con click afuera. En 375px los dos dan 44px
de trigger y de opción, sin scroll horizontal.

**Gotcha:** en móvil el sidebar está oculto detrás del botón "Filtros", así que medir sin abrirlo
primero da 0 en todo (`getBoundingClientRect` sobre un ancestro con `display:none`).

## Vehículo del alta de repartidor sin select (2026-08-28)

Rama `vehiculo-sin-select`. Tres opciones (bicicleta/moto/auto), así que radios estilados con
íconos, mismo patrón que las otras dos altas.

**Los estilos `.catpick` se movieron de inline en `vender.html` a `home.css`.** Los usan ya tres
formularios (categoría de producto, rubros de comercio, vehículo de repartidor) y las tres páginas
cargan `home.css`; tenerlos duplicados en cada `<style>` inline era pedir que se desincronizaran.

**Cómo convive con el acento del panel vendedor:** `.catpick` define
`--catpick-accent: var(--bl-vendor-accent, var(--bl-primary))` y su par `-rgb`. En `vender.html`,
que declara `--bl-vendor-accent` en su `:root`, la grilla sigue saliendo con el azul del panel
(#2f5aa8); en `repartidor.html`, que no lo declara, cae al azul de marca (#284175). Verificado en
las dos configuraciones.

**Cambio de comportamiento a propósito:** el `<select>` arrancaba en "bicicleta" (primera opción),
así que el campo "Patente" nacía oculto y el usuario podía enviar sin elegir vehículo nunca,
quedando como ciclista por omisión. Con radios no hay nada preseleccionado: "Patente" aparece
**solo** al elegir moto o auto, y el `required` obliga a elegir. `getVehicleType()` devuelve `''`
si no hay nada marcado, y la condición de la patente es `tipo && tipo !== 'bicicleta'` — sin ese
`tipo &&`, con nada elegido `'' !== 'bicicleta'` daba true y la patente aparecía de entrada.

**Verificado** (el formulario pide sesión, así que se probó en previsualización cargando las hojas
reales `home.css` + `auth.css`): 0 selects, 3 opciones de 44px, la patente oculta al inicio y con
bicicleta, visible con moto y auto, y oculta otra vez al volver a bicicleta; sin vehículo el form
es inválido con el mensaje nativo y el radio es enfocable.

**Gotcha de medición (nuevo):** `getComputedStyle` devuelve valores **obsoletos** para propiedades
que dependen de `:has()` **en el elemento sujeto** (el borde y el fondo de la opción marcada
seguían leyéndose como los de reposo), aunque las reglas de sus **descendientes** sí se leían bien
(el ícono). Lo que se pinta está correcto — se confirmó por captura. O sea: para estados con
`:has()`, creerle a la captura, no a `getComputedStyle`.

También: `requestAnimationFrame` **no dispara** con el panel del navegador oculto (no hay
composición) y cuelga el script hasta el timeout; usar `setTimeout` para esperar un recálculo.

**Estado de los selects nativos:** quedan dos, los dos fuera de lo pedido hasta ahora —
`delivery-address-select` (elegir dirección en el carrito) y `role-switcher` (cambiar de rol en el
perfil, solo visible para admin/moderador).

## Dirección del carrito sin select (2026-08-28)

Rama `direccion-sin-select`. Distinto de los anteriores: las opciones son **dinámicas** (las
direcciones guardadas del usuario, 0..N) más una de "usar otra".

**No se usó `.catpick`** (la grilla de las altas) sino una lista propia `.addr-option` con el
**radio visible**: acá conviven a dos centímetros de los radios de retiro/envío, y tenían que
leerse como el mismo tipo de elección. Cada opción muestra la etiqueta ("Casa"), la dirección
completa y el tag "Predeterminada" si corresponde.

**El motivo real del cambio, más allá de la estética:** una dirección es un texto largo
("Avenida Presidente Juan Domingo Perón 4587 esquina Los Aromos") y el `<select>` la recortaba en
una sola línea. Ahora envuelve (`overflow-wrap: anywhere`) y se lee entera — verificado que no
desborda en 375px.

**Bug de orden asíncrono arreglado de paso:** `loadAddressSelector()` es async y
`initDeliveryEvents()` decide qué mostrar según si hay direcciones. Con el `<select>` el chequeo era
`options.length > 2` sobre un elemento que se poblaba en el lugar; con la lista nueva pasó a ser
`savedAddresses.length`, una variable que empieza vacía. Si el usuario elegía "envío" antes de que
resolviera el fetch, veía el campo libre y **sus direcciones guardadas nunca aparecían**. Se agregó
`refreshDeliveryUI` (referencia a `updateMethod` que expone `initDeliveryEvents`), que
`loadAddressSelector` llama al terminar. Verificado ese caso puntual.

El listener va **delegado** en el contenedor, no en cada radio: las opciones se inyectan después,
así que engancharse a cada una en `initDeliveryEvents` llegaría antes de que existan.

**Adyacente:** los radios de retiro/envío salían con el violeta por defecto del navegador, que no
es de la paleta y desentonaba con las opciones de dirección de abajo. Se les puso
`accent-color: var(--bl-primary)`.

**Verificado** en previsualización con las hojas reales (el carrito necesita sesión para traer las
direcciones), 6 escenarios: sin direcciones cargadas todavía → campo libre; al llegar → lista
visible con la predeterminada ya elegida y puesta en `shippingAddress`; elegir otra → se actualiza;
"usar otra dirección" → aparece el campo libre, se limpia y toma el foco; volver a retiro → se
esconde todo; volver a envío → la lista vuelve conservando el estado. En 375px: sin scroll
horizontal, opciones de 68px, texto largo envuelto.

**Estado de los selects nativos:** queda **uno solo** en todo el proyecto, `role-switcher` en
`perfil.html` (cambiar de rol, visible únicamente para admin/moderador).

## Barrido final: cero `<select>` nativos en el proyecto (2026-08-31)

Rama `sin-selects-nativos`. El usuario pidió sacarlos "de todos lados". Quedaban cinco, tres de
ellos **creados desde JS** (no se ven grepeando el HTML — hay que buscar también
`createElement('select')`).

Tres soluciones distintas, según lo que cada uno era en realidad:

### 1. Calificación por estrellas (2 casos, era el mismo código duplicado)
`reviews-utils.js` (reseña de producto/comercio) y `perfil.js` (calificar al repartidor) tenían
**el mismo bloque copiado**: un `<select>` con opciones "★★★☆☆". Elegir una calificación abriendo
un desplegable y leyendo cinco cadenas casi idénticas es lo contrario del gesto natural, que es
tocar la tercera estrella.

Se extrajo `buildStarRating()` a `reviews-utils.js` (que `perfil.js` ya importaba). Son radios
nativos: teclado, `required` y envío los sigue manejando el navegador.

**Truco central:** el relleno "hasta la estrella elegida" se hace **solo con CSS**, sin JS. Para
eso las estrellas se pintan en orden **inverso** (5→1) y se muestran con `flex-direction:
row-reverse`. Así "la elegida y las de menor puntaje" queda expresable como "la elegida y sus
hermanas siguientes" (`~`), que es lo único que CSS permite. Visualmente se leen 1→5.

### 2. Desplegable propio reusable (2 casos)
`js/dropdown.js` nuevo: `buildDropdown({ options, value, onSelect, ariaLabel })` →
`{ element, getValue, setValue, setDisabled }`. Se arma solo, sin depender de ids, porque va dentro
de filas de tabla (estado de reclamo en el panel de admin) y de editores inline (tipo de documento
en el perfil), donde puede haber muchos a la vez. No importa nada, así que es testeable.

Detalle que importa: **elegir la misma opción no dispara `onSelect`**. En el panel de admin eso
evitaba una escritura inútil a la DB cada vez que el admin abría y cerraba el desplegable sin
cambiar nada.

El del sidebar de búsqueda **no** se migró a este módulo: su marcado ya vive en `search.html` y su
helper (`initFilterDropdown`) cablea DOM existente en vez de crearlo. Son formas distintas; unificar
por unificar habría agregado riesgo sin ganancia.

En `perfil.js`, el desplegable se guarda en `els[spec.name]` con la **misma forma mínima que un
input** (`value` como getter, `focus`, `setAttribute`, `removeAttribute`) para que guardar y validar
no tengan que distinguir si la fila tiene un input o un desplegable.

### 3. `role-switcher` → un link
Era un `<select>` cuya única opción distinta a la actual **navegaba a admin.html**; elegir la otra
no hacía nada. O sea, un control de navegación disfrazado de campo de formulario. Se reemplazó por
un `<a href="./admin.html">` que solo aparece si el JWT trae rol admin/moderador, con la etiqueta
correcta ("Panel de administración" / "Panel de moderación"). Menos código y más honesto.

**Verificado:** las estrellas se probaron **en la página real de producto** (es pública): orden DOM
5→1 pero visual 1→5, opciones de 44×44, y al elegir 4 se rellenan 4 en ámbar y queda 1 gris
(confirmado por captura). El desplegable se probó con el módulo real: abre/cierra, aria-expanded,
la activa marcada con `aria-selected`, foco de vuelta al trigger al elegir, Escape y click afuera
cierran, `setDisabled` impide abrir, dos instancias independientes, y elegir la misma opción no
re-dispara. Todo a 44px.

**Recordatorio (tercera vez que muerde):** `getComputedStyle` devuelve valores **obsoletos** para
propiedades que dependen de `:has()`. Reportaba las estrellas sin rellenar cuando la captura
mostraba las 4 en ámbar. Para estados con `:has()`, confiar en la captura.

## Selector de fecha propio: cero `<input type="date">` a la vista (2026-08-31)

Rama `sin-fechas-nativas`. Cuatro casos: vencimiento de cupón (admin), vencimiento de cupón
(vendedor), vencimiento de oferta (producto) y fecha de nacimiento (perfil, declarado en
`profile-fields.js` — no aparece grepeando `type="date"` en el HTML).

**Salvedad honesta:** este es el caso donde el control nativo tiene más a favor, sobre todo en
teléfonos, donde el navegador muestra su propio selector (rueda/calendario del sistema) que es muy
bueno. Se reemplazó igual porque el pedido fue sacarlos y porque el nativo se dibuja distinto en
cada navegador, pero es un intercambio real, no una mejora pura.

**`js/datepicker.js` nuevo.** Dos formas de cargar la fecha, porque sirven para cosas distintas:
escribir con máscara `dd/mm/aaaa` (lo único razonable para una fecha de nacimiento: nadie retrocede
400 meses en un calendario) y el calendario para "el mes que viene".

**Cómo no rompe el código existente:** el `<input type="date">` original se convierte en
`type="hidden"` **conservando su id**, y sigue llevando el valor en ISO. Así los cuatro lugares que
hacen `getElementById(id).value` no se tocaron. `upgradeDateInputs()` los convierte a todos de una.
El `type="date"` queda en el HTML a propósito: es el selector que los encuentra y, si el JS
fallara, el usuario ve un campo de fecha funcional en vez de nada.

**BUG encontrado al probar `reset()`:** en un input `hidden`, asignar `.value` escribe el
**atributo** value (su modo de valor es "default" según el spec), así que `form.reset()` lo
restaura... a sí mismo. Con el `<input type="date">` original sí se limpiaba. Efecto real: después
de crear un cupón, **el siguiente heredaba en silencio la fecha de vencimiento del anterior**. Se
arregla guardando el valor inicial al construir y volviendo a él en el evento `reset` (con
`setTimeout`, porque el evento llega antes de que se apliquen los valores por defecto). El arreglo
va dentro del componente, no en los tres formularios que llaman a `reset()`.

**Zona horaria:** nada de `new Date(iso)` para parsear — eso interpreta el string como UTC y en
Argentina devuelve el día anterior. Toda la aritmética es sobre `{año, mes, día}` o `Date.UTC`.

**20 chequeos** en `node js/datepicker.test.mjs`: bisiestos incluida la regla de los siglos (1900
no, 2000 sí), fechas inexistentes (31/02, 29/02 en año común, 31 de abril), ida y vuelta ISO↔display
sin corrimiento, la máscara, los límites inclusive, la grilla del mes (siempre 42 celdas para que no
salte el alto, el 1 alineado al día de semana correcto con semana de lunes) y el cruce de año al
navegar meses.

**Verificado en el navegador** con el módulo real: 0 campos de fecha nativos visibles, escribir
carga el ISO, el calendario abre en el mes de la fecha cargada, elegir un día actualiza y cierra,
las fechas fuera de rango quedan deshabilitadas en la grilla (en agosto 2026 con `min` = hoy, solo
el 31 quedaba habilitado), y las inválidas (31/02, antes del mínimo, nacimiento futuro) vacían el
valor y marcan `aria-invalid`.

**Gotcha de layout:** fijarle 21rem de ancho al calendario para que las celdas llegaran a 44px lo
hacía **sobresalir de la pantalla** en un teléfono (scroll horizontal + calendario cortado). Un
calendario cortado es peor que una celda chica: quedó `width: max(100%, 17rem)` (nunca más ancho
que el campo) y el alto de la celda fijo en 40px, que es lo que sí se puede garantizar para el dedo.

## Alcance acotado: solo checkboxes con accent-color, no text/email/password/number (2026-08-31)

Rama `checkbox-accent-color`. El pedido era sacar "los inputs de todos los tipos que sean
nativos". Se frenó antes de ejecutar: eso incluía ~55 inputs `text`/`email`/`password`/`number`/
`url`/`search`, que son cajas simples ya estilables con CSS puro. Reimplementarlos con JS
rompe el autocompletado del navegador, el gestor de contraseñas, y en el celular pierde el teclado
específico por tipo (`@` para email, numérico para tel/number) — degradación real para nada, no
había ningún problema visual que resolver ahí. Se le presentó la disyuntiva al usuario con
`AskUserQuestion` y eligió el alcance acotado: solo unificar el color de los checkboxes.

**Inventario:** 3 checkboxes en todo el proyecto (`address-default` en perfil, `terms-checkbox` en
register, `store-accepts-contact` en vender). Al mirarlos, **2 de los 3 ya tenían su propio
estilo**: `terms-checkbox` está oculto (`opacity:0`) detrás de una reconstrucción completa con
`:has()` (`.auth-terms__custom-check`), y `store-accepts-contact` ya tenía
`accent-color: var(--bl-vendor-accent)` explícito. El único sin ningún estilo era
`address-default`, que salía con el violeta por defecto del navegador.

**El arreglo:** una sola línea, `input[type="checkbox"] { accent-color: var(--bl-primary); }`, en
`home.css` (con el equivalente `--auth-primary` en `auth.css`, porque `register.html` no carga
`home.css`). Sin JS, sin perder nada del checkbox nativo (teclado, foco, lector de pantalla). Por
especificidad de selector, las reglas más específicas que ya existían (`.auth-terms
input[type="checkbox"]`, `.pf-check input`) siguen ganando, así que no hizo falta tocar nada más:
se verificó que ninguno de los dos checkboxes ya estilados cambiara.

**Verificado:** en `register.html` (público) el checkbox de términos se sigue viendo igual que
antes, azul de marca al tildarlo. En previsualización con `home.css` real, `address-default` pasó
de violeta del sistema a `rgb(40, 65, 117)` (#284175, el ancla de marca) — confirmado por
`getComputedStyle` (acá sí es confiable, no depende de `:has()` sobre el propio elemento) y por
captura.

## Tarjetas de "Mi historial de compras": miniatura + link a la ficha aunque esté pausada (2026-08-31)

Rama `purchase-history-cards`. Cada línea de producto dentro de una orden (`buildCompraItem` en
`js/perfil.js`) ahora muestra una miniatura de 40x40 (`oi.products?.image_url`, con fallback a
`/img/no-image.svg`) y linkea a `producto.html?id=...` cuando `order_items.product_id` sigue
existiendo. El texto (`Nx Título — $precio`) sigue usando `order_items.title` congelado (F2-06),
no el título en vivo — solo el link y la imagen vienen del join a `products`.

**El problema real no era de UI:** ni `producto.html` ni el embed `order_items -> products` podían
ver un producto que el vendedor pausó (`is_active = false`) después de la venta —
`products_select_public_active` exige `is_active = true` y `products_select_own` exige ser el
vendedor. Ninguna cubre "cliente viendo lo que ya compró", así que antes de esta tarea visitar la
ficha de un producto pausado desde el historial daba "Producto no encontrado" (RLS bloqueaba el
`.single()`), y el embed en el historial llegaba `null` (sin imagen).

**Fix:** migración `68_products_select_purchased.sql` — nueva policy RLS de SELECT en `products`,
aditiva a las que ya existían (Postgres las combina con OR), que permite ver el producto si existe
un `order_items` del comprador (`orders.client_id = auth.uid()`) apuntando a ese `product_id`.
Aplicada directo a producción con el MCP de Supabase (`otzhdwuaffcplrveuadc`), a pedido explícito
del usuario en la misma sesión — no quedó como pendiente sin aplicar (a diferencia de la migración
66).

**Verificado con SQL, no con navegador** (no había credenciales de una cuenta real con compras en
esta sesión): dentro de una transacción con rollback, se puso `is_active = false` en un producto
con compras reales, se simuló el rol `authenticated` con `set local request.jwt.claims` usando el
`client_id` real de esa orden — la fila SÍ aparece (comprador ve su propio producto pausado); con
un `sub` random no relacionado, la fila NO aparece (RLS sigue bloqueando a terceros). `get_advisors`
después de aplicar: sin lints nuevos. Sin datos de producción tocados (rollback).

No se agregó ningún gate de `is_active` en `producto.js` para el botón "Agregar al carrito": ya
existe un guard server-side (`create_order` RPC valida `is_active = true` antes de crear el
`order_item`, ver `18_create_order_rpc.sql` y las versiones posteriores) — un comprador que reabre
un producto pausado desde su historial y aprieta "agregar al carrito" fallaría recién al pagar, no
es un agujero de seguridad, solo una UX subóptima fuera del alcance de este pedido.

## Formulario de "Agregar dirección" (perfil): autocompletado, teléfono propio y default tildado (2026-09-02)

Rama `claude/address-autocomplete-phone-aa4827`. Pedido del usuario sobre la sección "Direcciones
de envío" del perfil (`js/perfil.js` + `pages/perfil.html`), sin clave de Jira (tarea ad hoc, no
del roadmap F0-F12).

**Autocompletado de "Dirección (Calle y Número)":** sin API key, vía Nominatim (OpenStreetMap,
`nominatim.openstreetmap.org/search`), sesgado a Baradero concatenando ", Baradero, Buenos Aires,
Argentina" a lo que escribe el usuario (todo el comercio es de esa ciudad, no hacía falta pedir
geolocalización ni un `viewbox`). Reutiliza el markup/CSS `.search-suggest*` que ya existía para el
buscador de la navbar (`home.css`, ver `initSearchBox` en `js/nav-utils.js`) en vez de escribir
estilos nuevos — mismo look, debounce (400ms), navegación por teclado (flechas/Enter/Escape) y
guard de respuestas viejas (`token`) copiados de ese mismo patrón. Requirió sumar
`https://nominatim.openstreetmap.org` al `connect-src` de la Content-Security-Policy de
`perfil.html` (es la única página con el formulario de direcciones); si se reusa este patrón en
otra página (`vender.js` para la dirección del comercio, por ejemplo) hay que agregarlo a su CSP
también.

**Teléfono de contacto:** nuevo checkbox "Usar mi teléfono ({{profile.phone}})" arriba del input,
tildado por default si el perfil tiene teléfono cargado (columna `profiles.phone`, la de
"Información de tu perfil", migración 61) y la dirección no tiene uno propio distinto ya guardado.
Tildado deja el input en `readOnly` con el valor del perfil; destildado lo limpia y habilita
edición libre. Si el perfil no tiene teléfono cargado, el checkbox ni se muestra.

**"Establecer como predeterminada":** ahora arranca tildado al agregar una dirección nueva (antes
arrancaba destildado, aunque la primera dirección se termina forzando a default igual en el
`submit`). Al editar una dirección existente sigue reflejando su `is_default` real — forzarlo
tildado ahí sería engañoso (parecería que ya es la default sin serlo).

**Verificación:** `npm run build` sin errores. La query a Nominatim se probó por fuera del
navegador (`curl` directo a la API) confirmando que devuelve calles reales de Baradero
correctamente sesgadas. **No se pudo probar el flujo completo logueado en el navegador**: crear una
cuenta de prueba nueva chocó primero con el rate-limit de registro de Supabase y después con
`over_email_send_rate_limit` (cuota de emails de confirmación del proyecto, compartida entre todas
las sesiones/worktrees en paralelo) — no hay forma de loguearse sin credenciales reales ni de
esquivar ese límite reintentando. Pendiente confirmar interactivamente cuando el usuario (u otra
sesión con una cuenta ya logueada) lo prueba a mano.

## Buscador y filtro por estado en "Mi historial de compras" (2026-09-02)

`A113-316`, rama `claude/purchase-history-search-filter-022fa1`, commit `b8d66a3`. Se agrega un
input de búsqueda (comercio, producto o n° de orden corto) y chips de filtro por estado del pedido
a la pestaña "Mis compras" del perfil (`pages/perfil.html`, `js/perfil.js`). De paso se sacó el
ícono de caja (`fa-box-open`) del título de la sección, a pedido del usuario.

**Reuso, no CSS nuevo:** el buscador y los chips reutilizan literalmente las clases
`fav-search`/`fav-chips` que ya existían para el buscador de "Mis favoritos" — mismo look, mismo
idioma de interacción (Escape limpia, "x" propia en vez de la nativa de `type=search`), sin tocar
`perfil-custom.css`. `loadCompras` ahora cachea `orders`/`reviewByRepartidorId`/
`transferInfoByStoreId` en variables de módulo (`comprasCache`, etc.) y el filtrado (texto + estado
combinados) corre en el cliente contra esa caché, sin volver a pegarle a Supabase.

**Cómo se verificó (sin login real):** se le pidió al usuario crear una cuenta de prueba
reutilizable y que yo la usara para probar. Eso choca con una regla fija de la política de
seguridad — "crear cuentas" y "entrar contraseñas/tokens para autenticarse" están prohibidos
incluso con autorización explícita del usuario, no es una decisión de contexto. Se le explicó la
restricción y, dadas las alternativas (que él mismo se loguee en su Chrome real y yo maneje esa
pestaña ya autenticada vía Claude-in-Chrome, o solo tests de lógica), eligió **solo tests de
lógica**. Se corrió un script aislado en Node (fuera del repo, en el scratchpad de la sesión, no
commiteado) que reproduce `orderMatchesQuery` + el filtro combinado texto/estado contra pedidos
mock calcados de la captura real que mandó el usuario (mismos ids cortos, mismos nombres de
comercio) — los 7 casos (por comercio, por producto, por n° de orden, por estado solo, estado +
texto combinados, sin resultados) pasaron. Ver memoria `feedback-testing-sin-login` para la regla
completa de cara a futuras sesiones.

## Página de Ajustes completa (2026-09-02)

Rama `claude/settings-page-features-a5928b`. La pestaña "Ajustes" del perfil tenía una sola
casilla ("Mostrar ayudas en el carrito") y nada más. Ahora tiene tres grupos:

- **Preferencias** — las ayudas del carrito (ya existía, sincronizada con la cuenta vía
  `profiles.cart_hints_enabled`) + dos nuevas: "Avisos emergentes de notificaciones" y
  "Reducir animaciones".
- **Sesión y seguridad** — un acceso directo a "Información de tu perfil" (donde viven la
  contraseña y la forma de ingreso) y **"Cerrar sesión en todos los dispositivos"**
  (`supabase.auth.signOut({ scope: "global" })`, revoca todos los refresh tokens de la cuenta).
- **Tus datos son tuyos** — "Descargar mis datos" + "Eliminar mi cuenta", **movidos** desde
  "Información de tu perfil". Es un movimiento de HTML puro: los ids (`btn-download-data`,
  `btn-delete-account`) no cambiaron, así que `setupPrivacyActions()` los sigue enganchando sin
  tocar una línea de JS.

**Por qué las dos preferencias nuevas son por dispositivo y no por cuenta:** la migración 66
(`cart_hints_enabled`) sigue sin aplicar, así que sumar más columnas a `profiles` habría sumado
más preferencias que no persisten. Además son genuinamente decisiones del dispositivo ("no me
tires carteles en la compu de la oficina", "esta pantalla me marea"). Viven en
`js/settings-utils.js`: una tabla chica `PREFS` (clave de localStorage + default) con
`getPref`/`setPref`/`applyDevicePreferences`, sin imports, con `node js/settings-utils.test.mjs`.

**Reducir animaciones** no inventa CSS: `applyDevicePreferences()` pone la clase
`bl-reduce-motion` en `<html>` y `Assets/styles/a11y.css` repite ahí el mismo cuerpo que ya tenía
el `@media (prefers-reduced-motion: reduce)` (no se pueden fusionar: son dos condiciones distintas
con el mismo efecto). La llamada vive en `js/auth-utils.js`, el único módulo que importa
prácticamente todo el sitio.

**Gotcha que apareció al verificarlo:** la llamada estaba puesta *después* de
`createClient(SUPABASE_URL, ...)`. Sin `.env` local eso tira `supabaseUrl is required`, corta la
evaluación del módulo y la clase nunca se aplicaba. Se movió **arriba** de `createClient`: una
preferencia de accesibilidad no tiene por qué depender de que la config de Supabase esté bien.

**Avisos emergentes**: el gate está dentro de `pollOnce` en `js/toast-utils.js`, antes del fetch —
apagado no consulta nada (se ahorra un request cada 30s) y el cambio se siente sin recargar. Al
apagarlos se borra `bl_toast_last_notif_id`, así que al volver a encenderlos se arranca de cero en
vez de recibir de golpe todas las de mientras.

**Navegación:** el selector `.account-card[data-target]` de `perfil.js` pasó a
`[data-target^="tab-"]`, así cualquier botón de adentro de una sección puede abrir otra sección
sin handler propio (lo usa el botón "Ver" de Sesión y seguridad).

**Cómo se verificó (sin login, ver memoria `feedback-testing-sin-login`):** `perfil.html` exige
sesión, así que (a) `node js/settings-utils.test.mjs` cubre defaults, round-trip, clave inexistente
y localStorage bloqueado; (b) "Reducir animaciones" se probó de punta a punta en `home.html` (que
es pública): con la preferencia en `1` el `<html>` queda con `bl-reduce-motion` y la
`transition-duration` de un botón del navbar pasa de `0.15s` a `1e-05s`; en `0` vuelve a `0.15s`;
(c) el render del panel se verificó inyectando el `#tab-ajustes` real de `perfil.html` (vía fetch +
DOMParser) junto con `perfil-custom.css`/`carrito.css` reales en una página pública, y sacando
captura — los tres toggles, los separadores, las etiquetas "Solo en este dispositivo" y las dos
filas de sesión se ven bien.

**Lo que NO se hizo, a propósito:** tema oscuro (habría que reescribir los colores de las 6 hojas
de estilo, no es un ajuste sino un proyecto), preferencias de notificación por tipo (necesitan
migración nueva y hoy solo existe el canal in-app: F8-02/F8-03 siguen bloqueadas), y tamaño de
texto (el zoom nativo del navegador ya lo cubre).

## "Servicios": números de emergencia en el home (2026-09-08)

Rama `claude/emergency-services-section-8g6e35`. El botón "Ayuda" de la fila
`category-bar__inner--home-actions` del home (Vender / Contratar / Ayuda) pasó a ser **"Servicios"**
y ahora lleva a una página nueva (`pages/servicios.html`) con los números de emergencia de
Baradero, agrupados por tipo: **Emergencias** (policía, bomberos, hospital, ambulancia, etc.) y
**Veterinarias** (de turno o de urgencias). El link "Ayuda" del footer NO se tocó -- sigue
apuntando a `info.html`, es un elemento distinto.

**Diseño de la tabla, más simple que farmacias a propósito:** `pharmacies`/`pharmacy_shifts`
(migración 67) están separadas en dos tablas porque el turno de farmacia rota todos los días y
hay que resolver del lado del cliente "a las 3am el turno vigente es el de ayer". Acá no hay esa
rotación automática: "veterinaria de turno" es, para esta sección, un contacto más que el admin
actualiza a mano cuando cambia (mismo criterio que ya usa para el resto de los teléfonos). Por eso
es una sola tabla, `emergency_contacts` (migración `76_emergency_contacts.sql`, aplicada a
producción con el MCP de Supabase en esta misma sesión): `category` (check `emergencias` /
`veterinarias`), `name`, `phone`, `notes` (aclaración opcional, ej. "Turno esta semana"),
`display_order`, `is_active`. RLS: lectura pública (`anon`+`authenticated`, solo activos) +
`for all` solo `admin` -- calco exacto de `pharmacies_select_public`/`pharmacies_all_admin`, con
el mismo trigger de auditoría (`log_admin_action`) que el resto de las tablas que edita el admin.

**Admin:** nueva sección "Servicios" en el panel (`data-target="emergency-contacts"`), en el grupo
"Catálogo" al lado de "Farmacias". Un form de alta (tipo/nombre/teléfono/aclaración/orden) + tabla
con activar/desactivar (no borra el registro, igual que farmacias) y borrar. Oculta para el rol
`moderador`, mismo criterio que categorías/cupones/farmacias (no es moderación de contenido de
usuarios, es configuración). Carga perezosa vía `SECTION_LOADERS['emergency-contacts']`.

**Página pública:** sin `guardPage`, sin sesión requerida -- misma decisión que `farmacias.html`
(información de utilidad pública). Si no hay contactos cargados en una categoría, esa categoría
directamente no se dibuja (no se muestra un grupo vacío); si no hay ninguno, un mensaje explícito
en vez de una página en blanco. Botón "Llamar" con `tel:` armado a partir del teléfono cargado.

**Gotcha de build:** `pages/servicios.html` necesitó agregarse a `rollupOptions.input` en
`vite.config.js` (como cada página nueva del sitio) -- sin eso Vite no la incluye en `dist/` aunque
el archivo exista y el link del home funcione en dev.

## "Contratar": directorio de profesionales y técnicos (2026-09-08)

Misma sesión que "Servicios" de arriba, rama `main` (push directo, a pedido del usuario). El botón
"Contratar" del home dejó de llevar a la página placeholder "muy pronto, estamos armando" y pasó a
ser el directorio real: profesionales y técnicos de Baradero, informativo por WhatsApp/teléfono
-- sin catálogo de productos ni pedidos, a diferencia de un comercio.

**Alcance definido por el usuario, textual:** "es un directorio informativo por WhatsApp/teléfono,
los profesionales se pueden cargar en el apartado de vender y se puede hacer un formulario simple
de ingreso para ellos, similar al de comercio". De ahí las tres decisiones de diseño:

1. **El alta vive en `vender.html`, no en una página nueva.** Arriba del formulario de "Crear mi
   tienda" hay un selector nuevo (`.register-type-toggle`, una píldora de dos botones) que alterna
   entre "Vender productos" (el form de siempre) y "Ofrecer un servicio" (form nuevo, más corto:
   nombre, oficio/especialidad, descripción opcional, teléfono, WhatsApp opcional -- sin CUIT ni
   dirección, no hace falta para un directorio de contacto). **Limitación conocida, a propósito:**
   quien ya es vendedor (o empleado de un comercio) nunca ve el toggle -- `checkSellerState()`
   revela el dashboard de comercio y vuelve antes de llegar a chequear nada de profesionales. No
   se puede ser las dos cosas a la vez desde esta UI; no lo pidió el alcance y hubiera complicado
   la función bastante.

2. **Aprobación manual del admin, igual que un comercio -- pero SIN RPC `SECURITY DEFINER`.**
   `approve_seller_request()` necesita correr con privilegios elevados porque escribe en
   `profiles.role` y en `auth.users.raw_app_meta_data` (subir a alguien a rol `vendedor`).
   Publicarse como profesional **no cambia el rol de la cuenta** -- sigue siendo `cliente`, no hay
   panel de vendedor que dar. Por eso aprobar acá es un `insert` en `professionals` + un `update`
   en `professional_requests`, dos llamadas comunes desde el cliente que ya cubre el RLS "for all"
   del admin -- mismo patrón que farmacias/emergency_contacts, no el de seller_requests. Migración
   `77_professionals.sql` (aplicada a producción con el MCP de Supabase en esta sesión): dos
   tablas, RLS calcada de `seller_requests`/`pharmacies` (insert/select propio +
   select/update admin en `professional_requests`; select público solo activos + "for all" admin en
   `professionals`), triggers de `set_updated_at` y de auditoría (`log_admin_action`, que ya se
   autolimita a filas tocadas por un admin real -- el insert que hace la propia persona al pedir
   turno no queda en el log, solo el approve/reject).

3. **Sin dashboard propio.** Un comercio tiene todo un shell "Mi cuenta" (pedidos, pagos, envíos,
   publicaciones...) porque gestiona ventas reales. Un profesional publicado no gestiona nada del
   lado de la plataforma -- por eso, después de registrarse, `vender.html` no lo manda a
   `dashboard-view`: le muestra un estado simple dentro del mismo `register-view`
   (`#professional-status-view`) con el texto "pendiente" / "ya estás publicado" / "rechazada",
   calcado del `#mc-pending-notice` que ya existía para comercios pendientes. Tampoco hay UI de
   autoedición todavía (cambiar el teléfono cargado, por ejemplo) -- no estaba en el alcance
   pedido ("formulario simple de ingreso"); si hace falta más adelante, el owner ya tiene los datos
   en `professionals.owner_id` para agregar RLS de auto-edición sin migración nueva.

**Página pública (`pages/contratar.html` + `js/contratar.js`):** reemplaza el placeholder entero.
Como `specialty` es texto libre (no una categoría fija -- hay demasiados oficios distintos para un
enum, y con pocos profesionales cargados agrupar por categoría hubiera dejado grupos de un solo
ítem, feo), el diseño NO repite las tarjetas por categoría de `servicios.html`: es una lista plana
de tarjetas (`.ct-card`) con un buscador arriba (`#ct-search-input`, filtro client-side por
nombre/oficio/descripción sobre el array ya cargado, sin ida y vuelta a la base por letra tipeada).
Cada tarjeta muestra nombre + oficio como pill + descripción opcional + botón "Llamar" (siempre,
`tel:`) y "WhatsApp" (solo si cargó uno, `wa.me`, verde `#25d366` -- único lugar del sitio con ese
color, a propósito reconocible como WhatsApp y no como el verde de éxito del design system). Cierra
con un CTA "¿Sos profesional o técnico? Sumate al directorio" -> `vender.html`, para no depender
solo de que alguien encuentre el toggle por su cuenta.

**Admin:** sección nueva "Profesionales" (grupo "Solicitudes" del nav, al lado de
Comercios/Repartidores), con dos tablas como Farmacias: "1. Solicitudes" (aprobar/rechazar,
igual que seller-requests pero con botones bindeados por fila en vez del querySelectorAll
delegado global que usa esa sección vieja -- evita colisión de clases `.btn-approve`/`.btn-reject`
sin tener que inventar sufijos nuevos) y "2. Publicados en Contratar" (activar/desactivar/borrar,
igual que farmacias). Oculta para el rol `moderador`, mismo criterio que seller-requests.

**Verificado visualmente con Playwright** (sin login real: `vender.html` exige sesión vía
`guardPage`, así que se bloqueó la carga del bundle `vender-*.js` con `page.route` para que nunca
corra el redirect a login, y se mostró/ocultó `register-view` a mano -- el resto de la página, CSS
y navbar incluidos, carga por navegación real así que se ve exactamente como en producción). Los
dos tabs del toggle y `contratar.html` con datos de ejemplo se ven bien, sin overflow ni recortes,
en desktop.

## "Contratar": categorías, estrellas, foto, home y buscador (2026-09-08, mismo día)

El usuario pidió, en un solo mensaje, cuatro ampliaciones al directorio recién armado: "que en la
parte de arriba tenga categorías", "un sistema de estrellas (mientras más estrellas, mejor)", "que
se puede ingresar... donde detallan un poco más lo que hacen y si es que tienen algún logo o
imagen", "que se puedan buscar en el buscador también" y "que aparezcan en home en un pequeño
apartado". Migración `78_professionals_extras.sql` (aplicada a producción) + `js/professional-categories.js`
nuevo (lista compartida, evita que vender.js/admin.js/contratar.js/home.js se desincronicen).

**Decisión central, la que ahorró más trabajo:** las estrellas NO son una tabla nueva. `reviews`
(36_reviews.sql) ya es polimórfica por `target_type`/`target_id`, y la migración 44 ya le había
sumado `'repartidor'` al `CHECK` en su momento -- acá se repite exactamente ese patrón, sumando
`'professional'`. Consecuencia directa: **cero JS nuevo para reseñas**. `js/reviews-utils.js`
(`renderReviewsSection`, resumen + lista + form + reportar, ya lo usan producto.js/comercio.js) se
llama tal cual con `target_type='professional'` desde `contratar.js`. También se sumó una rama a
`notify_new_review()` (38_notifications.sql) para que el profesional reciba notificación al recibir
una reseña -- 'repartidor' no la tiene (gap preexistente, no se tocó, no es parte de este cambio) --
con link nuevo en `notifications-utils.js` a `contratar.html?pro=<id>`.

**Categorías**: lista fija y chica (6 valores: hogar, clases, cuidado, belleza, tecnología, eventos)
en `professional-categories.js`, separada de `specialty` (texto libre, "Plomero", "Clases de
inglés") a propósito -- specialty es demasiado variado para chips útiles, category sirve para
filtrar sin depender de que el texto coincida exacto. Columna nueva en ambas tablas
(`professional_requests`/`professionals`) con el mismo `CHECK` en las dos.

**Foto/logo**: mismo patrón exacto que `stores.logo_url` (74_store_logo.sql) -- bucket
`professional-photos`, público de lectura, cada usuario escribe solo en su propia carpeta `{uid}/`
(la policy valida contra `auth.uid()`, no contra el id del profesional, porque storage no sabe
quién es dueño de qué fila). A diferencia del logo de comercio (se sube después de aprobado, desde
`comercio.js`), acá se sube **durante el alta** en `vender.html` -- antes de que exista la fila en
`professionals`, por eso la carpeta es por uid del usuario, no por id de profesional. Tope 2 MB,
mismo que el logo de comercio.

**"Un apartado donde detallan más" se resolvió como tarjeta expandible, no una página nueva.**
Se consideró un `pages/profesional.html` al estilo `producto.html`/`comercio.html`, pero para no
sumar una ruta/entrada de Vite nueva por un detalle que cabe perfecto en una tarjeta que se abre:
cada `.ct-card` de `contratar.html` es ahora un `<button>` que hace toggle de un panel
`.ct-card__detail` (descripción completa + botones de contacto + `renderReviewsSection`, cargada
recién la primera vez que se abre esa tarjeta -- `loadedReviewSections`, un `Set`, evita refetch al
cerrar/reabrir). El resumen de estrellas de la tarjeta CERRADA sí hace falta desde el arranque
(para poder ordenar la lista completa "mientras más estrellas, mejor"), así que `contratar.js` trae
TODAS las reseñas de TODOS los profesionales visibles en una sola consulta
(`.in('target_id', ids)`) y agrupa en memoria -- ni una consulta por tarjeta.

**Orden de la lista**: por rating promedio descendente: quien no tiene ninguna reseña todavía va al
final (no se mezcla con "0 estrellas", que sería peor que no tener reseñas), empatado por nombre.
Mismo criterio de orden en la mini-sección del home.

**Buscador principal** (`search.html`, la barra del navbar en todas las páginas -- distinto del
buscador local que ya tenía `contratar.html` desde el alta original): se agregó
`renderProfessionalResults()`/`getProfessionals()`/`buildProfessionalCard()` en `search.js`, calco
exacto de `renderStoreResults()`/`getStores()`/`buildStoreCard` que ya mostraban comercios arriba
de los productos -- mismo criterio (solo con texto escrito, cache en memoria porque son pocos
registros, reutiliza las clases CSS `.product-card`/`.store-card__meta` que ya existían). Sección
nueva `#professional-results` en `search.html`, mellizo de `#store-results`. `renderNoResults()` se
extendió para mencionar "el profesional/los profesionales de arriba" además de comercios cuando
corresponde, en vez de decir "sin resultados" siendo mentira.

**Home**: sección nueva "Profesionales destacados" (`loadFeaturedProfessionals()` en `home.js`,
después de `loadStores()`), fila horizontal de hasta 8 tarjetas compactas (foto, nombre, oficio,
estrellas) ordenadas igual que `contratar.html`, con "Ver todos" al lado del título. Se oculta la
sección entera si no hay ningún profesional publicado (mismo criterio que el carrusel de comercios:
no es contenido crítico, si falla o está vacío desaparece en vez de mostrar un hueco). CSS agregado
al final de `home.css` (el archivo ya es grande y no tiene una sección "temas nuevos" -- append es
seguro porque no hay ningún `@media` final que pudiera pisar reglas nuevas).

**Datos de ejemplo actualizados**: a los 3 profesionales de prueba cargados antes de esta tarea
(Juan Pérez/Plomero, María Gómez/Clases de inglés, Carlos Díaz/Electricista) se les asignó
categoría y se les cargaron reseñas de ejemplo (usando ids de usuarios reales ya existentes como
`client_id`, igual que el `owner_id` de estos profesionales de prueba viene de la cuenta que ya
tenía los 14 comercios de seed -- mismo criterio documentado en la entrada anterior) para que el
sistema de estrellas se vea funcionando de punta a punta sin esperar reseñas reales.

**Verificado visualmente con Playwright**: chips de categoría + tarjetas con foto/estrellas/tarjeta
expandida en `contratar.html`, formulario de alta con selector de categoría + selector de foto en
`vender.html`, mini-sección del home con "Ver todos", y resultados de profesionales con el mismo
estilo de tarjeta que los comercios en `search.html`. Un avatar de prueba (URL externa, pravatar.cc)
no cargó en la captura por el mismo bloqueo de red del sandbox hacia dominios externos que ya
afecta a Font Awesome en este entorno -- las fotos reales son URLs de Supabase Storage, mismo
origen ya permitido por la CSP del proyecto, así que sí van a cargar en producción.

## Se eliminó el chat interno: "Contactar al vendedor" ahora es teléfono/WhatsApp directo (2026-09-09)

A pedido del usuario se sacó por completo la mensajería dentro de la página (F7-02, `mensajes.html`
+ `js/mensajes.js` + tablas `conversations`/`messages`): antes del cambio se le mandó al usuario el
detalle exacto de qué se iba a borrar (página, módulo JS, tablas con 10 conversaciones y 2 mensajes
reales en producción, el trigger `notify_new_message()`, el tipo de notificación `new_message`
completo en `notifications-utils.js`, la tarjeta "Preguntas sin responder" del resumen del vendedor,
y el checkbox `accepts_contact`) y confirmó seguir adelante, incluida la pérdida de esos datos
reales -- ninguna alternativa de "solo ocultar" quedó pendiente.

**Reemplazo**: el botón "Contactar al vendedor" (en `producto.html` y `comercio.html`) ahora abre
`tel:` con el número visible o `https://wa.me/` con un mensaje prellenado ("Hola! Quería realizar
una consulta ... te escribo desde Baradero Local", con el nombre del producto si aplica), según lo
que el vendedor elija en su panel. Lógica pura y testeada en `js/store-contact-utils.js`
(`buildContactAction`/`buildWhatsappMessage`/`getVisibleSocialLinks`, `node
js/store-contact-utils.test.mjs`), mismo patrón que `storage-utils.js`.

**DB**: dos migraciones aplicadas a producción el mismo día --
`81_remove_in_app_messaging.sql` (dropea `messages`/`conversations`/su trigger/función) y
`82_store_contact_and_social.sql` (agrega `stores.contact_method` 'phone'|'whatsapp'|'none' -- con
backfill desde `accepts_contact`, que se dropea -- + `stores.whatsapp` + 6 pares de columnas
`social_<red>`/`social_<red>_show` para Instagram/Facebook/TikTok/X/YouTube/sitio web). El archivo
viejo `37_conversations_messages.sql` y `58_store_accepts_contact.sql` se dejan como registro
histórico con una nota arriba señalando qué migración los reemplazó -- no se borran ni se reescribe
el historial de git.

**Panel de vendedor** (`vender.html`, sección "Contacto y ubicación"): el checkbox
"Permitir que los clientes me contacten" se reemplazó por 3 radio buttons (Teléfono/WhatsApp/
Ninguno) + campo de número de WhatsApp, y se agregó una tarjeta nueva "Redes sociales" con
link + check "Mostrar" por cada red (6 filas fijas en el HTML, no un loop -- mismo criterio que el
resto de la página). `js/vender.js` valida el WhatsApp con `isValidPhone` solo si ese es el medio
elegido.

**Comercio** (`js/comercio.js`, `buildStoreHeader`): el link de contacto usa la misma
`buildContactAction()`; debajo se agregó una fila de íconos circulares con las redes sociales
activas (`getVisibleSocialLinks()`, CSS nuevo `.store-header__social`/`.store-header__social-link`
inline en `comercio.html`, mismo lugar donde ya vivía `.store-header__contact`).

**Limpieza**: se sacó `mensajes` de `vite.config.js` (ya no hay página que buildear) y todo el tipo
`new_message` de `notifications-utils.js` (label, color, vista previa, link "Ver mensaje" y el
batch-fetch a la tabla `messages`, que ya no existe -- de haber quedado, tiraba error al abrir la
campana de notificaciones).

## 2026-09-10 — Permisos por sección para empleados + fix panel de vendedor en blanco

**Permisos de empleado (sobre F12-16, A113-256)**: hasta ahora un empleado (`store_staff`) tenía
paridad total con el dueño en todo lo operativo que ya se veía en el panel -- Publicaciones,
Pedidos, Envíos en curso, Pagos por confirmar, Notificaciones, Soporte -- sin que el dueño pudiera
elegir cuáles. Ahora sí: migración `83_store_staff_permissions.sql` (aplicada a producción vía MCP
de Supabase) agrega `store_staff.permissions` (jsonb, default con las 6 claves en `true` -- no
cambia nada para los empleados ya agregados) + policy `store_staff_update_owner` (mismo criterio
que `store_staff_delete_owner`: solo el dueño de la tienda edita). Las 3 secciones exclusivas del
dueño (Perfil del comercio, Cupones, Empleados) siguen sin ofrecerse como opción -- nunca dependen
de `permissions`, es la misma lógica de siempre (`mc-navitem--owner`).

**Frontend** (`js/vender.js`): `STAFF_PERMISSION_SECTIONS` (las 6 claves + label) y
`staffPermissionsWithDefaults()` (fail-open a `true` si `permissions` no llegó, por las dudas).
`checkSellerState()` ahora trae `permissions` junto con `store_id` al detectar que la cuenta es
empleada, y se lo pasa a `loadDashboard(user, staffStoreId, staffPermissions)`. Ahí, si no es dueño,
por cada sección destildada se hace `document.querySelectorAll('[data-section="<key>"]').forEach(el
=> el.remove())` -- saca del DOM tanto el ítem del sidebar como la `<section>` (comparten el mismo
atributo `data-section`), no alcanza con ocultar: `showActiveSection()` de `vender-shell.js` revela
cualquier `<section data-section>` presente en el DOM que matchee el hash de la URL, así que ocultar
nomás dejaba una forma de verla igual tocando el hash a mano. Todas las funciones de render de esas
secciones (`renderPendingPayments`, `renderShipmentsInProgress`, `renderNotificationsSection`,
`renderSupportSection`, `renderPublicaciones` vía `fetchProducts`) ya cortaban solas si no
encontraban su contenedor (`if (!container) return`), así que sacar la sección entera no rompe nada.

**UI** (`pages/vender.html`, sección "Empleados"): cada fila de empleado (`buildStaffRow` en
`js/vender.js`) se partió en dos líneas -- la de siempre (foto/email/fecha + "Quitar acceso") arriba,
y una fila nueva de checks (`.staff-perms`, reusa `.pf-check` que ya existía para "Mostrar" de redes
sociales) abajo, una por sección. Cada check guarda solo (merge sobre el objeto `permissions`, no un
formulario con botón "Guardar" aparte) apenas se toca, con revert visual si falla el update.

**Fix "el panel de vendedor aparece vacío"**: encontrado con acceso directo a la DB de producción
(Supabase MCP) revisando la cuenta de test/seed `bianberayra@gmail.com` (role `admin`, que también
cuenta como "vendedor" en `checkSellerState()`): esa cuenta es `owner_id` de **14** filas en
`stores` (las tiendas de seed, `04_seed_mock_data.sql`/`06_seed_10_stores_and_products.sql`, todas
quedaron con el mismo dueño). `loadDashboard()` pedía la tienda con `.eq('owner_id',
user.id).single()` -- `.single()` de PostgREST tira error de coerción ("JSON object requested,
multiple (or no) rows returned") apenas hay 2+ filas, no solo con 0. Ese error hacía `return` ANTES
de `setupDashboardEvents()`/`initVenderShell()` (que cablean el sidebar) y antes de cualquier render
-- entraba a `dashboard-view` (ya revelado) pero se quedaba completamente vacío, sin sidebar
funcional ni contenido. Mismo patrón encontrado y corregido en el chequeo de `store_staff` de
`checkSellerState()` (`.maybeSingle()` también rompe con 2+ filas -- una cuenta podría en teoría ser
empleada de más de un comercio). Fix en ambos lugares: sacar `.single()`/`.maybeSingle()`, pedir con
`.order('created_at', { ascending: false }).limit(1)` y tomar `data?.[0]` -- funciona con 0, 1 o
más filas, siempre se queda con la más nueva. No se tocó la data de seed (14 tiendas bajo un mismo
owner_id no rompe ninguna constraint -- no hay `unique` en `stores.owner_id` -- así que el fix es
en el código, no una migración de datos).

## 2026-09-10 — Tags de afiliación a comercio en "Mi perfil"

A raíz de la entrada anterior (la cuenta `bianberayra@gmail.com`, admin, dueña "de mentira" de las
14 tiendas de seed), el usuario pidió mostrar en el perfil de cualquier cuenta, junto al badge de
rol que ya existía (`#profile-role-badge`, A113-269), tags de a qué comercio está afiliada de
verdad: empleada de cuál, dueña de cuál. Antes de tocar el perfil de todos los usuarios se confirmó
el diseño con `AskUserQuestion` (2 preguntas: si mostrar tag de dueño cuando hay más de una tienda,
y si los tags van en la misma fila que el rol o en una propia) -- eligió: tag de dueño SOLO si la
cuenta es dueña de una única tienda (evita el falso positivo de 14 tags en cuentas con seed data) +
misma fila que el rol, con wrap.

**Implementación**: `renderAffiliationBadges(userId)` en `js/perfil.js`, llamada al final de
`renderFullProfile()` (fire-and-forget, no bloquea el resto del render). Dos queries en paralelo:
`store_staff` (con embed `stores(name)`) → un badge "Empleado de \<tienda\>" por fila, y `stores`
por `owner_id` → badge "Dueño de \<tienda\>" solo si `data.length === 1`. Los badges se appendean a
`.profile-header__name-row` (ya tenía `flex-wrap: wrap` de antes, no hizo falta tocar el layout).
CSS nuevo en `Assets/styles/perfil-custom.css`: `.role-badge--staff` (violeta) / `.role-badge--owner`
(verde), mismo patrón que las variantes de rol ya existentes (`--vendedor`/`--admin`/etc.).
Wording sin barra de género ("Empleado"/"Dueño", no "Empleado/a") para mantener la misma convención
que el resto de los `roleLabels` del sitio ("Administrador", "Vendedor").

**Confirmado contra la DB real** (Supabase MCP, `execute_sql`) antes de implementar: de las 17
tiendas en producción, solo **gogo** (id `a1fba4cc...`, dueña real: la cuenta admin
`alganarasberenice@gmail.com`) y **facu.cells** (id `d07fc673...`, dueña real: la cuenta admin
`shueywater@gmail.com`) son reales -- las otras 14 (Almacén Don José, Carnicería El Novillo, Super
Baradero, etc.) son datos de seed de junio 2026, todas con `owner_id` = la cuenta
`bianberayra@gmail.com` (rol `admin`), que en la vida real es empleada (`store_staff`) de `gogo`, no
dueña de nada. No se tocó esa data ni se le dio ningún acceso nuevo a esa cuenta -- la regla "solo
mostrar tag de dueño con 1 tienda" resuelve el caso solo, sin hardcodear ningún user_id.

## 2026-09-10 — Notificación al profesional cuando su alta es aprobada

`approveProfessionalRequest()`/`rejectProfessionalRequest()` (`js/admin.js`) aprueban/rechazan un
alta de `professional_requests` con un UPDATE directo de `status` desde el cliente -- igual que
`seller_requests`/`delivery_requests` antes de que `41_notify_request_status.sql` les enchufara un
trigger genérico (`notify_request_status_change()`) para avisarle a la persona. A esa tabla nunca se
la había sumado al `CASE` de esa función ni se le había puesto el trigger, así que quien pedía
sumarse como profesional (`contratar.html`, alta desde `vender.html`) no se enteraba cuando lo
aprobaban.

**Fix** (migración `84_notify_professional_request_status.sql`, ya aplicada a producción): se
amplía el mismo `CASE` de `notify_request_status_change()` con `professional_requests` ->
`professional_request_approved`/`professional_request_rejected` (ambos casos, no solo el aprobado --
la función no tiene `else` en el `case`, así que dejar afuera el rechazo habría insertado
`type = NULL` y roto el UPDATE de rechazo por el `not null` de `notifications.type`) y se agrega
`professional_requests_notify_status` como trigger `after update`. En el front,
`js/notifications-utils.js` suma el título ("¡Tu publicación como profesional fue aceptada! Ya
figurás en Contratar" / rechazo), tono (`success`/`danger`, igual que seller/delivery) y link
("Ver Contratar" -> `contratar.html`, genérico: el payload solo trae el `request_id` de
`professional_requests`, no el id de la fila nueva en `professionals`, así que no se puede linkear
al perfil público puntual). El centro de notificaciones y los toasts (`js/toast-utils.js`) heredan
esto automático vía `buildNotificationTitle`/`buildNotificationLink`, sin tocar esos archivos.

## 2026-09-10 — Acceso al panel desde "Mi perfil" (vendedor/profesional) + mini panel de fotos promocionales

El usuario pidió que, si la cuenta es vendedora, pueda entrar a su panel desde "Mi perfil" por un
"pequeño apartado de administración" -- y que los profesionales/técnicos publicados en "Contratar"
tengan algo similar, con sus propios datos, para cargar fotos/promos. Antes de construir nada nuevo
se encontró que ese "pequeño apartado" **ya existía**: la fila "Tipo de cuenta" en Información de tu
perfil (`#role-panel-link`, `renderQuickProfile()`/`js/perfil.js`) ya mostraba un link "Panel" para
admin/moderador -> admin.html. Se amplió ese mismo mecanismo en vez de agregar una tarjeta nueva al
hub (primer intento descartado): más consistente con lo que el usuario ya conocía como "el pequeño
apartado de administración".

**`js/perfil.js`**: `setRolePanelLink(jwtRole)` (antes era un bloque inline dentro de
`renderQuickProfile`) ahora también reconoce `'vendedor'` (-> vender.html, ícono `fa-shop`) y un
pseudo-rol interno `'profesional'` (-> vender.html, ícono `fa-screwdriver-wrench`) que no existe en
el JWT -- lo setea `renderPanelLink(user)`, una función nueva y async llamada desde
`renderFullProfile()` (después de `renderAffiliationBadges`), que solo corre si `setRolePanelLink()`
todavía no mostró el link (chequea `rolePanelLink.hidden`) y resuelve los dos casos que sí necesitan
una consulta a la DB: empleada de un comercio (`store_staff`, sin rol propio) y publicada en
`professionals` (publicarse en "Contratar" tampoco cambia `profiles.role`). Todos los casos apuntan
a `vender.html`, que ya sabe distinguirlos vía `checkSellerState()` -- no hizo falta una página
nueva.

**Mini panel de profesional** (`js/vender.js`, `pages/vender.html`): hasta ahora, un profesional ya
publicado (`professionals`, fila con `is_active`) que entraba a vender.html solo veía un texto fijo
("Ya estás publicado... escribinos por Soporte para cambiar algo") -- `showProfessionalStatus()`
reusada para ese caso. Se reemplazó por `showProfessionalPanel(prof)`: un resumen de sus datos
(foto, nombre, categoría + especialidad, aviso si está desactivado) más una grilla de **fotos
promocionales** que puede cargar/borrar él mismo (hasta 6, 2 MB c/u) -- mismo patrón de subida que
la foto de perfil del alta (`professional-photos`), pero a una tabla/bucket nuevos:

- Migración `85_professional_promos.sql` (ya aplicada a producción): tabla `professional_promos`
  (`professional_id`, `image_url`) -- aparte de `professionals.photo_url` porque acá son varias por
  profesional, mismo criterio que `product_images` para productos. RLS: lectura pública solo si el
  profesional está activo (igual que `professionals_select_public`), el dueño (`owner_id =
  auth.uid()` vía subconsulta a `professionals`) gestiona las suyas, admin con acceso total. Bucket
  `professional-promos`, público, carpeta `{uid}/` -- mismo patrón que `professional-photos`
  (78_professionals_extras.sql).
- Borrado prolijo: `removeProfessionalPromo()` borra la fila y después llama
  `removeStoredObjects()` (`js/storage-utils.js`, ya existente) para no dejar el archivo huérfano en
  el bucket -- mismo criterio que fotos de producto/avatar (ver entrada 2026-08-28 de fotos
  huérfanas).

**`contratar.html`/`js/contratar.js`**: la tarjeta de cada profesional, al desplegarse, ahora
muestra esas fotos debajo de Llamar/WhatsApp (`pro._promos`, cargadas en una sola consulta en lote
para toda la lista -- mismo patrón que las reseñas agregadas de `loadProfessionals()`, no una
consulta por tarjeta). Cada foto abre un lightbox simple y nuevo (`ct-lightbox`, un solo overlay
reutilizado para toda la página, no uno por tarjeta): click en la miniatura para abrir, click en la
X, click afuera de la imagen o Esc para cerrar. No se reusó el gallery/zoom de `product-modal.js`
(pensado para el carrusel de fotos de un producto, con miniaturas y flechas) porque acá alcanza con
abrir/cerrar una imagen suelta -- un componente nuevo y chico salía más simple que adaptar ese.

**Probado**: build de Vite limpio y sin errores de sintaxis en los tres archivos JS tocados
(`node --check`). La carga real de datos (professionals/professional_promos vía Supabase) no se pudo
probar en un navegador en esta sesión -- el contenedor de la sesión no tiene salida a internet desde
el proceso del navegador (solo las herramientas del agente pasan por el proxy configurado), así que
`guardPage()` se queda esperando la verificación de sesión indefinidamente y las consultas públicas
de contratar.html fallan a nivel de red. Se validó igual que la página carga sin errores de JS
(`pageerror`/`console.error`) más allá de los fallos de red esperables, y que el layout no se rompe.
Falta una pasada manual (o desde una sesión con acceso a internet real) para confirmar el flujo
completo: subir una foto, verla en contratar.html, abrir/cerrar el lightbox.

**Verificado por SQL en la sesión siguiente** (Supabase MCP, simulando el JWT de cada cuenta con
`set local request.jwt.claims`, ver también la entrada de abajo): la RLS de `professional_promos`
se comporta como se diseñó -- el dueño de un profesional real (Juan Pérez) pudo insertar una fila
para su propio `professional_id`, otra profesional (Berenice Pirula) intentando insertar en la
publicación de Juan Pérez recibió el 42501 esperado de RLS, y con rol `anon` (visitante sin sesión)
la fila insertada se pudo leer sin problema. No se pudo probar la subida real de un archivo al
bucket (esa parte sí necesita un navegador real con sesión) -- filas de prueba borradas al terminar,
no quedó nada de esto en producción.

## 2026-09-10 — Panel de profesional/técnico: acceso desde la navbar + más acciones self-service

A partir de una captura del menú de cuenta de la navbar (screenshot del usuario), pidió: mejorar y
completar ese panel, sumar la categoría profesional/técnico dentro del perfil, que el panel también
aparezca en la barra de acceso rápido (el menú de cuenta de la navbar, no solo en "Mi perfil"), y que
el profesional/técnico pueda hacer alguna acción más además de subir fotos.

**Menú de cuenta de la navbar** (`js/nav-utils.js`, función `open()` del dropdown): sumada una
consulta a `professionals` (`owner_id = auth.uid()`) al lado de los `if (role === ...)` existentes
-- publicarse como profesional no cambia `profiles.role`/JWT, así que no entra en ese switch y
necesita su propia query, mismo criterio que `renderPanelLink()` en `js/perfil.js`. Si existe,
agrega una sección "Profesional/Técnico" con el link "Panel de profesional/técnico" -> `vender.html`.

**Tag en "Mi perfil"**: `renderAffiliationBadges()` (`js/perfil.js`) suma una tercera consulta
(`professionals` por `owner_id`) a las dos que ya tenía (`store_staff`/`stores`), y agrega un tag
"Profesional/Técnico · <categoría>" (o "... (pausado)" si `is_active` es false) junto al badge de
rol -- mismo patrón visual que "Empleado de/Dueño de", variante nueva `.role-badge--professional`
(`Assets/styles/perfil-custom.css`). De paso, el link de "Tipo de cuenta" (`role-panel-link`) que
mostraba "Mi panel de profesional" pasa a decir "Panel de profesional/técnico", para que el nombre
sea el mismo en los tres lugares (Mi perfil, navbar, header del panel en vender.html).

**Más acciones en el mini panel** (`js/vender.js`/`pages/vender.html`): hasta ahora solo se podían
cargar/borrar fotos promocionales -- cualquier otro cambio (especialidad, descripción, teléfono,
WhatsApp, pausar la publicación) seguía pidiendo pasar por Soporte, porque `professionals` no tenía
ninguna policy de UPDATE por dueño (solo `professionals_all_admin`, exclusiva del admin). Se agregó:

- Migración `86_professionals_update_own.sql` (ya aplicada a producción): policy
  `professionals_update_own` (`for update`, `using`/`with check` `owner_id = auth.uid()`) -- mismo
  criterio que `stores_update_own` para comercios, sin restricción por columna (el dueño edita su
  fila entera, como ya podía hacer un vendedor con el perfil de su comercio). Probada por SQL
  simulando el JWT de dos cuentas distintas: el dueño real pudo actualizar su fila, otra cuenta
  intentando tocar una fila ajena afectó 0 filas (silencioso, como corresponde a un UPDATE bloqueado
  por RLS, a diferencia del 42501 que sí tira un INSERT bloqueado) -- se hizo dentro de una
  transacción con `rollback` para no dejar nada escrito.
- **Pausar/reactivar la propia publicación**: botón nuevo en el resumen del panel
  (`toggleProfessionalActive()`), mismo patrón que ya usan productos y cupones (togglear
  `is_active`). Antes, pausar/reactivar una publicación de profesional dependía de pedírselo al
  admin por Soporte.
- **Editar especialidad/descripción/teléfono/WhatsApp**: formulario nuevo
  (`professional-edit-form`) arriba de la grilla de fotos, reusa las mismas validaciones
  (`isValidShopName`/`isValidPhone`) que ya usa el formulario de alta.

No se sumó edición de nombre/categoría/foto de perfil en esta pasada -- quedó afuera a propósito
para no ampliar el pedido más de lo que se pidió ("alguna acción más", no todas); si hace falta,
mismo patrón que specialty/description: agregar el campo al formulario y al `.update()`.

## 2026-09-10 — Botón de subir foto prolijo + fix del lightbox de Contratar que no cerraba del todo

El usuario probó el panel de profesional con una cuenta real (captura de pantalla) y confirmó que
funciona -- pidió dos retoques: que el botón de subir fotos promocionales se vea mejor, y que el
lightbox de una foto en contratar.html cierre del todo (el fondo oscuro quedaba trabado). También
pidió, con otra captura, que el lightbox se vea como el de los banners promocionales del home.

**Botón de subir foto** (`pages/vender.html`): el `<input type="file">` nativo (feo, inconsistente
entre navegadores) pasa a estar `hidden` detrás de un `<label>` estilado ("Agregar foto", ícono
`fa-camera`, pill con borde punteado) -- mismo criterio que ya usan los pickers de fotos de
producto/avatar en el resto del sitio, no un patrón nuevo. `renderProfessionalPromosGrid()`
(`js/vender.js`) togglea una clase `.is-disabled` en el label (además de `input.disabled`) al llegar
a las 6 fotos.

**Bug del lightbox** (`js/contratar.js`): togglear `overlay.hidden` no alcanzaba para ocultar el
overlay porque `.ct-lightbox { display: flex }` era una regla de **autor** (la hoja de estilos de la
página) y le ganaba en cascada a `[hidden] { display: none }`, que es una regla de **user-agent**
(la hoja por defecto del navegador) -- mismo peso de especificidad (ambas cuentan como una clase en
la fórmula), pero el origen del autor siempre le gana al del user-agent en el algoritmo de cascada
de CSS, sin importar el orden en que aparezcan. Resultado: `hidden=true` apagaba la imagen
(`img.src = ''`) pero el `div` seguía con `display:flex` ocupando toda la pantalla con su fondo
oscuro. **Fix**: en vez de parchear ese componente nuevo, se reemplazó entero por el lightbox que ya
existía para los banners del home (`.promo-lightbox-overlay`/`.promo-lightbox`/
`.promo-lightbox__img`/`.promo-lightbox__close`, `home.css` + `initPromoBannerLightbox()` en
`home.js`) -- contratar.html ya cargaba `home.css`, así que no hizo falta escribir CSS nueva, solo
armar la misma estructura de DOM en `js/contratar.js` y togglear una clase `is-open` (transiciona
`opacity`/`visibility`, sin el problema de especificidad de `hidden`). De paso, ahora se ve
exactamente igual que el lightbox de banners del home (fondo oscuro con blur, tarjeta con
fade+scale, botón circular blanco flotando sobre la esquina superior derecha de la imagen), que es
lo que pidió el usuario en la segunda captura.

**Verificado con Playwright headless** (sin depender de la red bloqueada de la sesión, ver entradas
anteriores): se inyectó el mismo HTML/CSS del lightbox en `contratar.html` ya servido por Vite y se
confirmó con `getComputedStyle` + `requestAnimationFrame` (necesario para no leer el valor
"stale" de antes de la transición) que `.is-open` cambia `visibility` de `hidden` a `visible` y
`opacity` de `0` a un valor intermedio en transición, y que sacar la clase los vuelve a `hidden`/`0`
-- confirma que el fix resuelve el bug de raíz, no solo lo tapa.

## 2026-09-10 — Redes sociales en el panel de profesional/técnico + rediseño con switch (ambos paneles)

El usuario pidió, con una captura de un mockup externo (un builder de landing pages, no del proyecto):
sumar un apartado de redes sociales al mini panel de profesional/técnico -- mismo dato que ya carga
un comercio -- pero con un diseño propio (distinto del de comercio), y que ambos (comercio y
profesional) tengan una estructura similar a la del mockup: label + link + switch por fila, en vez
del checkbox + texto "Mostrar" que tenía el de comercio hasta ahora. La idea del mockup era solo de
estructura -- se implementó respetando la estética de Baradero Local (tokens `--bl-*`, no los
colores del mockup).

**DB**: migración `87_professionals_social.sql` (ya aplicada a producción) agrega a `professionals`
las mismas 12 columnas que ya tiene `stores` desde `82_store_contact_and_social.sql`
(`social_instagram`/`social_instagram_show`, ... x6 redes). No hizo falta tocar RLS:
`professionals_update_own` (86) ya deja al dueño actualizar su fila entera.

**Switch compartido** (`pages/vender.html`): `.social-toggle`/`.social-toggle__track` es un
`<input type="checkbox">` real (accesible, funciona con teclado) escondido detrás de un `<span>`
con el visual de iOS-switch -- mismo patrón de "checkbox real + span decorativo" que ya usaba el
proyecto en otros lugares (ningún JS nuevo hizo falta para leer/escribir el valor: sigue siendo
`.checked`). Un solo componente, dos layouts:
- **Comercio** (`.social-row`, reemplaza la `.pf-grid`/`.pf-field` de antes): una fila de ancho
  completo por red -- ícono, nombre, input, switch -- calcada de la estructura del mockup. IDs sin
  cambios (`store-social-<red>`/`store-social-<red>-show`), así que no hizo falta tocar la lógica
  de lectura/guardado en `js/vender.js` (`fillStoreProfileForm()`/`setupStoreProfileForm()`), solo
  el HTML.
- **Profesional** (`.prof-social-grid`/`.prof-social-card`, sección nueva dentro de
  `professional-edit-form`): grilla de tarjetas chicas -- ícono en chip circular + nombre arriba,
  switch flotando en la esquina, input abajo -- mismo concepto (label + link + switch) pero
  apariencia distinta a propósito, para que ambos paneles no se vean idénticos. IDs
  `prof-social-<red>`/`prof-social-<red>-show`, dentro del mismo `<form>` que
  specialty/description/phone/whatsapp -- un solo "Guardar cambios" para todo, con el botón movido
  a un `.pf-actions` al final (mismo patrón que "Guardar perfil" del comercio), no metido dentro de
  la última tarjeta.

**`js/vender.js`**: el `select` de `professionals` en `checkSellerState()` suma las 12 columnas
nuevas; `fillProfessionalEditForm()` las precarga (`SOCIAL_NETWORKS.forEach`, mismo bucle que ya
usa el comercio); `setupProfessionalEditForm()` arma `socialFields` con el mismo patrón que
`setupStoreProfileForm()` y lo mergea al `.update()` de `professionals`.

**Público**: `js/contratar.js` ahora también pinta los íconos de redes sociales en la tarjeta del
profesional (`.ct-card__social`, mismo componente visual que `.store-header__social-link` de
comercio.html) reusando `getVisibleSocialLinks()` de `store-contact-utils.js` -- esa función ya era
genérica (no le importa si el objeto es una `store` o un `professional`, solo los campos
`social_<red>`/`social_<red>_show`), así que no hizo falta tocarla. Se ubican entre
Llamar/WhatsApp y las fotos promocionales.

**Probado sin depender de la red bloqueada de la sesión**: se armaron dos páginas de prueba
standalone (fuera de git, borradas al terminar) copiando el `<style>` de vender.html + el fragmento
HTML de cada sección, servidas por el mismo Vite dev server (así los `../Assets/styles/home.css`
relativos resuelven) y abiertas con Playwright headless -- esto evita por completo `guardPage()`
(que en esta sesión redirige a login.html apenas la llamada a Supabase falla a nivel de red, no
hace falta sesión real para ver el HTML/CSS). Confirmado visualmente que las dos filas/tarjetas
quedan bien alineadas, el switch anima correctamente y ambos diseños se leen como secciones
distintas aunque compartan el mismo componente de switch. Lo único que no se ve en el screenshot
son los íconos de Font Awesome (el CDN está bloqueado por la política de red del sandbox) -- no es
un bug, es sólo que esta sesión no tiene salida a internet real.

## 2026-09-10 — Badge "Modo Oficios" en la navbar de Contratar + botón hamburguesa oculto donde no hay sidebar

Dos ajustes chicos pedidos en la misma sesión que el trabajo de arriba.

**Botón hamburguesa fantasma**: el usuario mandó una captura del mini panel de profesional en mobile
mostrando el círculo de tres líneas (`#mc-hamburger`) que abre el sidebar de `dashboard-view` --
pero estaba visible incluso en `register-view` (alta de comercio/profesional, o el mini panel de un
profesional ya publicado), donde no hay sidebar. La media query de `pages/vender.html` fuerza
`display: inline-flex` en <900px sin importar qué vista esté activa; se corrigió en
`reveal()` (`js/vender.js`, `checkSellerState()`): ahora también togglea
`hamburgerBtn.style.display` a `'none'` salvo cuando `view === 'dashboard'` -- un estilo inline le
gana a la regla de la media query por especificidad, sin tocar CSS.

**Badge "Modo Oficios"**: pedido con una captura de `vender.html` mostrando `.vendor-mode-badge`
("Modo Vendedor", pill azul en la navbar) como referencia -- quería lo mismo arriba de
`contratar.html`. Se le dieron 4 opciones de texto por `AskUserQuestion` (Modo Oficios / Modo
Changas / Modo Profesionales / Directorio de Oficios); eligió **"Modo Oficios"** (su sugerencia
original) en un mensaje aparte, en medio del cual llegó el pedido del hamburguesa (se resolvió ese
primero, sin perder el pendiente). Implementado como `.oficios-mode-badge` en
`pages/contratar.html`, mismo patrón que `.vendor-mode-badge` (pill, ícono + texto, oculto en
mobile por falta de lugar en la navbar) pero con **acento propio**: `var(--bl-accent)` (el ámbar que
ya existe en el sistema de marca, hoy usado para "oportunidad/aviso" en `notifications-utils.js`)
en vez del azul de "modo vendedor" -- a propósito, para que se lea de un vistazo que Contratar es un
directorio público, no un panel de gestión como vender.html. Ícono `fa-screwdriver-wrench`, mismo
que ya usa el hero de la página. Verificado con capturas reales (Playwright headless contra el Vite
dev server) en desktop (pill centrado entre logo y flecha de volver) y en 400px de ancho (el badge
desaparece, layout no se rompe).

**Corregido en la misma sesión** -- el usuario aclaró que "Modo Oficios" iba **dentro del panel de
profesionales/técnicos** (`vender.html`), no en la página pública `contratar.html`: se sacó de ahí
y se agregó a la navbar de `vender.html`, al lado de `.vendor-mode-badge` ("Modo Vendedor"). De
paso salió a la luz que `.vendor-mode-badge` no tenía `id` ni lógica de visibilidad -- se mostraba
siempre, incluso para un profesional viendo su mini panel (que no es vendedor). Ahora los dos
badges (`#vendor-mode-badge`/`#oficios-mode-badge`) arrancan `hidden` y `reveal()`/
`showProfessionalPanel()` (`js/vender.js`) decide cuál mostrar: "Modo Vendedor" solo en
`dashboard-view`, "Modo Oficios" solo cuando `showProfessionalPanel()` revela el mini panel de
profesional ya publicado (ni durante el alta ni con una solicitud pendiente). **Mismo bug de
`[hidden]` vs. una regla de autor con `display` que ya apareció con el lightbox de Contratar** --
se agregó `.vendor-mode-badge[hidden], .oficios-mode-badge[hidden] { display: none; }` para que la
regla de autor no le gane en cascada al `[hidden]` de user-agent. Verificado con una página de
prueba standalone (fuera de git) con dos botones que simulan `reveal('dashboard')` y
`showProfessionalPanel()`: cada click deja visible solo el badge que corresponde.

## 2026-09-10 — Badge del carrito: cantidad de productos, no suma de unidades

El usuario mandó una captura de "Mi carrito" con el número del navbar circulado, pidiendo que
cuente **cantidad de productos** (líneas distintas en el carrito), no la suma de unidades por
producto. `updateCartBadge()` (`js/cart-utils.js`) hacía
`cart.reduce((acc, item) => acc + item.qty, 0)` -- 2 unidades de un mismo producto sumaban 2. Ahora
es `cart.length` (cantidad de filas del carrito, sin importar la cantidad de cada una). No hay otro
lugar del código con el mismo cálculo (se revisó con grep) -- el cambio queda contenido en esa
única función. **Nota aparte, no tocada**: la captura también mostraba el nombre de un producto
real con comillas mal codificadas (`Yerba Mate &quot;La Vuelta&quot; 500g` literal en vez de
comillas) -- es un dato ya guardado así en la DB (probablemente quedó doble-escapado al cargarlo),
no un bug de renderizado -- haría falta ubicar el producto y corregir el título a mano, no se hizo
en esta pasada porque no fue lo que se pidió.

## 2026-09-15 — "¿Olvidaste tu contraseña?" pasa a ser una página propia

Antes el link de Login pedía el mail para el reset con un `confirm()`/toast inline sobre el mismo
formulario de login (leía `#correo` y llamaba a `resetPasswordForEmail` desde `js/login.js`, sin
cambiar de página). A pedido del usuario ahora es una página nueva, `pages/recuperar-password.html`
+ `js/recuperar-password.js`, con el mismo layout `.auth-card`/`.auth-input` que login/register
(reutiliza `Assets/styles/auth.css` sin tocarlo) y un solo campo de correo. Al enviar con éxito
oculta el formulario y muestra el aviso `.auth-confirm-notice` ya usado en el registro ("revisá tu
correo"), en vez del toast de antes. El botón "¿Olvidaste tu contraseña?" de `login.html` ahora es
un link normal (`href="./recuperar-password.html"`), se sacó el `id="forgot-password-link"` y su
handler de `js/login.js` porque ya no hace falta. El link sigue mandando a `pages/login.html` como
`redirectTo` del mail (sin cambios ahí -- la página de "elegir nueva contraseña" después de klickear
el mail es un pendiente aparte, no pedido en esta tarea). Nueva entrada en `vite.config.js`
(`recuperarPassword`) para que el build multipágina la incluya.

**Completado el mismo día** -- el usuario preguntó si la página a la que lleva el link del mail
("Restablecer mi contraseña") ya estaba armada, y no: `resetPasswordForEmail` mandaba de vuelta a
`pages/login.html`, que como página INVERSA (`guardPage({ redirectIfAuth: true })`) redirige apenas
detecta la sesión de recuperación que arma el link -- el usuario nunca llegaba a ver un formulario
para elegir la contraseña nueva, quedaba logueado con la vieja sin darse cuenta. Nueva página
`pages/nueva-contrasena.html` + `js/nueva-contrasena.js` (dos campos de contraseña + confirmar,
misma regla de validación que `register.js`: 8+ caracteres, una mayúscula, un número). No usa
`guardPage` -- esa página piensa "sesión = usuario logueado normal" y te manda a Home; acá hace
falta la lógica opuesta (cualquier sesión activa al entrar habilita el formulario, sin sesión
después de un margen de ~2.5s muestra "enlace inválido o vencido" con link para pedir uno nuevo).
Al guardar, `supabase.auth.updateUser({ password })` + `signOut()` (que vuelva a entrar con la
contraseña nueva) + aviso de éxito con link a Login. `redirectTo` de `js/recuperar-password.js` y
del botón "Cambiar" contraseña en `js/perfil.js` (mismo gap ahí, no se había notado) ahora apuntan
acá en vez de a `login.html`. Clase nueva `.auth-confirm-notice--error` en `auth.css` (variante roja
del aviso verde que ya existía para "confirmá tu correo" del registro). Nueva entrada en
`vite.config.js` (`nuevaContrasena`).

## 2026-09-16 — Se saca por completo el rol `repartidor` y su apartado

A pedido del usuario: "sacá todo lo que tenga que ver con repartidor, el rol, el apartado, y demás,
la parte de logística lo vamos a dejar para más adelante". El rol venía de la migración 11 (F3-01 a
F3-04, `feature/F3-*`) y nunca pasó de "planeado" en la práctica -- no había ninguna cuenta real con
`role='repartidor'` en producción, así que sacar todo el frontend no afecta a ningún usuario ni
pedido existente.

**Archivos borrados enteros:** `pages/repartidor.html` (panel del repartidor: alta con
nombre/teléfono/vehículo, lista de "pedidos disponibles" con `claim_delivery`, lista de "mis
entregas" con avance de estado vía `update_delivery_status`, calificación propia) y `js/repartidor.js`
(su lógica). Sacada la entrada `repartidor` de `rollupOptions.input` en `vite.config.js` y la línea
`Disallow: /pages/repartidor.html` de `public/robots.txt`.

**Alta y aprobación** (mismo patrón que `seller_requests`/`professional_requests`, tabla
`delivery_requests`): vivía enteramente en `repartidor.html`/`repartidor.js` (alta) + `admin.js`/
`admin.html` (aprobación). En `admin.js` se sacaron `VEHICLE_LABELS`, `fetchDeliveryRequests`,
`approveDeliveryRequest`, `rejectDeliveryRequest` (llamaba al RPC `approve_delivery_request`) y
`fetchRepartidoresForModeration` (tabla de moderación con `admin_set_repartidor_suspended`) --
cuatro funciones bien aisladas, sin lógica compartida con las secciones de vendedores/profesionales
que siguen activas. En `admin.html` se sacaron los dos botones de nav ("Repartidores" en
Solicitudes y en Moderación) y las dos `<section>` completas (`delivery-requests`,
`repartidores-mod`). Se limpiaron las referencias sueltas: `SECTION_LOADERS`,
`MODERADOR_HIDDEN_SECTIONS`, los listeners de los botones "Refrescar" en `initAdminPage()`, y las
métricas del resumen global que dependían de esto (`Repartidores`, `Entregas en curso`, `Entregas
completadas` -- esta última consultaba la tabla `deliveries`, que ahora nadie va a volver a poblar).

**Cliente ("Mis compras", `perfil.js`):** se sacó la entrada `repartidor` del diccionario de labels
de rol, el objeto `DELIVERY_STATUS_LABELS` ("Un repartidor tomó tu pedido"/"El repartidor está en
camino"), y la función completa `buildRepartidorRatingSection` (calificar al repartidor tras la
entrega, F12-08, reusaba `reviews` con `target_type='repartidor'`) junto con el parámetro
`reviewByRepartidorId`/`comprasReviewByRepartidorId` que la alimentaba en `loadCompras()` (bloque
que buscaba reseñas propias en lote, mismo patrón que `phoneByClientId` de F12-05). El `select` de
`loadCompras` dejó de traer el embed `deliveries ( status, repartidor_id )`.

**Panel de vendedor (`vender.js`/`vender.html`):** se sacó la sección completa "Envíos en curso"
(F3-04) -- a diferencia de `delivery_method` (pickup/delivery, que sigue siendo una opción de
checkout válida y una forma de filtrar pedidos, eso NO se tocó), esta sección era 100% de
seguimiento read-only de entregas gestionadas por un repartidor ("el repartidor gestiona el estado
desde su panel", literal en el comentario que la describía). Sin repartidor.js nadie iba a volver a
crear una fila en `deliveries`, así que hubiera quedado una pestaña permanentemente vacía en el
dashboard de cada vendedor -- se sacó entera en vez de dejarla así: el nav item, la `<section>`, la
entrada `envios` de `STAFF_PERMISSION_SECTIONS` (permisos por empleado, migración 83), la llamada a
`renderShipmentsInProgress()` en la carga inicial, el conteo `shipmentsInProgress` y su card en
"Pendientes en tus ventas" del resumen, y las funciones `SHIPMENT_STATUS_LABELS`/
`SHIPMENT_STATUS_BADGE_VARIANT`/`renderShipmentsInProgress`/`renderShipmentsEmpty`/`buildShipmentRow`.

**Notificaciones (`notifications-utils.js`):** se sacaron `delivery_request_approved`/
`delivery_request_rejected` de `TYPE_LABELS`/`TYPE_TONE` y el `case` correspondiente en
`buildNotificationLink`. De paso se encontraron y sacaron tres tipos ya huérfanos antes de esta
tarea -- `courier_added`, `delivery_assigned` (sin entrada en `TYPE_LABELS`, solo en `TYPE_TONE` y
en el mismo `case` que apuntaba a `repartidor.html`) y `provider_approved` (apuntaba a
`logistica.html`, página que nunca existió en el repo) -- restos sueltos de la rama sin mergear
`feature/logistica-terceros` (mencionada en "Pendientes activos" de `CLAUDE.md` por los números de
migración 61-65 reservados), ningún código los genera.

**Copy y comentarios:** `pages/terminos.html` (sacado el rol de la lista de tipos de cuenta, "cuatro"
-> "tres", sacada la mención en la sección de envío y retiro), `pages/perfil.html` (intro de "Mi
perfil"), `pages/home.html` (link "Sumate como repartidor" del footer), `js/nav-utils.js` (bloque
`if (role === 'repartidor')` del menú de cuenta), `js/profile-fields.js` (hint del teléfono),
`Assets/styles/perfil-custom.css` (`.role-badge--repartidor`) y comentarios sueltos en
`js/vender.js`, `js/admin.js`, `js/reviews-utils.js`, `js/support-utils.js`, `js/auth-utils.js`,
`Assets/styles/home.css` que lo mencionaban de pasada. También `docs/GUIA_USUARIO.md` (sacada la
sección "Repartidor" completa y las menciones en "Administrador"), `memory/glossary.md` y
`.agents/product-marketing.md` (roles de producto). Los demás docs con menciones históricas
(`ROADMAP.md`, `ARQUITECTURA.md`, `TESTING_CHECKLIST.md`, `WHATSAPP_TEMPLATES.md`, etc., que
documentan las fases F3-01 a F3-04 como ya completadas en su momento) se dejaron sin tocar a
propósito -- son registro histórico de cómo se construyó, no documentación de cara al uso actual;
mismo criterio que ya se aplica en este mismo skill.

**Deliberadamente no tocado:** la base de datos. `delivery_requests`, `deliveries` y los RPCs
`claim_delivery`/`update_delivery_status`/`approve_delivery_request`/`admin_set_repartidor_suspended`
siguen en el schema (migraciones 11/25/26/27/28/44, ya aplicadas en producción) sin ninguna forma de
llegar a ellos desde la app. Se dejan así por si se retoma la logística de entregas más adelante --
no había nada real que migrar ni limpiar (ninguna fila de `deliveries`/`delivery_requests` en
producción tenía que ver con un usuario activo). `dist/` reconstruido con `npm run build` al final.

---

## 2026-09-16 — Sección de soporte: el CSS que nunca se escribió (+ 8 bugs)

Análisis al azar de `js/support-utils.js` (sección compartida "Contactar a soporte", la usan
`perfil.js` y `vender.js`). Lo que apareció no fue un detalle de estilo sino una **regresión
visible en producción**.

### El hallazgo principal

El commit `3a3e6a3` ("feat(soporte): adjuntar capturas al enviar un reclamo", 2026-09-03) reescribió
`js/support-utils.js` entero -- +552 líneas, 6 archivos tocados -- y **ninguno de esos 6 archivos
era CSS**. El rediseño que trajo (tarjeta con encabezado, campos con rótulo, contador de
caracteres, dropzone de adjuntos, lista de archivos elegidos con miniatura, chips de adjuntos, fila
de reclamo plegable con preview y chevron, estado vacío ilustrado) quedó **entero sin estilos**:
**34 clases `tkt-*` usadas por el JS sin una sola regla** en todo `Assets/styles/`.

Cómo se veía antes del arreglo (verificado con Playwright montando la sección real contra un stub
de Supabase): el encabezado de la tarjeta desbordaba el formulario, el dropzone era un renglón de
texto centrado sin borde ni caja, los chips de adjuntos eran texto plano pegado, y cada fila de la
lista mostraba **asunto + mensaje + fecha en un solo renglón corrido y sin separación**
("No me llegó el pedido #4821Hice el pedido el martes y figura como...11 de sept de 2026").

Además tres reglas que sí existían habían quedado desfasadas por el mismo rediseño:

- `.tkt-item__top` pasó de `<div>` a `<button>` (se hizo plegable) y su regla nunca se actualizó:
  le faltaba `width: 100%`, `padding: 0`, `font: inherit`, `color: inherit` y `text-align: left`.
  El reset global de `button` en `home.css:96` tapaba lo peor (fondo y borde), pero el encabezado
  seguía sin ocupar el ancho, con el `font-size: 13.33px` del navegador y centrado.
- `.tkt-empty` pasó de `<p>` suelto a un bloque con ícono + texto + aclaración.
- `.tkt-item__msg` y `.tkt-item__date` quedaron muertas (el JS pasó a `.tkt-item__preview` y a un
  `<span>` dentro de `.tkt-item__meta`). Borradas.

**Gotcha reusable:** el chequeo que caza esta clase de bug es comparar las dos direcciones,
`grep -oE "tkt-[a-zA-Z0-9_-]+" js/support-utils.js | sort -u` contra
`grep -rhoE "\.tkt-[a-zA-Z0-9_-]+" Assets/styles/ | sed 's/^\.//' | sort -u`, con `comm -23` y
`comm -13`. Al 2026-09-16 las dos dan 0. Sirve igual para cualquier otro prefijo de clases del
proyecto (`pubform-`, `proof-`, `notif-`, ...).

Las 34 reglas nuevas se agregaron a `Assets/styles/home.css`, al lado del bloque `tkt-` que ya
estaba (las tres páginas que muestran la sección -- perfil, vender, admin -- cargan `home.css`).
Se introdujo `--tkt-col: 560px` en un `:root` local a la sección: el formulario, la lista y el
estado vacío lo comparten para que se lea como una sola columna, en vez de un formulario angosto
arriba de una lista a todo lo ancho (que era lo que pasaba, `.tkt-form` tenía `max-width: 500px`
y `.tkt-list` ninguno). El dropzone sigue el mismo lenguaje que `.proof-drop` del comprobante de
transferencia (borde punteado + ícono), y los tintes usan `rgba(40, 65, 117, ...)` literal porque
no existe un token `--bl-primary-rgb`.

### Los 8 bugs de JS arreglados en la misma tarea

1. **Los adjuntos no se abrían en Safari ni Firefox.** `openAttachment()` llamaba a `window.open()`
   *después* del `await` de `createSignedUrl`: para entonces el gesto del usuario ya se consumió y
   el bloqueador de popups frena la pestaña **en silencio** (se hace clic en el chip y no pasa
   nada, sin error de consola). Ahora la pestaña se abre vacía antes del await y se navega con
   `location.replace()` cuando llega la URL. **Ojo:** no se puede pasar `noopener` en ese
   `window.open`, porque con esa opción el navegador devuelve `null` a propósito y uno se queda
   sin la referencia -- se usa `tab.opener = null`, que corta el vínculo inverso igual.
   **El mismo bug sigue sin arreglar en `js/vender.js:2599` y `js/admin.js:891`** (botón "Ver
   comprobante" de los pagos por transferencia, idéntico patrón); se dejaron fuera por estar fuera
   del alcance de esta tarea.
2. **Reclamo con asunto vacío.** El `required` del navegador da por completo un campo con solo
   espacios, y el insert guardaba el valor ya pasado por `.trim()`: entraba un ticket con
   `subject = ''`, que en la lista queda como una fila en blanco que ni el usuario ni soporte
   pueden identificar. Ahora se valida el valor trimmeado antes de subir nada.
3. **Cancelar un reclamo mentía.** `cancelTicket()` hacía `update().eq()` sin `.select()`: cuando
   la RLS rechaza el update (la policy de la migración 54 solo deja al dueño pasar a `cancelled`)
   Supabase **no devuelve error, devuelve cero filas**, así que se mostraba "Reclamo cancelado" y
   el estado seguía igual. Ahora `.select('id')` y se tira si no volvió ninguna fila.
4. **"Todavía no hay respuestas" cuando en realidad falló la consulta.** `fetchTicketMessages()`
   devolvía `[]` tanto para un hilo vacío como para un error. Ahora devuelve `null` en el error y
   el hilo lo dice ("No se pudieron cargar las respuestas").
5. **Fuga de objectURL.** `renderSupportSection()` hace `container.textContent = ''` y se lleva
   puesto el picker anterior sin pasar por su `cleanup()`; las miniaturas de las imágenes elegidas
   y no enviadas quedaban retenidas hasta recargar. Se registra el picker vivo en un `WeakMap`
   por contenedor y se limpia antes de redibujar.
6. **Hueco mudo mientras cargaban los reclamos.** Aparecía el formulario y, un rato después y de
   golpe, la lista. Ahora hay un bloque de carga con el spinner de 6 puntos, mismo markup que arma
   la grilla del buscador (`js/search.js`).
7. **Accesibilidad:** el campo de respuesta del hilo solo tenía `placeholder` (que no cuenta como
   nombre accesible) -- se le puso `aria-label`; y el encabezado plegable declaraba `aria-expanded`
   pero no `aria-controls` -- se le dio un `id` al hilo y se cablearon.
8. **Parpadeo al arrastrar archivos.** El `dragleave` también salta al pasar de la zona a uno de
   sus propios hijos, así que el resaltado titilaba. Resuelto por los dos lados: `pointer-events:
   none` en los hijos del dropzone (CSS) y un chequeo de `relatedTarget` (JS).

De yapa, la hora de cada mensaje del hilo salía con segundos (`toLocaleString('es-AR')` a secas ->
"12/9/2026, 10:00:00"); ahora es día + mes + hora:minuto.

### Verificación

Se montó un harness temporal (`_harness/`, borrado al terminar) que sirve la sección real contra un
stub de `auth-utils.js`, y se sacaron capturas con el Chromium preinstalado en cuatro escenarios:
lista con hilo abierto, picker con archivos elegidos + error de tamaño, estado vacío, y celular a
390px. Font Awesome está bloqueado por el proxy de egress de la sesión, así que los íconos se
sustituyeron con un CSS de harness. También se capturó el "antes" (checkout de `origin/main` de
`home.css` + `support-utils.js` en el mismo harness) para confirmar la regresión. Los 6
`js/*.test.mjs` del proyecto siguen pasando. `dist/` reconstruido.

**Nota sobre `dist/`:** el rebuild cambia el hash del nombre de bundles cuyo contenido no cambió
(ya documentado como `[[project-dist-merge-conflicts]]`); se verificó comparando el contenido de
`servicios-*.js` antes y después -- idéntico, solo cambia el nombre.

### Lo que NO se tocó

La migración **73** (`support_tickets.attachments` + bucket `support-attachments`) **sigue sin
aplicar** -- es uno de los pendientes que aplica el usuario. Hasta que corra, la sección de
reclamos funciona sin adjuntos (las dos consultas usan `select('*')` y la columna solo viaja en el
insert si hay archivos); lo que falla es la subida al bucket. El CSS y los arreglos de esta tarea
no dependen de esa migración.

---

## 2026-09-16 — Auditoría de las 4 Edge Functions (pagos y baja de cuenta)

Segundo análisis al azar de la sesión: salió `supabase/functions/`. Cuatro funciones, ~711 líneas,
que mueven plata (Mercado Pago) y borran cuentas — y **cero tests** hasta esta tarea.

### El hallazgo principal: el webhook nunca verificaba el monto

`mp-webhook` marcaba una orden como `paid` con esta sola condición:

```ts
if (payment.status === "approved") { /* ...update payment_status: "paid" */ }
```

Re-confirmaba contra la API real de MP (bien, eso ya estaba) y chequeaba que las órdenes fueran
`pending` y de Mercado Pago, pero **nunca comparaba `payment.transaction_amount` contra lo que
suman los `total_price` de esas órdenes**. Reproducido en test: un pago de $100 marcaba pagado un
pedido de $50.000. Un carrito de dos órdenes ($3.000 + $7.000) con un pago de $3.000 marcaba las
dos.

Ahora las órdenes se leen ANTES de escribir, se suma el total esperado y, si lo cobrado no lo
cubre, van a `needs_review` con una notificación al vendedor — nunca a `paid`.

**Decisión de diseño a tener presente:** un pago partido en dos medios (MP manda un webhook por
cada uno, cada `transaction_amount` es parcial) va a caer en `needs_review` en vez de `paid`. Es a
propósito: marcar `paid` de más regala mercadería, marcar `needs_review` de más solo pide una
revisión. Si el caso aparece seguido en producción, la salida correcta es consultar el
`merchant_order` (`paid_amount` vs `total_amount`) en vez de aflojar la comparación.

### Los otros bugs de `mp-webhook`

- **Devolución y contracargo no se manejaban.** `refunded`, `charged_back` e `in_mediation` caían
  en el `else` vacío ("pending/in_process: no hacemos nada"), así que la orden se quedaba `paid`
  para siempre: el vendedor despachaba una venta cuya plata ya no estaba. Ahora vuelven a
  `needs_review` + notificación. Se filtra por `payment_id` para no tocar órdenes de otro pago.
  **No hizo falta migración:** `needs_review` ya era un valor válido del CHECK
  (`56_mp_marketplace_split.sql`) y `notifications.type` no tiene CHECK (verificado contra
  producción), así que los dos tipos nuevos entran sin tocar el schema.
- **`external_reference` sin validar.** Se hacía `.split(",")` y se metía derecho en `.in("id",
  ...)`: cualquier cosa que no fuera uuid hacía tirar a Postgres por casteo, caía en el catch y
  devolvía **500 — y Mercado Pago reintenta un webhook con 500 durante días**. Ahora se filtra por
  forma de uuid y se responde 200 con un `console.warn`.
- **N+1.** Por cada orden actualizada se pedía el `owner_id` de su tienda en una query aparte;
  ahora es una sola con `.in()` (helper `notifyStoreOwners`).
- **`resolveAccessToken` con `.maybeSingle()`.** `stores.mp_collector_id` no tiene unique, así que
  la misma cuenta de MP puede quedar vinculada a dos tiendas; con dos filas `.maybeSingle()`
  devuelve error, el código lo ignoraba (`const { data: store } = ...`, sin mirar `error`) y caía
  **en silencio** al token global — con el que no puede leer el pago del vendedor, así que la venta
  no se confirmaba nunca y no quedaba rastro de por qué. Es el mismo patrón que ya había mordido en
  `js/vender.js` (panel en blanco con 2+ tiendas, 2026-09-10). Ahora usa `.limit(2)`, detecta el
  caso y lo loguea.

### `delete-account`: datos personales que sobrevivían a la baja

El encabezado del archivo cita la Ley 25.326 (derecho de supresión), pero solo limpiaba el bucket
`avatars`. Las **capturas adjuntas a un reclamo de soporte** (`support-attachments/{uid}/`, que por
su propia migración "suelen traer datos personales: dirección, mail, medio de pago") quedaban en el
bucket para siempre después de borrar la cuenta. Ahora se limpian los dos buckets con carpeta
`{uid}/`.

- `payment-proofs` **NO** se toca a propósito y queda documentado en el archivo: sus paths son
  `{order_id}/`, no `{uid}/`, y los pedidos sobreviven anonimizados (`orders.client_id` es SET
  NULL) para que el comercio conserve su historial de ventas — borrar el comprobante le sacaría el
  respaldo de un cobro que sigue siendo suyo.
- **`list()` corta en 100 objetos y no avisa que hay más**, así que se pagina (siempre pidiendo
  desde el principio, porque lo que queda corre para atrás al borrar) con un tope de vueltas para
  que un `remove` que no borre nada no deje la función girando.
- **Se reordenó**: primero `deleteUser`, después los archivos y sin tirar. Antes era al revés, y si
  el `deleteUser` fallaba la persona se quedaba con la cuenta pero ya sin su foto de perfil.
  Al revés también importa: si la limpieza tirara después de borrar al usuario, el catch devolvía
  500 y `js/perfil.js` cae al fallback de abrir un ticket de soporte... por una cuenta que ya no
  existe. Por eso `purgeUserFolder` loguea pero nunca tira.

### `mp-oauth-callback` y `mp-create-preference`

- **No se puede vincular la misma cuenta de MP a dos tiendas** (409 con el nombre de la otra
  tienda). Es lo que causaba el bug silencioso de `resolveAccessToken` de arriba.
- **Falta el `state` del flujo OAuth** — documentado en el encabezado del archivo y en "Pendientes
  activos". Sin `state`, nada ata el `code` a quien arrancó la vinculación: hacerle disparar la
  función a un vendedor logueado con un `code` ajeno le vincula el comercio a la cuenta de MP del
  atacante, y todos los cobros van ahí. Hoy no es explotable porque **ninguna página llama a esta
  función** (se confirmó con grep: solo `delete-account` y `mp-create-preference` se invocan desde
  el front) — la vinculación quedó pausada en A113-274. Resolverlo antes de cablearla.
- **`order_ids` validado** en `mp-create-preference`: uuids, deduplicado y con tope de 50. Antes un
  body con números u objetos llegaba derecho al `.in()` y el usuario veía "Error interno" (500);
  y `["A","A"]` hacía fallar el chequeo `orders.length !== orderIds.length` respondiendo "Alguna
  orden no existe o no te pertenece", que es falso.
- **`MP_MARKETPLACE_FEE_PCT`** con un valor inválido daba `NaN`, que se serializa como `null` en el
  JSON de la preferencia. Ahora cae a 0 y lo loguea.

### Tests nuevos: `supabase/functions/_tests/`

24 asserts, corren con `node` (sin Deno, sin Supabase levantado, sin red) y se sumaron a un
`npm test` nuevo que también corre los `js/*.test.mjs` de siempre.

- `load-edge.mjs` lee el `index.ts` **real**, le saca el `import` de `jsr:` (que solo resuelve en
  Deno), lo transpila con `typescript` (agregado como devDependency) y lo corre en un `vm` con
  `Deno`, `createClient` y `fetch` stubbeados, quedándose con el handler que la función le pasa a
  `Deno.serve`. O sea que se prueba el archivo que se despliega, no una copia.
- `fake-supabase.mjs` es un Supabase en memoria con lo justo del query builder que usan estas
  funciones (`select`/`update`/`eq`/`neq`/`in`/`limit`/`maybeSingle`/`single`/`rpc`).
- Van en `_tests/` porque **el CLI de Supabase ignora las carpetas que empiezan con `_`** al
  desplegar (misma convención que `_shared`), así que no viajan a producción.
- **Contra el código de `main` fallan 8** de los 24: los 5 del webhook (monto de menos, carrito
  parcial, devolución, contracargo, collector duplicado) y 3 de la baja de cuenta (adjuntos de
  soporte, orden de operaciones, archivos perdidos si la baja falla).

### El pendiente más grave que salió y NO se tocó

**`orders_insert_own` deja fijar el precio desde el cliente.** Verificado contra la base de
producción con `pg_policies`: la policy es solo `with check (client_id = auth.uid())`, sin nada que
proteja `total_price`, `payment_status` ni `store_id`, y **no hay trigger que recalcule el total
desde `order_items`**. El RPC `create_order` (SECURITY DEFINER) sí calcula bien el precio desde
`products.price` — pero nada obliga a pasar por él: cualquier usuario autenticado puede insertar la
orden directo por la API REST con el `total_price` que quiera, y con `order_items_insert_own`
sumarle ítems inventados.

Importante: **la verificación de monto del webhook NO tapa este caso** — el pago coincide con el
total inventado, así que para el webhook cierra perfecto. Se arregla en la policy (que el insert
directo no pueda fijar esos campos, o revocarlo y dejar solo el RPC). Necesita migración, la aplica
el usuario. Anotado en "Pendientes activos" con prioridad ALTA.

### Verificación

`npm test` en verde (24 asserts nuevos + los 6 archivos de test que ya había). Las 4 funciones
parsean sin errores de sintaxis (chequeado con el parser de TypeScript; **no hay Deno en el entorno
remoto y no se puede instalar, el proxy de egress bloquea deno.land**, así que no se corrió
`deno check` ni se desplegó nada). `dist/` reconstruido por el cambio en
`js/notifications-utils.js`. **Ninguna función se re-desplegó**: los cambios están en el repo, hay
que hacer `supabase functions deploy` para que lleguen a producción.

---

## 2026-09-16 — Directorios (contratar / farmacias / servicios): URLs sin validar y 4 bugs

Tercer análisis al azar de la sesión: salieron las tres páginas de directorio (`js/contratar.js`,
`js/farmacias.js`, `js/servicios.js`, ~940 líneas).

### El hallazgo principal: una URL de la base puesta derecho en un `href`

`getVisibleSocialLinks()` (`js/store-contact-utils.js`) devolvía el valor crudo de la columna:

```js
url: String(store[`social_${key}`] || '').trim(),
```

y tanto `contratar.js` como `comercio.js` hacían `link.href = s.url`. Lo mismo `farmacias.js` con
`pharmacy.maps_url`. Nadie valida esos campos en ningún punto de la cadena: el input de
`vender.html` es `type="text"` (no `type="url"`), `vender.js` guarda `.value.trim() || null` sin
tocar nada, y las columnas son `text` pelado sin CHECK (verificado contra producción). El dueño
las escribe él mismo desde su panel (`professionals_update_own`, migración 86).

**Consecuencia 1 — la de todos los días, confirmada en el navegador.** Una URL sin esquema queda
**relativa**: `instagram.com/mitienda` en un `href` no va a Instagram, el navegador la resuelve
contra la página y termina en `proyectopdisc.vercel.app/pages/instagram.com/mitienda`, un 404 del
propio sitio. Y "sin esquema" es exactamente como lo escribe cualquiera; el placeholder del campo
muestra `https://instagram.com/tu-usuario` pero nada lo obliga.

**Consecuencia 2 — el `javascript:`, con una aclaración importante.** Un
`javascript:void(...)` guardado en el campo se dibujaba como link clickeable. La medición
matizó la severidad y conviene dejarla escrita para no exagerarla después:

- Un `<a href="javascript:...">` **sin** `target="_blank"` **sí ejecuta** bajo la CSP del
  proyecto — `script-src 'self' 'unsafe-inline'`, y `unsafe-inline` habilita las URLs
  `javascript:`. Comprobado con Chromium contra la CSP real copiada de `pages/contratar.html`.
- Pero los dos lugares que renderizan estos links (`contratar.js`, `comercio.js`) ponen
  `target="_blank"` + `rel="noopener noreferrer"`, y ahí Chromium **abre una pestaña nueva y no
  llega al origen del sitio** (se probó leyendo el `localStorage` del origen después del clic:
  vacío).

O sea: **no era un XSS guardado explotable tal como está escrito hoy**, pero lo único que lo
separaba de serlo eran dos atributos en el call site — cualquier refactor que los saque (o un
tercer consumidor que los olvide) lo abre. Por eso el filtro va en el helper compartido y no en
cada página.

### El arreglo

`safeExternalUrl(raw)` en `js/store-contact-utils.js`:

1. saca caracteres de control (la forma clásica de partir un `javascript:` en dos: `"java\nscript:"`);
2. si no trae esquema, le antepone `https://`;
3. parsea con `new URL()` y **descarta todo lo que no sea `http:`/`https:`** (y lo que no tenga host).

Lo usa `getVisibleSocialLinks()`, así que **arregla de una las dos páginas que lo consumen**
(contratar y comercio) sin tocar `comercio.js`, y `farmacias.js` lo importa para su `mapsHref()`.
Tests nuevos en `js/store-contact-utils.test.mjs` (casos: sin esquema, mayúsculas raras,
partido con salto de línea, `data:`, `vbscript:`, `file:`, vacío, `https://` sin host).

### Los otros tres bugs

1. **`contratar.js`: las reseñas dejaban de cargar para siempre.** `loadedReviewSections` es un
   `Set` de ids ya cargados, pero `render()` rehace todas las tarjetas desde cero al filtrar. Tras
   filtrar, el id seguía en el Set y `toggleCard()` cortaba antes de poblar la sección del nodo
   nuevo, que quedaba vacía. Reproducido en el navegador (abrir tarjeta → escribir en el buscador →
   reabrir la misma: con `main` la sección queda en `""`, con el arreglo vuelve a cargar). Se
   vacía el Set en cada `render()`.
2. **Las tres páginas mostraban un hueco en blanco mientras cargaban.** Ahora usan el bloque con
   el spinner de 6 puntos (`bl-loading-block` + `bl-spinner`, ya en `home.css`, que las tres
   páginas cargan). En `servicios.html` importa más que en otras: son números de emergencia, y una
   página vacía se lee como "no hay ninguno cargado".
3. **`contratar`/`servicios` no filtraban por `is_active`.** Las policies públicas
   (`professionals_select_public`, `emergency_contacts_select_public`) sí lo hacen, pero las de
   admin (`professionals_all_admin`, `emergency_contacts_all_admin`, ambas cmd `ALL`) no: una
   cuenta admin veía en las páginas **públicas** las publicaciones pausadas y los contactos dados
   de baja. Se agregó `.eq('is_active', true)` explícito.

### Cosas que parecían bugs y NO lo eran (verificado, no asumido)

- **Dos farmacias de turno simultáneas**: `pharmacy_shifts` tiene
  `constraint pharmacy_shifts_one_per_day unique (shift_date)`, así que no puede pasar.
- **Contactos de emergencia en una categoría desconocida** (que `servicios.js` descartaría en
  silencio): hay un CHECK que limita `category` a `emergencias`/`veterinarias`, las dos que
  conoce el JS.
- **`pro.phone.replace()` / `contact.phone.replace()` con phone null**: las dos columnas son
  `NOT NULL`.

### Contradicción documentada, no resuelta

La migración 67 dice que `pharmacy_shifts.closes_at` se interpreta **SIEMPRE** como del día
siguiente. `shiftWindow()` en `js/farmacias.js` solo lo pasa al día siguiente cuando
`closes_at <= opens_at`, así que un turno cargado "8:00 a 22:00" lo toma del mismo día. El JSDoc
de la función afirmaba lo de la migración ("SIEMPRE") mientras el código hacía otra cosa.

Se dejó **el comportamiento del código** a propósito, y se reescribió el comentario para que diga
la verdad y el porqué: es el lado conservador, que es el criterio que manda en ese archivo ("ante
la duda, NO mostrar el dato"). Si el admin quiso decir "22:00 de mañana", la página dice "no
tenemos el turno" durante esas horas — molesto pero inofensivo; al revés mandaría a alguien a una
farmacia cerrada a la madrugada. Con los turnos reales de Baradero (8:00 a 8:00) las dos lecturas
coinciden, así que hoy no cambia nada.

**Si alguna vez hay que cargar turnos que no sean de 24hs, la salida correcta es agregarle a
`pharmacy_shifts` una columna explícita (`closes_next_day`), no adivinar por las horas.** El
formulario del admin (`shift-opens`/`shift-closes` en `admin.js`) son dos inputs de hora sin
ninguna aclaración sobre esto.

### Verificación

`npm test` en verde (95 asserts entre los `js/*.test.mjs` y los de las edge functions). Los dos
bugs principales se reprodujeron contra el código de `origin/main` en un harness de Playwright
que monta la página real con un stub de Supabase y la CSP real copiada de `pages/contratar.html`,
y se re-verificaron con el arreglo. `dist/` reconstruido.

**Gotcha del harness:** los estilos `ct-*` de `contratar.html` están partidos entre `home.css` y
un `<style>` inline en la propia página, así que un harness que solo cargue `home.css` la muestra
sin estilo — no es un bug de la página.

---

## 2026-09-16 — Carrito y checkout: el total mostrado no era el total cobrado

Cuarto análisis al azar de la sesión: salió `js/carrito.js` (1400 líneas) + `js/cart-utils.js`.

### El hallazgo principal

`create_order` (leído de la base de producción, no del archivo de migración) calcula así, **por
tienda**:

```sql
v_store_discount_pct := case
  when v_coupon_discount_pct is not null and (v_coupon_store_id is null or v_coupon_store_id = v_store_id)
  then v_coupon_discount_pct else 0 end;
...
v_total := round(v_subtotal * (1 - v_store_discount_pct / 100.0))::integer + v_delivery_fee;
```

O sea: **el descuento se aplica tienda por tienda**, y un cupón de un comercio puntual no toca a
los demás. El carrito hacía otra cosa: `applyCoupon()` leía `data.store_id` de
`validate_coupon_code` solo para chequear que el carrito tuviera algo de esa tienda, y después lo
**tiraba**, guardando nada más el porcentaje en un `currentDiscount` global que `renderCart()` le
restaba al subtotal entero.

**Diferencia medida en la página real, con el carrito de dos comercios:** $10.000 en cada uno y un
cupón del 20% que pertenece a uno solo. `main` muestra **Total $16.000**; `create_order` cobra
**$18.000**. El mensaje de la UI ya decía la verdad ("20% de descuento en los productos de esa
tienda") mientras el número de al lado decía otra cosa.

Dos diferencias más, chicas pero del mismo origen:

- **Orden del redondeo.** El RPC redondea el subtotal con descuento de **cada tienda**
  (`round(...)::integer`) y recién ahí suma el envío; el carrito redondeaba una sola vez al final y
  solo para mostrar. Con $10 y $10 al 15%: el RPC da 9 + 9 = 18, el carrito mostraba 17.
- **Umbral de envío gratis con el descuento de otro.** `calculateShippingByStore()` aplicaba
  `currentDiscount` al subtotal de **todas** las tiendas para decidir si llegaban al envío gratis,
  así que un cupón ajeno podía bajar artificialmente el subtotal de una tienda y mostrar envío
  cobrado donde el RPC daba gratis. Lo mismo el chip "Te faltan $X para envío gratis" de cada grupo.

### El arreglo

La aritmética se sacó a **`js/cart-totals.js`**, puro y sin DOM (mismo patrón que
`storage-utils.js` / `store-contact-utils.js`), con `node js/cart-totals.test.mjs`. Replica el RPC
paso por paso:

1. agrupa por tienda;
2. `discountPctForStore(pct, couponStoreId, storeId)` — el mismo `case` del SQL;
3. el umbral de envío se compara contra el valor **sin redondear** (es lo que hace el RPC: redondear
   antes de comparar puede cruzar el límite por una fracción de peso — hay un test para eso);
4. redondea el subtotal con descuento de cada tienda y **después** suma el envío.

**Gotcha del redondeo:** `round()` de Postgres sobre `numeric` redondea el 0,5 alejándose del cero y
`Math.round` de JS lo redondea hacia +infinito. Coinciden porque acá todos los importes son
positivos; si alguna vez hay negativos (una nota de crédito), hay que revisarlo.

`carrito.js` pasó de `currentDiscount` (0-1, global) a `couponPercent` (0-100) + `couponStoreId`, y
el resumen, el chip de envío por comercio y el botón de pagar salen todos de la misma función. Los
`FREE_SHIPPING_THRESHOLD`/`FLAT_SHIPPING_FEE` que estaban duplicados en `carrito.js` ahora se
importan de `cart-totals.js` (`DEFAULT_*`), para no tener el mismo número escrito en dos lados.

### Dos arreglos menores

1. **Las ofertas vencían tres horas antes, todas las noches.**
   `new Date().toISOString().slice(0, 10)` devuelve el día **en UTC**, y Argentina va 3 horas atrás:
   entre las 21:00 y la medianoche el día UTC ya es el siguiente, así que
   `offer_expires_at < today` daba `true` para una oferta que todavía estaba vigente y el precio
   tachado desaparecía. Estaba igual en `cart-utils.js` (`buildPriceRow`) y en `product-modal.js`.
   Ahora los dos usan `localIsoDate()` / `isOfferExpired()` de `cart-utils.js` — el mismo criterio
   que `isoDate()` de `js/farmacias.js`, que ya tenía el comentario "no UTC: toISOString corre el
   día". **Quedan dos usos más de ese patrón en `js/vender.js` (líneas ~1379 y ~2449), en las
   métricas del panel; no se tocaron por estar fuera de esta tarea.**
2. **`renderActiveCoupons` no filtraba vencidos para un admin.** `coupons_select_public` ya filtra
   `is_active` + expiración, pero `coupons_all_admin` (cmd `ALL`) no, así que una cuenta admin veía
   en el home y en el carrito cupones que `create_order` después rechazaba con "Cupón inválido o
   expirado". Se agregaron los filtros explícitos.

### Cosas que se verificaron y estaban bien

- **El checkout no manda precios.** El payload de `create_order` es solo `{id, qty}`; el precio lo
  vuelve a leer el servidor de `products`. Bien.
- **El filtro por comercio no toca `selected`.** Es solo una lente de visualización, y hay un aviso
  (`#cart-hidden-note`) para lo que queda tildado pero oculto. Bien pensado, se dejó igual.
- **No se vacía el carrito antes de tiempo con Mercado Pago.** Está documentado en el propio
  archivo y es correcto.

### Verificación

`npm test` en verde (112 asserts). El bug principal se reprodujo **en la página real** con un
harness de Playwright que monta `pages/carrito.html` con un stub de Supabase (dos comercios, un
cupón del 20% con `store_id` de uno solo): contra `origin/main` el resumen dice $16.000, con el
arreglo dice $18.000, que es lo que cobra el RPC. `dist/` reconstruido.

## 2026-09-17 — Botón "Panel" del home (con menú cuando hay dos) + a quién se auto-redirige

Continuación de lo que se había hecho el 2026-09-16 (`e569ccc`, "Home:
vendedor/profesional ya registrado entra directo a su panel"). Pedido del usuario, en tres
partes: (1) que quien ya está registrado como vendedor/profesional entre directo a su panel,
(2) que el logo de arriba a la izquierda sea la vuelta al inicio, y (3) que la palabra
"Vender" de la fila de accesos diga **"Panel"** para vendedores, profesionales **y
administradores**, con un menú de dos opciones cuando la misma cuenta es las dos cosas.

### Lo que ya estaba y lo que faltaba

(1) ya estaba resuelto. (2) estaba resuelto **por inferencia**: `home.js` miraba
`document.referrer` y, si era de este mismo origen, asumía que el click fue intencional. Anda,
pero el referrer no siempre viaja (páginas estáticas sin JS, políticas de referrer del
navegador, algunos favoritos). (3) existía a medias: el texto pasaba a "Panel" solo para
vendedor/profesional, solo en la rama "vinieron por el logo", y no contemplaba admin.

### `getPanelAccess()` — una sola función que responde "¿qué paneles tenés?"

`hasSellerPanel()` devolvía un booleano y solo miraba dos cosas (rol `vendedor` en el JWT +
tabla `professionals`). No alcanzaba para el caso nuevo, que necesita saber **cuál** panel y si
además hay uno de admin. Se reemplazó por `getPanelAccess(user)` →
`{ isAdmin, seller: 'vendedor'|'profesional'|null }` (`js/auth-utils.js`), más el mapa
`SELLER_PANEL_PAGES` (`vendedor` → `vender.html`, `profesional` → `profesional.html`) y
`sellerPanelPage(user)`, que es lo que consume el redirect post-login.

**Conflicto al mergear, y cómo se resolvió.** En paralelo, otra sesión sacó el mini panel del
profesional de adentro de `vender.html` y lo puso en una página propia (`pages/profesional.html`,
ver la sección "Panel de autogestión del profesional/técnico" más arriba), y en el camino renombró
`hasSellerPanel()` a `sellerPanelPage()`, que devuelve el nombre de la página en vez de un
booleano. Las dos ramas tocaron las mismas funciones de `auth-utils.js` y `home.js`. Se quedó el
**nombre y el contrato de main** (`sellerPanelPage`, devuelve página o `null`) implementado sobre
`getPanelAccess()`, y todos los destinos del botón salen ahora de `SELLER_PANEL_PAGES` en vez de
tener `'./vender.html'` escrito a mano — si no, el profesional habría terminado en `vender.html`,
que ya no tiene su panel. También se adoptó el `.limit(1)` de esa rama en lugar de
`.maybeSingle()`: ni `professionals` ni `stores` tienen unique por `owner_id`, y con dos filas el
`.maybeSingle()` tira error de coerción y deja a la cuenta sin panel (el mismo bug de las tiendas
de seed).

Por qué hacen falta consultas y no alcanza el JWT — **el rol guarda un valor solo**:
- publicarse en "Contratar" no cambia el rol (sigue `cliente`) → tabla `professionals`;
- una **empleada** de un comercio (`store_staff`) tampoco tiene rol propio y entra al mismo
  panel que su dueño (ver `checkSellerState` en `js/vender.js`) → tabla `store_staff`;
- un **admin que además tiene comercio** no se distingue por el rol → `stores.owner_id`.

Las tres consultas van en paralelo (`Promise.all`), solo con sesión, y se saltean del todo si el
JWT ya dice `vendedor`. `hasSellerPanel()` quedó como envoltorio:
`!isAdmin && seller !== null`.

**Decisión: a quien tiene panel de admin NO se lo auto-redirige.** Tiene dos destinos posibles y
elegir uno sería adivinar; se queda en el home y elige desde el botón. De paso esto esquiva la
trampa de los datos de seed: la cuenta admin `bianberayra@gmail.com` figura como `owner_id` de
las 14 tiendas de prueba (ver la nota de las 17 tiendas en CLAUDE.md), así que con el criterio
contrario habría entrado siempre al panel de vendedor sin haberlo pedido.

Efecto lateral buscado: la **empleada** de un comercio ahora sí entra directo a su panel, y el
redirect post-login (`resolvePostLoginRedirect`) la reconoce igual que al vendedor.

### El logo marca la intención, no se adivina

`markHomeIntent()` (`js/auth-utils.js`, listener delegado en captura, registrado en el bloque
`if (typeof window !== "undefined")` que corre en cualquier página que importe el módulo —
prácticamente todo el sitio) guarda `bl_home_intent` en `sessionStorage` cuando el click cae
adentro de `.navbar__logo`. `cameToHomeOnPurpose()` en `home.js` acepta esa marca **o** el
referrer del mismo origen (se mantiene: cubre cualquier link interno al home, y las páginas
estáticas sin JS —`info.html`, `terminos.html`, `privacidad.html`— donde el listener no corre).

**No se limpia al leerla**, a propósito: una vez que la persona pidió ver el inicio, recargar o
volver con el botón de atrás no tiene por qué rebotarla al panel otra vez. Es por pestaña
(`sessionStorage`), así que una pestaña nueva vuelve a arrancar en el panel.

De paso, la comparación de origen pasó de `referrer.startsWith(location.origin)` a
`new URL(referrer).origin === location.origin` (lo anterior daba `true` para un origen que
apenas empieza igual, tipo `...vercel.app.otrositio.com`).

### El botón

`renderPanelAction()` en `js/home.js`. Con **un** panel el `<a>` sigue siendo un `<a>`: cambia
el texto a "Panel" y el `href` al panel que corresponda (`vender.html`, `profesional.html` o
`admin.html`). Con **dos**, el `<a>` se
reemplaza por un `<div class="home-action-menu">` con un `<button class="home-action
home-action--menu">` y un menú (`.home-panel-menu`) de dos ítems, etiquetados según esa cuenta:
"Panel de vendedor" **o** "Panel de profesional/técnico" (nunca los dos, que es lo que pidió el
usuario), más "Panel de administrador" — o "Panel de moderación" si el rol es `moderador`, que
entra al mismo `admin.html` (ver `requireRole` en `js/admin.js`). Los textos son los mismos que
usa `setRolePanelLink()` en `js/perfil.js`.

**Gotcha del CSS:** `.home-action` es `flex: 1` como hijo directo de
`.category-bar__inner--home-actions`. Al envolverlo en un div para poder posicionar el menú,
el `flex: 1` tiene que pasar al **wrapper** — si no, el botón se encoge al ancho del texto y los
otros dos accesos se comen la fila. El menú no se recorta porque `.category-bar` ya es
`position: sticky` (antes `relative`, ver entrada 2026-09-18 más abajo) con `z-index: 40` y
overflow visible (lo dejó así el mega-menú de categorías) — sticky sigue sin recortar hijos
posicionados absoluto, así que el gotcha se mantiene igual.

### Verificación

20 checks en Chromium contra el build real (`vite build` a un outDir aparte con env de mentira,
servidor estático, sesión sembrada en `localStorage` con un JWT armado a mano y las consultas
de PostgREST interceptadas con `page.route`). Cubren: cliente común (no se toca nada),
vendedor sin referrer → `vender.html`, vendedor con intención → se queda y ve "Panel",
empleada → `vender.html`, profesional → `profesional.html`, admin solo → "Panel" a
`admin.html`, admin+vendedor y
admin+profesional → menú con las dos etiquetas correctas, y que el menú abra/cierre con click,
Escape y click afuera. Más una captura a 390px para confirmar que el menú entra en la pantalla.
Harness en el scratchpad de la sesión (no versionado). `npm test` en verde, `dist/` reconstruido.

**Gotcha del harness, por si se reusa:** Playwright resuelve las rutas de `page.route`/
`context.route` **de la última registrada a la primera**, así que el catch-all va primero y las
específicas después — al revés, el catch-all se come todo y las consultas mockeadas vuelven
vacías (pasó, y hacía fallar justo los casos de profesional/empleada). Y el Chromium
preinstalado del entorno remoto no es el que espera el `playwright` recién instalado: hay que
pasarle `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.

## 2026-09-18 — Barra de categorías fija al scrollear

La franja de "Inicio / Ofertas / rubros" (`.category-bar`, debajo del navbar en search/comercios/
producto/comercio, y la fila "Vender/Contratar/Panel" que ocupa el mismo lugar en home) era
`position: relative`: al bajar la página, scrolleaba con el resto igual que cualquier otro
bloque. Pedido del usuario: que quede fija (sticky) igual que ya lo era el navbar.

Pasa a `position: sticky` con `top: var(--bl-navbar-height, 0px)`. El valor no se pudo
hardcodear: el navbar mide distinto en home (una sola fila, `navbar--single-row`) que en el
resto (dos filas: logo+acciones y buscador separado), y también según el ancho de pantalla
(el navbar pasa a 2 renglones en mobile). Se resolvió midiéndolo en JS
(`syncStickyHeightVars()` en `js/nav-utils.js`, con `ResizeObserver` sobre `.navbar` y
`.category-bar` para que se actualice solo si el navbar cambia de alto o la barra de categorías
tarda en poblarse de forma asíncrona) y publicándolo como variable CSS
(`--bl-navbar-height`/`--bl-catbar-height` en `documentElement.style`). Se engancha desde
`initCategoryBar()`, que ya corren las 5 páginas con barra de categorías — no hizo falta tocar
cada página por separado.

**Efecto colateral que había que resolver sí o sí:** `.filters-sidebar` (el panel "Filtros" de
search.html) ya era `position: sticky` con un `top: 5rem` adivinado a mano (una aproximación al
alto del navbar de dos filas). Con la barra de categorías ahora también fija debajo del navbar,
ese `top` se quedaba corto y el sidebar terminaba tapado detrás de la barra al scrollear. Pasa a
`top: calc(var(--bl-navbar-height, 5rem) + var(--bl-catbar-height, 0px))` (mismo criterio para
`max-height`), así que se acomoda automáticamente sea cual sea el alto real.

**Verificado con Playwright** contra el build real (`vite preview`): con contenido de relleno
inyectado para simular una grilla de productos alta (en el entorno de la sesión la red a
Supabase no anda —`ERR_TUNNEL_CONNECTION_FAILED`/certificado inválido del proxy del sandbox—,
así que sin datos reales la grilla queda más baja que el propio sidebar y el sticky no tiene
margen para moverse; es una limitación del entorno de prueba, no del CSS). Con la grilla alta:
al scrollear 500px, navbar en `0–117px`, barra de categorías pegada justo debajo en
`117–166px`, y el sidebar de Filtros arrancando en `166px` sin quedar tapado. Confirmado también
en `home.html` (navbar de una fila, la franja de accesos queda fija en `65–102px`) y en mobile
(390px) que no rompe el layout. `npm test` en verde, `dist/` reconstruido.

## 2026-09-22 — Cerrado el hueco de `orders_insert_own` (fijar el precio desde el cliente) + popup bloqueado al ver el comprobante

**El pendiente de prioridad ALTA anotado el 2026-09-16 en CLAUDE.md**: la policy
`orders_insert_own` (`with check (client_id = auth.uid())`) y `order_items_insert_own` no
restringían nada más, así que cualquier usuario autenticado podía insertar una orden por la API
REST **salteándose el RPC `create_order`** con el `total_price`, `store_id`, `payment_status` y
`payment_method` que quisiera, y sumarle ítems con precio inventado. Confirmado contra la base
real antes de tocar nada (`pg_policy` vía el MCP de Supabase, proyecto `otzhdwuaffcplrveuadc`):
el `with_check` de `orders_insert_own` era exactamente eso, sin ninguna otra columna cubierta.

**Fix aplicado** (`db/schema/96_lock_down_direct_order_inserts.sql`, aplicada en producción el
mismo día vía `apply_migration`): en vez de intentar escribir un `with check` que cubra cada
columna sensible (frágil, cualquier columna nueva vuelve a abrir el hueco), se revoca el
`INSERT` de `orders`/`order_items` para `authenticated` y `anon` directamente y se borran las dos
policies de insert, que quedan sin uso. Esto **no rompe `create_order()`**: es `SECURITY DEFINER`
y tanto la función como las dos tablas son dueñas de `postgres` (verificado con
`pg_get_userbyid(relowner)`/`pg_get_userbyid(proowner)`) — el dueño de una tabla en Postgres
bypassea tanto los `GRANT` como el RLS (`relforcerowsecurity` está en `false`, no hay `FORCE ROW
LEVEL SECURITY`), así que el único camino para crear un pedido sigue siendo el RPC, ahora sin
forma de saltearlo desde la API REST. Verificado post-aplicación:
`information_schema.role_table_grants` ya no lista `INSERT` para `authenticated`/`anon` en
ninguna de las dos tablas. Se buscó en todo `js/` y no hay ningún `.from('orders').insert(...)`
ni `.from('order_items').insert(...)` en el cliente -- todo pasa por `supabase.rpc('create_order',
...)`, así que no había nada más que actualizar en el frontend.

**Segundo fix, más chico** (`js/vender.js` y `js/admin.js`, botón "Ver comprobante" de una
transferencia): mismo bug que ya se había resuelto en `js/support-utils.js` el 2026-09-16 pero
que esa sesión había dejado anotado como pendiente en estos dos archivos por estar fuera de
alcance. `window.open(signedUrl, ...)` se llamaba **después** del `await
createSignedUrl(...)`, y Safari/Firefox bloquean en silencio un `window.open()` que ya no está
atado al gesto de click del usuario (Chromium no, por eso no se notaba probando ahí). Mismo
arreglo: abrir la pestaña en blanco (`window.open('', '_blank')`, `tab.opener = null`) antes del
`await`, y navegarla con `tab.location.replace(signedUrl)` una vez que llega la URL firmada
(`tab?.close()` si falla). Cambio puro de JS, sin migración ni CSS -- `dist/` reconstruido.

## 2026-09-22 — Auditoría de seguridad del panel de profesional/técnico

Pedido del usuario: auditar un sector al azar del sitio buscando oportunidades de mejora de
seguridad. Se eligió el panel de autogestión del profesional/técnico
(`js/profesional.js` + los 6 módulos `js/profesional-*.js`, `pages/profesional.html`,
migraciones 77-95) por ser lo más nuevo y complejo del proyecto, y porque el propio CLAUDE.md
lo marcaba como "sin probar el recorrido logueado de punta a punta".

**Resultado: el panel en sí está bien construido.** Revisado contra la base real (no solo los
`.sql` del repo -- ya pasó antes que un archivo describiera un fix que nunca se aplicó) con
`pg_policy` vía el MCP de Supabase: las 7 tablas del panel
(`professionals`, `professional_services`, `professional_promos`,
`professional_inquiries`, `professional_metrics_daily`, `professional_business_hours`,
`professional_service_areas`) tienen exactamente las policies que documentan sus migraciones,
todas con el `exists (select 1 from professionals p where p.id = ... and p.owner_id =
auth.uid())` correcto en insert/update/delete. `professionals` no tiene policy de insert propia
para el dueño -- publicarse exige un insert que solo puede hacer el admin
(`professionals_all_admin`), así que no hay forma de auto-aprobarse (el mismo patrón que rompió
`approve_seller_request` en la migración 75 no se repite acá). Nada de `innerHTML` con datos de
la persona en ninguno de los 7 archivos, `contratar.js` ya usa `getVisibleSocialLinks`/
`safeExternalUrl` (fix del 2026-09-16) para las redes del profesional. El RPC público
`increment_professional_metric` valida el tipo de evento, exige que el profesional esté activo
y solo suma 1 -- no recibe el valor a escribir.

**Encontrado y arreglado** (`db/schema/97_lock_down_request_status_on_insert.sql`, aplicada en
producción vía `apply_migration`): `professional_requests_insert_own` --y, se confirmó, su
gemela `seller_requests_insert_own` de `02_shop_and_cart.sql`, mismo patrón desde el origen del
proyecto-- solo validaban `auth.uid() = user_id` al dar de alta la solicitud, sin restringir la
columna `status`. Un usuario autenticado podía insertar su propia solicitud con
`status: 'approved'` en vez de dejar el default `'pending'`. **No es una escalada de
privilegios**: publicarse de verdad sigue exigiendo el insert admin-only en
`professionals`/`stores`, así que la cuenta atacante no gana nada por sí misma. El impacto real
es de integridad del panel de admin -- confirmado leyendo `fetchProfessionalRequests()`
(`js/admin.js`): la tabla de solicitudes hace `select('*')` sin filtrar por estado y solo
muestra los botones Aprobar/Rechazar cuando `status === 'pending'`, así que una solicitud con el
estado falseado aparece con el badge "Aprobado"/"Rechazado" y sin acciones -- desaparece de la
cola de revisión aunque el admin nunca la haya mirado. Fix: el `with check` de las dos policies
ahora exige `status = 'pending'` en el insert, mismo criterio de "columna protegida" que ya usan
el trigger de `professional_inquiries` (90) y el de `reviews.owner_reply` (94). Se confirmó antes
de aplicar que ni `js/vender.js` (alta de comercio) ni el alta de profesional mandan `status` en
el insert -- las dos dependen del default de la columna (`'pending'::text` en ambas tablas), así
que el fix no rompe el flujo real.

**No se tocó** (fuera de alcance de esta auditoría, solo anotado): `increment_professional_metric`
no tiene rate limit -- un visitante anónimo podría inflar `profile_view`/`call_click`/
`whatsapp_click` llamando el RPC en loop. Es manipulación de una métrica vanity, no una fuga de
datos ni una escalada, y con el volumen de "pueblo chico" del proyecto no pareció justificar la
complejidad de un limitador -- queda para retomar si en algún momento se usan estas métricas para
algo con peso (ranking, facturación, etc.).

## 2026-09-22 — Auditoría de seguridad del flujo de login/registro/recuperación

Segundo sector elegido al azar (mismo pedido del usuario): `js/login.js`, `js/register.js`,
`js/recuperar-password.js`, `js/nueva-contrasena.js` y `js/auth-utils.js` (el módulo que importan
todas las páginas del sitio -- `guardPage`, `checkUrlErrors`, el listener global de sesión).

**Los cuatro flujos en sí están bien**: los redirects de OAuth/registro/login son todos
hardcodeados o salen de una lista cerrada de 3 valores (`paginaPostRegistro()`), no hay open
redirect. `checkUrlErrors()` vuelca `error_description` de la URL a un toast con `textContent`,
nunca `innerHTML` -- no hay XSS ahí pese a ser contenido 100% controlado por la URL. El gate de
rol de `guardPage` (`requireRole`) es puramente de UX/redirect: confirmado que las acciones reales
de admin en el sitio están today todas detrás de RLS con el mismo chequeo de
`auth.jwt() -> app_metadata ->> role`, así que aunque alguien lo saltee client-side no gana nada.

**Encontrado y arreglado, severidad alta** (`js/error-logger.js`): el logger global de errores
(`window.onerror`/`unhandledrejection`, A113-171) mandaba `window.location.href` **completo**,
hash incluido, a la tabla `error_logs` en cada error no manejado. El problema: los links de
recuperación de contraseña, de confirmación de email y el callback de Google OAuth vuelven con
`#access_token=...&refresh_token=...&type=recovery` en el HASH de la URL -- así arma la sesión
supabase-js (`detectSessionInUrl`, default `true`). Ese procesamiento es **asíncrono**
(`_initialize()` de `GoTrueClient`, con lock + posible round-trip antes de limpiar la URL con
`history.replaceState`): hay una ventana real, entre que carga la página y que termina, donde
`window.location.href` todavía tiene el token de sesión crudo. Si CUALQUIER error no relacionado
(un script de una extensión, un timeout de red, un bug en otra parte del sitio) dispara justo en
esa ventana, el token de la persona quedaba guardado en texto plano en una tabla de la base --
`error_logs_select_admin` la deja leer a las 4 cuentas admin, y con ese `access_token`/
`refresh_token` alcanza para tomar la sesión de la cuenta (llamando
`supabase.auth.setSession(...)` con esos valores) mientras no expiren. No hacía falta que el
error ocurriera EN la página de recuperación -- el mismo error-logger corre en TODO el sitio
(se importa desde `auth-utils.js`, que importa cualquier página), así que la ventana existe en
cualquier página a la que Google OAuth o un link de email puedan redirigir.

Se verificó contra la base real que hoy no hay ningún token filtrado (`error_logs` tiene una sola
fila en producción y no contiene `access_token`/`refresh_token`/`#`), así que es un hueco
encontrado antes de que se explotara, no una fuga ya ocurrida.

**Fix**: `sanitizeUrlForLogging()` (exportada, con test en `js/error-logger.test.mjs`) saca el
hash entero antes de loguear -- ahí no debería viajar nunca nada que valga la pena registrar para
diagnóstico -- y de paso borra de la query string cualquier parámetro con nombre sensible
(`access_token`, `refresh_token`, `provider_token`, `provider_refresh_token`, `token`,
`token_hash`, `code`, `apikey`) por si algún flujo futuro los pasa ahí en vez de en el hash. El
resto de la URL (path, query no sensible) se conserva intacto porque sigue siendo útil para
diagnosticar en qué página pasó el error. Sin migración: `error_logs` no cambia de esquema, el fix
es enteramente del lado del cliente, antes de que el insert salga.

## 2026-09-22 — Auditoría de seguridad del panel de admin (tercer sector al azar)

Tercer sector elegido al azar (mismo pedido del usuario): `js/admin.js` (1981 líneas) +
`pages/admin.html`. Es la superficie de mayor privilegio del sitio y no había tenido un pase de
auditoría dedicado (sesiones previas tocaron piezas sueltas -- el visor de `error_logs`, la
aprobación de profesionales -- pero no una revisión sistemática).

**El panel en general está bien construido**: sin un solo `innerHTML` con datos de la persona en
todo el archivo (se revisaron las ~60 apariciones, todas son literales de "Cargando…"/"Error al
cargar"/vacío o `= ''` para limpiar), el hilo de mensajes de soporte usa `textContent` para el
mensaje del usuario y del admin por igual, y los RPCs sensibles (`confirm_transfer_payment`,
`admin_set_product_active`) validan el rol o la propiedad del recurso adentro, con
`security definer` + `search_path` fijo -- mismo patrón ya establecido en el resto del proyecto.
`support_tickets_update`/`support_ticket_messages_insert_participants` (54) ya tenían el patrón
correcto de restringir por columna: el dueño del ticket solo puede poner `status = 'cancelled'`
en su propio `with check`, nunca reescribir el resto.

**Encontrado y arreglado, severidad media-alta**: `protect_review_owner_reply()` (el trigger de
`reviews` que agregó la respuesta pública del dueño, 94_reviews_owner_reply.sql) eximía a
`admin` **y** `moderador` de todo chequeo de columna -- volvía con `return new` apenas veía
cualquiera de los dos roles. El problema es 'moderador': es, por diseño explícito de
`50_moderador_role.sql`, un rol deliberadamente acotado ("nada financiero ni de configuración"),
pensado solo para ocultar/mostrar reseñas reportadas (F7-03) -- y "moderar una reseña" en este
proyecto es únicamente eso: `fetchReportedReviews()` en `js/admin.js` solo manda
`update({ is_hidden: ... })`, nunca toca otra columna. Pero `reviews_update_moderador` (la
policy RLS) no restringe ninguna columna en su `with check`, y con el trigger exento de chequeos
para ese rol, un moderador podía en los hechos reescribir el `rating`, el `comment`, el
`client_id` (autor) o el `target_id`/`target_type` de **cualquier reseña del sitio** -- forjar el
contenido de una reseña ajena, no solo moderarla. Confirmado contra la policy real en producción
(`pg_policy`, sin restricción de columna) antes de tocar nada.

**`admin` no se tocó a propósito**: ya tiene acceso total y consistente en el resto del proyecto
(`for all` en casi cualquier tabla) y las 4 cuentas admin ya pueden hacer lo mismo desde el SQL
Editor de Supabase -- restringirlo acá no cierra ninguna superficie real, solo movería la
inconsistencia a otro lado. `moderador` es el caso distinto: un rol delegado sin acceso al
dashboard, pensado explícitamente como acotado -- el mismo criterio que ya usa el propio archivo
50 para justificar por qué existe.

Fix (`db/schema/98_reviews_moderador_only_hides.sql`, aplicada en producción vía
`apply_migration`): el trigger ahora separa el camino de `moderador` del de `admin` -- para
moderador, cualquier cambio que no sea `is_hidden` (rating/comment/client_id/target_type/
target_id/report_reason/owner_reply) tira excepción ("Como moderador solo podés ocultar o
mostrar la reseña."), igual de estricto que ya lo era para el autor de la reseña con el resto de
las columnas. El toggle real de `fetchReportedReviews()` sigue andando exactamente igual, porque
solo cambia `is_hidden`. No hay cuentas `moderador` asignadas todavía en producción (verificado
2026-09-14, ver "Pendientes activos" de CLAUDE.md sobre los 4 admins) -- se encontró y cerró antes
de que hubiera alguien con ese rol para explotarlo.

## 2026-09-22 — Auditoría de seguridad de "Mi perfil" (cuarto sector al azar)

Cuarto sector elegido al azar (mismo pedido del usuario): `js/perfil.js` (2511 líneas) +
`pages/perfil.html`. Maneja datos personales, libreta de direcciones, avatar, favoritos, "Mis
compras" (con comprobante de transferencia y botón de arrepentimiento) y la baja de cuenta.

**En general está bien construido**: `renderFavList`/`buildFavProductCard`/`buildFavStoreCard`
usan `textContent`, nunca interpolan datos de producto/comercio en `innerHTML` (el único
`innerHTML` con interpolación, en `renderFavList`, es siempre un literal fijo, nunca dato de
usuario). `user_addresses` tiene RLS limpia por dueño sin nada que restringir por columna. El
upload de comprobante de transferencia sanea el nombre de archivo contra path traversal Y está
además cubierto en dos capas server-side (`payment_proofs_storage_insert_client` exige que la
carpeta del primer segmento del path sea un `order_id` de una orden propia con
`payment_method = 'transferencia'`, y el trigger `validate_payment_proof_order` exige que esa
orden siga `pending`) -- no hay forma de subir un comprobante a la carpeta de otra persona ni de
inflar la bandeja de otro comercio. `request_order_revocation` valida ownership + estado pagado +
plazo de 15 días. Los tres usos de `URLSearchParams` (`tab`, `order`, `mp`) solo mueven el foco de
scroll o togglean un toast -- ninguno se usa para autorizar nada ni se reinyecta sin escapar.

**Encontrado y arreglado, severidad alta**: `profiles_update_own` (`with check: auth.uid() = id`,
sin restricción de columna) deja que cualquier cuenta reescriba cualquier columna de su propia
fila en `profiles`. `role` ya estaba protegido desde la migración 24
(`prevent_role_update_on_profile`, con la bandera de transacción
`app.role_change_authorized`) -- pero `is_suspended` (34_admin_moderation.sql, pensada para
"suspender repartidor") **no tenía ninguna protección**. Un usuario podía mandar directo
`supabase.from('profiles').update({ is_suspended: false }).eq('id', auth.uid())` y
des-suspenderse a sí mismo, sin pasar por `admin_set_repartidor_suspended` (el único camino
pensado para tocar esa columna). Confirmado que no es hipotético: aunque el frontend de
`repartidor` se sacó el 2026-09-16, `claim_delivery`/`update_delivery_status` -- las únicas dos
RPCs que de verdad usan `is_suspended` como gate -- siguen con `EXECUTE` otorgado a
`authenticated` en producción (verificado con `information_schema.routine_privileges`), así que
la suspensión de un repartidor malo era, en los hechos, una defensa de cartón.

Fix (`db/schema/99_protect_is_suspended_on_profile.sql`, aplicada en producción vía
`apply_migration`): el trigger `prevent_role_update_on_profile` ahora protege `role` **e**
`is_suspended` bajo la misma bandera `app.role_change_authorized`, y
`admin_set_repartidor_suspended` pasa a setearla antes de su propio `update` -- si no, su UPDATE
legítimo (que corre con los privilegios reales del admin, tras el chequeo de rol de la función)
quedaría bloqueado por el mismo trigger que ahora lo protege, igual que le pasó en su momento a
`approve_seller_request` antes del fix de la migración 24. Verificado con tres pruebas en
transacciones con `ROLLBACK` contra la base real: un `UPDATE` directo de `is_suspended` sin la
bandera tira la excepción esperada, el mismo `UPDATE` con la bandera seteada sí aplica, y un
`UPDATE` directo de `role` sigue bloqueado igual que antes (sin regresión). No se tocó nada de
`js/`: es un fix puramente de base, la UI de repartidor ya no existe.

## 2026-09-22 — Auditoría de seguridad del panel de vendedor (quinto sector al azar)

Quinto sector elegido al azar: `js/vender.js` (3368 líneas) + `pages/vender.html`. Es el panel
más grande después de admin -- productos, pedidos, cupones, empleados, perfil del comercio y
comprobantes de transferencia.

**Primero, un susto que resultó falsa alarma pero vale dejar anotado.** `orders_update_staff` y
`orders_update_store_or_admin` (RLS de `orders`) no tienen `with check` propio -- en Postgres, una
policy de UPDATE sin `with check` reusa el `using` como check, así que a simple vista parecía el
mismo hueco que `orders_insert_own` (migración 96): dueño/empleado podrían reescribir
`payment_status`/`total_price`/`client_id` de cualquier orden de su tienda por fuera de
`confirm_transfer_payment`. Se probó directo contra la base real (`SET ROLE authenticated` +
intento de `UPDATE ... SET payment_status = 'paid'`) y **ya está bloqueado** -- pero no por RLS:
`authenticated` solo tiene el privilegio de columna `UPDATE` sobre `status` en `orders`, ninguna
otra columna (confirmado con `information_schema.column_privileges`). Este grant column-level
**no está en ningún archivo de `db/schema/`** -- se armó en algún momento fuera del historial de
migraciones (dashboard, o una sesión que no lo documentó). Es la única columna que
`updateOrderStatus()` (`js/vender.js`) toca directo, así que coincide exactamente con lo que hace
falta. **No se tocó** (ya está bien, solo quedó sin registrar en el repo -- si alguna vez hay que
reconstruir la base de cero desde los archivos de `db/schema/`, esta protección específica no
va a estar, vale la pena que quien lo note en el futuro sepa que existe en producción aunque no
esté en el historial).

**Encontrado y arreglado, severidad media** (`db/schema/100_products_bucket_folder_ownership.sql`,
aplicada en producción): la policy de INSERT del bucket público `products` (storage) solo
chequeaba `role in ('vendedor', 'admin')` -- a diferencia de TODOS los demás buckets del proyecto
(professional-photos, professional-promos, avatars, store-logos, support-attachments...), que
siempre exigen que el primer segmento del path sea del dueño de verdad. Sin ese chequeo,
cualquier cuenta vendedor podía subir lo que quisiera a
`products/{cualquier_product_id}/archivo` -- incluido el `product_id` de un producto ajeno (no es
secreto, está en la URL pública de cada producto). El bucket es público, así que quedaba servido
con URL pública bajo el dominio del proyecto: hosting de archivos arbitrarios sin relación con
Baradero Local, con el sitio como anfitrión involuntario. **No era defacement directo** de la
ficha de otro vendedor -- la vista de producto arma la galería desde la tabla
`product_images`/`products.image_url`, nunca listando el storage (y el bucket ni tiene policy de
SELECT en `storage.objects` para listar, mismo gotcha ya documentado sobre las fotos huérfanas) --
pero sí era hosting público no autorizado.

Fix: la policy ahora exige que el primer segmento del path sea el id de un producto que la cuenta
puede escribir de verdad -- dueño (`seller_id = auth.uid()`) o empleado del comercio
(`store_staff`), mismo criterio que `products_insert_staff`/`products_update_seller` (03/49); admin
pasa sin el chequeo de producto, ya tiene acceso total en el resto del proyecto. No rompe el flujo
real: `persistProductImages()` en `vender.js` siempre sube las fotos DESPUÉS de insertar la fila
del producto, así que el id ya existe y ya es del vendedor correcto. Verificado con dos inserts
directos contra `storage.objects` simulando el JWT de un vendedor real (`set_config('request.jwt.claims', ...)`
+ `SET ROLE authenticated`, todo en transacciones con `ROLLBACK`): subir a la carpeta de un
producto ajeno se bloquea, subir a la carpeta del producto propio funciona.

**El resto revisado sin problemas**: `add_store_staff` (RPC) valida que quien llama sea dueño del
comercio antes de buscar el email e insertar -- no expone una policy de "buscar cualquier profile
por email". `coupons_insert_own_store`/`update`/`delete` exigen `store_id` no nulo y
`stores.owner_id = auth.uid()` -- **excluye a los empleados a propósito**, coincide con el diseño
documentado ("nada financiero" para `store_staff`, 49_store_staff.sql). El sistema de
`store_staff.permissions` (qué SECCIONES ve un empleado en el panel, migración 83) es
explícitamente solo de UI -- el propio archivo de esa migración ya documenta que la superficie de
ataque real son las policies de 49, que dan paridad operativa completa sin mirar `permissions`;
no hay nada que arreglar ahí, ya está razonado y anotado.

## 2026-09-22 — Auditoría de seguridad de `nav-utils.js` (sexto sector al azar): sin hallazgos

Sexto sector elegido al azar: `js/nav-utils.js` (954 líneas, se carga en casi todas las páginas --
navbar de categorías, mega-menú, buscador con autocompletado, campana de notificaciones, menú de
cuenta) + de paso `js/notifications-utils.js` (los links que arma cada notificación).

**Resultado: sin hallazgos.** Los tres `innerHTML` del archivo son siempre `= ''` (limpiar), nunca
interpolan nada -- el propio comentario de cabecera del archivo lo deja explícito ("Todo con DOM
API (anti-XSS): los datos de la DB nunca van por innerHTML"), y se confirmó leyendo el archivo
entero. El RPC `search_products` (51_search_products_rpc.sql) es `language sql` con el parámetro
`p_query` bindeado normal dentro de la consulta (nunca `EXECUTE`/SQL dinámico) -- no hay
inyección posible, y al ser `security invoker` hereda `products_select_public_active` (oculta
productos de comercios suspendidos) sin necesidad de repetir ese filtro a mano. Los links que
arma `notifications-utils.js` para cada tipo de notificación son siempre una ruta relativa fija
más un id propio pasado por `encodeURIComponent` -- no hay open redirect. `initAccountMenu()` lee
el rol de `user.app_metadata` (el que valida el JWT/RLS), nunca de `user_metadata` (que el propio
usuario puede editarse) -- la distinción correcta, ya aplicada en todo el proyecto.

Se descarta como auditado (no hace falta repetirlo en una futura sesión salvo que el archivo
cambie de forma sustancial).

## 2026-09-22 — Auditoría de seguridad de `comercio.js` (séptimo sector al azar): sin hallazgos

Séptimo sector elegido al azar: `js/comercio.js` (875 líneas, la página pública de un comercio --
header editable por el dueño, productos, favoritos, reseñas, mapa embebido) + de paso los caminos
de escritura de `js/reviews-utils.js` (`submitReview`/`deleteOwnReview`/`report_review`).

**Resultado: sin hallazgos.** El header editable (color, logo) que ve el dueño en su propia
página pública ya está bien resuelto: `isOwner` sale de `session.user.id === store.owner_id`
(comparación contra la sesión verificada, nunca `user_metadata`) y solo decide qué UI mostrar --
el `.update()` real sigue atrás de `stores_update_own` (RLS por `owner_id`), así que aunque
alguien manipulara el DOM para mostrarse el popover, el `UPDATE` seguiría rechazado para
cualquiera que no sea el dueño. El logo se sube a `store-logos/{owner_id}/...`, folder-scoped
igual que el resto de los buckets del proyecto. El mapa embebido arma el iframe con dominio fijo
(`google.com/maps`) y la dirección del comercio solo entra como query param con
`encodeURIComponent` -- sin SSRF ni framing a un origen ajeno. `submitReview`/`deleteOwnReview`
siempre mandan `client_id: session.user.id`, nunca un valor elegido por quien llama; `rating` está
acotado 1-5 por CHECK y `target_type` por una lista fija, los dos a nivel de columna, no solo en
el cliente. `report_review` (RPC) exige sesión y no expone nada que no debería. Confirmado que
`comercio.js` sí usa `getVisibleSocialLinks`/`safeExternalUrl` (el fix del 2026-09-16), no una
copia vieja. `storeId` sale de la URL pero solo se usa como filtro de un `.eq()` parametrizado,
nunca concatenado.

Se descarta como auditado.

## 2026-09-22 — Auditoría de seguridad de `product-modal.js` (octavo sector al azar): sin hallazgos

Octavo sector elegido al azar: `js/product-modal.js` (931 líneas, el modal de vista rápida de
producto que abren home/search/favoritos).

**Primera impresión que resultó falsa alarma:** a diferencia de casi todo el resto del proyecto
(DOM API, nunca `innerHTML` con datos), este archivo arma el modal entero con un template string
(`buildModalHTML()`) y lo mete con `overlay.innerHTML = ...` -- a simple vista, con
`data.name`/`data.shop`/`data.description` (título/nombre de tienda/descripción, **todos
cargados por el vendedor**) interpolados directo en el template, parecía un XSS persistente
servido a cualquier visitante que abriera el modal de ese producto. Se seteó a la fuente:
`fetchProductData()` (línea 86-106) pasa **los tres** por `escapeHTML()` antes de meterlos en el
objeto `data` (`name: escapeHTML(product.title...)`, igual con `description` y `shop`), así que
para cuando llegan a `buildModalHTML()` ya están saneados -- confirmado leyendo las dos funciones
juntas, no alcanza con mirar el template solo. El resto de los campos que sí van directo al
template son numéricos/calculados (`priceText`, `shippingText`, `stockInfo.text`) o pasan por
`encodeURI()` en contexto de URL (`imgSrc`, las miniaturas) -- correcto para ese contexto, y
`encodeURI` sí escapa comillas dobles, así que tampoco hay forma de romper el atributo `src`. Los
productos relacionados (`relatedHTML`) y las variantes (`variantsHTML`) usan `escapeHTML()`
explícito en el punto de armado. Ningún campo del carrito (`_getCart`/`_saveCart`, localStorage
del propio navegador) ni del `pm-reviews-container` (delega en `renderReviewsSection`, ya
auditado, DOM API pura) agrega superficie nueva.

Se descarta como auditado.

## 2026-09-22 — Auditoría de seguridad de `home.js` (noveno sector al azar): sin hallazgos

Noveno sector elegido al azar: `js/home.js` (808 líneas, la página de entrada del sitio -- la de
más tráfico de todas).

**Sin hallazgos.** `buildProductCard()` (la tarjeta de producto del grid) usa DOM API en serio --
`textContent` para el título, `setAttribute`/`.alt` para los atributos -- nada de template
strings acá, a diferencia de `product-modal.js`. El mapa de "comercios cerca tuyo"
(`initNearbyMap`) arma el iframe/link de Google Maps con `lat`/`lng` que salen siempre de
`navigator.geolocation.getCurrentPosition()` (números que da el navegador) o de un
`JSON.parse` sobre `sessionStorage` propio -- nunca de un valor cruzado entre usuarios ni de
texto libre. El botón "Panel" (`initPanelAction`/`renderPanelAction`) lee el rol de
`user.app_metadata` (el que valida el JWT), reutilizando `getPanelAccess()` ya auditado en
`auth-utils.js`. El carrusel de comercios (`loadStores`) usa `store.id` sin `encodeURIComponent`
en el `href` -- inconsistente con el resto del sitio, pero `store.id` es un UUID generado por la
base, no texto libre, así que no hay superficie real ahí.

Se descarta como auditado.

## 2026-09-22 — Auditoría de seguridad "por áreas" (no al azar): pago simulado sin restricción de rol

Pedido del usuario después de nueve rondas de sectores al azar: dividir lo que quedaba del
proyecto en áreas y cubrirlas de manera sistemática en vez de una por sesión. Áreas cubiertas en
esta pasada: el resto de las páginas públicas sin auditar (`search.js`, `comercios.js`,
`producto.js`), los módulos compartidos más chicos (`panel-redirect-utils.js`,
`payment-providers.js`, `storage-utils.js`), y de ahí salió una revisión a fondo de los dos RPCs
de pago simulado.

**`search.js`/`comercios.js`/`producto.js`: sin hallazgos.** Las tres arman sus tarjetas con DOM
API (`textContent`/`setAttribute`), `search_products` ya estaba auditado (parametrizado, sin SQL
dinámico), y `stock_alerts` (el "avisame cuando vuelva el stock" de `producto.js`, tabla que no se
había tocado en ninguna auditoría anterior) tiene RLS limpia: el cliente inserta/borra su propia
alerta pero **no tiene policy de UPDATE** -- `notified_at` solo lo escribe el trigger
`notify_stock_alerts()` (`SECURITY DEFINER`), así que nadie puede marcarse a sí mismo como "ya
avisado" para lo que sea que eso habilitara. `panel-redirect-utils.js` y `storage-utils.js`
también sin hallazgos (el primero es una preferencia booleana sin superficie real; el segundo ya
tenía tests con filo desde antes, incluida la guarda contra `..` en el path).

**Encontrado y arreglado, severidad CRÍTICA** (`db/schema/101_restrict_simulated_payment_to_admin.sql`,
aplicada en producción): el método de pago `'simulado'` -- documentado en CLAUDE.md como "solo
para testing interno" y sacado del checkout real hace tiempo (P1-1, `js/carrito.js` nunca manda
ese valor) -- **seguía totalmente operativo del lado del servidor sin ningún chequeo de rol**.
`create_order()` aceptaba `p_payment_method: 'simulado'` de cualquier usuario autenticado (no solo
del checkout, de un `supabase.rpc()` directo salteándose la UI), y `confirm_simulated_payment()`
solo validaba que la orden fuera del que llama, nunca el rol. Combinadas: **cualquier cliente
podía comprar productos reales de un comercio real (gogo, facu.cells) y marcarlos pagados sin
pagar un peso** -- el pedido le queda al vendedor con `payment_status = 'paid'` como cualquier
venta legítima. Confirmado contra la base real antes de tocar nada
(`information_schema.routine_privileges`: `authenticated` tiene `EXECUTE` en las dos funciones,
ninguna valida `app_metadata.role`).

Fix: las dos funciones ahora exigen rol `admin` para usar/confirmar un pago simulado -- mismo
patrón que `admin_set_product_active`/`add_store_staff`. El resto de cada función queda
**idéntico** (se copió la definición viva con `pg_get_functiondef` antes de escribir la migración,
para no reinventar el cuerpo de memoria y arriesgar un cambio de comportamiento no intencional).
Verificado con tres pruebas en transacciones con `ROLLBACK` contra la base real, simulando el JWT
con `set_config('request.jwt.claims', ...)`: un cliente común queda bloqueado al intentar
`create_order(..., 'simulado', ...)`, ese mismo cliente sigue pudiendo comprar con
`'mercadopago'` sin ningún cambio (cero regresión), y una cuenta admin puede seguir creando y
confirmando una orden simulada de punta a punta (el uso interno legítimo sigue andando). Es,
de las auditorías de esta sesión, el hallazgo de mayor impacto real: a diferencia de los demás
(que requerían un rol delegado, un empleado, o ya estaban mitigados por otra capa), este lo podía
explotar **cualquier cliente común contra cualquier vendedor real**, hoy, sin necesitar ningún
permiso especial.

## 2026-09-22 — Auditoría de seguridad del sistema de favoritos (décimo sector al azar): sin hallazgos

Décimo sector elegido al azar: `favorites`/`favorite_stores` (tablas) + `getFavoriteIds`/
`toggleFavorite`/`getFavoriteStoreIds`/`toggleFavoriteStore`/`mergeLocalWishlistIntoFavorites`/
`initWishlist` en `js/cart-utils.js` -- se usa en home/search/comercio/producto/comercios/perfil
pero nunca se había auditado directo su RLS.

**Sin hallazgos.** Las dos tablas son idénticas en diseño: `user_id`/`client_id` +
`product_id`/`store_id`, sin columna que valga la pena restringir por rol (nada de estado ni
plata), tres policies (`select`/`insert`/`delete`, todas `= auth.uid()`) sin `update` porque no
hay nada que actualizar -- un favorito se agrega o se borra, no se edita. Confirmado que coinciden
con la base real (`pg_policy`, sin drift). El `productId`/`storeId` que viaja desde el cliente
siempre sale del `id` de una tarjeta ya renderizada con datos reales de la DB (nunca de un input
de texto), y aunque no fuera así el `foreign key` a `products`/`stores` corta cualquier intento de
favoritear algo que no existe -- no hay ganancia real en falsificar el id de todos modos, es un
bookmark personal, no un permiso. `mergeLocalWishlistIntoFavorites()` (el merge de favoritos de
invitado al loguearse) siempre usa `session.user.id`, nunca un id pasado desde otro lado.

Se descarta como auditado.

## 2026-09-22 — Auditoría de seguridad de cupones y empleados de comercio (undécimo sector al azar): sin hallazgos

Sector elegido al azar: la tabla `coupons` (con su uso en `js/vender.js`/`js/admin.js`/
`create_order()`) y la tabla `store_staff` (con el RPC `add_store_staff`) -- dos piezas
financieras/de-acceso del panel de vendedor que no se habían auditado directo contra la base real
en ninguna de las rondas anteriores.

**`coupons`: sin hallazgos.** Seis policies verificadas contra `pg_policy` real: `coupons_all_admin`
(admin sin restricción, consistente con el resto del proyecto), `coupons_select_public` (solo
`store_id is null and is_active and no vencido`, así un vendedor no puede fabricar un cupón
"público" -- el insert exige `store_id not null`), y las tres de dueño (`select`/`insert`/
`update`/`delete`) todas con el mismo `exists (select 1 from stores where owner_id = auth.uid())`
sobre el `store_id`, con `with_check` en el `update` que impide reasignar el cupón a una tienda
ajena. Constraints de tabla ya cubren lo que la RLS no necesita cubrir:
`discount_percentage` acotado 1-100 (`check`) y `code` con `unique` global -- este último de
paso descarta la duda inicial de la auditoría ("¿puede un vendedor crear un cupón con el mismo
código que uno público o de otro comercio, para que `create_order`, que hace un `select into` sin
`strict`, se equivoque de fila?"): con `code` único no puede existir esa colisión, es
estructuralmente imposible. El cliente (`vender.js`/`admin.js`) solo usa `textContent` para pintar
el código del cupón (sin `innerHTML`), y siempre manda `store_id: currentStoreId` confiando en que
la RLS lo valide, nunca al revés. `store_staff` ya excluye a los empleados de gestionar cupones a
propósito (documentado en su propia migración, confirmado de nuevo acá).

**`store_staff`: sin hallazgos.** No tiene policy de `insert` para `authenticated` -- la única vía
es el RPC `add_store_staff` (`SECURITY DEFINER`), que valida que quien llama es dueño de
`p_store_id`, que el email pertenece a una cuenta ya registrada y que no sea el propio dueño.
`store_staff_update_owner`/`store_staff_delete_owner` están acotadas por `store_id` propio en
`qual` **y** `with_check`, así que un dueño no puede tocar la fila de empleado de un comercio
ajeno. Único detalle sin restricción de columna: el dueño puede reescribir `user_id` de una fila
de `store_staff` existente de su propio comercio a cualquier uuid (sin pasar de nuevo por las
validaciones de `add_store_staff` -- email registrado, no soy yo mismo). Evaluado y descartado
como hallazgo: el alcance queda acotado a filas del propio comercio del dueño (no se puede tocar
la de otro), y lo peor que logra es agregar a alguien como "empleado" de su propia tienda sin
pasar por la validación de email -- no hay tercero perjudicado ni gano nada que el dueño no
tuviera ya sobre su propio comercio.

Se descarta como auditado.

## 2026-09-22 — La etiqueta de rubro de "Comercios" no era la que elige el dueño

Reportado por el usuario con capturas: en su panel el comercio *Beruru* tiene marcado el chip
**Ropa**, y en la página "Comercios" la tarjeta seguía diciendo **Tecnología**.

### Qué pasaba

`js/comercios.js` **nunca leía `stores.category_slug`** -- la columna que guarda "Perfil de mi
comercio → Categoría" (migración 71, y que `js/vender.js` escribe bien). En su lugar pedía
`products(categories(name))` y mostraba la categoría **más repetida entre los productos** del
comercio. O sea que la etiqueta no dependía del panel en absoluto: cambiar el chip no la movía
nunca.

Confirmado contra la base de producción antes de tocar nada:

| Comercio | `category_slug` (panel) | Categorías de sus productos |
|---|---|---|
| Beruru | `ropa` | Tecnología ×6, Lácteos ×1, Limpieza ×1, Ropa ×1, Verdulería ×1 |

6 contra 1: por eso ganaba "Tecnología".

### El arreglo, y la trampa que tenía

Lo obvio era reemplazar el conteo por `category_slug`. **Eso solo habría roto 14 tarjetas**: la
misma consulta mostró que de los 17 comercios aprobados, **14 tienen `category_slug` en NULL**.
Son las tiendas de seed (F11-06): se insertaron a mano, nunca pasaron por
`approve_seller_request` (que es quien copia el rubro desde la solicitud), y el backfill que trae
la propia migración 71 no las alcanza porque busca por `seller_requests` y ellas no tienen. Hoy
muestran etiqueta *gracias* al conteo por productos.

Así que el conteo se conservó **como respaldo, solo para `category_slug` NULL**
(`fallbackCategoryFromProducts()`). Se arreglan solas en cuanto su dueño guarde el perfil una vez:
el formulario exige elegir categoría. No se backfilleó la base a propósito -- son datos de seed
destinados a ser reemplazados por comercios reales, no vale una migración de datos en producción.

`buildStoreCard()` (`js/cart-utils.js`) pasó de `store._topCategory` ("el rubro más común de sus
productos") a `store._categoryName`, que es lo que ahora significa de verdad.

### Lo que se revisó y estaba bien

- **La ficha del comercio** (`comercio.html` / `js/comercio.js`) ya leía `store.category_slug` y
  lo resolvía con `getCategories()`. Ahí el cambio del panel siempre se vio bien.
- **Resultados de búsqueda** (`search.js`): usa la misma `buildStoreCard` pero no setea el rubro,
  así que la tarjeta sale sin etiqueta. No es el bug reportado (no muestra una vieja, no muestra
  ninguna) y se dejó igual para no meter un cambio visual que nadie pidió. Si algún día se quiere,
  alcanza con sumar `category_slug` al select de `getStores()` y resolverlo igual que acá.
- **El carrusel del home** muestra solo el logo, sin rubro.
- No hay caché de datos en el medio: `sw.js` cachea JS/CSS, no las respuestas de Supabase.

### Verificación

6 checks en Chromium contra el build real, con PostgREST interceptado y **los datos reales de
producción** como fixture (Beruru con su `ropa` + sus 6 productos de Tecnología, una tienda de seed
con `category_slug` NULL, una tienda con rubro y sin productos, y una sin nada). Cubren el bug
reportado, la no-regresión de las 14 de seed y los dos bordes. `npm test` en verde, `dist/`
reconstruido.

## 2026-09-22 — Opciones de producto (color / sabor / talle) de punta a punta — migración 102

Pedido del usuario: "cuando alguien vende la misma prenda en distintos colores… distintos sabores
para budines, salsas, todo eso… y que el cliente pueda elegir cuál quiere antes de comprar".

### Las tres decisiones que definieron el tamaño del trabajo

Se preguntaron **antes** de escribir código, porque cada una cambia el modelo de datos:

1. **Stock por opción, o del producto?** → del producto. El vendedor marca una opción como
   agotada a mano. **Consecuencia central: no hay tabla de variantes ni de combinaciones.** Una
   remera con 3 colores y 4 talles son 7 filas de valores, no 12 de combinaciones — y el
   comerciante no tiene que mantener 12 stocks.
2. **Un grupo o varios?** → varios (Color + Talle a la vez). De ahí que sean dos tablas
   (`product_options` / `product_option_values`) y no un array en `products`.
3. **La opción cambia el precio?** → no. Si algún día cambia, el lugar es una columna en
   `product_option_values` **más** `create_order` **más** `js/cart-totals.js`, que fija la
   aritmética contra ese mismo RPC con tests.

### Lo que ya existía y estaba muerto: F5-03

Apareció recién al abrir `js/vender.js`: había un manager de **"variantes"** (`product_variants`,
migración 13) con nombre + precio + stock por variante, el vendedor las podía cargar… y el cliente
solo veía una lista informativa con **"Para pedir una opción específica, consultá con el
vendedor."**. Nunca tocó el carrito.

`select count(*) from product_variants` en producción: **0**. Nadie la usó nunca, así que no hubo
datos que migrar. Se reemplazó el frontend entero (editor del vendedor, bloque del modal y bloque
de la ficha) y **la tabla se dejó en la base sin uso**, mismo criterio que las de `repartidor`.
Ningún archivo de `js/` la lee ya.

### Seguridad: el carrito manda ids, no texto

El payload de `create_order` por ítem pasó de `{id, qty}` a `{id, qty, options: [uuid…]}`, donde
los uuid son de `product_option_values`. **Ids y no texto a propósito**: con texto, un cliente
podía mandar `"Color: el que quiera"` y al vendedor le entraba un pedido de algo que no vende. El
nombre legible lo arma el RPC leyendo la base, exactamente el mismo criterio que ya se usaba con
el precio.

El RPC valida que la selección (a) cubra **todos** los grupos del producto, (b) use valores de
**ese** producto y (c) marcados disponibles. Las dos comparaciones de cantidad
(`count(distinct po.id) = v_group_count` **y** `array_length(v_opt_ids,1) = v_group_count`) son
las que cierran los huecos sutiles: mandar dos valores del mismo grupo, y mandar ids de relleno
además de los correctos.

`order_items.selected_options` guarda un **snapshot de texto** (`[{"option":"Color","value":"Rojo"}]`),
no foreign keys: el vendedor puede renombrar "Rojo" a "Bordó" o borrar el grupo, y un pedido de
hace tres meses tiene que seguir diciendo qué se despachó. Mismo criterio que `order_items.title`.

### Dos bugs que destapó la feature (los dos reales, los dos verificados en el navegador)

1. **`mergeCarts` fusionaba las líneas.** La sincronización del carrito con la nube
   (`user_carts`) agrupaba por `item.id`, así que la misma remera en rojo y en azul se fusionaba
   en **una sola línea, con la cantidad sumada y el color de la última**. O sea: el cliente
   terminaba comprando dos veces el mismo color sin haberlo pedido. Lo cazó el test de punta a
   punta comparando el payload exacto que recibe el RPC — el carrito en pantalla se veía bien.
   Ahora agrupa por `itemLineKey()`.
2. **`validateCartFreshness` recortaba el stock por línea, no por producto.** Con dos líneas de
   la misma remera, cada una se recortaba contra el stock **completo**, así que pasaban las dos y
   `create_order` (que sí agrupa por `product_id`) rechazaba el checkout entero con un error
   genérico. Ahora lleva un `stockLeft` por producto. **Era un bug preexistente**, solo que sin
   opciones era casi imposible tener dos líneas del mismo producto.

### Detalles de implementación que no son obvios

- **El botón rápido de "agregar" de una tarjeta** no puede agregar a ciegas un producto con
  opciones: abre el modal. Saber qué productos tienen opciones se resuelve con **una consulta por
  render** (no una por click, que se notaría) y **desde `cart-utils.js`, no desde el `select` de
  cada página**: los resultados de búsqueda salen del RPC `search_products`, con columnas fijas,
  y habría que tocar la base para sumarle el dato. Así las tres grillas quedan cubiertas con el
  mismo código. El handler hace `await` de esa consulta antes de decidir, para que un click en los
  primeros milisegundos no agregue una línea sin opciones.
- **Los chips arrancan sin marcar.** Preseleccionar el primero es lo cómodo de programar y lo peor
  para el vendedor: el cliente que no miró se lleva un pedido del color equivocado y la culpa
  parece del comercio.
- **"Comprar ahora" del modal es un segundo camino al carrito** y se olvida fácil — apareció
  barriendo `item.id ===` al final. Tiene la misma validación que "Agregar al carrito".
- **El CSS de los chips vive en `home.css`, no en `product-modal.css`**, aunque las clases se
  llamen `pm-option*`: `producto.html` **no carga** `product-modal.css` (verificado), y los chips
  también se usan ahí. `home.css` la cargan las cuatro páginas donde se puede comprar. Es
  exactamente la clase de bug del caso `tkt-*` del 2026-09-16.
- **El vendedor todavía no tiene vista de detalle del pedido** (el botón dice "llega pronto"), así
  que la fila de Pedidos es el único lugar donde ve qué le pidieron. Por eso esa celda pasó de
  "N productos" a listar los ítems con su opción (hasta 3, después un conteo): sin eso no puede
  saber de qué color despachar y la feature no le sirve.

### Verificación

- **RPC contra la base real**, en transacciones con ROLLBACK: rechaza sin elegir, con un grupo
  faltante, con dos valores del mismo grupo y con una opción agotada; acepta la selección válida y
  guarda el snapshot correcto. **Sin regresión**: un producto sin opciones se compra exactamente
  igual (mismo total, mismo descuento de stock, `selected_options` NULL) y el bloqueo del pago
  simulado de la migración 101 sigue en pie.
- **9 checks de Playwright** sobre el build real con PostgREST interceptado: los dos grupos en la
  ficha, el chip agotado deshabilitado, ningún chip preseleccionado, no agrega sin elegir y avisa
  qué falta, agrega con la elección, dos colores = dos líneas, el carrito las distingue, y **el
  payload exacto que recibe `create_order`**.
- `node js/product-options-utils.test.mjs`: 24 asserts. `npm test` en verde, `dist/` reconstruido.

**Gotcha del harness, otra vez:** Playwright resuelve las rutas de `context.route` **de la última
registrada a la primera**. La ruta de `/rest/v1/rpc/` tiene que registrarse **después** de la
genérica de `/rest/v1/`, si no la genérica se la come y el test dice "no se llamó a create_order"
cuando en realidad sí se llamó.

### Agregado el mismo día: selector "Un solo producto" / "Variantes de un mismo producto"

Pedido del usuario después de ver la feature armada: que el formulario de publicación empiece
preguntando qué se va a publicar, con dos opciones y un círculo al lado, para que **quien sube un
producto simple no tenga que ver ni entender nada de opciones**.

- "Un solo producto" — *Subir fotos de un solo producto.*
- "Variantes de un mismo producto" — *Subir fotos de un solo producto con sus respectivas
  variantes (distintos colores, sabores, etc.).*

**El modo no se guarda en la base.** El dato real es si el producto tiene filas en
`product_options`; al abrir un producto para editar, el modo se deduce de ahí. Guardar un campo
aparte sería un segundo lugar donde la verdad puede desincronizarse.

Dos decisiones que no son obvias:

1. **Volver a "Un solo producto" con opciones ya cargadas las borra**, con un `confirm` antes. Solo
   esconder el bloque dejaría un producto "simple" que igual le pide al cliente elegir un color, y
   el vendedor no tendría forma de ver por qué. Los pedidos ya hechos no se tocan (el snapshot vive
   en `order_items.selected_options`).
2. **Un alta nueva en modo Variantes no cierra el formulario al guardar.** Las opciones se guardan
   contra el `product_id`, que recién existe después del primer insert; cerrar ahí obligaría a
   volver a entrar a editar el producto para cargar los colores, que es justo lo que la persona
   vino a hacer. El form queda abierto en modo edición, con el editor de opciones ya renderizado y
   scrolleado. Mientras el producto no existe, el bloque muestra un aviso
   ("Guardá el producto y vas a poder cargar acá mismo…") en vez del editor.

7 checks de Playwright sobre el panel real (sesión de vendedor mockeada): arranca en "Un solo
producto", los dos textos son los pedidos, el bloque de opciones no se ve, al elegir Variantes
aparece con el aviso de guardar primero y sin editor, y al volver atrás desaparece.

**Gotcha del harness:** el panel abre un onboarding a pantalla completa la primera vez
(`js/panel-onboarding-utils.js`) que tapa el formulario en las capturas — hay que cerrarlo
("Entendido, ir a mi panel"). Y el sidebar cambia de sección con su propio handler: para llegar al
formulario en un test conviene revelar la sección de Publicaciones a mano.

## 2026-09-23 — Sidebar del vendedor: "Pedidos" y "Ventas" eran la misma sección

Reportado por el usuario con captura: en el grupo "Ventas" del sidebar había dos entradas que
llevaban al mismo lado.

En el HTML las dos tenían `data-section="pedidos"` y solo cambiaba `data-pedidos-tab`
(`all` en "Pedidos", `completed` en "Ventas"). O sea que "Ventas" era un atajo a una pestaña de
Pedidos, no una sección propia — y la pestaña **"Completados" ya está adentro** de la sección junto
a Todos / Pendientes de pago / Envíos en curso / Cancelados, así que sacar el atajo no quita
ninguna función.

**El detalle que había que mirar antes de borrar:** `setPedidosTab()` tenía esta línea

```js
document.querySelectorAll('.mc-navitem[data-section="pedidos"]')
  .forEach((btn) => btn.classList.toggle('is-active', btn.dataset.pedidosTab === tab));
```

que existía **solo** para desempatar cuál de las dos entradas se resaltaba. Con una sola entrada
pasaba a ser un bug: al mirar cualquier pestaña que no fuera "Todos", `dataset.pedidosTab` no
coincidía y **apagaba el resaltado de "Pedidos"**, dejando el sidebar sin ninguna sección marcada.
Se borró: el resaltado ya lo maneja el shell por `data-section` (`js/vender-shell.js`).

El click en la entrada del sidebar ahora siempre resetea a "Todos" — si quedara filtrada de la
visita anterior, volver a entrar y ver menos pedidos de los que hay parece que faltan.

Revisado sin cambios necesarios: la tarjeta "Ventas para calificar" del Resumen navega con
`{section:'pedidos', tab:'completed'}` y sigue funcionando; los permisos por empleado
(`STAFF_PERMISSION_SECTIONS`) van por la clave `pedidos`, no por botón del sidebar.

6 checks de Playwright sobre el panel real: la lista del grupo queda en 7 entradas sin la
duplicada, hay un solo `.mc-navitem[data-section="pedidos"]`, al entrar se marca y arranca en
"Todos", la pestaña "Completados" sigue estando, y al pararse en ella el sidebar **sigue**
marcando Pedidos (que es justo lo que antes se rompía).

## 2026-09-23 — Estados vacíos del panel de profesional: el texto de ayuda salía descentrado

Reportado con captura sobre "Servicios y precios": el ícono y el título centrados, y el párrafo de
abajo corrido.

**Causa:** `.of-sub` es la clase de subtítulo del panel y trae `max-width: 60ch` (para no hacer
renglones larguísimos en los subtítulos de sección, donde va alineada a la izquierda) con
`margin: 0`. Dentro de `.of-empty`, que es `text-align: center`, eso centra el texto **dentro** de
la caja del párrafo, pero la caja —más angosta que el bloque por el `max-width`— queda pegada a la
izquierda.

Medido en el navegador antes del fix, con el desvío del centro de cada `<p>` respecto del centro
del bloque: título **0px**, párrafo de ayuda **-175px**.

**Fix:** `.of-empty .of-sub { margin-inline: auto; }`, más `margin-block: 0` en los `<p>` del
bloque y un `margin-top` explícito entre ellos (los márgenes default de `<p>` dejaban el bloque
flojo). La regla va **scopeada a `.of-empty`** a propósito: `.of-sub` fuera de un estado vacío es
un subtítulo de sección y tiene que seguir alineado a la izquierda.

Afectaba a los **cinco** estados vacíos del panel, no solo al reportado: servicios, fotos de
trabajos, consultas, reseñas y estadísticas — todos arman el mismo `div.of-empty` con ícono +
`<p>` + `<p class="of-sub">`. Los cinco quedaron en 0px.

Revisado y **sin el mismo problema**: el panel de vendedor (`.pub-empty__sub` no lleva
`max-width`, así que ocupa todo el ancho y el `text-align: center` alcanza).

**Gotcha del harness:** cada sección del panel carga su contenido recién cuando el shell la muestra
(`ctx.alMostrar`), así que en un test no alcanza con sacarle el `hidden` a la sección — hay que
hacer click en el `.mc-navitem` de verdad o el contenedor queda vacío.

## 2026-09-23 — Font Awesome dejó de depender del CDN de cdnjs (se autoalojó)

Pedido inicial: "agregá los íconos al panel de administrador". Primera pasada (agregó íconos
faltantes a botones de fila que no los tenían — activar/desactivar, ver detalle, etc., todos en
`js/admin.js`) se mergeó a `main`, pero el usuario reportó después: **"en admin.html están solo
cuadrados y no se ven los íconos en todo el panel"** — no solo los nuevos, ninguno (ni el logo del
sidebar, ni Refrescar, ni Aprobar/Rechazar, que ya andaban antes de esta sesión).

**Diagnóstico:** cuadrados vacíos (tofu boxes) en vez del glyph es la firma clásica de que el CSS
del ícono cargó bien (el contenido Unicode de `::before` se aplica) pero el archivo de fuente
(`.woff2`) no. Se investigó y descartó la hipótesis más obvia primero: `.admin-shell, .admin-shell
* { font-family: var(--bl-font); }` en `admin.css` (pensada para pisar el `* { font-family:
Segoe UI... }` de `auth.css`) por accidente también apunta a los `<i class="fa-solid ...">` —
pero probado con Playwright local contra los archivos reales del repo (sirviendo Font Awesome
real vía `npm install @fortawesome/fontawesome-free@6.5.2` en un server local, sin tocar el CDN),
la cascada resuelve bien: el `<link>` de Font Awesome es el último en el `<head>`, mismo
specificity (0,1,0) que `.admin-shell *`, gana por orden de aparición — `getComputedStyle` daba
`font-family: "Font Awesome 6 Free"` correcto y el ícono se veía perfecto. La regla de `admin.css`
**no es el bug** (aunque sigue siendo una trampa latente si algún día alguien le agrega
`!important` a algo, o si Font Awesome deja de declarar su propio `font-family` sin `!important`
— quedó documentado acá por si alguna vez hay que revisarla de nuevo).

Con el código descartado como causa, quedó el CDN externo (`https://cdnjs.cloudflare.com/ajax/
libs/font-awesome/6.5.2/css/all.min.css`, con `integrity` + `crossorigin="anonymous"`) como único
sospechoso restante: si el `.woff2` no llega (bloqueado por la red del usuario, un adblocker que
filtra cdnjs, un intermediario corporativo, lo que sea) el CSS igual carga bien -- por eso el
cuadrado se dibuja -- pero la fuente no, y el navegador cae al glyph de "no encontrado". No se
pudo confirmar la causa exacta del lado del usuario (esta sesión no tiene salida de red hacia
`cdnjs.cloudflare.com` para reproducirlo tal cual), pero un CDN externo de terceros como único
punto de falla para **todo ícono del sitio entero** (Font Awesome se usa en las 19 páginas, no
solo admin) es en sí mismo un riesgo a sacarse de encima, más viniendo de un proyecto que ya
versiona `dist/` completo y prioriza no depender de infraestructura de terceros en runtime.

**Fix:** autoalojar Font Awesome 6.5.2 (misma versión que ya estaba pineada) en
`public/vendor/fontawesome/` (`css/all.min.css` + los 8 archivos de `webfonts/` -- solid, regular,
brands, v4compatibility, en woff2 y ttf -- copiados desde el paquete oficial
`@fortawesome/fontawesome-free`, ~1.1MB total). Las 19 páginas que usan íconos pasan de
`<link href="https://cdnjs.cloudflare.com/...">` con `integrity`/`crossorigin` a
`<link href="/vendor/fontawesome/css/all.min.css">` sin depender de red externa; `index.html` no
usa íconos, solo se le tocó el CSP. De paso, la CSP de las 20 páginas se pudo achicar: `cdnjs.
cloudflare.com` no se usaba para nada más que esto, así que salió de `style-src` y `font-src` en
las 20 (`fonts.googleapis.com`/`fonts.gstatic.com`, que son de Google Fonts para Inter, quedan
igual). Verificado con Playwright local (server real de `vite`, sin red externa): `getComputedStyle`
de un ícono del sidebar de admin da `font-family: "Font Awesome 6 Free"`, `font-weight: 900`, sin
ningún request fallido a `/vendor/fontawesome/*`. `dist/vendor/fontawesome/` se genera solo (Vite
copia `public/` tal cual). No se agregó `@fortawesome/fontawesome-free` como dependencia de
`package.json` -- los archivos se copiaron una vez a mano, no hay paso de build que los regenere;
si en el futuro hay que actualizar la versión, hay que repetir la copia manual (`npm install
@fortawesome/fontawesome-free@<version>` en un scratch dir, copiar `css/all.min.css` +
`webfonts/*.woff2`/`*.ttf` a `public/vendor/fontawesome/`).

# Accesibilidad — TalkBack y lectores de pantalla

> Rama `feature/accesibilidad-talkback`. Primera pasada: **estructura y anuncios**.
> El objetivo declarado es que la app se pueda usar con **TalkBack** (el lector de pantalla de
> Android), que es como la va a usar una persona ciega en Baradero — no un checklist abstracto
> de WCAG.

---

## Qué se hizo

### 1. `Assets/styles/a11y.css` — base compartida por las 16 páginas

Archivo nuevo, cargado antes de las hojas específicas de cada página. Contiene:

- **`.sr-only`** — texto que solo lee el lector de pantalla.
- **`.skip-link`** — estilos del "Saltar al contenido principal".
- **Foco visible** con `:focus-visible` (no `:focus`), para que el anillo aparezca al navegar
  por teclado o con TalkBack, pero no al tocar con el dedo.
- **Blanco táctil de 44×44** en los botones circulares del navbar y el corazón de favoritos,
  vía pseudo-elemento: agranda el área tocable sin cambiar el tamaño visual (WCAG 2.5.5).
- **`prefers-reduced-motion`** respetado.

**Bug que motivó el archivo:** `.sr-only` estaba definida **únicamente en `auth.css`**, pero la
usaban `home.html`, `comercios.html` y `search.html`, que no cargan esa hoja. Resultado: esos
textos "invisibles" se veían en pantalla. La definición de `auth.css` se dejó donde estaba (es
idéntica, no rompe nada).

### 2. Skip link en las 16 páginas

Primer elemento enfocable de cada página. Sin esto, TalkBack obliga a recorrer navbar +
buscador + barra de categorías —más de 20 pasos— **en cada página** antes de llegar al
contenido. Es la mejora que más tiempo ahorra de toda la tanda.

El destino es el `<main>` real, con **`tabindex="-1"`**. Ese atributo no es opcional: sin él el
navegador scrollea pero **no mueve el foco**, y TalkBack sigue leyendo desde donde estaba.

> **Ojo con `#main-content`:** en varias páginas ese id envuelve *también* al navbar (lo usa
> `guardPage` para ocultar/mostrar mientras verifica la sesión). Por eso el destino del skip
> link es `#contenido-principal` sobre el `<main>`, no `#main-content`. La excepción es
> `comercio.html`, donde el id ya estaba sobre el `<main>` y se reusó tal cual.

### 3. Un `<h1>` por página, en las 16

TalkBack usa los encabezados como índice para saltar por la pantalla. El estado previo era:

- **6 páginas sin ningún `<h1>`**: `comercio`, `comercios`, `login`, `perfil`, `producto`, `search`.
- **`vender.html` con 8** y **`repartidor.html` con 3** — un `h1` por sección.

Se resolvió así:
- Donde ya había un `<h2>` que era el título real de la pantalla (`comercios`, `search`), se
  promovió a `<h1>`.
- Donde el título vive solo en el `<title>` (`login`, `perfil`), se agregó un `<h1 class="sr-only">`.
- En `producto` y `comercio` el título depende de datos que llegan por fetch: el `<h1>` arranca
  como "Cargando…" y lo completa el JS junto a `document.title`.
- En `vender` y `repartidor`, los títulos de sección bajaron a `<h2>` —que es lo que son— y cada
  página quedó con un `<h1>` invisible que la nombra.

### 4. Contexto en los botones generados por JS

En una grilla de 12 productos, TalkBack leía **"Agregar, botón"** doce veces seguidas sin decir
de qué producto. El nombre visible alcanza para quien ve la tarjeta; el lector anuncia el botón
aislado.

Ahora (`js/home.js`, `js/search.js`):
- `Agregar Yerba Mate "La Vuelta" 500g al carrito`
- `Agregar Yerba Mate "La Vuelta" 500g a favoritos`
- `Yerba Mate "La Vuelta" 500g sin stock` cuando corresponde

### 5. Anuncio de resultados

El contador de resultados (`search.html`, `comercios.html`) lleva `role="status"` +
`aria-live="polite"`. Al cambiar un filtro, TalkBack anuncia "57 resultados" sin interrumpir lo
que se esté leyendo. Antes la lista se actualizaba en silencio y no había forma de saber que
había pasado algo.

---

## Verificado

- `npm run build` con exit code 0.
- Las 16 páginas: skip link presente, `a11y.css` cargado, exactamente un `<h1>`, `<main>` con
  `tabindex="-1"`.
- En el navegador: **el skip link mueve el foco al `<main>`** (`document.activeElement` pasa a
  ser el `<main>` tras el click), el `<h1>` de `search.html` es "Todos los productos", el
  contador anuncia "57 resultados" con `role="status"`, y los botones traen el nombre del
  producto.
- Consola sin errores nuevos (el de Vercel Speed Insights bloqueado por CSP es preexistente en
  todas las páginas).

### Segunda pasada — formularios y verificación (misma rama)

**Campos de formulario: 0 sin nombre accesible.** La primera estimación decía "~54 por revisar";
era un grep tosco que contaba también los que ya tenían `<label for>`. El número real de campos
rotos era **9**, y una auditoría más fina —que contempla el *label implícito*, es decir el input
anidado dentro de un `<label>`— confirmó que los radios y checkboxes del carrito y del perfil
**ya estaban bien**. Los 9 reales (cupón, dirección de entrega, selector de direcciones, los dos
buscadores del navbar en `comercio`/`producto`, filtro de favoritos, los dos buscadores de
`vender` y el input de fotos) recibieron `aria-label`.

> El `placeholder` **no** es un nombre accesible: desaparece al escribir y los lectores no lo
> anuncian de forma confiable. Por eso no alcanzaba con que lo tuvieran.

**Los modales ya estaban resueltos.** La primera versión de este documento los listaba como
pendientes; era incorrecto. `js/product-modal.js` ya trae `role="dialog"`, `aria-modal="true"`,
`aria-label` con el nombre del producto, trampa de foco con Tab/Shift+Tab, restauración del foco
al elemento que lo abrió, y cierre con Escape.

**El skip link quedó verificado end-to-end.** Con un Tab real en el navegador: es el primer
elemento que recibe foco, matchea `:focus`, y se dibuja arriba de todo (top 0, 44px de alto,
258 de ancho). Al activarlo, el foco viaja al `<main>`.

> Detalle que costó un rato: leer `getComputedStyle().top` justo después de enfocar devuelve
> `-100px`, porque agarra la transición de 150ms a mitad de camino. Parece un bug y no lo es.
> Para verificarlo hay que anular la transición o leer después de que termine.

---

### Tercera pasada (2026-11-17) — páginas faltantes, íconos, foco y pruebas

- **`contratar`, `farmacias` y `servicios` no tenían nada de lo anterior** (ni `a11y.css`, ni skip
  link, ni `<main>` enfocable; con `.sr-only` sin definir). Ahora cargan `a11y.css`, tienen el skip
  link y `<main id="contenido-principal" tabindex="-1">`. Las 21 páginas quedan iguales.
- **161 íconos de Font Awesome decorativos** (HTML y plantillas de JS) llevan `aria-hidden="true"`,
  para que ningún lector lea el glifo. Los que tienen `aria-label`, `title` o `role` se dejaron.
- **Foco visible:** se sacó `outline: none` de la fila del comparador (`.bl-compare__row`) y de las
  zonas de subida de `vender.html`, que solo cambiaban de color de fondo o borde. En `contratar`, el
  input de fecha invisible ahora dibuja el anillo en su chip (`:focus-within`). Los campos de
  texto que reemplazan el anillo por borde + sombra se dejaron.
- **Errores de formulario:** los avisos de error ya se anuncian solos (`js/notice.js` usa
  `role="alert"` para errores). Faltaba marcar el campo: `markInvalid()` (`js/auth-utils.js`) pone
  `aria-invalid="true"`, mueve el foco y lo saca al escribir; lo usan `login.js` y `register.js`.
- **Pruebas nuevas** (corren con `npm test` y `npm run test:e2e`):
  - `js/a11y-paginas.test.mjs`: en cada página de `pages/`, `lang`, `a11y.css`, skip link con
    destino existente y enfocable, `<h1>`, sin `<img>` sin `alt` y sin íconos sin `aria-hidden`.
  - `e2e/humo.spec.mjs`: en 9 páginas públicas, con Tab real, el skip link es lo primero que se
    enfoca y al activarlo el foco llega al destino.

---

## Lo que queda pendiente

1. **Probarlo con TalkBack en un teléfono Android.** Es el único test que vale de verdad, y no
   se puede hacer desde acá. Un lector de pantalla real siempre encuentra cosas que el código
   no muestra.
2. **Errores de validación en el resto de los formularios.** Login y registro ya marcan el campo
   (`markInvalid`); falta lo mismo en `perfil`, `vender`, `contratar` y `profesional`.
3. **Contraste de color**: no se auditó. Requiere medir cada par texto/fondo.
4. **El carrito y el panel de logística** viven en otras ramas sin mergear: cuando se integren,
   hay que darles la misma pasada (skip link, `h1`, labels en lo generado por JS). El modal de
   "vaciar carrito" de esa rama, en particular, necesita su propia trampa de foco.

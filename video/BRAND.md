# BRAND.md — Identidad de marca en video (Remotion)

> Guía técnica para producir cualquier spot o historia de Instagram nueva con el proyecto
> Remotion de `video/` sin reinventar el lenguaje visual cada vez. Este documento **codifica
> en reglas con nombre** lo que `video/src/lib/anim.jsx` y `video/src/marca.js` ya implementan —
> no propone un sistema nuevo.

## 1. Propósito y fuente de verdad

Este documento es una capa de reglas encima del código, no una fuente de verdad paralela.
El orden real de las fuentes es:

1. **`Assets/styles/styles.css`** (`:root`) — los tokens de color/tipografía del sitio en producción. Es la fuente primera.
2. **`docs/brand-guidelines.md`** — la guía completa de identidad de marca (por qué cada decisión, contraste AA, deuda de identidad entre `styles.css` y `home.css`, síntesis del panel de marketing). Para el *porqué* de cualquier color o decisión tipográfica, ir ahí.
3. **`video/src/marca.js`** — espeja en código los tokens de `styles.css` que el video necesita (colores, formato, cierre, rubros). Si `styles.css` cambia, `marca.js` tiene que cambiar para que coincida.
4. **Este archivo (`video/BRAND.md`)** — le pone nombre a los patrones de movimiento ya construidos en `video/src/lib/anim.jsx` y fija las reglas de uso (formatos, ritmo, checklist para piezas nuevas) para que cualquier historia futura se sienta parte de la misma familia.

Si algo entra en conflicto entre este documento y el código: **el código gana**. Actualizar acá.

## 2. Formatos y cuándo usar cada uno

Definidos en `video/src/Root.jsx`, IDs reales de `Composition`:

| Composition ID | Dimensiones | Uso |
|---|---|---|
| `BaraderoLocal` | 1920×1080 @ 30fps | Spot de marca horizontal — YouTube, web, pantallas, presentaciones. |
| `BaraderoLocalVertical` | 1080×1920 @ 30fps | El mismo spot (`BaraderoLocal.jsx`, mismo componente) renderizado en formato historia. |
| `01-Lunes-Carrito` … `05-Viernes-Vendedores` | 1080×1920 @ 30fps (`HISTORIA` de `marca.js`) | Historias de Instagram, una por día de la semana (patrón AGENDA, ver sección 7). |

Regla: **un componente sirve para ambos formatos** gracias a `useEscala()` (sección 3) — nunca
duplicar una escena para hacer una versión "vertical" a mano. El spot de marca (`BaraderoLocal.jsx`)
es la única pieza pensada para 16:9 y 9:16 a la vez; las historias del AGENDA son siempre verticales.

## 3. Principios de movimiento

El lenguaje de movimiento vive en `video/src/lib/anim.jsx`. Cada patrón tiene nombre para poder
pedirlo por nombre ("dale una entrada elástica", "cerrá con CTA que late") sin releer el código.

### Escala adaptable
**Qué es:** el mismo diseño (tamaños de fuente, paddings, gaps) se reescala automáticamente según
el lado menor del frame, para que una escena pensada en 1080 px de referencia no se vea diminuta
en vertical ni gigante en horizontal.
**Cuándo usarse:** siempre, en toda escena nueva, multiplicando cada medida por `escala`.
**Implementación:** `useEscala()` en `anim.jsx` — devuelve `Math.min(width, height) / 1080`.

### Entrada elástica
**Qué es:** el patrón de entrada por defecto para cualquier elemento (logo, ítem, texto suelto):
un `spring` normalizado 0→1 con rebote perceptible (damping 11-14, mass 0.5-0.7), no un fade lineal.
**Cuándo usarse:** cuando un elemento individual (no un bloque de texto) tiene que aparecer con
peso y personalidad — el logo del spot, el carrito de `Carrito.jsx`, la píldora del `Cta`.
**Implementación:** `useEntrada(delay, config)` en `anim.jsx`.

### Fondo que respira
**Qué es:** el fondo de marca — degradado radial cuyo centro deriva lento con seno/coseno (nunca
congelado), zoom Ken Burns muy leve, un barrido de luz diagonal que cruza una única vez en el
primer tercio, y una viñeta que concentra la atención al centro. Siempre en la familia
AZUL / AZUL_MEDIO / AZUL_PROFUNDO — nunca plano, nunca de otro color.
**Cuándo usarse:** en toda escena, como envoltorio. Es el fondo único de la marca en video.
**Implementación:** componente `Fondo` en `anim.jsx`.

### Cortina de encadenado
**Qué es:** fundido de entrada (rápido, ~6-8 frames) y salida (más lento, ~14 frames) de la escena
completa, pensado para que varias piezas se puedan reproducir una atrás de otra sin corte seco.
**Cuándo usarse:** siempre, como opacidad general de la escena (`opacity: cortina` en el `Fondo`).
**Implementación:** `useCortina(framesEntrada, framesSalida)` en `anim.jsx` (default 8/14; `Carrito.jsx`
y `Rubros.jsx` usan el default llamando `useCortina()` sin argumentos).

### Texto que se revela palabra por palabra
**Qué es:** el recurso que más "aporta producción" frente a un fade plano — cada palabra sube desde
atrás de una máscara (`overflow: hidden`), en cascada (una tras otra, `escalonado` frames de
diferencia), con un `spring` de entrada corto por palabra. Soporta multilínea (cada línea es su
propia máscara para que el salto de línea sea intencional).
**Cuándo usarse:** para cualquier titular o frase principal de una escena — es el título por defecto,
no una alternativa.
**Implementación:** componente `Palabras` en `anim.jsx`.

### CTA con latido
**Qué es:** la píldora blanca de cierre (texto en AZUL_PROFUNDO) — entra con `useEntrada` y, una
vez adentro, "late" una vez (pulso de escala vía seno) para enganchar el ojo antes del corte.
**Cuándo usarse:** como cierre de toda pieza que invite a una acción — hoy siempre con el texto de
`CIERRE` (sección 8).
**Implementación:** componente `Cta` en `anim.jsx`.

### Patrones ad-hoc por historia (no en `anim.jsx`, pero siguen el mismo lenguaje)
Las historias del AGENDA agregan movimiento propio *sobre* estos helpers, sin salirse de la
familia visual — por ejemplo el vuelo en arco de los ítems del carrito en `historias/Carrito.jsx`
(parábola con `Easing.in(Easing.quad)` + rebote del canasto) o la cascada escalonada de chips de
rubro en `historias/Rubros.jsx` (`spring` con 4 frames de diferencia entre cada uno). Estos son
ejemplos de cómo extender el lenguaje para un elemento específico, no helpers reutilizables — si un
patrón ad-hoc se repite en una tercera historia, ese es el momento de subirlo a `lib/anim.jsx` con
nombre propio.

## 4. Zonas seguras y ritmo (historias de Instagram, 1080×1920 @ 30fps)

**Zona segura horizontal/vertical:** diseñar dentro del **80% central** del frame (dejar ~10% de
margen arriba y abajo, y contenido centrado horizontalmente) para no quedar tapado por los overlays
de Instagram (nombre de usuario y controles arriba, barra de reply/reacciones abajo). En la práctica
esto ya se respeta en el código: los `padding` de `Fondo` en las historias existentes rondan
`60-80 * escala` px, y todo el contenido de texto usa `justifyContent`/`alignItems: center` con
`maxWidth` acotado (`anchoLinea`, `maxWidth: 900 * escala`, etc.) en vez de estirarse a los bordes.

**Ritmo por beats**, con los tiempos reales ya usados como referencia (frames a 30fps):

| Beat | Spot `BaraderoLocal.jsx` (150 fr) | Historia típica (`Rubros.jsx`, 210 fr) |
|---|---|---|
| Entrada (fondo + elemento ancla) | frame 0, logo con `useEntrada(0, …)` | frame 0, `Fondo` + `useCortina()` |
| Texto principal | `Palabras` con `delay={14}` | `Palabras` con `delay={6}` |
| Elementos secundarios (en cascada) | línea de acento `delay={20}`, subtítulo frames 30-46 | chips de rubro desde frame 40, +4 fr cada uno |
| Cierre / CTA o remate | `Cta` con `delay={58}` | frase de cierre interpolada en frames 168-186 |
| Salida (cortina de salida) | últimos ~14 frames antes de `durationInFrames` | ídem, `useCortina()` default |

Regla general observada en las 5 historias del AGENDA (`Carrito` y `Envio`/`Vendedores` a 240
frames = 8s, `Rubros` y `ComoFunciona` a 210 frames = 7s): **la duración total la fija el último
elemento que entra**, no un número fijo de antemano — armar la escena y dejar que `durationInFrames`
en `Root.jsx` refleje cuándo termina de pasar todo, con margen para la cortina de salida.

## 5. Tipografía en video

**Inter**, cargada vía `@remotion/google-fonts/Inter` en `marca.js` (`export const { fontFamily } = loadFont()`).
No es Segoe UI (fuente del sitio) ni Georgia (acento editorial del login) porque Remotion renderiza
server-side y no puede depender de una fuente instalada en el sistema — necesita una fuente
embebible en el bundle. Inter se eligió por ser geométrica-humanista: armoniza con Segoe UI sin
depender de fuentes de sistema. Detalle completo en `docs/brand-guidelines.md` → sección "Fuente de video: Inter".

## 6. Sonido

**No implementado todavía.** Ninguna pieza actual (spot ni historias del AGENDA) lleva música,
locución ni efectos. Queda pendiente explícito a definir el día que se pida — no hay dirección
sonora decidida ni sugerida en este documento. Cuando se aborde, documentar acá la decisión (igual
que se hizo con color y tipografía) en vez de improvisar pieza por pieza.

## 7. Cómo agregar una historia nueva (patrón AGENDA)

Checklist para sumar una historia siguiendo el mismo patrón que las 5 ya existentes en `video/src/historias/`:

1. **Crear el componente** en `video/src/historias/NombreHistoria.jsx` (un archivo por historia, `export const NombreHistoria = () => { ... }`).
2. **Importar tokens de marca desde `../marca`** — nunca hardcodear un hex ni un nombre de fuente. Traer solo lo que se use: colores (`AZUL`, `AZUL_MEDIO`, `AZUL_CLARO`, `AZUL_PROFUNDO`, `BLANCO`), `fontFamily`, `CIERRE` si la pieza cierra con CTA, `RUBROS` si aplica.
3. **Envolver todo en `<Fondo>`** (de `../lib/anim`) para heredar el fondo que respira — no crear un fondo propio.
4. **Usar `useEscala()`** y multiplicar cada medida (`fontSize`, `padding`, `gap`, `width`) por `escala` — nunca un px fijo suelto.
5. **Usar `useCortina()`** como `opacity` del `Fondo` para que la pieza encadene bien con las demás.
6. **Título principal con `<Palabras>`**, no con un `<h1>` + fade a mano — es el patrón de texto por defecto (sección 3).
7. **Entradas de elementos individuales con `useEntrada()`**; si hay una lista/cascada (chips, ítems), replicar el patrón de `spring` escalonado de `Rubros.jsx`/`Carrito.jsx` (offset fijo de frames entre elementos).
8. **Cierre con `<Cta texto={CIERRE} delay={...} />`** si la pieza invita a una acción — usar la constante `CIERRE` de `marca.js`, nunca un string de cierre propio (así el día que cambie `CIERRE`, sección 8, se actualiza en un solo lugar).
9. **Agregar la historia al array `AGENDA` en `Root.jsx`** con un `id` en el mismo formato (`NN-Dia-Nombre`) y un `durationInFrames` que refleje cuándo termina de entrar el último elemento (ver ritmo en sección 4) — no hace falta declarar una `<Composition>` aparte, el `.map()` de `AGENDA` ya la genera con el formato `HISTORIA`.
10. **No tocar** `BaraderoLocal.jsx` ni las historias existentes al hacer esto — son piezas ya cerradas; si hace falta un patrón de movimiento nuevo y reutilizable, se agrega a `lib/anim.jsx` de forma aditiva, no se copia y pega dentro de la historia nueva.

## 8. Nota sobre `CIERRE = "Próximamente"`

`marca.js` define `CIERRE` sin URL a propósito: el sitio (`baraderolocal` en Vercel, hoy sin dominio
propio — ver "Pendientes activos" en `CLAUDE.md`, ítem F11-04) todavía no se anuncia públicamente,
así que ninguna pieza de video debe invitar a nadie a un link que no es para difundir todavía.

**El día que se anuncie el sitio:** cambiar una única línea en `video/src/marca.js`
(`export const CIERRE = "Próximamente"` → el texto/URL definitivo, ej. `"baraderolocal.com"` o
`"Ya podés comprar →"`). El spot (`BaraderoLocal.jsx`) y las historias que lo usan como CTA
(`Carrito.jsx` hoy; cualquier historia nueva que siga el checklist de la sección 7) lo levantan
automáticamente porque importan la constante en vez de hardcodear el texto — no hay que tocar nada
más.

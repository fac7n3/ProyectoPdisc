# Guía de identidad de marca — Baradero Local

> Última actualización: 2026-08-03
> Estado: Vivo — se actualiza a medida que el proyecto evoluciona (ver [CLAUDE.md](../CLAUDE.md)).
> Fuente de verdad del sistema visual: [`Assets/styles/styles.css`](../Assets/styles/styles.css) y el resto de `Assets/styles/*.css`. Tokens legibles por máquina (para el sitio, piezas futuras y video): [`Assets/design-tokens.json`](../Assets/design-tokens.json) y [`Assets/design-tokens.css`](../Assets/design-tokens.css). Detalle de la identidad en movimiento (Remotion): `video/BRAND.md`.

Baradero Local es **comercio de proximidad**, no una tienda online genérica ni un marketplace nacional. Cada decisión de esta guía — color, tipografía, foto, copy — existe para demostrar esa categoría en cada punto de contacto, no solo para declararla en el footer. El riesgo que esta guía existe para evitar ya fue nombrado por un usuario real: una versión anterior "parecía inmobiliaria o de viajes". Esa es la vara: si una pieza nueva podría ser el sitio de cualquier otro pueblo del país, no sirve.

## Referencia rápida

| | |
|---|---|
| Color primario | `#3f85ba` (azul medio) — anclaje de marca a largo plazo: `#284175` (azul oscuro) |
| Color secundario | `#78b4eb` (azul claro, superficies) |
| Fuente principal | Segoe UI (pila de sistema, sitio) |
| Fuente de video | Inter (Remotion, `@remotion/google-fonts`) |
| Voz en 3 palabras | Vecinal, cálida, directa |

---

## 1. Paleta de colores

### Colores primarios

Definidos en `:root` de `Assets/styles/styles.css`, usados hoy en topbar, botones y la pantalla de login. Son la paleta de marca oficial.

| Nombre | Variable CSS | Hex | RGB | Uso |
|---|---|---|---|---|
| Azul medio | `--primary-color` | `#3f85ba` | `rgb(63, 133, 186)` | Topbar, CTAs, acento principal en superficies claras |
| Azul claro | `--primary-light` | `#78b4eb` | `rgb(120, 180, 235)` | Superficies (la card de login), fondos de bloques destacados |
| Azul oscuro | `--primary-dark` | `#284175` | `rgb(40, 65, 117)` | Énfasis, texto sobre superficies claras, **color ancla de la marca** (ver más abajo) |
| Azul profundo | `--primary-hover` | `#1f3460` | `rgb(31, 52, 96)` | Estados `:hover` / activos sobre `--primary-color` |

**Por qué `#284175` es el ancla, no `#3f85ba`.** El panel de marketing (Byron Sharp) señaló que hoy no hay un solo activo de color fijo: el celeste medio `#3f85ba` es indistinguible del azul de cualquier fintech o inmobiliaria — exactamente el registro que ya generó el comentario de "parece inmobiliaria". `#284175` es más oscuro, más memorizable y no genérico. **Regla para piezas nuevas (logo, CTA de video, topbar de piezas futuras): `#284175` es el color que se repite siempre igual.** `#3f85ba` sigue siendo válido como acento de superficie (así se usa hoy en el sitio), pero no se introduce en piezas nuevas como color de marca principal.

### Neutros y fondo

| Nombre | Variable CSS | Hex | Uso |
|---|---|---|---|
| Fondo | `--bg-color` | `#dfdfdf` | Fondo general de página |
| Fondo de input | `--bg-input` | `#3f6d99` | Inputs y botones de la card de login |
| Texto oscuro | `--text-dark` | `#111111` | Texto principal sobre fondos claros |
| Texto claro | `--text-light` | `#ffffff` | Texto sobre fondos de color (topbar, botones) |
| Texto secundario | `--text-muted` | `#686868` | Texto de apoyo, placeholders |
| Borde | `--border-color` | `#5286b5` | Separadores, bordes de inputs |

> **Nota de ingeniería (para quien toque CSS):** además de este sistema, `Assets/styles/home.css` define un segundo set de tokens (`--bl-primary: #2563eb`, `--bl-success`, `--bl-danger`, `--bl-radius-*`, `--bl-shadow-*`, etc.) que hoy alimenta la mayoría de las páginas reales (home, admin, carrito, modal de producto, perfil) — un azul distinto (`#2563eb`, más genérico/"stock") al de `styles.css`. Es deuda de identidad real, no un error de esta guía: los dos sistemas conviven en producción. Esta guía fija `#284175`/`#3f85ba` como la paleta de marca de referencia; una tarea futura razonable es migrar `--bl-primary` a los tokens de `Assets/design-tokens.css` para que el sitio tenga un solo azul, no dos.

### Colores semánticos (nuevos) — estado de pedido

El sistema de pedidos usa hoy 6 estados sin ningún color asociado (`ORDER_STATUS_LABELS` en `js/perfil.js` y `js/vender.js`): `pending` (Pendiente), `paid` (Pagado), `shipped` (Enviado), `ready_for_pickup` (Listo para retirar), `completed` (Completado), `cancelled` (Cancelado). Se proponen 3 colores semánticos, agrupando esos 6 estados en éxito / advertencia / error:

| Semántica | Hex | RGB | Estados que cubre |
|---|---|---|---|
| Éxito | `#0B6B4D` | `rgb(11, 107, 77)` | `paid`, `completed` |
| Advertencia | `#8F4D00` | `rgb(143, 77, 0)` | `pending`, `shipped`, `ready_for_pickup` (algo en curso) |
| Error | `#A4302A` | `rgb(164, 48, 42)` | `cancelled` |

**Por qué estos hex y no un semáforo rojo/amarillo/verde genérico de librería.** Seth Godin, en el panel de marketing, lo dijo explícito: un semáforo estándar es "bajado de una librería de componentes", no hecho a medida de esta marca. Se descartó reutilizar el verde/rojo que ya existe en `--bl-success`/`--bl-danger` (`#10b981`/`#ef4444`, en `home.css`) porque son los tonos Tailwind/Bootstrap más vistos en cualquier dashboard genérico — la misma textura visual que ya generó el comentario de "inmobiliaria". En cambio:
- **Éxito `#0B6B4D`** es un verde-azulado (teal) oscuro, no un verde puro: comparte la saturación apagada y la profundidad de `--primary-dark`/`--primary-hover`, así que se lee como parte de la misma familia fría en vez de un verde de sistema operativo insertado de golpe.
- **Advertencia `#8F4D00`** es un ámbar quemado/terracota (no el amarillo brillante de una alerta de sistema) — el mismo tono que un toldo de negocio de barrio, cálido y a propósito distinto del azul frío de la marca, para que "algo está en curso" se note de un vistazo sin gritar.
- **Error `#A4302A`** es un rojo ladrillo, de la misma familia cálida/terracota que la advertencia pero más saturado hacia el rojo — evita el rojo de alarma genérico manteniendo coherencia con el resto de la paleta semántica.

**Patrón de uso recomendado (ya existe en el código):** `admin.css` (líneas 384-385) ya usa el patrón "fondo tintado al 14% + texto en el color sólido" (`color-mix(in srgb, var(--m-color) 14%, transparent)`) para las tarjetas de métricas del panel de admin. Aplicar el mismo patrón a las badges de estado de pedido: fondo tintado (10-15% del color semántico sobre blanco) + texto en el color sólido — así el color sólido solo necesita pasar contraste como texto, no como fondo pleno.

### Accesibilidad — ratios de contraste reales

Calculados según la fórmula de luminancia relativa de WCAG 2.1 (mínimo AA: 4.5:1 texto normal, 3:1 texto grande/UI ≥18px o 14px bold).

| Par | Ratio | AA texto normal (4.5:1) | AA texto grande / UI (3:1) |
|---|---|---|---|
| `--text-dark` (#111111) sobre `--bg-color` (#dfdfdf) | 14.17:1 | ✅ | ✅ |
| Blanco sobre `--primary-dark` (#284175) | 9.98:1 | ✅ | ✅ |
| Blanco sobre `--primary-hover` (#1f3460) | 12.22:1 | ✅ | ✅ |
| Blanco sobre `--primary-color` (#3f85ba) | 3.98:1 | ⚠️ falla por poco | ✅ |
| `--text-dark` sobre `--primary-light` (#78b4eb) | 8.57:1 | ✅ | ✅ |
| Blanco sobre `--primary-light` (#78b4eb) | 2.20:1 | ❌ | ❌ |
| `--text-muted` (#686868) sobre `--bg-color` | 4.18:1 | ⚠️ falla por poco | ✅ |
| Éxito `#0B6B4D` sobre blanco / sobre `--bg-color` | 6.51:1 / 4.89:1 | ✅ / ✅ | ✅ / ✅ |
| Advertencia `#8F4D00` sobre blanco / sobre `--bg-color` | 6.50:1 / 4.88:1 | ✅ / ✅ | ✅ / ✅ |
| Error `#A4302A` sobre blanco / sobre `--bg-color` | 6.92:1 / 5.19:1 | ✅ / ✅ | ✅ / ✅ |

**Conclusiones prácticas:** los 3 colores semánticos nuevos pasan AA como texto sólido tanto sobre blanco como sobre el fondo gris del sitio (`--bg-color`), en cualquier combinación. `--primary-color` (#3f85ba) como fondo con texto blanco encima **no** llega a 4.5:1 — usarlo solo con texto grande/bold o iconografía (ya es como se usa hoy: botones píldora con texto corto en mayúscula/negrita), nunca con párrafos. `--primary-light` nunca lleva texto blanco (por eso la card de login ya usa texto oscuro sobre ella). `--text-muted` sobre `--bg-color` está al límite (4.18:1): evitarlo para texto de cuerpo pequeño sobre el fondo gris, está pensado para blanco/superficies claras (5.57:1 ahí).

---

## 2. Tipografía

### Pila del sitio: fuentes de sistema

```css
--font-main: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
```

Es la fuente base de todo el sitio (aplicada globalmente vía el reset `*` en `styles.css`). **Por qué fuente de sistema y no una fuente cargada:** cero peso de descarga y cero FOUT (flash of unstyled text) — en un sitio de e-commerce donde la primera carga importa (conversión, datos móviles de un vecino con 4G), no vale la pena pagar una fuente externa para texto de UI que nadie nota si es "Segoe UI" o "Inter". Es una decisión de rendimiento, no estética.

> **Nota de ingeniería:** `Assets/styles/home.css`, `admin.css`, `carrito.css` y `product-modal.css` importan Inter desde Google Fonts (`--bl-font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) y la aplican en la mayoría de las páginas reales — en la práctica, gran parte del sitio ya no corre en la pila de sistema pura. No es una decisión documentada, es deuda de identidad que conviene resolver junto con la unificación de color de la sección anterior: o se vuelve a la pila de sistema en todos lados (rendimiento) o se adopta Inter como fuente oficial del sitio y se actualiza `--font-main` para que coincida (consistencia con el video, que ya usa Inter).

### Acento serif: Georgia

```css
--font-serif: Georgia, "Times New Roman", serif;
```

Uso actual: los headlines editoriales de la pantalla de login (`.welcome h1`, labels y botones grandes de `.login-card`). Es el único lugar del sitio con un tono más editorial/cálido en vez de utilitario — encaja con la voz vecinal, no corporativa, en el momento de mayor peso emocional (el primer "bienvenido"). No se usa en ningún otro lugar del sitio hoy; si se extiende, debería ser a otros momentos de bienvenida/cierre (ej. un hero futuro), no a UI utilitaria (formularios, tablas, botones de acción).

### Fuente de video: Inter

`video/src/marca.js` carga Inter vía `@remotion/google-fonts/Inter`, no Segoe UI ni Georgia. Es intencional y correcto, no una inconsistencia: Remotion renderiza server-side (genera el video como frames, sin navegador de usuario de por medio) y necesita una fuente que pueda embeber en el render — no puede confiar en que la fuente de sistema del usuario final exista, porque no hay usuario final leyendo HTML, hay un archivo de video ya cocinado. Inter es geométrica-humanista y armoniza visualmente con Segoe UI sin depender de fuentes de sistema, así que el video se siente de la misma familia que el sitio sin heredar su restricción técnica.

### Escala tipográfica sugerida (piezas futuras)

Para banners, landing sections o cualquier pieza nueva que no sea la UI utilitaria existente:

| Nivel | Desktop | Mobile | Fuente |
|---|---|---|---|
| H1 | 3rem / 48px | 2rem / 32px | Georgia (momentos cálidos) o Segoe UI (utilitario) |
| H2 | 2.125rem / 34px | 1.5rem / 24px | Segoe UI, 600-700 |
| H3 | 1.5rem / 24px | 1.25rem / 20px | Segoe UI, 600 |
| Body | 1rem / 16px | 0.9375rem / 15px | Segoe UI, 400 |
| Caption | 0.8125rem / 13px | 0.75rem / 12px | Segoe UI, 400, `--text-muted` |

### Pesos

| Peso | Valor | Uso |
|---|---|---|
| Regular | 400 | Cuerpo de texto, párrafos |
| Semibold | 600 | Botones, labels, énfasis de UI (el peso más usado en el sitio hoy: `.pill-btn`, badges) |
| Bold | 700 | Headlines cortos, cifras destacadas |

---

## 3. Uso del logo

- **Archivo real:** [`Assets/images/Logos/logoazulpng.png`](../Assets/images/Logos/logoazulpng.png) — azul (`#284175`) sobre fondo transparente. Es el único archivo de logo versionado hoy.
- **Versión invertida a blanco:** no existe como archivo separado — se genera on-the-fly en CSS con `filter: brightness(0) invert(1)` (así lo hace `video/src/BaraderoLocal.jsx` sobre fondo azul oscuro). Es la forma correcta de usarlo hoy: mismo PNG, filtro CSS para fondos oscuros. **Regla fija (recomendación de Byron Sharp):** azul sobre fondo claro, blanco invertido sobre fondo oscuro, siempre — no generar variantes de color nuevas por pieza.
- **Espacio de resguardo:** dejar como mínimo la altura de la "B" del isotipo libre de aire alrededor en los cuatro lados (ni texto ni otros elementos dentro de ese margen).
- **Tamaño mínimo digital:** 32px de alto (favicon/ícono de app), 96px de alto para cualquier uso con el logo como elemento reconocible (header, tarjeta, banner).
- **Qué no hacer:** no rotar; no recolorear fuera de `#284175` (claro) / blanco (oscuro) — nunca en gris, negro puro, o un color de campaña puntual; no aplicarle sombras, glow ni bisel; no recortarlo ni estirarlo fuera de su proporción original.
- **Dónde viven las variantes futuras:** [`Assets/images/brand/`](../Assets/images/brand/) — carpeta reservada, hoy vacía. Antes de subir algo ahí, ver la sección 5 (Guía de imágenes): si la pieza podría ser de cualquier otro pueblo del país, no va ahí.

---

## 4. Voz y tono

### Personalidad de marca

Síntesis del panel de marketing (April Dunford, Seth Godin, Byron Sharp, Rory Sutherland) y de `.agents/product-marketing.md`:

- **Vecinal.** Habla como alguien que vive en Baradero, no como una plataforma que "opera en" Baradero. Nombra comercios, barrios, distancias — nunca "usuarios" o "la plataforma".
- **Cálida.** El comentario que hay que evitar para siempre es "parece inmobiliaria". Calidez concreta (una persona, un local, un pedido real), no calidez decorativa (emojis, signos de exclamación de sobra).
- **Directa.** Frases cortas, sin rodeos corporativos. Dice "Marta ya te lo está preparando", no "Su pedido se encuentra en proceso de preparación".
- **Con nombre propio, no anónima.** Cada comercio, cada estado de pedido, cada mensaje debería poder nombrar a alguien o algo específico de Baradero en vez de una abstracción de sistema.
- **Orgullosamente chica.** No compite en catálogo infinito ni en velocidad de logística nacional — no hay que sonar como si lo intentara. Lo chico y curado se dice con orgullo, no se disimula.

### Somos / No somos

| Somos | No somos |
|---|---|
| El almacén de tu barrio, ahora online | Una tienda online más |
| Comercios reales de Baradero, con nombre y cara | Un marketplace anónimo |
| Directos: "Te lo trae Almacén Don Raúl" | Corporativos: "Su pedido está siendo procesado" |
| Cercanos y concretos | Genéricos y abstractos |
| Orgullosos de ser chicos y de Baradero | Una versión chica de una plataforma nacional |
| Cálidos, con criterio propio | Prolijos por prolijos, sin personalidad |

### Tono por contexto

| Contexto | Tono | Ejemplo |
|---|---|---|
| Marketing (hero, redes, banners) | Cálido, orgulloso del barrio, en segunda persona | "Comprá local, recibí en casa" |
| Email/notificación transaccional de pedido | Directo, con nombres propios, tranquilizador sin ser efusivo | "Almacén Don Raúl ya está preparando tu pedido." en vez de "Su pedido ha sido confirmado" |
| Mensajes de error | Claro, sin culpar al usuario, sin jerga técnica | "No pudimos confirmar el pago. Probá de nuevo o elegí transferencia." en vez de "Error 402: payment_failed" |
| Redes sociales | Cercano, casi de vecino a vecino, sin vender de más | "¿Se te acabó el pan? La Panadería de siempre, a un clic." |

### Términos prohibidos

El riesgo real no es de vocabulario técnico, es de **registro corporativo/inmobiliario** — el mismo que ya generó el comentario de "parece inmobiliaria o de viajes". Evitar:

- "Su pedido", "su cuenta", "el usuario" → usar "vos", "tu pedido", nombrar a la persona o al comercio cuando se pueda.
- "Solución", "plataforma", "ecosistema", "experiencia de compra premium" → jerga de pitch corporativo, no dice nada concreto.
- "Tienda online" / "marketplace" de cara al cliente → la categoría es **comercio de proximidad**; decirlo mal invita a compararse con MercadoLibre y perder.
- "Optimizado", "sinergia", "solución integral", "líder en su categoría" → vacío, ninguna marca vecinal habla así.
- Superlativos sin sustento ("el mejor", "el más grande") → hoy hay 14 comercios semilla; el argumento es cercanía y confianza, no escala.

### Frases ya validadas — reutilizar tal cual

- **Tagline hero:** "Comprá local, recibí en casa"
- **Subtítulo hero:** "Productos frescos de los comercios de Baradero directo a tu puerta."
- **Slogan / manifiesto de footer:** "Mientras otras plataformas conectan personas lejanas, nosotros conectamos vecinos."
- **Remate de cierre para video/redes** (reemplaza a "Próximamente" en `video/src/marca.js` el día del lanzamiento — ver `video/BRAND.md`): "Conectamos vecinos."

---

## 5. Guía de imágenes

### Fotografía

Productos y comercios **reales** de Baradero, luz natural, gente real del barrio (comerciantes, vecinos) — nunca stock genérico corporativo (la mano feliz agarrando una caja de cartón, la familia sonriente recibiendo un delivery: es exactamente la textura de una inmobiliaria vendiendo confianza abstracta). Regla práctica antes de subir cualquier foto nueva a `Assets/images/brand/`: **¿esto podría ser el sitio de cualquier otro pueblo del país?** Si la respuesta es sí, no sirve — mejor un espacio vacío que una foto de stock. Hoy no hay fotos reales de comercios cargadas (el catálogo corre con datos semilla, ver "Pendientes activos" en `CLAUDE.md`); hasta que las haya, preferir el lenguaje ilustrado/animado que ya funciona en el video de Remotion antes que bajar stock.

### Estilo de banners y gráficas

Fondos en la familia azul de marca (degradados suaves entre `--primary-color`, `--primary-dark`, `--primary-hover`, nunca planos), composición simple, un solo foco de atención por pieza. Nada de "collage corporativo" con íconos flotantes genéricos (apretones de manos, engranajes, globos terráqueos). Cuando haya texto sobre foto/gradiente, usar blanco o `--text-dark` según el fondo, respetando los ratios de la sección 1.

### Iconografía

FontAwesome (ya integrado en el sitio vía `.icon-btn`, `.icon-square`), estilo **outline/regular**, nunca sólido/filled salvo para estados activos puntuales. Tamaño consistente con el contexto (27px en `.icon-btn` de la topbar, 34px en `.icon-square`). Un ícono por concepto, sin mezclar sets de terceros.

---

## 6. Componentes de diseño

Inferido de las hojas de estilo reales (`styles.css`, `home.css`, `admin.css`, `carrito.css`, `product-modal.css`).

### Botones

Estilo píldora, consistente en todo el sitio:

| Elemento | Border-radius | Alto | Notas |
|---|---|---|---|
| `.pill-btn` / `.search-pill` (topbar) | 1.25rem (20px) | 2rem (32px) | Fondo `#f6f6f6`, texto `#2b6fa2`, peso 600 |
| `.continue-btn` / `.google-btn` (login) | 1.75rem (28px) | 3.5rem (56px) | Botones grandes, full-width |
| `--bl-radius-pill` (home/admin/carrito) | 50rem | variable | Badges y CTAs de las páginas con el sistema `--bl-*` |
| `.icon-square` | 0.5rem (8px) | 2.125rem | Único radio "cuadrado" del sistema — íconos, no botones de texto |

### Spacing

No hay una escala documentada formalmente; el patrón observado en el CSS real usa incrementos de ~0.125rem (2px) en el rango chico y saltos de 0.25-0.5rem en el rango grande. Escala sugerida para piezas nuevas, en base a lo ya usado (0.5rem, 0.625rem, 0.75rem, 0.875rem, 1rem, 1.125rem, 1.75rem, 2.25rem aparecen todos en `styles.css`):

| Token | Valor | Uso |
|---|---|---|
| `xs` | 0.25rem (4px) | Separación mínima entre elementos inline |
| `sm` | 0.5rem (8px) | Gap entre íconos, padding de badges |
| `md` | 0.875rem (14px) | Gap de topbar (`.topbar`, `.topbar-icons`) — el más repetido del sitio |
| `lg` | 1.125rem (18px) | Padding interno de cards |
| `xl` | 2.25rem (36px) | Gap entre bloques grandes (`.login-layout`) |

### Radios (cards, inputs, modals)

| Elemento | Border-radius |
|---|---|
| Inputs (login) | 1.75rem (28px) — mismo radio que los botones grandes, pensado como set |
| Card de login (`.login-card`) | 1rem (16px) |
| Cards del sistema `--bl-*` (home/admin) | `--bl-radius-lg` 0.75rem a `--bl-radius-xl` 1rem, según jerarquía |
| Modal de producto (`.product-modal`) | `--bl-radius-xl` 1rem (esquinas superiores en mobile fullscreen) |
| Inputs del sistema `--bl-*` | `--bl-radius-md` 0.5rem |
| Badges/pills (`--bl-radius-pill`) | 50rem (círculo perfecto en cualquier alto) |

---

## 7. Generación de imágenes con IA

### Prompt base reutilizable

```
Fotografía/ilustración cálida de comercio de barrio en Baradero, Argentina.
Paleta de color: azul #284175 y #3f85ba como acento, nunca como dominante frío;
tonos cálidos de luz natural de tarde. Gente real de barrio, comercios con
nombre propio, productos reconocibles. Composición simple, un solo foco de
atención. Mood: barrial, cercano, luz de tarde, hecho a pulmón, con carácter.
Evitar: corporativo, inmobiliario, genérico, stock fotográfico, oficinas,
apretones de manos, iconografía de fintech, gente sonriendo de forma artificial.
```

### Ejemplos de prompt

**Banner hero (sitio):**
> "Vidriera de almacén de barrio en Baradero, Argentina, luz cálida de atardecer entrando de costado, productos frescos a la vista, sin gente posando para cámara — una escena real de comercio de proximidad. Paleta dominada por tonos cálidos de luz natural con un acento azul `#284175` sutil en algún elemento (toldo, cartel). Composición horizontal, espacio negativo a la izquierda para texto. Nada de stock corporativo ni inmobiliario."

**Gráfica de red social (historia de Instagram, 1080×1920):**
> "Ilustración plana simple de un repartidor en bicicleta llevando una bolsa de compras por una calle de barrio con casas bajas, estilo geométrico-humanista (no infantil, no corporativo), paleta azul `#3f85ba`/`#284175` de fondo con un acento cálido en la bolsa o la bicicleta. Composición vertical centrada, espacio arriba y abajo para texto superpuesto. Mood: barrial, directo, con carácter propio — no un ícono de stock de delivery."

**Chip/ilustración de rubro (ej. Verdulería):**
> "Ícono ilustrado simple de un puesto de verdulería de barrio — cajones de madera con verduras frescas, estilo outline coherente con FontAwesome pero con más carácter, línea de grosor medio, color de línea `#284175` sobre fondo transparente o blanco. Nada de 3D, nada de gradientes complejos, nada de mascotas."

---

## 8. Identidad en movimiento

El proyecto Remotion en `video/` (`video/src/marca.js`, `video/src/lib/anim.jsx`, `video/src/Root.jsx`) ya implementa un lenguaje de movimiento propio y consistente, pensado para funcionar igual de bien en un spot horizontal (1920×1080) que en una historia vertical de Instagram (1080×1920, formato `HISTORIA`). El detalle técnico completo (specs de animación, convenciones de cada componente de `anim.jsx`, el patrón `AGENDA` semanal, cómo se arma cada historia nueva) vive en `video/BRAND.md` — esta sección es un resumen, no lo repite.

Principios de la identidad en movimiento, sin repetir la especificación técnica:

- **Una sola escala de fondo, siempre azul.** El fondo respira (degradado radial lento) y nunca es plano ni de otro color de la familia — es el mismo recurso que ancla `#284175` como color de marca en el resto del sistema.
- **Entradas elásticas, no lineales.** Todo lo que entra en cámara (CTA, texto, chips) usa spring, no fade/slide genérico — es parte de lo que hace que una pieza "se sienta hecha", no bajada de una plantilla.
- **Texto en cascada por palabra**, no un bloque que aparece de golpe — el recurso que más aporta sensación de producción frente a un fade plano.
- **El logo se invierte a blanco sobre fondo oscuro** vía filtro CSS, nunca un archivo de color distinto — misma regla que la sección 3.
- **Cadencia semanal fija** (el patrón `AGENDA`, una historia por día de lunes a viernes): la disponibilidad mental se construye por frecuencia repetida, no por sorprender cada vez con algo distinto.
- **El cierre es la firma de la marca.** Hoy dice "Próximamente" a propósito (el sitio todavía no se anuncia); el día del lanzamiento, ese único texto pasa a ser "Conectamos vecinos" — la frase del footer convertida en remate verbal fijo de cada pieza.

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-08-03 | Identidad inicial, construida a partir del sistema visual ya en producción (`Assets/styles/*.css`, logo, video Remotion) y de un panel de marketing (skills `product-marketing`, `marketing-council`, `brand`). |

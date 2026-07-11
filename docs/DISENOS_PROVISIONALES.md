# Diseños provisionales — pendientes de reemplazo

> Estos ítems se implementaron con una versión funcional y provisional (con datos reales,
> no maquetas) para que la app no quede con un hueco visible mientras se espera un diseño
> definitivo. **Cuando el usuario pase diseños propios, esta sección se reemplaza** — no
> son decisiones de diseño finales, son placeholders honestos.

## F9-01 — Sistema de diseño (más contraste, calidez y personalidad)
**Estado:** placeholder mínimo aplicado, no un rediseño.

- `pages/home.html` / `Assets/styles/home.css`: franja "franja de valor" debajo del hero
  (`.value-strip`), 3 frases cortas con ícono en el acento cálido ya existente de la
  paleta (`--bl-accent: #f59e0b`, definido desde el inicio del proyecto pero casi sin uso
  real fuera de los badges de descuento).
- No se tocó la paleta de colores en sí, ni la tipografía, ni la estructura de ninguna
  página existente — sería prematuro sin ver primero los diseños reales del usuario.

## F9-06 — Micro-interacciones, estados vacíos, skeletons, manejo de error
**Estado:** parcialmente resuelto con componentes reales (no placeholder puro).

- `renderEmptyState()` (nuevo, `js/cart-utils.js`) — mismo lenguaje visual que
  `renderErrorState()` (F10-04): ícono + mensaje, sin tono de error. Aplicado en
  `home.js`, `search.js` y `comercio.js` (antes cada uno tenía su propio `<div>` de texto
  plano con estilos inline duplicados).
- Micro-interacción `:active` (leve `scale(0.97)` al presionar) agregada a `.quick-btn`,
  `.coupon-chip` y `.hero__banner-cta` en `home.css` — antes solo `.product-card__add`
  tenía un estado de presión.
- **No** se tocaron los paneles de admin/vendedor/repartidor (tienen su CSS inline propio
  por página) ni se hizo una pasada de micro-interacciones exhaustiva sobre todo el sitio
  — eso sí amerita una decisión de diseño con el usuario, no una pasada automática.

## F12-13 — Insights/analíticas reales del vendedor
**Estado:** funcional con datos reales, layout provisional.

- Sección nueva "Insights (provisional)" en el dashboard de `vender.js`/`vender.html`,
  debajo de las estadísticas existentes (Ventas Hoy / Productos Activos / Ingresos del Mes).
- **Productos más vendidos**: agrupado por título desde `order_items` (snapshot, mismo
  criterio que F2-06 — no depende de que el producto siga activo), solo pedidos `paid`.
- **Ventas de los últimos 7 días**: barras simples con CSS (sin librería de gráficos),
  total real por día desde `orders.total_price`.
- Layout deliberadamente simple (lista + barras) — cuando lleguen los diseños reales del
  usuario (mencionó que quiere pasar los suyos), se reemplaza el layout sin tocar las
  consultas de datos, que ya son reales y reutilizables.

## Qué NO está en esta lista
- **F9-07** (modal de producto) — ya se resolvió con datos 100% reales, no es un
  placeholder, no requiere diseño nuevo del usuario.
- La sección **Categorías de la navbar** — el usuario pidió tratarla aparte, más adelante.
  No tocada en esta tanda.

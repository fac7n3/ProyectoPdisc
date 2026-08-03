// Tokens de marca, espejados de Assets/styles/styles.css (:root).
// Si cambian ahí, cambiarlos acá.
// Por qué (colores, tipografía, decisiones de contraste): docs/brand-guidelines.md.
// Reglas de uso de estos tokens en piezas de video (formatos, movimiento, ritmo): video/BRAND.md.
import { loadFont } from "@remotion/google-fonts/Inter";

export const { fontFamily } = loadFont();

export const AZUL = "#284175"; // --primary-dark
export const AZUL_MEDIO = "#3f85ba"; // --primary-color
export const AZUL_CLARO = "#78b4eb"; // --primary-light
export const AZUL_PROFUNDO = "#1f3460"; // --primary-hover
export const BLANCO = "#ffffff";

// Colores semánticos (estado de pedido), de docs/brand-guidelines.md — paleta cálida-terrosa,
// no el semáforo genérico rojo/amarillo/verde, para compartir profundidad con AZUL/AZUL_PROFUNDO.
export const EXITO = "#0B6B4D"; // verde-azulado oscuro (teal) — pedido pagado/completado
export const ADVERTENCIA = "#8F4D00"; // ámbar quemado/terracota — pendiente/enviado/listo para retirar
export const ERROR = "#A4302A"; // rojo ladrillo — pedido cancelado

// Formato de historias de Instagram.
export const HISTORIA = { width: 1080, height: 1920, fps: 30 };

// Cierre de todas las piezas. Sin URL a propósito: el sitio todavía no se anuncia.
// Cuando se lance, cambiar acá y se actualizan los 4 videos que lo usan.
export const CIERRE = "Próximamente";

// Rubros reales del sitio (CATEGORY_ICONS en js/nav-utils.js).
export const RUBROS = [
  "Almacén",
  "Panadería",
  "Verdulería",
  "Carnicería",
  "Lácteos",
  "Bebidas",
  "Kiosco",
  "Limpieza",
  "Farmacia",
  "Ferretería",
  "Tecnología",
  "Ropa",
  "Deportes",
  "Mascotas",
];

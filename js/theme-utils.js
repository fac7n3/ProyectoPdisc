// Lógica pura del modo claro/oscuro (sin DOM: se prueba con node js/theme-utils.test.mjs).

export const THEME_KEY = 'bl_theme';

export function normalizeTheme(value) {
  return value === 'dark' || value === 'light' ? value : null;
}

export function nextTheme(current) {
  return current === 'dark' ? 'light' : 'dark';
}

// Texto del botón: dice a qué modo se pasa al tocarlo.
export function themeToggleLabel(current) {
  return current === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
}

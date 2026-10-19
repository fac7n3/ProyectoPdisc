// Modo claro / oscuro.
//
// El atributo <html data-theme="dark"> lo pone antes del primer pintado el
// script inline del <head> de cada página (para que no haya destello claro);
// este módulo suma lo que viene después: el botón (sol en modo claro, luna en
// oscuro) al lado del carrito, y guardar la elección.
//
// Se guarda en localStorage (`bl_theme`: 'light' | 'dark'). Sin elección
// guardada el sitio queda claro, como siempre.

import { THEME_KEY, normalizeTheme, nextTheme, themeToggleLabel } from './theme-utils.js';

// SVG propio y no Font Awesome: el panel de admin no carga esa fuente de íconos.
const SUN_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<circle cx="12" cy="12" r="4.2" fill="currentColor"/>' +
  '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/>' +
  '</g></svg>';
const MOON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<path d="M20.6 14.6A8.6 8.6 0 0 1 9.4 3.4a8.6 8.6 0 1 0 11.2 11.2z" fill="currentColor"/>' +
  '</svg>';

const THEME_COLORS = { light: '#2563eb', dark: '#0e121c' };

function readStored() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return null;
  }
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  // Barra del navegador en el celular (la meta ya existe en cada página).
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    if (!meta.dataset.lightColor) meta.dataset.lightColor = meta.getAttribute('content') || THEME_COLORS.light;
    meta.setAttribute('content', theme === 'dark' ? THEME_COLORS.dark : meta.dataset.lightColor);
  }
  syncButtons(theme);
}

function syncButtons(theme) {
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.dataset.mode = theme;
    btn.setAttribute('aria-label', themeToggleLabel(theme));
    btn.setAttribute('title', themeToggleLabel(theme));
    // Sol = estás en modo claro; luna = estás en modo oscuro.
    btn.innerHTML = theme === 'dark' ? MOON_SVG : SUN_SVG;
  });
}

function setTheme(theme, { persist = true, animate = false } = {}) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 350);
  }
  applyTheme(theme);
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* modo privado / almacenamiento bloqueado: el cambio vale solo esta página */
    }
  }
}

function buildButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'theme-toggle';
  btn.className = 'navbar__action-circle theme-toggle';
  btn.addEventListener('click', () => {
    setTheme(nextTheme(currentTheme()), { animate: true });
  });
  return btn;
}

function mountButton() {
  if (document.getElementById('theme-toggle')) return;
  const btn = buildButton();
  const actions = document.querySelector('.navbar__actions');
  if (actions) {
    // Pegado al carrito, del lado derecho: es lo último de la fila.
    const cart = actions.querySelector('#nav-cart');
    if (cart) cart.after(btn);
    else actions.appendChild(btn);
  } else if (document.querySelector('.admin-topbar')) {
    // Panel de admin: al final de su barra superior, después de "Ver sitio".
    btn.classList.remove('navbar__action-circle');
    document.querySelector('.admin-topbar').appendChild(btn);
  } else {
    // Login, registro, recuperar contraseña: no hay barra con acciones.
    btn.classList.remove('navbar__action-circle');
    btn.classList.add('theme-toggle--floating');
    document.body.appendChild(btn);
  }
  syncButtons(currentTheme());
}

// Reaplicar por si el script del <head> no corrió (navegador sin JS inline).
const stored = readStored();
if (stored && stored !== currentTheme()) applyTheme(stored);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountButton);
} else {
  mountButton();
}

// Otra pestaña cambió el tema: esta la sigue.
window.addEventListener('storage', (e) => {
  if (e.key !== THEME_KEY) return;
  const t = normalizeTheme(e.newValue);
  if (t && t !== currentTheme()) applyTheme(t);
});

/**
 * login-prompt.js — Cartel en el centro de la pantalla que avisa "tenés que
 * iniciar sesión" cuando alguien sin sesión toca un botón que la necesita
 * (finalizar compra, favoritos de comercio, pedir presupuesto, avisarme cuando
 * vuelva el stock...).
 *
 * Solo en celular (pantalla angosta): ahí un aviso chico arriba se pierde y un
 * cambio de página brusco desorienta. En compu cada botón sigue con su
 * comportamiento de siempre, por eso `promptLogin` devuelve `false` y el que
 * llama usa su camino de antes.
 *
 * Reusa la tarjeta de js/confirm-dialog.js (mismas clases `bl-confirm-*` de
 * home.css, colores por tokens, modo oscuro incluido). Sin dependencias.
 */

const MOBILE_QUERY = '(max-width: 768px)';
const LOGIN_PATH = 'login.html';

let activePrompt = null;

/** ¿Estamos en pantalla de celular? */
export function isMobileViewport() {
  try {
    return window.matchMedia(MOBILE_QUERY).matches;
  } catch {
    return false;
  }
}

/** Dónde queda login.html desde la página actual (están todas en /pages/, salvo el home). */
function loginUrl() {
  return window.location.pathname.includes('/pages/') ? `./${LOGIN_PATH}` : `./pages/${LOGIN_PATH}`;
}

export function closeLoginPrompt() {
  if (!activePrompt) return;
  document.removeEventListener('keydown', activePrompt.onKeydown);
  activePrompt.overlay.remove();
  const { opener } = activePrompt;
  activePrompt = null;
  if (opener?.isConnected) opener.focus?.();
}

/**
 * Muestra el cartel si estamos en celular.
 * @param {string} [message] Qué estaba por hacer ("Para comprar necesitás...").
 * @param {{ title?: string }} [options]
 * @returns {boolean} true si mostró el cartel (el que llama no hace nada más);
 *   false si no es celular (el que llama sigue con su aviso de siempre).
 */
export function promptLogin(message = 'Para seguir necesitás iniciar sesión.', options = {}) {
  if (typeof document === 'undefined' || !isMobileViewport()) return false;
  if (activePrompt) closeLoginPrompt();

  const { title = 'Iniciá sesión para continuar' } = options;
  const opener = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'bl-confirm-overlay bl-login-prompt-overlay';

  const card = document.createElement('div');
  card.className = 'bl-confirm-card bl-login-prompt';
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'bl-login-prompt-title');
  card.setAttribute('aria-describedby', 'bl-login-prompt-msg');

  const icon = document.createElement('span');
  icon.className = 'bl-login-prompt__icon';
  icon.setAttribute('aria-hidden', 'true');
  const iconGlyph = document.createElement('i');
  iconGlyph.className = 'fa-solid fa-user';
  icon.appendChild(iconGlyph);

  const heading = document.createElement('h3');
  heading.className = 'bl-confirm-title bl-login-prompt__title';
  heading.id = 'bl-login-prompt-title';
  heading.textContent = title;

  const text = document.createElement('p');
  text.className = 'bl-confirm-msg bl-login-prompt__msg';
  text.id = 'bl-login-prompt-msg';
  text.textContent = message;

  const actions = document.createElement('div');
  actions.className = 'bl-confirm-actions bl-login-prompt__actions';

  const enter = document.createElement('a');
  enter.className = 'bl-confirm-btn bl-confirm-btn--confirm';
  enter.href = loginUrl();
  enter.textContent = 'Iniciar sesión';

  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'bl-confirm-btn bl-confirm-btn--cancel';
  later.textContent = 'Ahora no';
  later.addEventListener('click', closeLoginPrompt);

  actions.append(enter, later);
  card.append(icon, heading, text, actions);
  overlay.appendChild(card);

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeLoginPrompt();
  });
  const onKeydown = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeLoginPrompt();
  };
  document.addEventListener('keydown', onKeydown);

  activePrompt = { overlay, onKeydown, opener };
  (document.querySelector('dialog:modal') || document.body).appendChild(overlay);
  enter.focus();
  return true;
}

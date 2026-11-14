/**
 * detail-dialog.js — ventana central con un texto largo (detalles, ejemplos, límites)
 * Baradero Local
 *
 * Mismo estilo que el visor de banners del inicio y que `confirm-dialog.js`: al tocar
 * un botón se abre, en el centro de la pantalla y sobre un fondo oscuro, una tarjeta
 * con el contenido. Se cierra con la X, con "Cerrar", con Esc o tocando afuera, y el
 * foco vuelve al botón que la abrió.
 *
 * Es genérico: sirve para cualquier "ver más" que no entre cómodo dentro de una
 * tarjeta (hoy, los detalles de cada servicio de "Impulsar"). Los estilos
 * (`.bl-detail-*`) viven en pages/vender.html; el fondo reusa `.bl-confirm-overlay`.
 */

let active = null;
let seq = 0;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Cierra la ventana abierta (si hay) y devuelve el foco a quien la abrió. */
export function closeDetailDialog() {
  if (!active) return;
  const { overlay, onKeydown, prevHtmlOverflow, trigger } = active;
  active = null;
  document.removeEventListener('keydown', onKeydown, true);
  overlay.remove();
  document.documentElement.style.overflow = prevHtmlOverflow;
  if (trigger && trigger.isConnected && typeof trigger.focus === 'function') trigger.focus();
}

/**
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   sections?: Array<{ title: string, text?: string, items?: string[], check?: boolean }>,
 *   trigger?: HTMLElement | null,
 *   closeText?: string,
 * }} options
 *   `sections`: cada una lleva un título y un párrafo (`text`) o una lista (`items`;
 *   con `check: true` cada ítem lleva una tilde en vez de un punto).
 *   `trigger`: el botón que la abrió; recibe el foco al cerrar.
 * @returns {HTMLElement} la tarjeta (útil para pruebas)
 */
export function openDetailDialog({ title, subtitle = '', sections = [], trigger = null, closeText = 'Cerrar' }) {
  closeDetailDialog();
  seq += 1;
  const titleId = `bl-detail-title-${seq}`;

  const overlay = document.createElement('div');
  overlay.className = 'bl-confirm-overlay bl-detail-overlay';

  const card = document.createElement('div');
  card.className = 'bl-confirm-card bl-detail-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', titleId);

  const head = document.createElement('div');
  head.className = 'bl-detail__head';
  const h = document.createElement('h3');
  h.className = 'bl-detail__title';
  h.id = titleId;
  h.textContent = title;
  head.appendChild(h);
  if (subtitle) {
    const sub = document.createElement('p');
    sub.className = 'bl-detail__sub';
    sub.textContent = subtitle;
    head.appendChild(sub);
  }
  const closeX = document.createElement('button');
  closeX.type = 'button';
  closeX.className = 'bl-detail__x';
  closeX.setAttribute('aria-label', 'Cerrar');
  closeX.textContent = '×';
  closeX.addEventListener('click', closeDetailDialog);
  head.appendChild(closeX);
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'bl-detail__body';
  sections.forEach((s) => {
    const sec = document.createElement('section');
    sec.className = 'bl-detail__sec';
    const st = document.createElement('h4');
    st.textContent = s.title;
    sec.appendChild(st);
    if (s.text) {
      const p = document.createElement('p');
      p.textContent = s.text;
      sec.appendChild(p);
    }
    if (s.items?.length) {
      const ul = document.createElement('ul');
      ul.className = s.check ? 'bl-detail__list bl-detail__list--check' : 'bl-detail__list';
      s.items.forEach((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        ul.appendChild(li);
      });
      sec.appendChild(ul);
    }
    body.appendChild(sec);
  });
  card.appendChild(body);

  const foot = document.createElement('div');
  foot.className = 'bl-detail__foot';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'bl-confirm-btn bl-confirm-btn--confirm';
  closeBtn.textContent = closeText;
  closeBtn.addEventListener('click', closeDetailDialog);
  foot.appendChild(closeBtn);
  card.appendChild(foot);

  overlay.appendChild(card);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeDetailDialog();
  });

  // Esc cierra; Tab no se escapa de la ventana (da la vuelta entre sus botones).
  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeDetailDialog();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = [...card.querySelectorAll(FOCUSABLE)];
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!card.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKeydown, true);

  // El fondo no se mueve mientras está abierta: se traba SOLO el html. Nunca el body:
  // a11y.css le pone `overflow-x: clip` justamente para que NO sea un contenedor de
  // scroll, y un `overflow: hidden` en el body lo convierte en uno. Entonces el navbar
  // y el menú lateral (`position: sticky`) pierden su referencia, vuelven al principio
  // de la página y desaparecen de la pantalla. (Pasó: ver pruebas con el shell real.)
  // No hace falta reponer el ancho de la barra: home.css reserva siempre ese espacio
  // (`scrollbar-gutter: stable`), la página no salta.
  active = {
    overlay,
    onKeydown,
    trigger,
    prevHtmlOverflow: document.documentElement.style.overflow,
  };
  document.documentElement.style.overflow = 'hidden';

  // Un <dialog> abierto con showModal() deja inerte todo lo de afuera: se monta adentro.
  (document.querySelector('dialog:modal') || document.body).appendChild(overlay);
  closeX.focus();
  return card;
}

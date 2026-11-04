/**
 * notice.js — Avisos cortos de todo el sitio ("Agregado al carrito", "No se
 * pudo guardar", "Elegí un sabor antes de comprar").
 *
 * Antes había cinco implementaciones distintas (auth-utils, cart-utils,
 * carrito.js, hints-utils, support-utils) y dos de ellas salían en la misma
 * esquina, una encima de la otra; además solo 9 páginas tenían el <div id="toast">
 * del que dependían las de cart-utils, así que en el resto el aviso no se veía.
 * Ahora todo sale por acá y va a la misma pila (#bl-toast-container) que las
 * notificaciones de la campanita (js/toast-utils.js): arriba a la derecha en
 * compu, arriba de todo en celular, una debajo de la otra.
 *
 * Sin dependencias (ni Supabase ni DOM de la página) para poder importarlo
 * desde cualquier módulo sin ciclos.
 */

const STACK_ID = 'bl-toast-container';
/** Cuántos avisos como máximo a la vez; al pasarse se saca el más viejo. */
export const MAX_NOTICES = 4;
const DURATION_MS = { default: 5000, success: 4000, warning: 6500, error: 7000 };
const LEAVE_MS = 180;

/** La pila compartida: la crea quien llegue primero (aviso corto o notificación). */
export function noticeStack() {
  let stack = document.getElementById(STACK_ID);
  if (stack) return stack;
  stack = document.createElement('div');
  stack.id = STACK_ID;
  stack.setAttribute('role', 'region');
  stack.setAttribute('aria-label', 'Avisos');
  document.body.appendChild(stack);
  return stack;
}

/** 'error' | 'success' | 'warning' | 'default'; cualquier otra cosa es 'default'. */
export function normalizeNoticeType(type) {
  return type === 'error' || type === 'success' || type === 'warning' ? type : 'default';
}

/**
 * Muestra un aviso corto.
 * @param {string} message  Texto plano (se pone con textContent).
 * @param {'default'|'success'|'warning'|'error'} [type]
 * @returns {() => void} para cerrarlo antes de tiempo
 */
export function notify(message, type = 'default') {
  if (!message || typeof document === 'undefined') return () => {};
  const kind = normalizeNoticeType(type);
  const stack = noticeStack();

  // El mismo texto otra vez (ej. tocar "Agregar" cinco veces): no se apila, se
  // reinicia el tiempo del que ya está.
  const same = [...stack.querySelectorAll('.bl-toast--notice')]
    .find((n) => n.dataset.message === message && !n.classList.contains('is-leaving'));
  if (same) {
    same.dispatchEvent(new CustomEvent('bl:notice-restart'));
    return () => same.dispatchEvent(new CustomEvent('bl:notice-close'));
  }

  while (stack.children.length >= MAX_NOTICES) stack.firstElementChild.remove();

  const node = document.createElement('div');
  node.className = `bl-toast bl-toast--notice bl-toast--${kind}`;
  node.dataset.message = message;
  // Los errores se anuncian al toque; el resto espera a que el lector termine.
  node.setAttribute('role', kind === 'error' ? 'alert' : 'status');

  const text = document.createElement('p');
  text.className = 'bl-toast__text';
  text.textContent = message;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'bl-toast__close';
  close.setAttribute('aria-label', 'Cerrar aviso');
  const x = document.createElement('i');
  x.className = 'fa-solid fa-xmark';
  x.setAttribute('aria-hidden', 'true');
  close.appendChild(x);

  node.append(text, close);
  stack.appendChild(node);
  void node.offsetHeight; // reflow: sin esto la entrada no se anima
  requestAnimationFrame(() => node.classList.add('is-visible'));

  let timer = null;
  let holds = 0;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(dismiss, DURATION_MS[kind]);
  };
  function dismiss() {
    if (!node.isConnected || node.classList.contains('is-leaving')) return;
    clearTimeout(timer);
    node.classList.add('is-leaving');
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), LEAVE_MS);
  }
  // Mientras el mouse o el foco están encima no se va: da tiempo a leerlo.
  const hold = () => { holds += 1; clearTimeout(timer); };
  const release = () => { holds = Math.max(0, holds - 1); if (!holds) run(); };
  node.addEventListener('mouseenter', hold);
  node.addEventListener('mouseleave', release);
  node.addEventListener('focusin', hold);
  node.addEventListener('focusout', release);
  node.addEventListener('bl:notice-restart', () => { if (!holds) run(); });
  node.addEventListener('bl:notice-close', dismiss);
  close.addEventListener('click', dismiss);

  run();
  return dismiss;
}

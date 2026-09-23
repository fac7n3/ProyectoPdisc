/**
 * confirm-dialog.js — reemplazo lindo del `confirm()` nativo del navegador
 * Baradero Local
 *
 * `window.confirm()` muestra el cuadro gris del navegador con la URL del
 * sitio arriba — no se puede estilar y desentona con el resto de la UI.
 * `confirmDialog(mensaje)` arma el mismo chequeo (devuelve una Promise<boolean>)
 * pero con una tarjeta propia, en el estilo del sitio.
 */

let activeDialog = null;

function closeDialog(resolve, value) {
  if (!activeDialog) return;
  document.removeEventListener('keydown', activeDialog.onKeydown);
  activeDialog.overlay.remove();
  activeDialog = null;
  resolve(value);
}

/**
 * @param {string} message
 * @param {{ title?: string, confirmText?: string, cancelText?: string, danger?: boolean }} [options]
 * @returns {Promise<boolean>} true si confirmó, false si canceló/cerró
 */
export function confirmDialog(message, options = {}) {
  const {
    title = '',
    confirmText = 'Aceptar',
    cancelText = 'Cancelar',
    danger = false,
  } = options;

  return new Promise((resolve) => {
    if (activeDialog) closeDialog(resolve, false);

    const overlay = document.createElement('div');
    overlay.className = 'bl-confirm-overlay';

    const card = document.createElement('div');
    card.className = 'bl-confirm-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');

    if (title) {
      const h = document.createElement('h3');
      h.className = 'bl-confirm-title';
      h.textContent = title;
      card.appendChild(h);
      card.setAttribute('aria-labelledby', 'bl-confirm-title');
      h.id = 'bl-confirm-title';
    }

    const p = document.createElement('p');
    p.className = 'bl-confirm-msg';
    p.textContent = message;
    card.appendChild(p);
    if (!title) card.setAttribute('aria-label', message);

    const actions = document.createElement('div');
    actions.className = 'bl-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'bl-confirm-btn bl-confirm-btn--cancel';
    cancelBtn.textContent = cancelText;
    cancelBtn.addEventListener('click', () => closeDialog(resolve, false));

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = danger
      ? 'bl-confirm-btn bl-confirm-btn--danger'
      : 'bl-confirm-btn bl-confirm-btn--confirm';
    confirmBtn.textContent = confirmText;
    confirmBtn.addEventListener('click', () => closeDialog(resolve, true));

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    card.appendChild(actions);
    overlay.appendChild(card);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) closeDialog(resolve, false);
    });

    const onKeydown = (e) => {
      if (e.key === 'Escape') closeDialog(resolve, false);
    };
    document.addEventListener('keydown', onKeydown);

    activeDialog = { overlay, onKeydown };
    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}

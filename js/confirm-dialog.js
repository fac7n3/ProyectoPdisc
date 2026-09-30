/**
 * confirm-dialog.js — reemplazo lindo del `confirm()` nativo del navegador
 * Baradero Local
 *
 * `window.confirm()` muestra el cuadro gris del navegador con la URL del
 * sitio arriba — no se puede estilar y desentona con el resto de la UI.
 * `confirmDialog(mensaje)` arma el mismo chequeo (devuelve una Promise<boolean>)
 * pero con una tarjeta propia, en el estilo del sitio. `formDialog` es la
 * misma tarjeta con campos: un motivo a elegir y/o un texto (ej. el código de
 * retiro de un pedido).
 */

let activeDialog = null;

function closeDialog(resolve, value) {
  if (!activeDialog) return;
  document.removeEventListener('keydown', activeDialog.onKeydown);
  activeDialog.overlay.remove();
  activeDialog = null;
  resolve(value);
}

/** Overlay + tarjeta + título + mensaje, comunes a los dos diálogos. */
function buildShell(message, title, resolve, cancelValue) {
  if (activeDialog) closeDialog(activeDialog.resolve, activeDialog.cancelValue);

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

  overlay.appendChild(card);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeDialog(resolve, cancelValue);
  });

  const onKeydown = (e) => {
    if (e.key === 'Escape') closeDialog(resolve, cancelValue);
  };
  document.addEventListener('keydown', onKeydown);

  activeDialog = { overlay, onKeydown, resolve, cancelValue };
  return { overlay, card };
}

function buildActions({ cancelText, confirmText, danger }, onCancel, onConfirm) {
  const actions = document.createElement('div');
  actions.className = 'bl-confirm-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'bl-confirm-btn bl-confirm-btn--cancel';
  cancelBtn.textContent = cancelText;
  cancelBtn.addEventListener('click', onCancel);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = danger
    ? 'bl-confirm-btn bl-confirm-btn--danger'
    : 'bl-confirm-btn bl-confirm-btn--confirm';
  confirmBtn.textContent = confirmText;
  confirmBtn.addEventListener('click', onConfirm);

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  return { actions, confirmBtn };
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
    const { overlay, card } = buildShell(message, title, resolve, false);
    const { actions, confirmBtn } = buildActions(
      { cancelText, confirmText, danger },
      () => closeDialog(resolve, false),
      () => closeDialog(resolve, true),
    );
    card.appendChild(actions);
    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}

let fieldSeq = 0;

/**
 * La misma tarjeta, con campos. `choices` arma una lista de motivos (más
 * "Otro motivo" con texto libre si `allowOther`); `input` arma un campo de
 * texto suelto. "Confirmar" se habilita recién cuando hay algo elegido o
 * escrito (y, si hay `input.pattern`, cuando lo escrito lo cumple).
 * `extraText` agrega una acción secundaria (ej. "Entregar sin código").
 *
 * @param {string} message
 * @param {{
 *   title?: string, confirmText?: string, cancelText?: string, danger?: boolean,
 *   choices?: string[], allowOther?: boolean,
 *   input?: { label: string, placeholder?: string, inputMode?: string, maxLength?: number, pattern?: RegExp, value?: string },
 *   extraText?: string,
 * }} [options]
 * @returns {Promise<null | { value: string, extra: boolean }>} null si canceló
 */
export function formDialog(message, options = {}) {
  const {
    title = '',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    danger = false,
    choices = null,
    allowOther = true,
    input = null,
    extraText = null,
  } = options;

  return new Promise((resolve) => {
    const { overlay, card } = buildShell(message, title, resolve, null);
    card.classList.add('bl-confirm-card--form');
    const seq = ++fieldSeq;

    let getValue = () => '';
    let firstField = null;
    const fields = document.createElement('div');
    fields.className = 'bl-confirm-fields';

    if (choices?.length) {
      const group = document.createElement('div');
      group.className = 'bl-confirm-choices';
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', title || message);
      const name = `bl-confirm-choice-${seq}`;
      const other = document.createElement('textarea');
      other.className = 'bl-confirm-input bl-confirm-input--other';
      other.rows = 2;
      other.maxLength = 300;
      other.placeholder = 'Contá el motivo';
      other.setAttribute('aria-label', 'Otro motivo');
      other.hidden = true;

      [...choices, ...(allowOther ? ['__other__'] : [])].forEach((choice) => {
        const label = document.createElement('label');
        label.className = 'bl-confirm-choice';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = name;
        radio.value = choice;
        radio.addEventListener('change', () => {
          other.hidden = choice !== '__other__';
          if (!other.hidden) other.focus();
          sync();
        });
        label.append(radio, document.createTextNode(choice === '__other__' ? 'Otro motivo' : choice));
        group.appendChild(label);
        if (!firstField) firstField = radio;
      });
      other.addEventListener('input', sync);
      fields.append(group, other);

      getValue = () => {
        const checked = group.querySelector('input:checked');
        if (!checked) return '';
        return checked.value === '__other__' ? other.value.trim() : checked.value;
      };
    }

    let textInput = null;
    if (input) {
      const id = `bl-confirm-input-${seq}`;
      const label = document.createElement('label');
      label.className = 'bl-confirm-label';
      label.htmlFor = id;
      label.textContent = input.label;
      textInput = document.createElement('input');
      textInput.id = id;
      textInput.className = 'bl-confirm-input';
      textInput.type = 'text';
      textInput.autocomplete = 'off';
      if (input.placeholder) textInput.placeholder = input.placeholder;
      if (input.inputMode) textInput.inputMode = input.inputMode;
      if (input.maxLength) textInput.maxLength = input.maxLength;
      if (input.value) textInput.value = input.value;
      textInput.addEventListener('input', sync);
      textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !confirmBtn.disabled) confirmBtn.click();
      });
      fields.append(label, textInput);
      if (!firstField) firstField = textInput;
      getValue = () => textInput.value.trim();
    }

    card.appendChild(fields);

    const { actions, confirmBtn } = buildActions(
      { cancelText, confirmText, danger },
      () => closeDialog(resolve, null),
      () => closeDialog(resolve, { value: getValue(), extra: false }),
    );

    function sync() {
      const value = getValue();
      confirmBtn.disabled = !value || Boolean(input?.pattern && !input.pattern.test(value));
    }

    if (extraText) {
      const extra = document.createElement('button');
      extra.type = 'button';
      extra.className = 'bl-confirm-extra';
      extra.textContent = extraText;
      extra.addEventListener('click', () => closeDialog(resolve, { value: getValue(), extra: true }));
      card.appendChild(extra);
    }

    card.appendChild(actions);
    sync();
    document.body.appendChild(overlay);
    (firstField || confirmBtn).focus();
  });
}

/**
 * Desplegable propio, para reemplazar al `<select>` nativo (que no se puede
 * estilar: cada navegador y cada sistema lo dibuja distinto).
 *
 * Se arma solo, sin depender de ids en el HTML, así sirve dentro de una fila
 * de tabla o de un editor inline donde puede haber muchos a la vez. El del
 * sidebar de búsqueda no usa esto porque su marcado ya vive en search.html.
 *
 * No importa nada: se puede probar con `node js/dropdown.test.mjs`.
 */

let seq = 0;

/**
 * @param {object} cfg
 * @param {{value: string, label: string}[]} cfg.options
 * @param {string} [cfg.value] valor inicial
 * @param {(value: string) => void} [cfg.onSelect]
 * @param {string} [cfg.ariaLabel]
 * @param {Document} [cfg.doc] para poder testear con un DOM inyectado
 * @returns {{ element, getValue, setValue, setDisabled }}
 */
export function buildDropdown({ options, value = '', onSelect, ariaLabel = 'Elegir una opción', doc = document }) {
  const id = `bl-dd-${++seq}`;
  let current = value;
  let disabled = false;

  const root = doc.createElement('div');
  root.className = 'bl-dropdown';

  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 'bl-dropdown__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', ariaLabel);

  const labelEl = doc.createElement('span');
  labelEl.className = 'bl-dropdown__label';
  trigger.appendChild(labelEl);

  const caret = doc.createElement('i');
  caret.className = 'fa-solid fa-chevron-down bl-dropdown__caret';
  caret.setAttribute('aria-hidden', 'true');
  trigger.appendChild(caret);

  const menu = doc.createElement('div');
  menu.className = 'bl-dropdown__menu';
  menu.setAttribute('role', 'listbox');
  menu.id = `${id}-menu`;
  menu.hidden = true;

  root.append(trigger, menu);

  const labelDe = (v) => options.find((o) => o.value === v)?.label ?? '';

  function syncLabel() {
    labelEl.textContent = labelDe(current) || options[0]?.label || '';
    menu.querySelectorAll('.bl-dropdown__item').forEach((item) => {
      const activa = item.dataset.value === current;
      item.classList.toggle('bl-dropdown__item--active', activa);
      item.setAttribute('aria-selected', String(activa));
    });
  }

  const open = () => {
    if (disabled) return;
    menu.hidden = false;
    root.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    menu.hidden = true;
    root.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
  };

  options.forEach((op) => {
    const item = doc.createElement('button');
    item.type = 'button';
    item.className = 'bl-dropdown__item';
    item.dataset.value = op.value;
    item.setAttribute('role', 'option');
    item.textContent = op.label;
    item.addEventListener('click', () => {
      const previo = current;
      current = op.value;
      syncLabel();
      close();
      trigger.focus();
      if (previo !== current) onSelect?.(op.value);
    });
    menu.appendChild(item);
  });

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden ? open() : close();
  });

  // Cerrar al hacer click afuera o con Escape. Se engancha al documento, no al
  // root: el click de cierre suele caer en cualquier otro lado de la página.
  doc.addEventListener('click', (e) => {
    if (!root.contains(e.target)) close();
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      close();
      trigger.focus();
    }
  });

  syncLabel();

  return {
    element: root,
    getValue: () => current,
    setValue: (v) => { current = v; syncLabel(); },
    setDisabled: (v) => {
      disabled = !!v;
      trigger.disabled = disabled;
      if (disabled) close();
    },
  };
}

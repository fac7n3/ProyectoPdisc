/**
 * Selector de fecha propio, para reemplazar al `<input type="date">` nativo
 * (cada navegador lo dibuja distinto: el "dd/mm/aaaa" gris de Chrome, el ícono
 * de calendario propio, el ancho que no respeta el del formulario).
 *
 * Dos formas de cargar la fecha, porque sirven para cosas distintas:
 *  - **Escribiendo** (con máscara dd/mm/aaaa). Es lo más rápido para una fecha
 *    lejana: nadie quiere retroceder 400 meses para poner su nacimiento.
 *  - **Calendario**, para "el mes que viene" y para ver en qué día de la semana
 *    cae.
 *
 * El valor viaja en un `<input type="hidden">` con el id original, en formato
 * ISO (YYYY-MM-DD), así todo el código que ya hacía `getElementById(id).value`
 * sigue funcionando sin tocarse.
 *
 * A propósito NO usa `new Date(iso)` para parsear: eso interpreta el string
 * como UTC y en Argentina (UTC-3) devuelve el día anterior. Toda la aritmética
 * es sobre {año, mes, día} o sobre Date.UTC, que sí es estable.
 *
 * Las funciones puras se corren con `node js/datepicker.test.mjs`.
 */

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
// La semana arranca en lunes, como en Argentina.
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Días que tiene un mes (1-12), contemplando años bisiestos. */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ¿Es una fecha de calendario real? Rechaza 31/02 y meses/días fuera de rango. */
export function isValidIso(iso) {
  if (typeof iso !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > daysInMonth(y, mo)) return false;
  return true;
}

/** 'YYYY-MM-DD' -> '12/03/1994' ('' si no es una fecha válida). */
export function isoToDisplay(iso) {
  if (!isValidIso(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** '12/03/1994' -> '1994-03-12' (null si está incompleta o no existe). */
export function displayToIso(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((text || '').trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isValidIso(iso) ? iso : null;
}

/** Va poniendo las barras mientras se escribe: "12031994" -> "12/03/1994". */
export function maskDate(text) {
  const d = (text || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Compara dos ISO como texto: el formato ya ordena cronológicamente. */
export function isoInRange(iso, min, max) {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

/** Hoy en ISO local (no UTC: en Argentina eso puede caer en el día anterior). */
export function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Celdas del mes, alineadas a una semana que empieza en lunes. Devuelve las
 * 6 filas completas (42 celdas) para que el alto del calendario no cambie al
 * pasar de mes, que hace saltar el resto del formulario.
 */
export function monthGrid(year, month) {
  // getUTCDay(): 0=domingo. Se corre para que 0=lunes.
  const primerDia = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const total = daysInMonth(year, month);
  const celdas = [];

  for (let i = 0; i < 42; i++) {
    const diaDelMes = i - primerDia + 1;
    if (diaDelMes < 1 || diaDelMes > total) {
      celdas.push(null); // relleno: fuera del mes
    } else {
      const mm = String(month).padStart(2, '0');
      const dd = String(diaDelMes).padStart(2, '0');
      celdas.push({ iso: `${year}-${mm}-${dd}`, day: diaDelMes });
    }
  }
  return celdas;
}

/** Suma meses a un {year, month} (month 1-12). */
export function addMonths(year, month, delta) {
  const total = (year * 12) + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

let seq = 0;

/**
 * @param {object} cfg
 * @param {HTMLInputElement} cfg.input el <input type="date"> a reemplazar; se
 *        convierte en hidden y conserva su id, name y valor.
 * @param {string} [cfg.min] ISO
 * @param {string} [cfg.max] ISO
 * @param {string} [cfg.ariaLabel]
 * @returns {{ element, getValue, setValue }}
 */
export function buildDatePicker({ input, min = '', max = '', ariaLabel = 'Fecha' }) {
  const doc = input.ownerDocument;
  const id = `bl-dp-${++seq}`;

  // El input original pasa a ser el portador del valor en ISO.
  input.type = 'hidden';

  const root = doc.createElement('div');
  root.className = 'bl-date';

  const field = doc.createElement('div');
  field.className = 'bl-date__field';

  const text = doc.createElement('input');
  text.type = 'text';
  text.className = 'bl-date__text';
  text.placeholder = 'dd/mm/aaaa';
  text.inputMode = 'numeric';
  text.autocomplete = 'off';
  text.maxLength = 10;
  text.setAttribute('aria-label', ariaLabel);
  text.value = isoToDisplay(input.value);
  field.appendChild(text);

  const openBtn = doc.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'bl-date__btn';
  openBtn.setAttribute('aria-label', 'Abrir el calendario');
  openBtn.setAttribute('aria-expanded', 'false');
  openBtn.setAttribute('aria-controls', `${id}-pop`);
  const btnIcon = doc.createElement('i');
  btnIcon.className = 'fa-regular fa-calendar';
  btnIcon.setAttribute('aria-hidden', 'true');
  openBtn.appendChild(btnIcon);
  field.appendChild(openBtn);

  root.appendChild(field);

  const pop = doc.createElement('div');
  pop.className = 'bl-date__pop';
  pop.id = `${id}-pop`;
  pop.hidden = true;
  root.appendChild(pop);

  // El calendario se dibuja sobre este mes; arranca en la fecha cargada.
  let vista = (() => {
    const base = isValidIso(input.value) ? input.value : todayIso();
    return { year: Number(base.slice(0, 4)), month: Number(base.slice(5, 7)) };
  })();

  input.parentNode.insertBefore(root, input);
  root.appendChild(input);

  function setValue(iso, { silent = false } = {}) {
    const ok = isValidIso(iso) && isoInRange(iso, min, max);
    input.value = ok ? iso : '';
    if (!silent) text.value = ok ? isoToDisplay(iso) : '';
    text.setAttribute('aria-invalid', String(!!text.value && !ok));
    if (ok) vista = { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
  }

  function renderPop() {
    pop.textContent = '';

    const head = doc.createElement('div');
    head.className = 'bl-date__head';

    const prev = doc.createElement('button');
    prev.type = 'button';
    prev.className = 'bl-date__nav';
    prev.setAttribute('aria-label', 'Mes anterior');
    prev.innerHTML = '';
    const prevIcon = doc.createElement('i');
    prevIcon.className = 'fa-solid fa-chevron-left';
    prevIcon.setAttribute('aria-hidden', 'true');
    prev.appendChild(prevIcon);
    prev.addEventListener('click', () => { vista = addMonths(vista.year, vista.month, -1); renderPop(); });
    head.appendChild(prev);

    const titulo = doc.createElement('span');
    titulo.className = 'bl-date__title';
    titulo.setAttribute('aria-live', 'polite');
    titulo.textContent = `${MESES[vista.month - 1]} ${vista.year}`;
    head.appendChild(titulo);

    const next = doc.createElement('button');
    next.type = 'button';
    next.className = 'bl-date__nav';
    next.setAttribute('aria-label', 'Mes siguiente');
    const nextIcon = doc.createElement('i');
    nextIcon.className = 'fa-solid fa-chevron-right';
    nextIcon.setAttribute('aria-hidden', 'true');
    next.appendChild(nextIcon);
    next.addEventListener('click', () => { vista = addMonths(vista.year, vista.month, 1); renderPop(); });
    head.appendChild(next);

    pop.appendChild(head);

    const semana = doc.createElement('div');
    semana.className = 'bl-date__week';
    DIAS.forEach((d, i) => {
      const s = doc.createElement('span');
      s.textContent = d;
      // Dos "M" seguidas (martes/miércoles) sin esto se leen igual.
      s.title = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i];
      semana.appendChild(s);
    });
    pop.appendChild(semana);

    const grid = doc.createElement('div');
    grid.className = 'bl-date__grid';
    const hoy = todayIso();

    monthGrid(vista.year, vista.month).forEach((celda) => {
      if (!celda) {
        const vacio = doc.createElement('span');
        vacio.className = 'bl-date__day bl-date__day--empty';
        grid.appendChild(vacio);
        return;
      }
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'bl-date__day';
      b.textContent = String(celda.day);
      b.dataset.iso = celda.iso;
      if (celda.iso === input.value) b.classList.add('bl-date__day--selected');
      if (celda.iso === hoy) b.classList.add('bl-date__day--today');
      if (!isoInRange(celda.iso, min, max)) b.disabled = true;
      b.addEventListener('click', () => {
        setValue(celda.iso);
        close();
        text.focus();
      });
      grid.appendChild(b);
    });
    pop.appendChild(grid);
  }

  function open() {
    renderPop();
    pop.hidden = false;
    root.classList.add('is-open');
    openBtn.setAttribute('aria-expanded', 'true');
  }
  function close() {
    pop.hidden = true;
    root.classList.remove('is-open');
    openBtn.setAttribute('aria-expanded', 'false');
  }

  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden ? open() : close();
  });

  text.addEventListener('input', () => {
    const antes = text.value;
    text.value = maskDate(antes);
    // Se escribe con silent para no pisar lo que la persona está tecleando.
    setValue(displayToIso(text.value) || '', { silent: true });
  });

  // Al salir del campo se normaliza: o queda una fecha válida, o se vacía.
  text.addEventListener('blur', () => {
    const iso = displayToIso(text.value);
    if (!text.value.trim()) { setValue(''); return; }
    if (iso && isoInRange(iso, min, max)) setValue(iso);
    else text.setAttribute('aria-invalid', 'true');
  });

  // form.reset() no alcanza para limpiar esto, por dos motivos:
  //  1. El campo visible es un input aparte, que el reset no conoce.
  //  2. En un input `hidden`, asignar .value escribe el ATRIBUTO value (su
  //     modo de valor es "default"), así que el reset lo restaura... a sí
  //     mismo. Con el <input type="date"> original sí se limpiaba.
  // Sin esto, después de crear un cupón el siguiente heredaba en silencio la
  // fecha de vencimiento del anterior. Se vuelve al valor que tenía al cargar.
  const valorInicial = input.value;
  input.form?.addEventListener('reset', () => {
    setTimeout(() => setValue(valorInicial), 0);
  });

  doc.addEventListener('click', (e) => {
    if (!root.contains(e.target)) close();
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) { close(); openBtn.focus(); }
  });

  return {
    element: root,
    getValue: () => input.value,
    setValue: (iso) => setValue(iso || ''),
  };
}

/**
 * Convierte todos los `<input type="date">` que encuentre dentro de `scope`.
 * Devuelve un mapa id -> picker, para los pocos lugares que necesitan escribir
 * el valor desde afuera.
 */
export function upgradeDateInputs(scope = document) {
  const pickers = {};
  scope.querySelectorAll('input[type="date"]').forEach((input) => {
    const picker = buildDatePicker({
      input,
      min: input.min || '',
      max: input.max || '',
      ariaLabel: input.getAttribute('aria-label')
        || scope.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()
        || 'Fecha',
    });
    if (input.id) pickers[input.id] = picker;
  });
  return pickers;
}

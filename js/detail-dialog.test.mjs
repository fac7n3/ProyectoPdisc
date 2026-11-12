// node js/detail-dialog.test.mjs
// La ventana central de detalles (js/detail-dialog.js) con un DOM falso mínimo.
// Lo que más importa: al abrirla se traba el scroll SOLO en el <html>. Si se le pone
// `overflow` al <body>, el body pasa a ser un contenedor de scroll y el navbar y el menú
// lateral (`position: sticky`) se van al principio de la página y desaparecen (pasó el
// 2026-11-12 en Impulsar). El diseño real (sticky, tamaños) se prueba con Playwright.
import assert from 'node:assert/strict';

let n = 0;
function check(name, fn) {
  try { fn(); n += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// ---- DOM falso ----
const writes = []; // toda escritura de `overflow` en cualquier style, con quién la hizo
function makeStyle(owner, initial = {}) {
  return new Proxy({ ...initial }, {
    set(t, k, v) { if (k === 'overflow') writes.push(`${owner}=${v}`); t[k] = v; return true; },
  });
}
function makeEl(tag) {
  const el = {
    tag, className: '', id: '', textContent: '', type: '', children: [], parent: null, isConnected: false,
    attrs: {}, listeners: {}, style: makeStyle(tag),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { c.parent = el; c.isConnected = el.isConnected; el.children.push(c); markConnected(c, el.isConnected); return c; },
    addEventListener(t, fn) { (el.listeners[t] ||= []).push(fn); },
    remove() { if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el); el.parent = null; markConnected(el, false); },
    focus() { doc.activeElement = el; },
    querySelectorAll(sel) {
      const out = [];
      (function walk(e) { e.children.forEach((c) => { if (c.tag === 'button') out.push(c); walk(c); }); })(el);
      return sel ? out : [];
    },
  };
  return el;
}
function markConnected(el, v) { el.isConnected = v; el.children.forEach((c) => markConnected(c, v)); }

const docListeners = { keydown: [] };
const html = makeEl('html'); html.isConnected = true; html.style = makeStyle('html', { overflow: '' });
const body = makeEl('body'); body.isConnected = true; body.style = makeStyle('body', { overflow: '' });
const doc = {
  documentElement: html, body, activeElement: null,
  createElement: (t) => makeEl(t),
  querySelector: () => null, // sin <dialog> modal abierto
  addEventListener: (t, fn) => { (docListeners[t] ||= []).push(fn); },
  removeEventListener: (t, fn) => { docListeners[t] = (docListeners[t] || []).filter((f) => f !== fn); },
};
globalThis.document = doc;

const { openDetailDialog, closeDetailDialog } = await import('./detail-dialog.js');

const find = (root, cls) => { let hit = null; (function walk(e) { if (e.className.split(' ').includes(cls)) hit = hit || e; e.children.forEach(walk); })(root); return hit; };
const press = (key) => {
  let prevented = false;
  [...docListeners.keydown].forEach((fn) => fn({ key, shiftKey: false, preventDefault() { prevented = true; }, stopPropagation() {} }));
  return prevented;
};
const SECTIONS = [{ title: 'Qué contiene', text: 'Algo' }, { title: 'Ejemplos', items: ['Uno', 'Dos'] }, { title: 'Por qué conviene', items: ['A'], check: true }];
const open = (trigger) => openDetailDialog({ title: 'Banner chico', subtitle: 'Banner · $6.000', sections: SECTIONS, trigger });
const overlayOf = () => body.children.find((c) => c.className.includes('bl-detail-overlay'));

check('al abrir se traba el scroll en el html', () => {
  writes.length = 0;
  open(null);
  assert.equal(html.style.overflow, 'hidden');
  assert.ok(overlayOf(), 'la ventana quedó en el body');
});

check('NUNCA se escribe overflow en el body (rompería el sticky del navbar y del menú)', () => {
  assert.ok(!writes.some((w) => w.startsWith('body=')), writes.join(', '));
  assert.equal(body.style.overflow, '');
});

check('la tarjeta es un diálogo accesible con el título enlazado', () => {
  const card = find(overlayOf(), 'bl-detail-card');
  assert.equal(card.attrs.role, 'dialog');
  assert.equal(card.attrs['aria-modal'], 'true');
  assert.equal(card.attrs['aria-labelledby'], find(overlayOf(), 'bl-detail__title').id);
});

check('arma una sección por cada bloque, con listas y tildes', () => {
  const secs = [];
  (function walk(e) { if (e.tag === 'section') secs.push(e); e.children.forEach(walk); })(overlayOf());
  assert.equal(secs.length, 3);
  const lists = [];
  (function walk(e) { if (e.tag === 'ul') lists.push(e); e.children.forEach(walk); })(overlayOf());
  assert.equal(lists.length, 2);
  assert.equal(lists[1].className, 'bl-detail__list bl-detail__list--check');
});

check('cerrar devuelve el scroll del html y saca la ventana', () => {
  writes.length = 0;
  closeDetailDialog();
  assert.equal(html.style.overflow, '');
  assert.equal(overlayOf(), undefined);
  assert.ok(!writes.some((w) => w.startsWith('body=')), 'el body tampoco se toca al cerrar');
  assert.equal(docListeners.keydown.length, 0, 'se sacó el listener de teclado');
});

check('cerrar sin nada abierto no rompe nada', () => {
  closeDetailDialog();
  assert.equal(html.style.overflow, '');
});

check('si el html ya tenía un overflow, se lo devuelve tal cual', () => {
  html.style.overflow = 'auto';
  open(null);
  assert.equal(html.style.overflow, 'hidden');
  closeDetailDialog();
  assert.equal(html.style.overflow, 'auto');
  html.style.overflow = '';
});

check('abrir una segunda ventana encima de la primera no deja el scroll trabado para siempre', () => {
  open(null);
  open(null); // cierra la 1ª y abre la 2ª
  assert.equal(body.children.filter((c) => c.className.includes('bl-detail-overlay')).length, 1);
  closeDetailDialog();
  assert.equal(html.style.overflow, '', 'tras cerrar queda como al principio, no en "hidden"');
});

check('Esc cierra', () => {
  open(null);
  assert.equal(press('Escape'), true);
  assert.equal(overlayOf(), undefined);
  assert.equal(html.style.overflow, '');
});

check('la X y "Cerrar" cierran', () => {
  open(null);
  find(overlayOf(), 'bl-detail__x').listeners.click[0]();
  assert.equal(overlayOf(), undefined);
  open(null);
  find(overlayOf(), 'bl-confirm-btn').listeners.click[0]();
  assert.equal(overlayOf(), undefined);
  assert.equal(html.style.overflow, '');
});

check('tocar el fondo oscuro cierra, tocar la tarjeta no', () => {
  open(null);
  const overlay = overlayOf();
  const card = find(overlay, 'bl-detail-card');
  overlay.listeners.mousedown[0]({ target: card });
  assert.ok(overlayOf(), 'tocar adentro no cierra');
  overlay.listeners.mousedown[0]({ target: overlay });
  assert.equal(overlayOf(), undefined);
});

check('al cerrar, el foco vuelve al botón que la abrió', () => {
  const trigger = makeEl('button'); trigger.isConnected = true;
  open(trigger);
  assert.notEqual(doc.activeElement, trigger, 'adentro el foco está en la X');
  closeDetailDialog();
  assert.equal(doc.activeElement, trigger);
});

check('Tab da la vuelta adentro de la ventana', () => {
  open(null);
  const card = find(overlayOf(), 'bl-detail-card');
  const btns = card.querySelectorAll('button');
  doc.activeElement = btns[btns.length - 1];
  let prevented = false;
  docListeners.keydown[0]({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true);
  assert.equal(doc.activeElement, btns[0]);
  closeDetailDialog();
});

console.log(`\n${n} checks ok`);

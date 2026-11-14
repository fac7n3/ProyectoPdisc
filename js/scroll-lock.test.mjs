// node js/scroll-lock.test.mjs
// El helper que traba el scroll de la página con un cuadro central abierto (js/scroll-lock.js).
// Lo que importa: solo toca el <html>, y con cuadros anidados se destraba al cerrar el último.
import assert from 'node:assert/strict';

let n = 0;
function check(name, fn) {
  try { fn(); n += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

const html = { style: { overflow: '' } };
const body = { style: { overflow: '' } };
globalThis.document = { documentElement: html, body };
const { lockScroll } = await import('./scroll-lock.js');

check('traba el html y no toca el body', () => {
  const unlock = lockScroll();
  assert.equal(html.style.overflow, 'hidden');
  assert.equal(body.style.overflow, '');
  unlock();
  assert.equal(html.style.overflow, '');
});

check('repone el valor que había antes', () => {
  html.style.overflow = 'scroll';
  const unlock = lockScroll();
  unlock();
  assert.equal(html.style.overflow, 'scroll');
  html.style.overflow = '';
});

check('con dos cuadros, se destraba al cerrar el último', () => {
  const a = lockScroll();
  const b = lockScroll();
  a();
  assert.equal(html.style.overflow, 'hidden');
  b();
  assert.equal(html.style.overflow, '');
});

check('soltar dos veces la misma traba no destraba la de otro', () => {
  const a = lockScroll();
  const b = lockScroll();
  a();
  a();
  assert.equal(html.style.overflow, 'hidden');
  b();
  assert.equal(html.style.overflow, '');
});

console.log(`${n} ok`);

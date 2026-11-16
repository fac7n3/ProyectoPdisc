// node js/nav-menus.test.mjs
// Un solo menú del navbar abierto a la vez (js/nav-menus.js): al abrirse uno, los otros se cierran,
// pero nunca el que se acaba de abrir.
import assert from 'node:assert/strict';
import { announceNavMenuOpen, closeOnOtherNavMenuOpen } from './nav-menus.js';

let n = 0;
function check(name, fn) {
  try { fn(); n += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

function setup() {
  const bus = new EventTarget();
  const menus = ['categorias', 'campanita', 'cuenta'].map((name) => {
    const m = { name, owner: { name }, closed: 0 };
    m.stop = closeOnOtherNavMenuOpen(m.owner, () => { m.closed += 1; }, bus);
    return m;
  });
  return { bus, menus };
}

check('al abrir uno se cierran los otros dos', () => {
  const { bus, menus } = setup();
  announceNavMenuOpen(menus[2].owner, bus);
  assert.deepEqual(menus.map((m) => m.closed), [1, 1, 0]);
});

check('el menú que se abre no se cierra a sí mismo', () => {
  const { bus, menus } = setup();
  announceNavMenuOpen(menus[0].owner, bus);
  assert.equal(menus[0].closed, 0);
});

check('dejar de escuchar corta el aviso', () => {
  const { bus, menus } = setup();
  menus[1].stop();
  announceNavMenuOpen(menus[0].owner, bus);
  assert.deepEqual(menus.map((m) => m.closed), [0, 0, 1]);
});

console.log(`\n${n} ok`);

// node js/nav-back.test.mjs
// La flecha del navbar de los paneles de vendedor y de profesional tiene que llevar SIEMPRE al inicio, no a la página
// anterior del historial: lo marca `data-nav-home` y lo respeta `handleNavBack` (js/auth-utils.js).
// El panel está detrás del login, así que el comportamiento real se prueba en e2e/humo.spec.mjs con
// una página pública; acá solo se vigila que la marca no se pierda del HTML ni del manejador.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
function check(name, fn) {
  try { fn(); n += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

const authUtils = readFileSync(new URL('./auth-utils.js', import.meta.url), 'utf8');

for (const pagina of ['vender', 'profesional']) {
  const html = readFileSync(new URL(`../pages/${pagina}.html`, import.meta.url), 'utf8');
  // Las flechas del navbar: <a ... class="navbar__action-circle" ...><i class="fa-solid fa-arrow-left">
  const flechas = [...html.matchAll(/<a\b[^>]*class="[^"]*navbar__action-circle[^"]*"[^>]*>\s*<i class="fa-solid fa-arrow-left"/g)].map((m) => m[0]);

  check(`${pagina}.html tiene una sola flecha en el navbar`, () => {
    assert.equal(flechas.length, 1, `se esperaba 1 flecha y hay ${flechas.length}`);
  });

  check(`la flecha de ${pagina}.html lleva a home.html y está marcada con data-nav-home`, () => {
    assert.match(flechas[0], /href="\.\/home\.html"/);
    assert.match(flechas[0], /\sdata-nav-home(\s|>|=)/);
  });

  check(`el menú lateral de ${pagina}.html ya no tiene el botón "Volver al inicio"`, () => {
    assert.doesNotMatch(html, /id="(btn-logout-seller|of-logout)"/);
    const menu = html.slice(html.indexOf('id="mc-sidebar"'), html.indexOf('<div class="mc-content">'));
    assert.ok(menu.length > 200, 'no se encontró el menú lateral');
    assert.doesNotMatch(menu, /Volver al inicio/);
  });
}

check('handleNavBack no usa history.back() cuando la flecha trae data-nav-home', () => {
  const cuerpo = authUtils.slice(authUtils.indexOf('function handleNavBack'));
  const fin = cuerpo.indexOf('\n}\n');
  const fn = cuerpo.slice(0, fin);
  assert.match(fn, /!circle\.hasAttribute\("data-nav-home"\)\s*&&\s*hasSiteHistory\(\)/);
  // y sigue marcando la intención de ver el inicio, para que home.js no rebote al panel
  assert.match(fn, /HOME_INTENT_KEY/);
});

console.log(`\n${n} ok`);

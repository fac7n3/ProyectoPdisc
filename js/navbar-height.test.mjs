// navbar-height.js: publica el alto del navbar como variable CSS y el menú lateral
// de "Mi cuenta" (vender.html / profesional.css) la usa para no quedar tapado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { syncNavbarHeight, watchNavbarHeight } from './navbar-height.js';

function fakeDoc(height) {
  const props = {};
  const navbar = height == null ? null : { getBoundingClientRect: () => ({ height }) };
  return {
    props,
    querySelector: (sel) => (sel === '.navbar' ? navbar : null),
    documentElement: { dataset: {}, style: { setProperty: (k, v) => { props[k] = v; } } },
  };
}

test('publica el alto del navbar', () => {
  const doc = fakeDoc(61);
  assert.equal(syncNavbarHeight(doc), 61);
  assert.equal(doc.props['--bl-navbar-height'], '61px');
});

test('sin navbar publica 0px', () => {
  const doc = fakeDoc(null);
  syncNavbarHeight(doc);
  assert.equal(doc.props['--bl-navbar-height'], '0px');
});

test('watchNavbarHeight es idempotente y observa cambios de tamaño', () => {
  const doc = fakeDoc(70);
  let observed = 0;
  class RO { constructor(cb) { this.cb = cb; } observe() { observed++; } }
  const win = { ResizeObserver: RO, addEventListener() {} };
  watchNavbarHeight(doc, win);
  watchNavbarHeight(doc, win);
  assert.equal(observed, 1);
  assert.equal(doc.props['--bl-navbar-height'], '70px');
});

test('el menú lateral se pega debajo del navbar y no se corta (vendedor y profesional)', () => {
  for (const file of ['../pages/vender.html', '../Assets/styles/profesional.css']) {
    const css = readFileSync(new URL(file, import.meta.url), 'utf8');
    const block = css.match(/\.mc-sidebar\s*\{[^}]*position:\s*sticky[^}]*\}/)?.[0] ?? '';
    assert.match(block, /top:\s*calc\(var\(--bl-navbar-height/, `${file}: top debajo del navbar`);
    assert.match(block, /max-height:\s*calc\(100vh/, `${file}: tope de alto`);
    assert.match(block, /overflow-y:\s*auto/, `${file}: scroll interno si es más largo`);
  }
});

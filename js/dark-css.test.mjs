// Modo oscuro: (1) dark-auto.css está al día con los CSS fuente, (2) cada página
// carga dark.css + theme.js y trae el script del <head> que evita el destello.
//   Si falla (1): node scripts/gen-dark-css.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/gen-dark-css.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const current = fs.readFileSync(path.join(ROOT, 'Assets/styles/dark-auto.css'), 'utf8');
assert.equal(
  current,
  build(),
  'dark-auto.css está desactualizado: correr `node scripts/gen-dark-css.mjs` y commitearlo'
);

const pagesDir = path.join(ROOT, 'pages');
const pages = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.html'));
assert.ok(pages.length >= 20, 'no se encontraron las páginas');
for (const f of pages) {
  const html = fs.readFileSync(path.join(pagesDir, f), 'utf8');
  assert.match(html, /Assets\/styles\/dark\.css/, `${f}: falta el link a dark.css`);
  assert.match(html, /js\/theme\.js/, `${f}: falta el script js/theme.js`);
  assert.match(html, /localStorage\.getItem\('bl_theme'\)==='dark'/, `${f}: falta el script del <head> (destello claro)`);
  // El script del tema tiene que correr antes de cualquier hoja de estilos.
  const initAt = html.indexOf("bl_theme");
  const firstCss = html.search(/<link[^>]+stylesheet/);
  assert.ok(initAt < firstCss, `${f}: el script del tema va después de las hojas de estilo`);
}

const dark = fs.readFileSync(path.join(ROOT, 'Assets/styles/dark.css'), 'utf8');
assert.match(dark, /@import '\.\/dark-auto\.css';/, 'dark.css tiene que importar dark-auto.css (Vite reordena los <link>)');
console.log(`dark-css: ok (${pages.length} páginas)`);

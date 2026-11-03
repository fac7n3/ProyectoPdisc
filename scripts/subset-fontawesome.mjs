/**
 * subset-fontawesome.mjs — Recorta Font Awesome a los íconos que el sitio usa.
 *
 *   npm run subset-icons
 *
 * Antes cada página bajaba Font Awesome entero: 101 KB de CSS + 156 KB (solid) +
 * 118 KB (brands) + 25 KB (regular) de fuentes, para ~170 íconos. Ahora el CSS
 * trae solo las reglas de los íconos usados y las fuentes solo sus glifos.
 *
 * Entrada : node_modules/@fortawesome/fontawesome-free (devDependency, 6.5.2: es
 *           byte a byte la misma versión que ya se servía)
 * Salida  : public/vendor/fontawesome/{css/all.min.css, webfonts/*.woff2, subset.json}
 * Qué íconos: todo `fa-nombre` que aparezca en js/, pages/, index.html y los CSS
 *           (scripts/fa-usage.mjs). Si agregás un ícono nuevo al código, corré este
 *           script; `npm test` falla (js/fontawesome-subset.test.mjs) si te olvidás.
 * Requiere: Python con `fonttools` y `brotli` (pip install fonttools brotli).
 *           Otro intérprete: FA_PYTHON=/ruta/a/python npm run subset-icons
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { scanIconUsage, ROOT } from './fa-usage.mjs';

const FA = path.join(ROOT, 'node_modules/@fortawesome/fontawesome-free');
const OUT = path.join(ROOT, 'public/vendor/fontawesome');
const PYTHON = process.env.FA_PYTHON || 'python3';

const FONTS = {
  solid: 'fa-solid-900',
  regular: 'fa-regular-400',
  brands: 'fa-brands-400',
};

/** `.fa-bread-slice:before` -> 'bread-slice'; cualquier otro selector -> null. */
const iconClassOf = (selector) => (selector.trim().match(/^\.fa-([a-z0-9-]+):{1,2}before$/) || [])[1] || null;

/** El `content:"\f7ec"` de una regla de ícono -> 0xf7ec (null si no es un solo glifo). */
function codepointOf(rule) {
  const decl = rule.nodes.find((n) => n.prop === 'content');
  const m = decl && decl.value.match(/^"\\([0-9a-f]{1,6})"$/i);
  return m ? parseInt(m[1], 16) : null;
}

function pythonOk() {
  try {
    execFileSync(PYTHON, ['-c', 'import fontTools, brotli'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const PY_CMAP = `
import sys, json
from fontTools.ttLib import TTFont
print(json.dumps(sorted(TTFont(sys.argv[1]).getBestCmap().keys())))
`;

function cmapOf(file) {
  return new Set(JSON.parse(execFileSync(PYTHON, ['-c', PY_CMAP, file], { encoding: 'utf8' })));
}

function main() {
  if (!existsSync(FA)) throw new Error('Falta @fortawesome/fontawesome-free: corré `npm install`.');
  if (!pythonOk()) {
    throw new Error(`No encuentro Python con fonttools y brotli ("${PYTHON}").\n  pip install fonttools brotli   (o FA_PYTHON=/ruta/a/python)`);
  }

  const { icons: usage } = scanIconUsage();
  const originalCss = readFileSync(path.join(FA, 'css/all.min.css'), 'utf8');
  const root = postcss.parse(originalCss);

  // 1) clase -> glifo, para cada ícono que existe en Font Awesome y el sitio usa
  const glyphOf = new Map();
  root.walkRules((rule) => {
    const cp = codepointOf(rule);
    if (cp == null) return;
    for (const sel of rule.selectors) {
      const name = iconClassOf(sel);
      if (name && usage.has(name)) glyphOf.set(name, cp);
    }
  });

  // 2) glifos que lleva cada fuente: por el estilo escrito en la misma línea del
  //    código; si no lo decía, en todas las fuentes que tengan ese glifo.
  const cmaps = Object.fromEntries(Object.entries(FONTS).map(([style, f]) => [style, cmapOf(path.join(FA, 'webfonts', `${f}.woff2`))]));
  const wanted = { solid: new Set(), regular: new Set(), brands: new Set() };
  for (const [name, cp] of glyphOf) {
    const declared = [...usage.get(name)];
    const styles = declared.length ? declared : Object.keys(FONTS);
    let placed = false;
    for (const style of styles) {
      if (cmaps[style].has(cp)) { wanted[style].add(cp); placed = true; }
    }
    if (!placed) { // declarado con un estilo que no lo tiene: dejarlo donde exista
      for (const style of Object.keys(FONTS)) if (cmaps[style].has(cp)) wanted[style].add(cp);
    }
  }

  // 3) CSS: se quedan las reglas que no son de un ícono (base, utilidades, animaciones)
  //    y, de las de ícono, solo los selectores usados. Fuera: Font Awesome 5 y la
  //    compatibilidad v4 (nadie las pide) y los .ttf (los navegadores de hoy leen woff2).
  root.walkAtRules('font-face', (at) => {
    const family = at.nodes.find((n) => n.prop === 'font-family')?.value || '';
    const src = at.nodes.find((n) => n.prop === 'src');
    const file = (src?.value.match(/webfonts\/([a-z0-9-]+)\.woff2/) || [])[1];
    const keep = /Font Awesome 6 (Free|Brands)/.test(family) && Object.values(FONTS).includes(file);
    if (!keep) { at.remove(); return; }
    src.value = `url(../webfonts/${file}.woff2) format("woff2")`;
    const display = at.nodes.find((n) => n.prop === 'font-display');
    if (display) display.value = 'swap'; // "block" deja los íconos invisibles mientras baja la fuente
  });
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    const isIconRule = codepointOf(rule) != null && rule.selectors.every((s) => iconClassOf(s));
    if (!isIconRule) return;
    const kept = rule.selectors.filter((s) => usage.has(iconClassOf(s)));
    if (!kept.length) rule.remove();
    else rule.selector = kept.join(',');
  });
  // el comentario de licencia (/*! ... */) se conserva: Font Awesome Free lo exige (CC BY 4.0 / OFL / MIT)

  // 4) fuentes recortadas
  mkdirSync(path.join(OUT, 'css'), { recursive: true });
  mkdirSync(path.join(OUT, 'webfonts'), { recursive: true });
  for (const ttf of ['fa-brands-400.ttf', 'fa-regular-400.ttf', 'fa-solid-900.ttf', 'fa-v4compatibility.ttf', 'fa-v4compatibility.woff2']) {
    rmSync(path.join(OUT, 'webfonts', ttf), { force: true });
  }
  const sizes = {};
  for (const [style, file] of Object.entries(FONTS)) {
    const unicodes = [...wanted[style]].sort((a, b) => a - b).map((cp) => cp.toString(16)).join(',');
    const dest = path.join(OUT, 'webfonts', `${file}.woff2`);
    if (!unicodes) { rmSync(dest, { force: true }); continue; }
    execFileSync(PYTHON, ['-m', 'fontTools.subset', path.join(FA, 'webfonts', `${file}.woff2`),
      `--unicodes=${unicodes}`, '--flavor=woff2', `--output-file=${dest}`,
      '--layout-features=', '--no-hinting', '--desubroutinize'], { stdio: 'pipe' });
    sizes[style] = statSync(dest).size;
  }
  // un estilo sin glifos no necesita su @font-face
  root.walkAtRules('font-face', (at) => {
    const file = (at.nodes.find((n) => n.prop === 'src')?.value.match(/webfonts\/([a-z0-9-]+)\.woff2/) || [])[1];
    const style = Object.keys(FONTS).find((s) => FONTS[s] === file);
    if (style && !wanted[style].size) at.remove();
  });

  const css = root.toString();
  writeFileSync(path.join(OUT, 'css/all.min.css'), css);
  writeFileSync(path.join(OUT, 'subset.json'), JSON.stringify({
    fontawesome: '6.5.2',
    generated_by: 'scripts/subset-fontawesome.mjs',
    icons: Object.fromEntries([...glyphOf].sort(([a], [b]) => a.localeCompare(b)).map(([n, cp]) => [n, cp.toString(16)])),
    glyphs: Object.fromEntries(Object.entries(wanted).map(([s, set]) => [s, [...set].sort((a, b) => a - b).map((cp) => cp.toString(16))])),
  }, null, 1) + '\n');
  if (!existsSync(path.join(OUT, 'LICENSE.txt'))) copyFileSync(path.join(FA, 'LICENSE.txt'), path.join(OUT, 'LICENSE.txt'));

  const before = { css: Buffer.byteLength(originalCss), solid: 156400, brands: 117852, regular: 25392 };
  console.log(`Íconos usados: ${glyphOf.size}`);
  console.log(`CSS     ${(before.css / 1024).toFixed(0)} KB -> ${(Buffer.byteLength(css) / 1024).toFixed(1)} KB`);
  for (const [style, size] of Object.entries(sizes)) {
    console.log(`${style.padEnd(7)} ${(before[style] / 1024).toFixed(0)} KB -> ${(size / 1024).toFixed(1)} KB (${wanted[style].size} glifos)`);
  }
}

main();

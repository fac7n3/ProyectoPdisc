/**
 * fa-usage.mjs — Qué íconos de Font Awesome usa el sitio. Lo comparten
 * scripts/subset-fontawesome.mjs (arma el recorte) y js/fontawesome-subset.test.mjs
 * (falla si se usa un ícono que no está en el recorte).
 *
 * Se mira TODO el código fuente, no solo el HTML: los íconos se arman también
 * desde JS (innerHTML, className, mapas de íconos por categoría o por tipo de
 * aviso). Cualquier `fa-nombre` escrito en js/, pages/, index.html o los CSS cuenta;
 * lo que no sea un ícono de Font Awesome (fa-solid, fa-spin, fa-2x...) se descarta
 * después, al cruzarlo con el CSS original.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  { dir: 'js', ext: /\.js$/, skip: /\.test\.(m?js)$/ },
  { dir: 'pages', ext: /\.html$/ },
  { dir: 'Assets/styles', ext: /\.css$/, skip: /^dark-auto\.css$/ }, // generado: repite lo de los otros
  { dir: '.', ext: /^index\.html$/, flat: true },
];

function listFiles() {
  const out = [];
  for (const { dir, ext, skip, flat } of SOURCES) {
    const abs = path.join(ROOT, dir);
    for (const name of readdirSync(abs)) {
      const full = path.join(abs, name);
      if (statSync(full).isDirectory() || !ext.test(name) || (skip && skip.test(name))) continue;
      out.push({ full, rel: path.join(dir, name) });
    }
    void flat;
  }
  return out;
}

const STYLE_TOKENS = { 'fa-solid': 'solid', fas: 'solid', 'fa-regular': 'regular', far: 'regular', 'fa-brands': 'brands', fab: 'brands' };

/**
 * { icons: Map<nombre, Set<estilo>>, files: Map<nombre, string[]> }
 * Los estilos salen de la misma línea (`fa-brands fa-instagram`). Si la línea no
 * dice el estilo (un mapa `{ almacen: 'fa-box' }`), el Set queda vacío y el recorte
 * lo pone en todos los estilos que tengan ese ícono.
 */
export function scanIconUsage() {
  const icons = new Map();
  const files = new Map();
  for (const { full, rel } of listFiles()) {
    for (const line of readFileSync(full, 'utf8').split('\n')) {
      const names = [...line.matchAll(/(?<![A-Za-z0-9_-])fa-([a-z0-9]+(?:-[a-z0-9]+)*)(?![A-Za-z0-9_-])/g)].map((m) => m[1]);
      if (!names.length) continue;
      const styles = new Set();
      for (const [token, style] of Object.entries(STYLE_TOKENS)) {
        if (new RegExp(`(?<![A-Za-z0-9_-])${token}(?![A-Za-z0-9_-])`).test(line)) styles.add(style);
      }
      for (const name of names) {
        if (!icons.has(name)) { icons.set(name, new Set()); files.set(name, []); }
        styles.forEach((s) => icons.get(name).add(s));
        if (!files.get(name).includes(rel)) files.get(name).push(rel);
      }
    }
  }
  return { icons, files };
}

export { ROOT };

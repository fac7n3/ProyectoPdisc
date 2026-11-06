// Única definición del CSP de las páginas. Cada HTML lleva el <meta> con el resultado
// (hace falta en el HTML estático), pero no se edita a mano: se cambia ACÁ y se corre
//   node scripts/sync-csp.mjs
// js/csp.test.mjs falla si algún HTML quedó distinto de lo que genera esto.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE = 'https://*.supabase.co';

// Lo que suma cada página además de la base. Una página que no está acá usa solo la base.
const EXTRAS = {
  'pages/admin.html': ['blobImg'],
  'pages/contratar.html': ['blobImg'],
  'pages/profesional.html': ['blobImg'],
  'pages/perfil.html': ['blobImg', 'nominatim'],
  'pages/vender.html': ['blobImg', 'tiles', 'nominatim'], // mapa del local
  'pages/home.html': ['frameGoogle'], // mapa embebido
  'pages/comercio.html': ['frameGoogle'],
};

export function buildCsp(extras = []) {
  const has = (e) => extras.includes(e);
  const img = ["'self'", 'data:', ...(has('blobImg') ? ['blob:'] : []), 'https://*.googleusercontent.com', SUPABASE, ...(has('tiles') ? ['https://tile.openstreetmap.org'] : [])];
  const connect = ["'self'", SUPABASE, 'wss://*.supabase.co', 'https://accounts.google.com', ...(has('nominatim') ? ['https://nominatim.openstreetmap.org'] : [])];
  const dirs = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src ${img.join(' ')}`,
    `media-src 'self' blob: ${SUPABASE}`,
    `connect-src ${connect.join(' ')}`,
    ...(has('frameGoogle') ? ['frame-src https://www.google.com'] : []),
  ];
  return `${dirs.join('; ')};`;
}

export function cspFiles() {
  return [
    ...readdirSync(path.join(ROOT, 'pages')).filter((f) => f.endsWith('.html')).sort().map((f) => `pages/${f}`),
    'index.html',
  ];
}

const META = /(<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=")([^"]*)(")/i;

/** El HTML con su CSP regenerado (o null si la página no tiene el <meta>). */
export function withCsp(html, file) {
  return META.test(html) ? html.replace(META, (_, a, __, c) => `${a}${buildCsp(EXTRAS[file])}${c}`) : null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const file of cspFiles()) {
    const abs = path.join(ROOT, file);
    const html = readFileSync(abs, 'utf8');
    const next = withCsp(html, file);
    if (next === null) console.warn(`sin <meta> de CSP: ${file}`);
    else if (next !== html) { writeFileSync(abs, next); console.log(`actualizado: ${file}`); }
  }
}

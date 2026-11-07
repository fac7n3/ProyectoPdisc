/**
 * sitemap.mjs — Genera dist/sitemap.xml (y la línea Sitemap: de robots.txt)
 * en cada `vite build`. Lo usa el plugin `sitemapPlugin` de vite.config.js.
 * Tests: node js/sitemap.test.mjs (vive en js/ para que lo corra `npm test`)
 *
 * - Páginas fijas públicas + cada comercio aprobado + cada producto activo.
 * - Comercios y productos se leen con la clave pública (la misma del
 *   navegador, protegida por RLS): solo entra lo que cualquier visitante ve.
 * - Si la base no responde (sin red, sin .env), el build NO falla: el sitemap
 *   sale solo con las páginas fijas y se avisa en la consola.
 * - El dominio sale de SITE_URL, o del dominio de producción que Vercel pasa al
 *   build (VERCEL_PROJECT_PRODUCTION_URL; con dominio propio, es ese), o del
 *   actual por defecto.
 */

export const DEFAULT_ORIGIN = 'https://proyectopdisc.vercel.app';

/** Páginas públicas fijas, con su prioridad relativa. */
export const STATIC_PAGES = [
  { path: '/pages/home.html', priority: '1.0', changefreq: 'daily' },
  { path: '/pages/comercios.html', priority: '0.9', changefreq: 'daily' },
  { path: '/pages/search.html', priority: '0.8', changefreq: 'daily' },
  { path: '/pages/search.html?cat=ofertas', priority: '0.8', changefreq: 'daily' },
  { path: '/pages/contratar.html', priority: '0.8', changefreq: 'weekly' },
  { path: '/pages/farmacias.html', priority: '0.7', changefreq: 'daily' },
  { path: '/pages/servicios.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/pages/info.html', priority: '0.5', changefreq: 'monthly' },
  { path: '/pages/terminos.html', priority: '0.3', changefreq: 'yearly' },
  { path: '/pages/privacidad.html', priority: '0.3', changefreq: 'yearly' },
];

export function resolveOrigin(env = process.env) {
  const raw = env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '') || DEFAULT_ORIGIN;
  try {
    const u = new URL(raw);
    return u.origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

const xmlEscape = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const isoDay = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Arma el XML. `stores`/`products`: filas { id, updated_at }. Ignora ids que no son uuid. */
export function buildSitemapXml(origin, { stores = [], products = [], today = new Date() } = {}) {
  // Sin updated_at en la fila, se usa la fecha del build: así ninguna URL queda sin lastmod.
  const buildDay = isoDay(today);
  const urls = [
    ...STATIC_PAGES.map((p) => ({ loc: origin + p.path, changefreq: p.changefreq, priority: p.priority })),
    ...stores.filter((s) => UUID.test(s?.id || '')).map((s) => ({
      loc: `${origin}/pages/comercio.html?id=${s.id}`, lastmod: isoDay(s.updated_at) || buildDay, changefreq: 'weekly', priority: '0.8',
    })),
    ...products.filter((p) => UUID.test(p?.id || '')).map((p) => ({
      loc: `${origin}/pages/producto.html?id=${p.id}`, lastmod: isoDay(p.updated_at) || buildDay, changefreq: 'weekly', priority: '0.6',
    })),
  ];
  const body = urls.map((u) => [
    '  <url>',
    `    <loc>${xmlEscape(u.loc)}</loc>`,
    u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
    `    <changefreq>${u.changefreq}</changefreq>`,
    `    <priority>${u.priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** robots.txt con la línea Sitemap: del dominio correcto (reemplaza una vieja si la había). */
export function withSitemapLine(robots, origin) {
  const lines = String(robots || '').split(/\r?\n/).filter((l) => !/^sitemap:/i.test(l.trim()));
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return `${lines.join('\n')}\n\nSitemap: ${origin}/sitemap.xml\n`;
}

/** Lee todas las filas de una tabla con la API REST, de a 1000 (el tope de Supabase). */
async function fetchAll(supabaseUrl, key, query, fetchImpl, timeoutMs) {
  const rows = [];
  for (let page = 0; page < 50; page++) {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${query}&limit=1000&offset=${page * 1000}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`${query.split('?')[0]}: HTTP ${res.status}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

/** Comercios aprobados y productos activos; [] y un aviso si no se puede leer la base. */
export async function fetchSitemapRows({ supabaseUrl, key, fetchImpl = fetch, timeoutMs = 8000, log = console } = {}) {
  if (!supabaseUrl || !key) {
    log.warn('[sitemap] sin VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: solo páginas fijas');
    return { stores: [], products: [] };
  }
  try {
    const [stores, products] = await Promise.all([
      fetchAll(supabaseUrl, key, 'stores?select=id,updated_at&status=eq.approved&order=id', fetchImpl, timeoutMs),
      fetchAll(supabaseUrl, key, 'products?select=id,updated_at&is_active=eq.true&stock=gt.0&order=id', fetchImpl, timeoutMs),
    ]);
    return { stores, products };
  } catch (err) {
    log.warn(`[sitemap] no se pudo leer la base (${err?.message || err}): solo páginas fijas`);
    return { stores: [], products: [] };
  }
}

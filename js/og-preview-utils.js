/**
 * og-preview-utils.js — Vista previa de un producto o comercio al compartir el
 * link (WhatsApp, Facebook, Instagram, Telegram, X...). Lo usa `middleware.js`
 * (Routing Middleware de Vercel, en la raíz del repo). Tests: node js/og-preview-utils.test.mjs
 *
 * Por qué existe: producto.html y comercio.html arman todo con JS, y los
 * robots que generan la vista previa no ejecutan JS: veían siempre "Baradero
 * Local" con el logo, para cualquier producto. El middleware le responde SOLO
 * a esos robots una página mínima con las etiquetas og: del producto o del
 * comercio; las personas reciben la página de siempre, sin cambios.
 *
 * Sin DOM ni dependencias: corre en el runtime edge de Vercel y en Node (tests).
 */

/** Robots de vista previa de links. Googlebot NO: ejecuta JS y ya lee el JSON-LD.
 *  Ojo con los navegadores internos de las apps (Instagram, Pinterest, Snapchat,
 *  LINE, Viber): su User-Agent trae el nombre de la app, así que acá van solo los
 *  nombres de los ROBOTS ("Pinterestbot", "Snap URL Preview Service"), nunca el de
 *  la app sola. LINE, iMessage e Instagram usan el robot de Facebook. */
const PREVIEW_BOTS = /facebookexternalhit|facebookcatalog|facebot|whatsapp|twitterbot|telegrambot|slackbot|slack-imgproxy|discordbot|linkedinbot|pinterestbot|skypeuripreview|vkshare|redditbot|embedly|quora link preview|iframely|mastodon|cardyb|snap url preview|kakaotalk-scrap|google-pagerenderer/i;

/** Parámetro que agrega la página mínima al mandar a una persona a la página real
 *  (por si algún navegador se hace pasar por robot): con él, el middleware no actúa. */
export const SKIP_PARAM = 'bl_full';

export function isPreviewBot(userAgent) {
  return PREVIEW_BOTS.test(String(userAgent || ''));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** { kind: 'product'|'store', id } según la URL, o null si no es una página con vista previa propia. */
export function parseOgTarget(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (url.searchParams.has(SKIP_PARAM)) return null;
  const id = (url.searchParams.get('id') || '').trim();
  if (!UUID.test(id)) return null;
  const page = url.pathname.split('/').pop();
  if (page === 'producto.html') return { kind: 'product', id };
  if (page === 'comercio.html') return { kind: 'store', id };
  return null;
}

export const formatPrice = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

const clip = (text, max) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function absolute(path, origin) {
  if (!path) return null;
  try {
    const u = new URL(path, origin + '/pages/');
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch { return null; }
}

const imageType = (url) => {
  const ext = (String(url).split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  return { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' }[ext] || null;
};

function offerActive(product, now) {
  if (!(Number(product.compare_at_price) > Number(product.price))) return false;
  if (!product.offer_expires_at) return true;
  const end = new Date(product.offer_expires_at);
  return Number.isNaN(end.getTime()) || end >= now;
}

/** Datos de la vista previa de un producto (formato de get_product_detail). */
export function productPreview(product, { origin, url, now = new Date() }) {
  if (!product?.title) return null;
  const store = product.stores?.name ? clip(product.stores.name, 80) : '';
  const price = formatPrice(product.price);
  const offer = offerActive(product, now);
  const lead = [offer ? `${price} (antes ${formatPrice(product.compare_at_price)})` : price, store].filter(Boolean).join(' · ');
  const stock = Number(product.stock) > 0 ? '' : 'Sin stock por ahora. ';
  return {
    type: 'product',
    title: clip(product.title, 90),
    description: clip(`${lead}. ${stock}${product.description || 'Comprá en los comercios de Baradero.'}`, 200),
    image: absolute(product.image_url, origin) || `${origin}/og-image.png`,
    url,
    price: Number.isFinite(Number(product.price)) ? Number(product.price) : null,
    inStock: Number(product.stock) > 0,
  };
}

/** Datos de la vista previa de un comercio (fila de `stores`). */
export function storePreview(store, { origin, url }) {
  if (!store?.name) return null;
  return {
    type: 'website',
    title: clip(store.name, 90),
    description: clip(store.description || `Mirá los productos de ${store.name} en Baradero Local, el comercio de proximidad de Baradero.`, 200),
    image: absolute(store.banner_url || store.logo_url, origin) || `${origin}/og-image.png`,
    url,
  };
}

/** La página real, con el parámetro que hace que el middleware no vuelva a actuar. */
function fullUrl(url) {
  try {
    const u = new URL(url);
    u.searchParams.set(SKIP_PARAM, '1');
    return u.toString();
  } catch {
    return url;
  }
}

/** Página mínima con las etiquetas og:/twitter: que leen los robots de vista previa.
 *  Los robots no ejecutan JS; una persona que llegue acá por error salta sola a la
 *  página real (el <script> del final). */
export function buildOgHtml(p) {
  const meta = (attr, key, value) => (value == null || value === '' ? '' : `<meta ${attr}="${key}" content="${escapeHtml(value)}">`);
  const type = imageType(p.image);
  const tags = [
    `<title>${escapeHtml(p.title)} | Baradero Local</title>`,
    meta('name', 'description', p.description),
    `<link rel="canonical" href="${escapeHtml(p.url)}">`,
    meta('property', 'og:site_name', 'Baradero Local'),
    meta('property', 'og:locale', 'es_AR'),
    meta('property', 'og:type', p.type),
    meta('property', 'og:title', p.title),
    meta('property', 'og:description', p.description),
    meta('property', 'og:url', p.url),
    meta('property', 'og:image', p.image),
    meta('property', 'og:image:secure_url', p.image),
    type ? meta('property', 'og:image:type', type) : '',
    meta('property', 'og:image:alt', p.title),
    p.type === 'product' && p.price != null ? meta('property', 'product:price:amount', String(p.price)) : '',
    p.type === 'product' && p.price != null ? meta('property', 'product:price:currency', 'ARS') : '',
    p.type === 'product' ? meta('property', 'product:availability', p.inStock ? 'in stock' : 'out of stock') : '',
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', p.title),
    meta('name', 'twitter:description', p.description),
    meta('name', 'twitter:image', p.image),
  ].filter(Boolean).join('\n    ');
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    ${tags}
  </head>
  <body>
    <h1>${escapeHtml(p.title)}</h1>
    <p>${escapeHtml(p.description)}</p>
    <p><a href="${escapeHtml(fullUrl(p.url))}">Ver en Baradero Local</a></p>
    <script>location.replace(${JSON.stringify(fullUrl(p.url)).replace(/</g, '\\u003c')});</script>
  </body>
</html>
`;
}

/**
 * Trae lo necesario de la base con la clave pública (misma RLS que un visitante:
 * un producto pausado o un comercio no aprobado no se encuentran) y arma la
 * página. Devuelve null ante cualquier problema: el middleware deja pasar el
 * pedido a la página de siempre.
 */
export async function buildPreviewPage(target, { supabaseUrl, key, origin, url, fetchImpl = fetch, timeoutMs = 2500, now }) {
  if (!target || !supabaseUrl || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    if (target.kind === 'product') {
      const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/get_product_detail`, {
        method: 'POST', headers, body: JSON.stringify({ p_product_id: target.id }), signal,
      });
      if (!res.ok) return null;
      const product = await res.json();
      const p = productPreview(Array.isArray(product) ? product[0] : product, { origin, url, now });
      return p ? buildOgHtml(p) : null;
    }
    const res = await fetchImpl(
      `${supabaseUrl}/rest/v1/stores?id=eq.${target.id}&status=eq.approved&select=name,description,logo_url,banner_url&limit=1`,
      { headers, signal },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const p = storePreview(rows?.[0], { origin, url });
    return p ? buildOgHtml(p) : null;
  } catch {
    return null;
  }
}

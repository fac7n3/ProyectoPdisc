/**
 * seo-utils.js — Lógica pura (sin DOM) de la dirección canónica y de los datos
 * estructurados (JSON-LD de schema.org) de las páginas públicas.
 * Tests: node js/seo-utils.test.mjs
 *
 * Todo se arma con el origen de la página (location.origin) y no con un
 * dominio escrito a mano: así sigue andando el día que el sitio pase de
 * proyectopdisc.vercel.app a un dominio propio (F11-04).
 */

/** Parámetros de la URL que cambian el contenido de cada página. Todo lo demás
 *  (utm_*, fbclid, el #, parámetros de las notificaciones) se saca de la canónica. */
const CANONICAL_PARAMS = {
  'producto.html': ['id'],
  'comercio.html': ['id'],
  'search.html': ['cat', 'q'],
};

/** Páginas que no tienen que aparecer en buscadores (ver robots.txt). */
const PRIVATE_PAGES = new Set([
  'login.html', 'register.html', 'recuperar-password.html', 'nueva-contrasena.html',
  'perfil.html', 'carrito.html', 'vender.html', 'profesional.html', 'repartidor.html', 'admin.html',
]);

const pageName = (url) => url.pathname.split('/').pop() || '';

/** La URL canónica de `href`, o null si la página es privada o la URL no sirve. */
export function canonicalUrl(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const page = pageName(url);
  if (PRIVATE_PAGES.has(page)) return null;
  const keep = CANONICAL_PARAMS[page] || [];
  const out = new URL(url.origin + url.pathname);
  for (const key of keep) {
    const value = url.searchParams.get(key);
    if (value != null && value.trim() !== '') out.searchParams.set(key, value.trim());
  }
  return out.toString();
}

/** Convierte una ruta del sitio ("/img/x.webp", "../img/x.webp") en URL absoluta. */
export function absoluteUrl(path, origin) {
  if (!path) return null;
  try { return new URL(path, origin + '/pages/').toString(); } catch { return null; }
}

const clean = (text, max = 5000) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
};

/** Saca las claves con undefined/null para que el JSON quede prolijo. */
function compact(obj) {
  if (Array.isArray(obj)) return obj.map(compact).filter((v) => v !== undefined);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const c = compact(v);
      if (c !== undefined && c !== null && !(Array.isArray(c) && c.length === 0)) out[k] = c;
    }
    return out;
  }
  return obj;
}

/** JSON-LD del inicio: el sitio (con su buscador) y la organización. */
export function buildSiteJsonLd(origin) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: 'Baradero Local',
        url: `${origin}/pages/home.html`,
        inLanguage: 'es-AR',
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${origin}/pages/search.html?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'Baradero Local',
        url: `${origin}/pages/home.html`,
        logo: `${origin}/img/logo-baradero-local.png`,
        areaServed: { '@type': 'City', name: 'Baradero' },
      },
    ],
  };
}

/**
 * JSON-LD de un producto (formato de fetchProductDetail, ver product-detail-api.js).
 * `now` se puede pasar para los tests (vencimiento de la oferta).
 */
export function buildProductJsonLd(product, { origin, url, now = new Date() } = {}) {
  if (!product?.title) return null;
  const images = [product.image_url, ...(product.product_images || []).map((pi) => pi?.url)]
    .filter(Boolean)
    .map((p) => absoluteUrl(p, origin))
    .filter(Boolean);
  const offerEnds = product.offer_expires_at ? new Date(product.offer_expires_at) : null;
  const offerActive = Number(product.compare_at_price) > Number(product.price)
    && (!offerEnds || Number.isNaN(offerEnds.getTime()) || offerEnds >= now);
  const ratingCount = Number(product.review_count) || 0;
  const ratingAvg = Number(product.review_average);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: clean(product.title, 300),
    description: clean(product.description),
    sku: product.id,
    image: [...new Set(images)],
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'ARS',
      price: Number.isFinite(Number(product.price)) ? Number(product.price) : undefined,
      priceValidUntil: offerActive && offerEnds && !Number.isNaN(offerEnds.getTime())
        ? offerEnds.toISOString().slice(0, 10) : undefined,
      availability: Number(product.stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: product.stores?.name ? { '@type': 'Store', name: clean(product.stores.name, 200) } : undefined,
    },
    aggregateRating: ratingCount > 0 && Number.isFinite(ratingAvg)
      ? { '@type': 'AggregateRating', ratingValue: Math.round(ratingAvg * 10) / 10, reviewCount: ratingCount, bestRating: 5, worstRating: 1 }
      : undefined,
  });
}

/** JSON-LD de un comercio (fila de `stores`). No publica teléfono ni datos de cobro. */
export function buildStoreJsonLd(store, { origin, url, categoryName } = {}) {
  if (!store?.name) return null;
  const hasGeo = Number.isFinite(Number(store.lat)) && Number.isFinite(Number(store.lng))
    && store.lat !== null && store.lng !== null;
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: clean(store.name, 200),
    description: clean(store.description),
    url,
    image: absoluteUrl(store.banner_url || store.logo_url, origin) || undefined,
    logo: absoluteUrl(store.logo_url, origin) || undefined,
    keywords: clean(categoryName, 100),
    address: {
      '@type': 'PostalAddress',
      streetAddress: clean(store.address, 200),
      addressLocality: 'Baradero',
      addressRegion: 'Buenos Aires',
      addressCountry: 'AR',
    },
    geo: hasGeo ? { '@type': 'GeoCoordinates', latitude: Number(store.lat), longitude: Number(store.lng) } : undefined,
    hasMap: clean(store.maps_url, 500),
  });
}

/** JSON-LD de migas de pan (BreadcrumbList). `items`: [{ name, url }], de la raíz a la página actual. */
export function buildBreadcrumbJsonLd(items) {
  const list = (items || []).filter((i) => i?.name && i?.url);
  if (list.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list.map((i, n) => ({
      '@type': 'ListItem',
      position: n + 1,
      name: clean(i.name, 200),
      item: i.url,
    })),
  };
}

/** JSON listo para ir adentro de <script type="application/ld+json">: escapa "<"
 *  para que un "</script>" en un nombre o descripción no pueda cerrar el bloque. */
export function serializeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

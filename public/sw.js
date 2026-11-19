// F9-02 — service worker: offline básico + cache de assets estáticos.
// Cachea en runtime a medida que se van pidiendo los archivos de Vite (sus
// nombres llevan hash y cambian en cada build, así que no hay una lista fija
// que precachear). La única excepción son las páginas esenciales (ver v3).
// Nunca intercepta pedidos a otro origen (Supabase, CDNs) para no interferir
// con auth/API/storage.
//
// v2 (2026-11-03):
// - Tope de entradas: antes la caché crecía para siempre (cada build deja JS/CSS
//   con nombres nuevos y los viejos no se borraban nunca). Al pasar de v1 a v2 se
//   borra todo lo acumulado.
// - Solo se guardan respuestas OK: antes también quedaban guardados un 404 o un 500.
// - Lo que NO lleva hash en el nombre (/img/, /vendor/, iconos) se sirve de la
//   caché pero se revisa en segundo plano: si se reemplaza una foto con el mismo
//   nombre, la próxima visita ya la ve. Lo de /assets/ (con hash) sigue siendo
//   "caché primero": un build nuevo cambia el nombre, nunca queda viejo.
//
// v3 (2026-11-19): farmacias de turno y emergencias tienen que andar SIN señal.
// - OFFLINE_PAGES (el inicio, farmacias y servicios) se guardan enteras, con su
//   JS, CSS y fuentes, en una caché aparte (OFFLINE_CACHE) que no tiene tope: la
//   otra se llena de fotos de productos y, al pasar de MAX_ENTRIES, tiraría
//   justo los archivos de esas páginas (se borra lo más viejo). La página pide el
//   guardado con un mensaje `{ type: 'bl-precache' }` (js/offline-essentials.js);
//   los datos (Supabase) no pasan por acá: los guarda la página (js/offline-data.js).
// - Con señal mala el pedido no falla, queda colgado: en las páginas esenciales, si
//   la red no contesta en SLOW_NAVIGATION_MS y hay copia guardada, se muestra la
//   copia y la red sigue en segundo plano (queda guardada para la próxima).
// - Una página que da error del servidor (5xx) y tiene copia guardada muestra la copia.
// - Sin conexión y sin copia: una pantalla propia (en vez de la del navegador) con
//   los accesos a lo que sí está guardado.
// Los nombres y números de abajo los lee js/sw.test.mjs.

const CACHE_NAME = 'baradero-local-v3';
const OFFLINE_CACHE = 'baradero-local-offline-v1';
const KEEP_CACHES = [CACHE_NAME, OFFLINE_CACHE];
const MAX_ENTRIES = 250;
const MAX_OFFLINE_FILES = 120;
const SLOW_NAVIGATION_MS = 3500;
const OFFLINE_PAGES = ['/pages/home.html', '/pages/farmacias.html', '/pages/servicios.html'];
const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/;
const HASHED_ASSET = /^\/assets\//;
// Archivos que una página esencial pide por su HTML (script, link, img) o su CSS (fuentes, fondos).
const HTML_ASSET_REF = /(?:src|href)=["'](\/(?:assets|vendor|img)\/[^"']+)["']/g;
const CSS_URL_REF = /url\(\s*["']?([^"')\s]+)["']?\s*\)/g;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => !KEEP_CACHES.includes(key)).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

/** Borra las entradas más viejas cuando la caché pasa el tope (keys() viene en orden de alta). */
async function trimCache(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_ENTRIES;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

/**
 * Guarda una copia solo si es una respuesta OK del propio sitio. Las páginas
 * esenciales van a su caché sin tope y con la dirección sin parámetros (así
 * `farmacias.html?utm=...` y `farmacias.html` son la misma copia).
 */
function store(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  const url = new URL(request.url);
  const essential = OFFLINE_PAGES.includes(url.pathname);
  const copy = response.clone();
  caches.open(essential ? OFFLINE_CACHE : CACHE_NAME).then(async (cache) => {
    await cache.put(essential ? url.origin + url.pathname : request, copy);
    if (!essential) await trimCache(cache);
  }).catch(() => {});
}

// Todo lo que se guarda son archivos del propio sitio, iguales para cualquiera: se busca
// ignorando `Vary`. Sin esto, un servidor que responde `Vary: Origin` (vite preview lo hace)
// hace que una copia bajada por el worker (sin ese encabezado) no valga para el pedido de la
// página (un <script type="module"> sí lo manda) y, sin conexión, no se encuentra nada.
const MATCH = { ignoreVary: true };

/** La copia guardada de una página (el `/` es el inicio; los parámetros no cuentan). */
async function cachedPage(request, url) {
  const path = url.pathname === '/' ? OFFLINE_PAGES[0] : url.pathname;
  const hit = await caches.match(url.origin + path, MATCH);
  return hit || caches.match(request, { ...MATCH, ignoreSearch: true });
}

const OFFLINE_HTML = `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#284175">
<title>Sin conexión - Baradero Local</title>
<script>try{if(localStorage.getItem('bl_theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}</script>
<style>
  :root { --bg: #f5f7fa; --card: #fff; --text: #1a2233; --muted: #4b5563; --brand: #284175; --border: #dbe1ea; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #10151f; --card: #181d2a; --text: #e8ecf3; --muted: #aab3c2; --brand: #8fb0f0; --border: #2b3345; } }
  :root[data-theme="dark"] { --bg: #10151f; --card: #181d2a; --text: #e8ecf3; --muted: #aab3c2; --brand: #8fb0f0; --border: #2b3345; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { width: 100%; max-width: 28rem; background: var(--card); border: 1px solid var(--border); border-radius: 1rem; padding: 1.5rem; }
  h1 { margin: 0 0 .5rem; font-size: 1.4rem; color: var(--brand); }
  p { margin: 0 0 1rem; color: var(--muted); }
  nav { display: grid; gap: .6rem; margin-bottom: 1rem; }
  a.go { display: block; padding: .85rem 1rem; border-radius: .6rem; background: #284175; color: #fff; font-weight: 600; text-decoration: none; text-align: center; }
  a.retry { display: block; text-align: center; color: var(--brand); font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>No hay conexión</h1>
  <p>Esta página necesita internet y todavía no está guardada en este dispositivo. Cuando vuelva la señal, probá de nuevo.</p>
  <p>Estas sí están guardadas:</p>
  <nav>
    <a class="go" href="/pages/farmacias.html">Farmacias de turno</a>
    <a class="go" href="/pages/servicios.html">Emergencias y números útiles</a>
    <a class="go" href="/pages/home.html">Inicio</a>
  </nav>
  <a class="retry" href="">Reintentar</a>
</main>
</body>
</html>`;

function offlineFallback() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function offlineNavigation(request, url) {
  return (await cachedPage(request, url)) || offlineFallback();
}

/**
 * Páginas HTML: red primero (contenido fresco), copia guardada como respaldo.
 * En las esenciales, además, no se espera a una red colgada (ver v3 arriba).
 */
function respondToNavigation(event, request, url) {
  const network = fetch(request).then(async (response) => {
    if (response.status >= 500) {
      const cached = await cachedPage(request, url);
      if (cached) return cached;
    }
    store(request, response);
    return response;
  });

  if (!OFFLINE_PAGES.includes(url.pathname)) {
    return network.catch(() => offlineNavigation(request, url));
  }

  // Si la copia gana, el pedido sigue vivo para que quede guardada la versión nueva.
  event.waitUntil(network.catch(() => {}));
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => {
      cachedPage(request, url).then((cached) => { if (cached) settle(cached); });
    }, SLOW_NAVIGATION_MS);
    network.then(
      (response) => { clearTimeout(timer); settle(response); },
      () => { clearTimeout(timer); offlineNavigation(request, url).then(settle); },
    );
  });
}

/** Dirección absoluta de un archivo propio y estático (con su `?v=`), o null si es de otro origen o no es estático. */
function staticUrl(ref, base) {
  let url;
  try {
    url = new URL(ref, base);
  } catch {
    return null;
  }
  if (url.origin !== self.location.origin) return null;
  return STATIC_EXTENSIONS.test(url.pathname) ? url.href : null;
}

let precaching = null;

/**
 * Guarda las páginas esenciales y todo lo que necesitan para verse: scripts,
 * estilos, fuentes e imágenes del HTML, y lo que pide cada CSS. Lo que ya está
 * guardado no se baja de nuevo (los de /assets/ llevan hash). Al terminar sin
 * fallas se borra lo que ya no usa ninguna página (de builds anteriores).
 */
function precacheOffline() {
  if (!precaching) {
    precaching = doPrecache().catch(() => {}).finally(() => { precaching = null; });
  }
  return precaching;
}

async function doPrecache() {
  const cache = await caches.open(OFFLINE_CACHE);
  const wanted = new Set();
  let complete = true;
  let wave = new Set();

  for (const page of OFFLINE_PAGES) {
    const pageUrl = self.location.origin + page;
    try {
      const response = await fetch(pageUrl, { cache: 'no-cache' });
      if (!response.ok || response.type !== 'basic') throw new Error('sin copia');
      const html = await response.clone().text();
      await cache.put(pageUrl, response);
      wanted.add(pageUrl);
      for (const match of html.matchAll(HTML_ASSET_REF)) {
        const url = staticUrl(match[1], pageUrl);
        if (url) wave.add(url);
      }
    } catch {
      complete = false;
    }
  }

  // De a tandas: cada CSS puede sumar archivos (fuentes) para la tanda siguiente.
  while (wave.size > 0 && wanted.size < MAX_OFFLINE_FILES) {
    const current = [...wave].filter((url) => !wanted.has(url));
    wave = new Set();
    await Promise.all(current.map(async (url) => {
      wanted.add(url);
      try {
        let response = await cache.match(url, MATCH);
        if (!response) {
          response = await fetch(url);
          if (!response.ok || response.type !== 'basic') throw new Error('sin copia');
          await cache.put(url, response.clone());
        }
        if (/\.css$/.test(new URL(url).pathname)) {
          const css = await response.text();
          for (const match of css.matchAll(CSS_URL_REF)) {
            const found = staticUrl(match[1], url);
            if (found) wave.add(found);
          }
        }
      } catch {
        complete = false;
      }
    }));
  }

  if (complete) {
    for (const key of await cache.keys()) {
      if (!wanted.has(key.url)) await cache.delete(key);
    }
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'bl-precache') {
    event.waitUntil(precacheOffline());
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return; // video/audio parcial: que lo maneje el navegador

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(respondToNavigation(event, request, url));
    return;
  }

  if (!STATIC_EXTENSIONS.test(url.pathname)) return;

  if (HASHED_ASSET.test(url.pathname)) {
    // Con hash de Vite en el nombre: cache primero, nunca quedan viejos.
    event.respondWith(
      caches.match(request, MATCH).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          store(request, response);
          return response;
        });
      })
    );
    return;
  }

  // Sin hash (/img/, /vendor/, iconos): lo guardado al toque y se actualiza atrás.
  event.respondWith(
    caches.match(request, MATCH).then((cached) => {
      const network = fetch(request).then((response) => {
        store(request, response);
        return response;
      });
      if (cached) {
        event.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    })
  );
});

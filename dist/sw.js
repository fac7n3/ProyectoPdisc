// F9-02 — service worker mínimo: offline básico + cache de assets estáticos.
// A propósito NO precachea una lista de archivos (los nombres de JS/CSS
// llevan hash de Vite y cambian en cada build; no hay integración con un
// plugin de build tipo vite-plugin-pwa) — cachea en runtime a medida que
// se van pidiendo. Nunca intercepta pedidos a otro origen (Supabase, CDNs)
// para no interferir con auth/API/storage.
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
// Los nombres y números de abajo los lee js/sw.test.mjs.

const CACHE_NAME = 'baradero-local-v2';
const MAX_ENTRIES = 250;
const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/;
const HASHED_ASSET = /^\/assets\//;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
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

/** Guarda una copia solo si es una respuesta OK del propio sitio. */
function store(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(async (cache) => {
    await cache.put(request, copy);
    await trimCache(cache);
  }).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return; // video/audio parcial: que lo maneje el navegador

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Páginas HTML: red primero (contenido fresco), cache como respaldo offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          store(request, response);
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (!STATIC_EXTENSIONS.test(url.pathname)) return;

  if (HASHED_ASSET.test(url.pathname)) {
    // Con hash de Vite en el nombre: cache primero, nunca quedan viejos.
    event.respondWith(
      caches.match(request).then((cached) => {
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
    caches.match(request).then((cached) => {
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

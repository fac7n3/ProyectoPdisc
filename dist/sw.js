// F9-02 — service worker mínimo: offline básico + cache de assets estáticos.
// A propósito NO precachea una lista de archivos (los nombres de JS/CSS
// llevan hash de Vite y cambian en cada build; no hay integración con un
// plugin de build tipo vite-plugin-pwa) — cachea en runtime a medida que
// se van pidiendo. Nunca intercepta pedidos a otro origen (Supabase, CDNs)
// para no interferir con auth/API/storage.

const CACHE_NAME = 'baradero-local-v1';
const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/;

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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Páginas HTML: red primero (contenido fresco), cache como respaldo offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (STATIC_EXTENSIONS.test(url.pathname)) {
    // Assets con nombre hasheado por Vite: cache primero, nunca quedan viejos
    // porque un build nuevo genera un nombre de archivo distinto.
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        });
      })
    );
  }
});

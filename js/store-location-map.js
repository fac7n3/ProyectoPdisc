// Selector de la ubicación del local en "Perfil de mi comercio" (vender.html).
// Un mapa de OpenStreetMap (Leaflet, sin API key) con un pin que el dueño
// toca, arrastra, pone con el GPS ("estoy en mi local") o acerca buscando la
// dirección. Lo guarda vender.js con el resto del perfil (stores.lat/lng).
//
// Leaflet se pide recién cuando el mapa entra en pantalla: el panel tiene
// muchas secciones y casi nunca se abre esta.
import { showToast } from './auth-utils.js';
import {
  BARADERO_CENTER, isValidPoint, roundPoint, isNearBaradero, parseCoordsFromMapsUrl,
} from './store-location-utils.js';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const PIN_ZOOM = 17;

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root  contenedor con #store-loc-map, los botones y #store-loc-status
 * @param {() => string} opts.getAddress  dirección escrita en el formulario
 * @param {HTMLInputElement|null} opts.mapsUrlInput  link de Google Maps (si trae coordenadas, se usan)
 */
export function createStoreLocationPicker({ root, getAddress, mapsUrlInput }) {
  const mapEl = root.querySelector('#store-loc-map');
  const statusEl = root.querySelector('#store-loc-status');
  const gpsBtn = root.querySelector('#store-loc-gps');
  const addressBtn = root.querySelector('#store-loc-address');
  const clearBtn = root.querySelector('#store-loc-clear');

  let point = null;   // {lat, lng} o null
  let dirty = false;  // cambió y falta "Guardar perfil"
  let note = '';      // aclaración del último paso (GPS impreciso, calle sin altura...)
  let L = null;
  let map = null;
  let marker = null;
  let mapReady = null;

  function renderStatus() {
    let text;
    if (!point) {
      text = 'Todavía no marcaste dónde está tu local. Tocá el mapa, usá tu ubicación o buscá tu dirección.';
    } else if (dirty) {
      text = 'Pin marcado. Tocá "Guardar perfil" para que quede.';
    } else {
      text = 'Tu local está marcado en el mapa.';
    }
    if (point && !isNearBaradero(point)) text += ' Ojo: ese punto queda lejos de Baradero.';
    if (note) text += ` ${note}`;
    statusEl.textContent = text;
    statusEl.classList.toggle('sl-status--pending', Boolean(point && dirty));
    clearBtn.hidden = !point;
  }

  function syncMarker({ pan = false } = {}) {
    if (!map) return;
    if (!point) {
      if (marker) { marker.remove(); marker = null; }
      return;
    }
    const latlng = [point.lat, point.lng];
    if (!marker) {
      marker = L.marker(latlng, {
        draggable: true,
        keyboard: false, // se mueve con el mapa + Enter (ver más abajo)
        icon: L.divIcon({
          className: 'sl-pin',
          html: '<i class="fa-solid fa-location-dot" aria-hidden="true"></i>',
          iconSize: [32, 40],
          iconAnchor: [16, 38],
        }),
      }).addTo(map);
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        setPoint({ lat: ll.lat, lng: ll.lng }, { dirty: true, pan: false });
      });
    } else {
      marker.setLatLng(latlng);
    }
    if (pan) map.setView(latlng, Math.max(map.getZoom(), PIN_ZOOM));
  }

  /** Marca (o saca, con null) el punto. `dirty: false` = viene de la base. */
  function setPoint(p, { dirty: isDirty = true, pan = true } = {}) {
    point = isValidPoint(p) ? roundPoint(p) : null;
    dirty = isDirty;
    note = '';
    syncMarker({ pan });
    renderStatus();
  }

  async function ensureMap() {
    mapReady ||= (async () => {
      const [mod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
      L = mod.default || mod;
      map = L.map(mapEl, { zoomControl: true, attributionControl: true })
        .setView(point ? [point.lat, point.lng] : [BARADERO_CENTER.lat, BARADERO_CENTER.lng], point ? PIN_ZOOM : 14);
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(map);
      map.on('click', (e) => setPoint({ lat: e.latlng.lat, lng: e.latlng.lng }, { pan: false }));
      // Teclado: Leaflet ya mueve el mapa con las flechas y hace zoom con +/-;
      // Enter pone el pin en el centro (la cruz que se ve al enfocar el mapa).
      mapEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target !== mapEl) return;
        e.preventDefault();
        const c = map.getCenter();
        setPoint({ lat: c.lat, lng: c.lng }, { pan: false });
      });
      syncMarker();
      return map;
    })().catch((err) => {
      mapReady = null;
      console.error('No se pudo cargar el mapa:', err);
      statusEl.textContent = 'No se pudo cargar el mapa. Probá de nuevo más tarde o usá el botón de tu ubicación.';
      throw err;
    });
    return mapReady;
  }

  // El mapa necesita tener tamaño al crearse: se arma cuando se ve.
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    ensureMap().then(() => map.invalidateSize()).catch(() => {});
  });
  io.observe(mapEl);

  gpsBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showToast('Tu navegador no permite compartir la ubicación.', 'error');
      return;
    }
    gpsBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        gpsBtn.disabled = false;
        await ensureMap().catch(() => {});
        const acc = Math.round(pos.coords.accuracy || 0);
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (acc > 60) {
          note = `Tu ubicación tiene un margen de unos ${acc} m: revisá que el pin esté en tu puerta.`;
          renderStatus();
        }
      },
      () => {
        gpsBtn.disabled = false;
        showToast('No pudimos obtener tu ubicación. Revisá el permiso del navegador.', 'error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });

  addressBtn.addEventListener('click', async () => {
    const address = (getAddress() || '').trim();
    if (!address) {
      showToast('Escribí la dirección de tu local primero.', 'error');
      document.getElementById('store-address')?.focus();
      return;
    }
    addressBtn.disabled = true;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q=${encodeURIComponent(`${address}, Baradero, Buenos Aires, Argentina`)}`;
      const res = await fetch(url);
      const results = res.ok ? await res.json() : [];
      const hit = results[0];
      if (!hit) {
        showToast('No encontramos esa dirección. Tocá el mapa donde está tu local.', 'error');
        return;
      }
      await ensureMap().catch(() => {});
      setPoint({ lat: Number(hit.lat), lng: Number(hit.lon) });
      // OSM no tiene las alturas de Baradero: casi siempre ubica la calle, no la puerta.
      note = 'Revisá el pin y movelo hasta la puerta de tu local: el mapa puede ubicar solo la calle.';
      renderStatus();
    } catch (err) {
      console.error('Búsqueda de dirección:', err);
      showToast('No se pudo buscar la dirección. Probá de nuevo.', 'error');
    } finally {
      addressBtn.disabled = false;
    }
  });

  clearBtn.addEventListener('click', () => setPoint(null, { pan: false }));

  // Un link largo de Google Maps trae las coordenadas: se usan solas.
  mapsUrlInput?.addEventListener('change', async () => {
    const p = parseCoordsFromMapsUrl(mapsUrlInput.value);
    if (!p) return;
    await ensureMap().catch(() => {});
    setPoint(p);
    note = 'Tomamos la ubicación de tu link de Google Maps.';
    renderStatus();
  });

  renderStatus();

  return {
    setPoint,
    getPoint: () => point,
    isDirty: () => dirty,
    markSaved() { dirty = false; note = ''; renderStatus(); },
  };
}

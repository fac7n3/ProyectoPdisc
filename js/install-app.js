/**
 * install-app.js — "¿Instalar la app?": la card del hub de Mi perfil y el
 * ítem del menú de la foto de perfil (nav-utils.js usa getInstallState /
 * triggerInstall).
 *
 * Solo en celular y solo cuando el sitio está abierto en el navegador: dentro
 * de la app instalada no tiene sentido. En Android con Chrome el botón abre el
 * cartel de instalación del propio navegador (evento `beforeinstallprompt`);
 * donde no hay ese evento (iPhone, otros navegadores, o Chrome todavía no lo
 * ofreció) se explica cómo hacerlo desde el menú. Qué se muestra en cada caso
 * lo decide install-app-utils.js.
 *
 * Se importa desde nav-utils.js y perfil.js (arriba de todo): Chrome dispara
 * `beforeinstallprompt` una sola vez por carga de página y hay que estar
 * escuchando desde antes.
 */
import { detectMobilePlatform, installCardState } from './install-app-utils.js';

const platform = detectMobilePlatform(navigator);

let deferredPrompt = null;
let installed = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (event) => {
  // En la computadora se deja el comportamiento del navegador tal cual.
  if (!platform) return;
  // Sin esto Chrome muestra su propio cartelito abajo de la pantalla; acá la
  // oferta es la card de Mi perfil y el ítem del menú de cuenta.
  event.preventDefault();
  deferredPrompt = event;
  notify();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installed = true;
  notify();
});

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/**
 * Chrome en Android dice si la app ya está instalada en el celular (lo
 * habilita `related_applications` del manifest). En el resto de los
 * navegadores no se puede saber: se muestran los pasos igual.
 */
async function isAlreadyInstalled() {
  if (!platform || !('getInstalledRelatedApps' in navigator)) return false;
  try {
    const apps = await navigator.getInstalledRelatedApps();
    return apps.length > 0;
  } catch {
    return false;
  }
}

isAlreadyInstalled().then((yes) => {
  if (!yes) return;
  installed = true;
  notify();
});

/** 'hidden' | 'installed' | 'prompt' | 'ios-steps' | 'android-steps' (ver install-app-utils.js). */
export function getInstallState() {
  return installCardState({
    platform,
    standalone: isStandalone(),
    installed,
    canPrompt: Boolean(deferredPrompt),
  });
}

/** Abre el cartel de instalación del navegador. false si no hay uno disponible. */
export async function triggerInstall() {
  const promptEvent = deferredPrompt;
  if (!promptEvent) return false;
  // El cartel se puede abrir una sola vez por evento.
  deferredPrompt = null;
  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') installed = true;
  } catch (err) {
    console.error('No se pudo abrir el cartel de instalación:', err);
  } finally {
    // Si dijo que no, quedan los pasos del menú por si cambia de idea.
    notify();
  }
  return true;
}

/** Lleva la vista a la card del hub y la resalta un momento. */
export function focusInstallCard() {
  const card = document.getElementById('install-app-card');
  if (!card || card.hidden) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.remove('install-card--pulse');
  void card.offsetWidth;
  card.classList.add('install-card--pulse');
  card.addEventListener('animationend', () => card.classList.remove('install-card--pulse'), { once: true });
}

const LEAD = 'Tené Baradero Local en la pantalla de inicio de tu celular y entrá de un toque, sin abrir el navegador.';

/** Arma "texto <ícono> texto <strong>…</strong> texto" sin innerHTML. */
function fillSteps(el, parts) {
  el.replaceChildren(...parts.map((part) => {
    if (typeof part === 'string') return document.createTextNode(part);
    if (part.icon) {
      const i = document.createElement('i');
      i.className = part.icon;
      i.setAttribute('aria-hidden', 'true');
      return i;
    }
    if (part.symbol) {
      const span = document.createElement('span');
      span.textContent = part.symbol;
      span.setAttribute('aria-hidden', 'true');
      return span;
    }
    const strong = document.createElement('strong');
    strong.textContent = part.strong;
    return strong;
  }));
}

const STEPS = {
  'ios-steps': [
    'Tocá el botón Compartir ',
    { icon: 'fa-solid fa-arrow-up-from-bracket' },
    ' del navegador y elegí ',
    { strong: '«Agregar a inicio»' },
    '.',
  ],
  'android-steps': [
    'Abrí el menú del navegador ',
    { symbol: '⋮' },
    ' y tocá ',
    { strong: '«Instalar aplicación»' },
    ' o ',
    { strong: '«Agregar a la pantalla principal»' },
    '.',
  ],
};

/** Prepara la card del hub. La llama initSettings() de perfil.js. */
export function initInstallCard() {
  const card = document.getElementById('install-app-card');
  const title = document.getElementById('install-app-title');
  const text = document.getElementById('install-app-text');
  const steps = document.getElementById('install-app-steps');
  const btn = document.getElementById('install-app-btn');
  if (!card || !title || !text || !steps || !btn) return;

  const render = () => {
    const state = getInstallState();
    card.hidden = state === 'hidden';
    if (state === 'hidden') return;

    title.textContent = state === 'installed' ? 'Ya tenés la app' : '¿Instalar la app?';
    text.textContent = state === 'installed'
      ? 'Está en la pantalla de inicio de tu celular: abrila desde ahí para entrar de un toque.'
      : LEAD;
    btn.hidden = state !== 'prompt';
    steps.hidden = !STEPS[state];
    if (STEPS[state]) fillSteps(steps, STEPS[state]);
  };

  listeners.add(render);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await triggerInstall();
    btn.disabled = false;
  });
  render();
}

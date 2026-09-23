/**
 * panel-onboarding-utils.js — Bienvenida a un panel (vendedor/profesional/admin)
 *
 * La primera vez que una cuenta entra a su panel, muestra un overlay con una
 * tarjeta por sección del sidebar explicando qué hace cada una -- no es un
 * tour paso a paso, es un mapa rápido. Agnóstico de dominio (igual que
 * vender-shell.js): no sabe nada de sidebars concretos, cada panel arma su
 * propia lista de secciones y se la pasa a showPanelOnboarding().
 *
 * Tracking de "ya lo vio" con el mismo patrón que hints-utils.js: cache en
 * localStorage + `profiles.panel_onboarding_seen` (migración 95, jsonb con
 * una clave por panel: "vendedor" | "profesional" | "admin") como fuente de
 * verdad, con fallback a la cache si la migración todavía no está aplicada.
 */

import { supabase } from './auth-utils.js';

const SEEN_CACHE_KEY = 'bl_panel_onboarding_seen';

function readSeenCache() {
  try {
    const raw = localStorage.getItem(SEEN_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeSeenCache(map) {
  try {
    localStorage.setItem(SEEN_CACHE_KEY, JSON.stringify(map));
  } catch {
    // Navegador con storage bloqueado: se vuelve a mostrar en la próxima carga.
  }
}

/** Lee la cache sin tocar la red (para no esperar el fetch antes de decidir). */
export function isPanelOnboardingSeenCached(panelKey) {
  return !!readSeenCache()[panelKey];
}

/**
 * Sincroniza con `profiles.panel_onboarding_seen`. Sin sesión, o si la
 * migración 95 todavía no está aplicada, cae a la cache local.
 * @param {'vendedor'|'profesional'|'admin'} panelKey
 * @returns {Promise<boolean>}
 */
export async function loadPanelOnboardingSeen(panelKey) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return isPanelOnboardingSeenCached(panelKey);

    const { data, error } = await supabase
      .from('profiles')
      .select('panel_onboarding_seen')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error || !data || data.panel_onboarding_seen == null) return isPanelOnboardingSeenCached(panelKey);

    const seen = !!data.panel_onboarding_seen[panelKey];
    if (seen) {
      const cache = readSeenCache();
      cache[panelKey] = true;
      writeSeenCache(cache);
    }
    return seen;
  } catch {
    return isPanelOnboardingSeenCached(panelKey);
  }
}

/**
 * Marca un panel como visto: cache primero (siempre), después intenta
 * persistir en la cuenta con lectura-fusión-escritura (el jsonb puede tener
 * la clave de otro panel que no hay que pisar).
 * @param {'vendedor'|'profesional'|'admin'} panelKey
 * @returns {Promise<{persisted: boolean}>}
 */
export async function markPanelOnboardingSeen(panelKey) {
  const cache = readSeenCache();
  cache[panelKey] = true;
  writeSeenCache(cache);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { persisted: false };

    const { data: profile } = await supabase
      .from('profiles')
      .select('panel_onboarding_seen')
      .eq('id', session.user.id)
      .maybeSingle();

    const merged = { ...(profile?.panel_onboarding_seen || {}), [panelKey]: true };
    const { error } = await supabase
      .from('profiles')
      .update({ panel_onboarding_seen: merged })
      .eq('id', session.user.id);

    return { persisted: !error };
  } catch {
    return { persisted: false };
  }
}

/**
 * Arma y abre el overlay de bienvenida. Quien llama ya decidió que
 * corresponde mostrarlo (ver loadPanelOnboardingSeen) -- esta función solo
 * pinta y cablea el cierre (X implícita en click afuera, "Entendido",
 * Escape, "Ir al inicio"): cualquier forma de cerrarlo marca el panel como
 * visto.
 *
 * @param {Object} opts
 * @param {'vendedor'|'profesional'|'admin'} opts.panelKey
 * @param {string} opts.title
 * @param {string} [opts.greeting]
 * @param {{icon:string, title:string, desc:string}[]} opts.sections
 */
export function showPanelOnboarding({ panelKey, title, greeting, sections }) {
  if (!sections?.length) return;

  const overlay = document.createElement('div');
  overlay.className = 'panel-onboarding-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  const box = document.createElement('div');
  box.className = 'panel-onboarding';

  const h2 = document.createElement('h2');
  h2.className = 'panel-onboarding__title';
  h2.textContent = title;
  box.appendChild(h2);

  if (greeting) {
    const p = document.createElement('p');
    p.className = 'panel-onboarding__greeting';
    p.textContent = greeting;
    box.appendChild(p);
  }

  const grid = document.createElement('div');
  grid.className = 'panel-onboarding__cards';
  sections.forEach(({ icon, title: cardTitle, desc }) => {
    const card = document.createElement('div');
    card.className = 'panel-onboarding__card';

    const i = document.createElement('i');
    if (icon.startsWith('fa-')) {
      i.className = `${icon} panel-onboarding__card-icon`;
    } else {
      // Panel de admin: no usa Font Awesome, `icon` ya viene como emoji.
      i.className = 'panel-onboarding__card-icon';
      i.textContent = icon;
    }
    i.setAttribute('aria-hidden', 'true');

    const body = document.createElement('div');
    const strong = document.createElement('span');
    strong.className = 'panel-onboarding__card-title';
    strong.textContent = cardTitle;
    const desc_ = document.createElement('span');
    desc_.className = 'panel-onboarding__card-desc';
    desc_.textContent = desc || '';
    body.append(strong, desc_);

    card.append(i, body);
    grid.appendChild(card);
  });
  box.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'panel-onboarding__actions';

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
    markPanelOnboardingSeen(panelKey);
  };

  const homeBtn = document.createElement('a');
  homeBtn.href = './home.html';
  homeBtn.className = 'panel-onboarding__btn';
  homeBtn.textContent = 'Ir al inicio';
  homeBtn.addEventListener('click', () => markPanelOnboardingSeen(panelKey));

  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'panel-onboarding__btn panel-onboarding__btn--primary';
  okBtn.textContent = 'Entendido, ir a mi panel';
  okBtn.addEventListener('click', close);

  actions.append(homeBtn, okBtn);
  box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  function onEsc(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onEsc);

  requestAnimationFrame(() => overlay.classList.add('is-open'));
  okBtn.focus();
}

/**
 * "Cambiar de cuenta" en Mi perfil → Tu cuenta.
 *
 * Una persona puede tener más de una cuenta en Baradero Local (por ejemplo la
 * del comercio y la personal). Acá puede guardarlas en este dispositivo y pasar
 * de una a otra sin tipear la contraseña cada vez.
 *
 * Cómo se sabe que son de la misma persona: para agregar una cuenta hay que
 * INICIAR SESIÓN en ella (contraseña o Google). Nadie puede sumar la cuenta de
 * otro, porque no tiene cómo entrar.
 *
 * Cómo se cambia: cada cuenta guarda sus tokens de sesión (linked-accounts.js)
 * y se abre con supabase.auth.setSession(); después la página se recarga sola.
 * Los tokens de una cuenta que NO está activa no se tocan, así siguen
 * válidos; la cuenta activa se actualiza antes de irse.
 */

import { createClient } from '@supabase/supabase-js';
import { supabase, showToast } from './auth-utils.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';
import { confirmDialog } from './confirm-dialog.js';
import {
  loadLinkedAccounts,
  rememberAccount,
  forgetAccount,
  markLinkPending,
  completePendingLink,
  resetLocalCartState,
} from './linked-accounts.js';
import {
  buildAccountEntry,
  switchTargets,
  canLinkAccount,
  accountDisplayName,
  MAX_LINKED_ACCOUNTS,
} from './linked-accounts-utils.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function mapLoginError(error) {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (msg.includes('email not confirmed')) return 'Esa cuenta todavía no confirmó su correo.';
  if (msg.includes('too many requests') || msg.includes('rate limit') || error?.status === 429) {
    return 'Demasiados intentos. Esperá unos minutos.';
  }
  if (msg.includes('network') || msg.includes('fetch')) return 'Error de conexión. Verificá tu internet.';
  return 'No pudimos iniciar sesión en esa cuenta.';
}

/** Inicia sesión en la otra cuenta SIN tocar la sesión de este navegador. */
async function signInSeparately(email, password) {
  const aparte = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'bl-link-account-temp',
    },
  });
  return aparte.auth.signInWithPassword({ email, password });
}

let panel = null;
let currentSession = null;

async function switchTo(entry, button) {
  button.disabled = true;
  const etiqueta = button.textContent;
  button.textContent = 'Cambiando…';

  // La cuenta de la que nos vamos queda con sus tokens al día (se pudieron
  // renovar desde que se guardó).
  const { data: { session: actual } } = await supabase.auth.getSession();
  if (actual) rememberAccount(actual);

  const { data, error } = await supabase.auth.setSession(entry.session);
  if (error || !data?.session) {
    console.error('No se pudo abrir la otra cuenta:', error);
    // Los tokens guardados ya no sirven (la sesión se cerró en otro lado): se
    // saca de la lista para no dejar un botón que nunca va a andar.
    forgetAccount(entry.id);
    showToast('La sesión de esa cuenta se cerró. Agregala de nuevo para volver a usarla.', 'error');
    button.disabled = false;
    button.textContent = etiqueta;
    await render();
    return;
  }

  rememberAccount(data.session);
  resetLocalCartState();
  showToast(`Entraste con ${entry.email}`, 'success');
  // Se recarga sola, volviendo a la misma sección de Mi perfil.
  window.location.href = './perfil.html?tab=mis-datos';
}

async function addWithPassword(emailInput, passwordInput, button) {
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!email || !password) {
    showToast('Ingresá el correo y la contraseña de la otra cuenta.', 'error');
    return;
  }
  if (currentSession?.user?.email?.toLowerCase() === email) {
    showToast('Esa ya es la cuenta con la que estás ahora.', 'error');
    return;
  }

  button.disabled = true;
  const etiqueta = button.textContent;
  button.textContent = 'Verificando…';

  try {
    const { data, error } = await signInSeparately(email, password);
    if (error || !data?.session) {
      showToast(mapLoginError(error), 'error');
      return;
    }

    const motivo = canLinkAccount(loadLinkedAccounts(), currentSession.user.id, data.session.user.id);
    if (motivo) {
      showToast(motivo, 'error');
      return;
    }

    // Las dos quedan guardadas: así, desde la otra cuenta, también se puede volver.
    rememberAccount(currentSession);
    rememberAccount(data.session);
    passwordInput.value = '';
    emailInput.value = '';
    showToast(`Agregaste la cuenta ${accountDisplayName(data.session.user)}.`, 'success');
  } catch (err) {
    console.error('Error al agregar la cuenta:', err);
    showToast('No pudimos agregar la cuenta. Probá de nuevo.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = etiqueta;
  }
  await render();
}

async function addWithGoogle(button) {
  if (loadLinkedAccounts().length >= MAX_LINKED_ACCOUNTS) {
    showToast(`Podés tener hasta ${MAX_LINKED_ACCOUNTS} cuentas en este dispositivo.`, 'error');
    return;
  }
  button.disabled = true;

  // Se guarda la cuenta actual y se anota desde dónde se arrancó: al volver de
  // Google, auth-utils (resolvePostLoginRedirect) suma la cuenta nueva y manda a
  // Mi perfil. Google redirige a login.html, que es el destino ya habilitado.
  rememberAccount(currentSession);
  markLinkPending(currentSession.user.id);
  resetLocalCartState();

  const redirectTo = `${window.location.origin}/pages/login.html`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } },
  });
  if (error) {
    console.error('Google link error:', error);
    showToast('No se pudo conectar con Google. Intentá de nuevo.', 'error');
    button.disabled = false;
  }
}

async function removeFromDevice(entry) {
  const ok = await confirmDialog(
    `¿Sacar ${entry.email} de este dispositivo?\n\nLa cuenta no se borra: solo vas a tener que iniciar sesión de nuevo para volver a usarla desde acá.`,
    { confirmText: 'Sí, sacarla' }
  );
  if (!ok) return;
  forgetAccount(entry.id);
  await render();
}

function accountRow(entry, { current }) {
  const row = el('div', 'acct-row');
  row.appendChild(el('span', 'acct-row__avatar', (entry.name || entry.email || '?').charAt(0).toUpperCase()));

  const text = el('div', 'acct-row__text');
  text.appendChild(el('span', 'acct-row__name', entry.name));
  text.appendChild(el('span', 'acct-row__email', entry.email));
  row.appendChild(text);

  if (current) {
    row.appendChild(el('span', 'acct-row__badge', 'Cuenta actual'));
  } else {
    const actions = el('div', 'acct-row__actions');
    const switchBtn = el('button', 'datos-btn datos-btn--primary', 'Cambiar');
    switchBtn.type = 'button';
    switchBtn.addEventListener('click', () => switchTo(entry, switchBtn));
    const removeBtn = el('button', 'datos-btn datos-btn--quiet', 'Quitar');
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', `Quitar ${entry.email} de este dispositivo`);
    removeBtn.addEventListener('click', () => removeFromDevice(entry));
    actions.append(switchBtn, removeBtn);
    row.appendChild(actions);
  }
  return row;
}

async function render() {
  if (!panel) return;
  const { data: { session } } = await supabase.auth.getSession();
  currentSession = session;
  if (!session) return;

  // La cuenta activa renueva sus tokens guardados, si ya estaba en la lista.
  const lista = loadLinkedAccounts();
  if (lista.some((e) => e.id === session.user.id)) rememberAccount(session);

  const otras = switchTargets(loadLinkedAccounts(), session.user.id);
  const children = [];

  const lead = el('p', 'acct-panel__lead',
    otras.length
      ? 'Elegí con qué cuenta querés entrar. La página se actualiza sola.'
      : 'Todavía no agregaste otra cuenta. Si tenés más de una en Baradero Local (por ejemplo la del comercio), agregala y cambiá entre ellas desde acá.');
  children.push(lead);

  const actual = buildAccountEntry(session) || {
    id: session.user.id, email: session.user.email || '', name: accountDisplayName(session.user),
  };
  const list = el('div', 'acct-list');
  list.appendChild(accountRow(actual, { current: true }));
  otras.forEach((e) => list.appendChild(accountRow(e, { current: false })));
  children.push(list);

  // --- Agregar otra cuenta ---
  const add = el('div', 'acct-add');
  add.appendChild(el('h4', 'acct-add__title', 'Agregar otra cuenta'));
  add.appendChild(el('p', 'acct-add__hint',
    'Para sumarla tenés que iniciar sesión en ella: así confirmamos que las dos cuentas son tuyas.'));

  const form = el('form', 'acct-add__form');
  form.noValidate = true;
  const emailInput = el('input', 'datos-input datos-input--grow');
  emailInput.type = 'email';
  emailInput.placeholder = 'Correo de la otra cuenta';
  emailInput.autocomplete = 'off';
  emailInput.setAttribute('aria-label', 'Correo de la otra cuenta');
  const passInput = el('input', 'datos-input datos-input--grow');
  passInput.type = 'password';
  passInput.placeholder = 'Contraseña';
  passInput.autocomplete = 'off';
  passInput.setAttribute('aria-label', 'Contraseña de la otra cuenta');
  const addBtn = el('button', 'datos-btn datos-btn--primary', 'Agregar cuenta');
  addBtn.type = 'submit';
  form.append(emailInput, passInput, addBtn);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addWithPassword(emailInput, passInput, addBtn);
  });
  add.appendChild(form);

  const googleBtn = el('button', 'datos-btn acct-add__google');
  googleBtn.type = 'button';
  const gIcon = el('i', 'fa-brands fa-google');
  gIcon.setAttribute('aria-hidden', 'true');
  googleBtn.append(gIcon, document.createTextNode(' Agregar una cuenta de Google'));
  googleBtn.addEventListener('click', () => addWithGoogle(googleBtn));
  add.appendChild(googleBtn);
  children.push(add);

  panel.replaceChildren(...children);
}

/**
 * Cablea la fila "Cambiar de cuenta" de Mi perfil.
 * @param {{ toggle: HTMLElement, panel: HTMLElement, current: HTMLElement }} nodos
 */
export async function initAccountSwitcher({ toggle, panel: panelNode, current }) {
  if (!toggle || !panelNode) return;
  panel = panelNode;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  currentSession = session;
  if (current) current.textContent = session.user.email || '';

  // Si ya hay otras cuentas, lo dice en el botón.
  const otras = switchTargets(loadLinkedAccounts(), session.user.id).length;
  if (otras) toggle.querySelector('span')?.replaceChildren(`Cambiar de cuenta (${otras + 1})`);

  toggle.addEventListener('click', async () => {
    const abrir = panel.hidden;
    toggle.setAttribute('aria-expanded', String(abrir));
    if (abrir) await render();
    panel.hidden = !abrir;
  });

  // Volvió de agregar una cuenta con Google: se deja abierto el panel. Si la
  // vuelta por login.html no llegó a sumar la cuenta (la marca sigue pendiente),
  // se suma acá: Mi perfil es la otra puerta de entrada a esa vinculación.
  const sumadaAca = completePendingLink(session);
  if (sumadaAca || new URLSearchParams(window.location.search).get('cuenta') === 'agregada') {
    await render();
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    showToast('Cuenta agregada. Ya podés cambiar entre tus cuentas.', 'success');
    const url = new URL(window.location.href);
    url.searchParams.delete('cuenta');
    window.history.replaceState(window.history.state, '', url);
  }
}

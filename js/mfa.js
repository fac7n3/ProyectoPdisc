/**
 * mfa.js — verificación en dos pasos (TOTP) en pantalla.
 * Baradero Local
 *
 * Tres usos:
 *  - promptMfaCode(): cartel "Escribí el código de 6 dígitos" (login y panel
 *    de admin). Pide el código hasta que sea correcto o la persona cancele.
 *  - ensureMfaAfterLogin(): lo llama resolvePostLoginRedirect (auth-utils.js)
 *    después de iniciar sesión, con contraseña o con Google.
 *  - initMfaSettings(): fila "Verificación en dos pasos" de Mi perfil ->
 *    Información de tu perfil -> Seguridad (activar con QR / desactivar).
 *
 * Todas reciben el cliente de Supabase por parámetro para no importar
 * auth-utils.js (que importa este archivo).
 *
 * La pantalla NO es el control: la base exige sesión aal2 a admin/moderador
 * (migración 151, public.jwt_role()). Esto solo guía a la persona.
 * Estilos en Assets/styles/mfa.css (solo tokens, sirve en claro y oscuro).
 */
import qrcode from 'qrcode-generator';
import '../Assets/styles/mfa.css';
import {
  isStaffRole, mfaGate, normalizeTotpCode, isTotpCode, formatTotpSecret,
  verifiedTotpFactors, pendingTotpFactors, describeMfaError,
  MFA_ENROLL_UNAVAILABLE_KEY,
} from './mfa-utils.js';

const ISSUER = 'Baradero Local';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Estado de MFA de la sesión actual. Nunca tira: ante un error devuelve "sin datos". */
export async function getMfaStatus(client) {
  try {
    const [{ data: aal }, { data: list }] = await Promise.all([
      client.auth.mfa.getAuthenticatorAssuranceLevel(),
      client.auth.mfa.listFactors(),
    ]);
    const all = list?.all || [];
    return {
      currentLevel: aal?.currentLevel || null,
      nextLevel: aal?.nextLevel || null,
      factors: all,
      verified: verifiedTotpFactors(all),
    };
  } catch (err) {
    console.warn('MFA status error:', err?.message || err);
    return { currentLevel: null, nextLevel: null, factors: [], verified: [] };
  }
}

/* ------------------------------------------------------------------------ */
/* Cartel del código                                                         */
/* ------------------------------------------------------------------------ */

let activePrompt = null;

/**
 * Pide el código de la app y lo verifica contra Supabase. Con el código
 * correcto la sesión pasa a aal2 (supabase-js guarda la sesión nueva sola).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ title?: string, message?: string, cancelText?: string, factorId?: string }} [opts]
 * @returns {Promise<boolean>} true si verificó, false si canceló
 */
export function promptMfaCode(client, opts = {}) {
  // Login y guard pueden pedirlo a la vez (SIGNED_IN + chequeo inicial): un solo cartel.
  if (activePrompt) return activePrompt;
  activePrompt = new Promise((resolve) => {
    const {
      title = 'Verificación en dos pasos',
      message = 'Abrí tu app de autenticación (Google Authenticator, Microsoft Authenticator, Authy...) y escribí el código de 6 dígitos de Baradero Local.',
      cancelText = 'Cancelar',
    } = opts;

    const overlay = el('div', 'mfa-overlay');
    const card = el('form', 'mfa-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'mfa-prompt-title');
    card.noValidate = true;

    const icon = el('div', 'mfa-card__icon');
    // SVG propio y no Font Awesome: admin.html no carga esa hoja.
    icon.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2 4 5v6c0 5.05 3.41 9.76 8 11 4.59-1.24 8-5.95 8-11V5l-8-3Zm0 2.18 6 2.25V11c0 4.05-2.63 7.86-6 8.93V4.18Z"/></svg>';
    const h = el('h2', 'mfa-card__title', title);
    h.id = 'mfa-prompt-title';
    const p = el('p', 'mfa-card__text', message);

    const label = el('label', 'mfa-label', 'Código de 6 dígitos');
    label.htmlFor = 'mfa-prompt-code';
    const input = buildCodeInput('mfa-prompt-code');
    const error = el('p', 'mfa-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const actions = el('div', 'mfa-actions');
    const cancelBtn = el('button', 'mfa-btn mfa-btn--ghost', cancelText);
    cancelBtn.type = 'button';
    const okBtn = el('button', 'mfa-btn mfa-btn--primary', 'Verificar');
    okBtn.type = 'submit';
    okBtn.disabled = true;
    actions.append(cancelBtn, okBtn);

    card.append(icon, h, p, label, input, error, actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.documentElement.classList.add('mfa-lock');

    const finish = (value) => {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      document.documentElement.classList.remove('mfa-lock');
      activePrompt = null;
      resolve(value);
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
    document.addEventListener('keydown', onKeydown);
    cancelBtn.addEventListener('click', () => finish(false));
    input.addEventListener('input', () => {
      okBtn.disabled = !isTotpCode(input.value);
      error.hidden = true;
      input.removeAttribute('aria-invalid');
    });

    card.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = normalizeTotpCode(input.value);
      if (!isTotpCode(code)) return;
      okBtn.disabled = true;
      okBtn.textContent = 'Verificando…';
      const result = await verifyCode(client, code, opts.factorId);
      if (result.ok) { finish(true); return; }
      error.textContent = result.message;
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.value = '';
      input.focus();
      okBtn.textContent = 'Verificar';
    });

    input.focus();
  });
  return activePrompt;
}

function buildCodeInput(id) {
  const input = el('input', 'mfa-code');
  input.id = id;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'one-time-code';
  input.maxLength = 7; // deja pegar "123 456"
  input.setAttribute('pattern', '[0-9 ]*');
  input.addEventListener('input', () => { input.value = normalizeTotpCode(input.value); });
  return input;
}

/** challenge + verify del primer factor TOTP verificado (o el indicado). */
async function verifyCode(client, code, factorId) {
  try {
    let id = factorId;
    if (!id) {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) return { ok: false, ...describeMfaError(error) };
      id = verifiedTotpFactors(data?.all)[0]?.id;
      if (!id) return { ok: false, kind: 'other', message: 'Tu cuenta no tiene una app de autenticación activada.' };
    }
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: id, code });
    if (error) return { ok: false, ...describeMfaError(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, ...describeMfaError(err) };
  }
}

/**
 * Después de iniciar sesión: si la cuenta tiene un factor y la sesión es de
 * solo contraseña (o Google), pide el código. Si cancela, cierra la sesión: una
 * cuenta que activó la verificación no se queda abierta a medias.
 *
 * @returns {Promise<boolean>} false si canceló (la sesión ya quedó cerrada)
 */
export async function ensureMfaAfterLogin(client) {
  const status = await getMfaStatus(client);
  if (mfaGate(status) !== 'verify') return true;
  const ok = await promptMfaCode(client, {
    message: 'Tu cuenta tiene la verificación en dos pasos activada. Abrí tu app de autenticación y escribí el código de 6 dígitos de Baradero Local.',
    cancelText: 'Cancelar',
  });
  if (!ok) {
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* sin red: la sesión local ya no sirve igual */ }
  }
  return ok;
}

/**
 * Guard del panel de admin/moderador (lo llama guardPage con requireRole).
 * @returns {Promise<'ok'|'home'|'enroll'>} a dónde tiene que ir la persona
 */
export async function ensureStaffMfa(client, role) {
  if (!isStaffRole(role)) return 'ok';
  const status = await getMfaStatus(client);
  const gate = mfaGate({ role, ...status });
  if (gate === 'ok') return 'ok';
  if (gate === 'verify') {
    const ok = await promptMfaCode(client, {
      title: 'Confirmá que sos vos',
      message: 'El panel de administración pide el código de tu app de autenticación. Escribí el código de 6 dígitos de Baradero Local.',
      cancelText: 'Volver al inicio',
    });
    return ok ? 'ok' : 'home';
  }
  // Sin factor. Si ya se vio que el alta no está habilitada en Supabase, se
  // deja pasar en esta pestaña (la base igual decide qué puede hacer).
  try {
    if (sessionStorage.getItem(MFA_ENROLL_UNAVAILABLE_KEY) === '1') return 'ok';
  } catch { /* sessionStorage bloqueado */ }
  return 'enroll';
}

/* ------------------------------------------------------------------------ */
/* Mi perfil: activar / desactivar                                           */
/* ------------------------------------------------------------------------ */

/** QR como imagen GIF (data:, que la CSP permite). Oscuro sobre blanco siempre. */
function buildQrImage(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const img = document.createElement('img');
  img.src = qr.createDataURL(5, 2);
  img.alt = 'Código QR para agregar Baradero Local a tu app de autenticación';
  img.className = 'mfa-qr';
  return img;
}

/**
 * Fila "Verificación en dos pasos" de Mi perfil.
 * Espera en la página: #mfa-status, #mfa-hint, #btn-mfa-toggle, #mfa-setup y
 * (opcional) #mfa-required-notice.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ user: any, showToast?: Function, confirm?: (msg: string, o?: object) => Promise<boolean>, required?: boolean }} opts
 */
export async function initMfaSettings(client, { user, showToast = () => {}, confirm = async () => true, required = false } = {}) {
  const statusEl = document.getElementById('mfa-status');
  const hintEl = document.getElementById('mfa-hint');
  const toggleBtn = document.getElementById('btn-mfa-toggle');
  const setup = document.getElementById('mfa-setup');
  const notice = document.getElementById('mfa-required-notice');
  if (!statusEl || !toggleBtn || !setup) return;

  const role = user?.app_metadata?.role || null;
  const staff = isStaffRole(role);
  let busy = false;

  async function render() {
    const status = await getMfaStatus(client);
    const active = status.verified.length > 0;
    statusEl.textContent = active ? 'Activada' : 'Desactivada';
    statusEl.classList.toggle('mfa-status--on', active);
    toggleBtn.textContent = active ? 'Desactivar' : 'Activar';
    toggleBtn.classList.toggle('datos-btn--danger', active);
    toggleBtn.hidden = false;
    if (hintEl) {
      hintEl.textContent = active
        ? 'Cada vez que entrás con tu contraseña o con Google te pedimos el código de tu app de autenticación.'
        : staff
          ? 'Tu cuenta es de administración: la necesitás para entrar al panel. Además de la contraseña, te vamos a pedir un código de una app como Google Authenticator.'
          : 'Además de la contraseña, te pedimos un código de una app como Google Authenticator. Si alguien consigue tu contraseña, igual no puede entrar.';
    }
    if (notice) notice.hidden = !(staff && !active);
    return status;
  }

  function closeSetup() {
    setup.replaceChildren();
    setup.hidden = true;
    toggleBtn.disabled = false;
  }

  function showSetupError(message, { allowContinue = false } = {}) {
    setup.replaceChildren();
    setup.hidden = false;
    const box = el('div', 'mfa-setup__body');
    const p = el('p', 'mfa-error', message);
    p.setAttribute('role', 'alert');
    box.appendChild(p);
    const actions = el('div', 'mfa-actions mfa-actions--start');
    const close = el('button', 'mfa-btn mfa-btn--ghost', 'Cerrar');
    close.type = 'button';
    close.addEventListener('click', closeSetup);
    actions.appendChild(close);
    if (allowContinue && staff) {
      // Sin TOTP habilitado en Supabase no hay forma de activarla: no dejar al
      // admin afuera de su panel por algo que no depende de él.
      const go = el('a', 'mfa-btn mfa-btn--primary', 'Entrar al panel por ahora');
      go.href = './admin.html';
      go.addEventListener('click', () => {
        try { sessionStorage.setItem(MFA_ENROLL_UNAVAILABLE_KEY, '1'); } catch { /* bloqueado */ }
      });
      actions.appendChild(go);
    }
    box.appendChild(actions);
    setup.appendChild(box);
    toggleBtn.disabled = false;
  }

  async function startEnroll() {
    toggleBtn.disabled = true;
    setup.hidden = false;
    setup.replaceChildren(el('p', 'mfa-setup__loading', 'Preparando el código QR…'));

    // Altas a medio terminar de otra vez: se limpian (no exigen aal2).
    const status = await getMfaStatus(client);
    for (const f of pendingTotpFactors(status.factors)) {
      try { await client.auth.mfa.unenroll({ factorId: f.id }); } catch { /* sigue igual */ }
    }

    const { data, error } = await client.auth.mfa.enroll({
      factorType: 'totp',
      issuer: ISSUER,
      friendlyName: `${ISSUER} (${new Date().toISOString().slice(0, 10)})`,
    });
    if (error || !data?.totp) {
      const info = describeMfaError(error);
      showSetupError(info.message, { allowContinue: info.kind === 'disabled' });
      return;
    }
    try { sessionStorage.removeItem(MFA_ENROLL_UNAVAILABLE_KEY); } catch { /* bloqueado */ }
    renderEnrollStep(data);
  }

  function renderEnrollStep(factor) {
    setup.replaceChildren();
    const body = el('form', 'mfa-setup__body');
    body.noValidate = true;

    const steps = el('ol', 'mfa-steps');
    const s1 = el('li', null);
    s1.append(
      el('strong', null, 'Instalá una app de autenticación'),
      el('span', null, ' en tu celular, por ejemplo Google Authenticator, Microsoft Authenticator o Authy.'),
    );
    const s2 = el('li', null);
    s2.append(el('strong', null, 'Escaneá este código QR'), el('span', null, ' desde la app ("Agregar cuenta" o el botón +).'));
    const qrWrap = el('div', 'mfa-qr-wrap');
    qrWrap.appendChild(buildQrImage(factor.totp.uri));
    const manual = el('details', 'mfa-manual');
    manual.appendChild(el('summary', null, '¿No podés escanearlo? Escribí la clave a mano'));
    const secret = el('code', 'mfa-secret', formatTotpSecret(factor.totp.secret));
    const copy = el('button', 'mfa-btn mfa-btn--ghost mfa-btn--small', 'Copiar clave');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(factor.totp.secret);
        showToast('Clave copiada.', 'success');
      } catch { showToast('No se pudo copiar. Escribila a mano.', 'error'); }
    });
    manual.append(secret, copy);
    s2.append(qrWrap, manual);

    const s3 = el('li', null);
    s3.append(el('strong', null, 'Escribí el código de 6 dígitos'), el('span', null, ' que muestra la app para Baradero Local.'));
    const label = el('label', 'mfa-label', 'Código');
    label.htmlFor = 'mfa-enroll-code';
    const input = buildCodeInput('mfa-enroll-code');
    const error = el('p', 'mfa-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    s3.append(label, input, error);
    steps.append(s1, s2, s3);

    const actions = el('div', 'mfa-actions mfa-actions--start');
    const cancel = el('button', 'mfa-btn mfa-btn--ghost', 'Cancelar');
    cancel.type = 'button';
    const ok = el('button', 'mfa-btn mfa-btn--primary', 'Activar');
    ok.type = 'submit';
    ok.disabled = true;
    actions.append(cancel, ok);

    body.append(steps, actions);
    setup.appendChild(body);

    input.addEventListener('input', () => {
      ok.disabled = !isTotpCode(input.value);
      error.hidden = true;
    });
    cancel.addEventListener('click', async () => {
      // El factor quedó "sin verificar": se saca para no dejar basura.
      try { await client.auth.mfa.unenroll({ factorId: factor.id }); } catch { /* se limpia la próxima */ }
      closeSetup();
    });
    body.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = normalizeTotpCode(input.value);
      if (!isTotpCode(code)) return;
      ok.disabled = true;
      ok.textContent = 'Activando…';
      const result = await verifyCode(client, code, factor.id);
      if (!result.ok) {
        error.textContent = result.message;
        error.hidden = false;
        input.value = '';
        input.focus();
        ok.textContent = 'Activar';
        return;
      }
      closeSetup();
      await render();
      showToast('Listo: la verificación en dos pasos quedó activada.', 'success');
      if (staff) renderStaffDone();
    });
    input.focus();
  }

  function renderStaffDone() {
    setup.hidden = false;
    setup.replaceChildren();
    const body = el('div', 'mfa-setup__body');
    body.appendChild(el('p', 'mfa-ok', 'Ya podés entrar al panel de administración. Desde ahora te vamos a pedir el código cada vez que inicies sesión.'));
    const actions = el('div', 'mfa-actions mfa-actions--start');
    const go = el('a', 'mfa-btn mfa-btn--primary', 'Ir al panel');
    go.href = './admin.html';
    actions.appendChild(go);
    body.appendChild(actions);
    setup.appendChild(body);
  }

  async function disable() {
    const status = await getMfaStatus(client);
    const factor = status.verified[0];
    if (!factor) { await render(); return; }
    const sure = await confirm(
      staff
        ? 'Tu cuenta es de administración: sin la verificación en dos pasos no vas a poder usar el panel. ¿La desactivás igual?'
        : 'Vas a volver a entrar solo con la contraseña. ¿Desactivás la verificación en dos pasos?',
      { title: 'Desactivar verificación en dos pasos', confirmText: 'Desactivar', danger: true },
    );
    if (!sure) return;
    // Supabase exige haber entrado con el código para sacar un factor verificado.
    if (status.currentLevel !== 'aal2') {
      const ok = await promptMfaCode(client, {
        title: 'Confirmá con tu código',
        message: 'Para desactivarla, escribí el código de 6 dígitos de tu app de autenticación.',
        factorId: factor.id,
      });
      if (!ok) return;
    }
    const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      showToast(describeMfaError(error).message, 'error');
      return;
    }
    // La sesión sigue diciendo aal2 hasta refrescarse: se refresca ya.
    try { await client.auth.refreshSession(); } catch { /* se refresca sola después */ }
    await render();
    showToast('La verificación en dos pasos quedó desactivada.', 'success');
  }

  toggleBtn.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try {
      const status = await getMfaStatus(client);
      if (status.verified.length) await disable();
      else await startEnroll();
    } finally {
      busy = false;
    }
  });

  const status = await render();
  // Vino desde el panel de admin sin factor: abrir el alta directo.
  if (required && staff && !status.verified.length) await startEnroll();
}

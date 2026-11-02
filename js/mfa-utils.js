/**
 * mfa-utils.js — lógica pura de la verificación en dos pasos (TOTP).
 * Baradero Local
 *
 * Sin DOM ni Supabase, para poder probarla con `node js/mfa-utils.test.mjs`.
 * La parte de pantalla vive en js/mfa.js.
 *
 * Contexto: las cuentas admin/moderador tienen que entrar con un código de una
 * app de autenticación además de la contraseña (pendiente P-01 de
 * docs/seguridad/HARDENING-SOC2-ISO27701.md). El control de verdad está en la
 * base (migración 151, `public.jwt_role()`): sin sesión aal2 la base trata a
 * esa cuenta como un cliente. Esto solo decide qué pantalla mostrar.
 */

/** Roles que necesitan la verificación en dos pasos para usar su panel. */
export const STAFF_ROLES = Object.freeze(['admin', 'moderador']);

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

/**
 * Qué falta para que la sesión pueda seguir.
 *  - 'ok':     nada (ya es aal2, o la cuenta no tiene ni necesita factor).
 *  - 'verify': la cuenta tiene un factor verificado y la sesión todavía no pasó
 *              por el código (aal1 -> hay que pedirlo).
 *  - 'enroll': cuenta admin/moderador sin ningún factor: tiene que activarla.
 *
 * `currentLevel`/`nextLevel` son los de
 * supabase.auth.mfa.getAuthenticatorAssuranceLevel().
 *
 * @param {{ role?: string|null, currentLevel?: string|null, nextLevel?: string|null }} s
 * @returns {'ok'|'verify'|'enroll'}
 */
export function mfaGate({ role = null, currentLevel = null, nextLevel = null } = {}) {
  if (currentLevel === 'aal2') return 'ok';
  if (nextLevel === 'aal2') return 'verify';
  return isStaffRole(role) ? 'enroll' : 'ok';
}

/** Deja solo dígitos y corta en 6 (pegar "123 456" o "123-456" anda igual). */
export function normalizeTotpCode(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 6);
}

export function isTotpCode(value) {
  return /^\d{6}$/.test(String(value ?? ''));
}

/** Clave secreta en grupos de 4 para copiarla a mano sin perderse. */
export function formatTotpSecret(secret) {
  return String(secret ?? '').replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

/** Factores TOTP ya verificados (los que sirven para entrar). */
export function verifiedTotpFactors(factors) {
  return (Array.isArray(factors) ? factors : [])
    .filter((f) => f && f.factor_type === 'totp' && f.status === 'verified');
}

/**
 * Factores que quedaron a medio activar (se escaneó el QR pero nunca se
 * confirmó el código). Se limpian antes de empezar otro: si no, Supabase
 * rechaza el alta nueva por nombre repetido y además cuentan para el tope.
 */
export function pendingTotpFactors(factors) {
  return (Array.isArray(factors) ? factors : [])
    .filter((f) => f && f.factor_type === 'totp' && f.status !== 'verified');
}

/**
 * Traduce los errores de Supabase Auth del flujo de MFA a un texto para la
 * persona. `kind` sirve a la pantalla para decidir qué ofrecer:
 *  - 'disabled': TOTP no está activado en el proyecto (Authentication -> MFA).
 *  - 'code':     el código no es el correcto o venció.
 *  - 'rate':     demasiados intentos.
 *  - 'aal':      la acción pide haber entrado con el código (ej. desactivar).
 *  - 'other'.
 *
 * @param {{ code?: string, message?: string, status?: number }|null} error
 * @returns {{ kind: 'disabled'|'code'|'rate'|'aal'|'other', message: string }}
 */
export function describeMfaError(error) {
  const code = String(error?.code || '').toLowerCase();
  const msg = String(error?.message || '').toLowerCase();

  if (code.includes('not_enabled') || /mfa .*(disabled|not enabled)|(enroll|verification) is disabled/.test(msg)) {
    return {
      kind: 'disabled',
      message: 'La verificación en dos pasos todavía no está habilitada en el sitio. Avisale al equipo de Baradero Local.',
    };
  }
  if (error?.status === 429 || code.includes('rate_limit') || msg.includes('too many') || msg.includes('rate limit')) {
    return { kind: 'rate', message: 'Demasiados intentos. Esperá un minuto y probá de nuevo.' };
  }
  if (code.includes('verification_failed') || code.includes('challenge_expired')
      || msg.includes('invalid totp') || msg.includes('invalid code') || msg.includes('expired')) {
    return { kind: 'code', message: 'El código no es correcto o ya venció. Escribí el que aparece ahora en la app.' };
  }
  if (code.includes('insufficient_aal') || msg.includes('aal2')) {
    return { kind: 'aal', message: 'Para hacer esto tenés que confirmar primero con el código de tu app.' };
  }
  return { kind: 'other', message: 'No se pudo completar la verificación. Probá de nuevo en un momento.' };
}

/** Clave de sessionStorage: el admin ya vio que el alta no está habilitada y siguió igual. */
export const MFA_ENROLL_UNAVAILABLE_KEY = 'bl_mfa_enroll_unavailable';

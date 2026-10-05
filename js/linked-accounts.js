/**
 * Almacenamiento de las cuentas vinculadas a este dispositivo (ver
 * linked-accounts-utils.js). Sin imports de Supabase a propósito: lo importa
 * auth-utils.js (para cerrar todo al salir y para terminar una vinculación con
 * Google), y un import de vuelta sería circular.
 *
 * Qué se guarda: los tokens de sesión de cada cuenta, en el localStorage de
 * este navegador -- el mismo lugar donde Supabase ya guarda la sesión activa.
 * "Cerrar sesión" lo borra todo: en un dispositivo compartido no queda ninguna
 * cuenta abierta atrás.
 */

import {
  LINKED_ACCOUNTS_KEY,
  parseLinkedAccounts,
  upsertAccount,
  removeAccount,
  buildAccountEntry,
} from './linked-accounts-utils.js';

/** Marca que deja "Agregar con Google" para terminar la vinculación al volver. */
const PENDING_KEY = 'bl_linked_pending';
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

export function loadLinkedAccounts() {
  try {
    return parseLinkedAccounts(localStorage.getItem(LINKED_ACCOUNTS_KEY));
  } catch {
    return [];
  }
}

function saveLinkedAccounts(lista) {
  try {
    if (lista.length) localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(lista));
    else localStorage.removeItem(LINKED_ACCOUNTS_KEY);
  } catch (err) {
    console.warn('No se pudo guardar la lista de cuentas:', err?.message || err);
  }
}

/** Guarda (o actualiza) la cuenta de esta sesión de Supabase. */
export function rememberAccount(session) {
  const entrada = buildAccountEntry(session);
  if (!entrada) return;
  saveLinkedAccounts(upsertAccount(loadLinkedAccounts(), entrada));
}

export function forgetAccount(id) {
  saveLinkedAccounts(removeAccount(loadLinkedAccounts(), id));
}

/** Olvida todas las cuentas de este dispositivo (al cerrar sesión). */
export function clearLinkedAccounts() {
  try {
    localStorage.removeItem(LINKED_ACCOUNTS_KEY);
    localStorage.removeItem(PENDING_KEY);
  } catch { /* sin storage: no hay nada que borrar */ }
}

/** Antes de irse a Google: deja anotado desde qué cuenta se arrancó. */
export function markLinkPending(fromUserId) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ from: fromUserId, at: Date.now() }));
  } catch { /* si no se puede, la vinculación simplemente no se completa sola */ }
}

/**
 * Al volver de Google: si había una vinculación en curso y la sesión es de OTRA
 * cuenta, la suma a la lista. Devuelve true si se agregó una cuenta.
 * @param {object} session sesión de Supabase recién abierta
 */
export function completePendingLink(session) {
  let pendiente;
  try {
    pendiente = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
  } catch {
    localStorage.removeItem(PENDING_KEY);
    return false;
  }
  if (!pendiente?.from || Date.now() - Number(pendiente.at) > PENDING_MAX_AGE_MS) {
    try { localStorage.removeItem(PENDING_KEY); } catch { /* sin storage */ }
    return false;
  }
  if (!session?.user?.id) return false;
  // Misma cuenta que la de partida: puede ser que la página haya leído la sesión
  // vieja antes de que se procesara la vuelta de Google. La marca NO se gasta:
  // queda para cuando se abra la sesión nueva (vence sola a los 15 minutos).
  if (session.user.id === pendiente.from) return false;
  rememberAccount(session);
  try { localStorage.removeItem(PENDING_KEY); } catch { /* sin storage */ }
  return true;
}

/**
 * El carrito local es de la cuenta que lo armó. Al pasar a otra, se deja de
 * lado el de este navegador (el de cada cuenta vive en la nube) para que no se
 * mezcle con el de la nueva. Las claves son las de cart-utils.js
 * (CART_KEY, CART_DIRTY_KEY y CART_SYNCED_FLAG).
 */
export function resetLocalCartState() {
  try {
    localStorage.removeItem('bl_cart');
    localStorage.removeItem('bl_cart_unsynced');
    sessionStorage.removeItem('bl_cart_synced');
  } catch { /* sin storage: nada que limpiar */ }
}

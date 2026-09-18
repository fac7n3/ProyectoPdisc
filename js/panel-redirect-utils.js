/**
 * panel-redirect-utils.js — Preferencia "entrar directo a mi panel"
 *
 * Una cuenta con un solo panel posible (vendedor, empleada de un comercio,
 * profesional publicado, o admin/moderador sin además vender/ofrecer un
 * servicio) entra directo a su panel al iniciar sesión en vez de ver primero
 * el inicio de compras (ver initPanelAction en js/home.js). Este módulo es la
 * preferencia para apagar ese redirect, editable desde Perfil → Ajustes.
 *
 * Mismo patrón que hints-utils.js: cache en localStorage + `profiles.auto_redirect_panel_enabled`
 * (migración 95) como fuente de verdad, con fallback a la cache si la
 * migración todavía no está aplicada.
 */

import { supabase } from './auth-utils.js';

const AUTO_REDIRECT_PREF_KEY = 'bl_auto_redirect_panel';

/** Default: activado (mismo comportamiento que ya existía antes de esta preferencia). */
const AUTO_REDIRECT_DEFAULT = true;

/** Lee la preferencia cacheada (sin tocar la red). */
export function isAutoRedirectEnabled() {
  try {
    const raw = localStorage.getItem(AUTO_REDIRECT_PREF_KEY);
    return raw === null ? AUTO_REDIRECT_DEFAULT : raw === '1';
  } catch {
    return AUTO_REDIRECT_DEFAULT;
  }
}

/** Guarda la preferencia en la cache local (no toca la base). */
function cacheAutoRedirectPreference(enabled) {
  try {
    localStorage.setItem(AUTO_REDIRECT_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // Navegador con storage bloqueado: la preferencia dura lo que la pestaña.
  }
}

/**
 * Trae la preferencia real de la cuenta y refresca la cache. Sin sesión no
 * hace nada: la cache local ya es la fuente de verdad para un invitado.
 * @returns {Promise<boolean>} la preferencia vigente después de sincronizar
 */
export async function loadAutoRedirectPreference() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return isAutoRedirectEnabled();

    const { data, error } = await supabase
      .from('profiles')
      .select('auto_redirect_panel_enabled')
      .eq('id', session.user.id)
      .maybeSingle();

    // Si la migración 95 todavía no se aplicó, la columna no existe y esto
    // devuelve error: se ignora a propósito y manda la cache local, así la
    // feature funciona igual mientras la migración esté pendiente.
    if (error || !data || data.auto_redirect_panel_enabled == null) return isAutoRedirectEnabled();

    cacheAutoRedirectPreference(data.auto_redirect_panel_enabled);
    return data.auto_redirect_panel_enabled;
  } catch {
    return isAutoRedirectEnabled();
  }
}

/**
 * Cambia la preferencia: cache local primero (efecto inmediato aunque la red
 * falle) y después la cuenta.
 * @param {boolean} enabled
 * @returns {Promise<{persisted: boolean}>} `persisted:false` = quedó solo local
 */
export async function setAutoRedirectEnabled(enabled) {
  cacheAutoRedirectPreference(enabled);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { persisted: false };

    const { error } = await supabase
      .from('profiles')
      .update({ auto_redirect_panel_enabled: enabled })
      .eq('id', session.user.id);

    if (error) {
      console.error('No se pudo guardar la preferencia de redirect al panel:', error);
      return { persisted: false };
    }
    return { persisted: true };
  } catch (err) {
    console.error('No se pudo guardar la preferencia de redirect al panel:', err);
    return { persisted: false };
  }
}

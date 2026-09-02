/**
 * settings-utils.js — Preferencias de la app que se guardan por dispositivo.
 *
 * Todo lo que se puede tocar desde Perfil → Ajustes y NO tiene columna propia
 * en `profiles`. Es a propósito: la única preferencia sincronizada con la
 * cuenta es la de las ayudas del carrito (`profiles.cart_hints_enabled`, ver
 * hints-utils.js) y su migración (66) todavía está sin aplicar — sumar más
 * columnas ahora sería sumar más preferencias que no persisten. Las de acá
 * son, además, decisiones del dispositivo más que de la persona: "no me tires
 * avisos emergentes en esta compu", "esta pantalla me marea".
 *
 * Sin imports: lo importa `auth-utils.js` (que lo carga prácticamente todo el
 * sitio) para aplicar las preferencias visuales en cualquier página.
 */

/**
 * Cada preferencia: su clave en localStorage y qué vale si nunca se tocó.
 * Todas booleanas. El default se elige para que la app se comporte como
 * siempre para quien nunca entró a Ajustes.
 */
const PREFS = {
  notifToasts: { key: 'bl_pref_notif_toasts', fallback: true },
  reduceMotion: { key: 'bl_pref_reduce_motion', fallback: false },
};

/**
 * Valor vigente de una preferencia.
 * @param {keyof PREFS} name
 * @returns {boolean}
 */
export function getPref(name) {
  const pref = PREFS[name];
  if (!pref) return false;
  try {
    const raw = localStorage.getItem(pref.key);
    return raw === null ? pref.fallback : raw === '1';
  } catch {
    // Navegación privada / storage bloqueado: se comporta como recién instalada.
    return pref.fallback;
  }
}

/**
 * Guarda una preferencia y la aplica al instante (sin recargar la página).
 * @param {keyof PREFS} name
 * @param {boolean} enabled
 */
export function setPref(name, enabled) {
  const pref = PREFS[name];
  if (!pref) return;
  try {
    localStorage.setItem(pref.key, enabled ? '1' : '0');
  } catch {
    // Sin storage la preferencia dura lo que la pestaña; se aplica igual.
  }
  applyDevicePreferences();
}

/**
 * Aplica las preferencias que cambian cómo se ve la página. Idempotente: se
 * puede llamar en cada carga y en cada cambio.
 */
export function applyDevicePreferences() {
  if (typeof document === 'undefined' || !document.documentElement) return;
  // La regla vive en a11y.css, al lado del `prefers-reduced-motion` del
  // sistema: es el mismo efecto, pedido a mano en vez de por el sistema.
  document.documentElement.classList.toggle('bl-reduce-motion', getPref('reduceMotion'));
}

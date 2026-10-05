/**
 * Lista de cuentas vinculadas a este dispositivo ("Cambiar de cuenta" en Mi
 * perfil). Lógica pura, sin DOM, sin storage y sin imports, para correrla con
 * `node js/linked-accounts-utils.test.mjs`.
 *
 * Cada entrada guarda la sesión de Supabase de esa cuenta (los dos tokens) para
 * poder volver a entrar sin pedir la contraseña. Una cuenta solo llega acá
 * después de que la persona inició sesión en ella: esa es la forma de saber que
 * las dos cuentas son de la misma persona.
 */

export const LINKED_ACCOUNTS_KEY = 'bl_linked_accounts_v1';
export const MAX_LINKED_ACCOUNTS = 5;

/** Solo lo mínimo para volver a abrir la sesión: nada del usuario completo. */
export function snapshotSession(session) {
  const access = session?.access_token;
  const refresh = session?.refresh_token;
  if (!access || !refresh) return null;
  return { access_token: access, refresh_token: refresh };
}

/** Nombre para mostrar: el que tiene la cuenta, si no la parte del mail. */
export function accountDisplayName(user) {
  const meta = user?.user_metadata || {};
  const nombre = String(meta.full_name || meta.name || '').trim();
  if (nombre) return nombre;
  return String(user?.email || '').split('@')[0] || 'Cuenta';
}

/** Arma la entrada a guardar a partir de una sesión de Supabase. */
export function buildAccountEntry(session) {
  const user = session?.user;
  const tokens = snapshotSession(session);
  if (!user?.id || !user?.email || !tokens) return null;
  return {
    id: user.id,
    email: String(user.email).toLowerCase(),
    name: accountDisplayName(user),
    session: tokens,
  };
}

/** Lee lo guardado tolerando basura (JSON roto, campos que faltan). */
export function parseLinkedAccounts(raw) {
  let lista;
  try {
    lista = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  const limpias = [];
  for (const e of lista) {
    if (!e || typeof e.id !== 'string' || typeof e.email !== 'string') continue;
    if (!e.session?.access_token || !e.session?.refresh_token) continue;
    if (vistos.has(e.id)) continue;
    vistos.add(e.id);
    limpias.push({
      id: e.id,
      email: e.email,
      name: typeof e.name === 'string' ? e.name : e.email.split('@')[0],
      session: { access_token: e.session.access_token, refresh_token: e.session.refresh_token },
    });
  }
  return limpias.slice(0, MAX_LINKED_ACCOUNTS);
}

/** Agrega la cuenta o, si ya estaba, actualiza sus datos y tokens en su lugar. */
export function upsertAccount(lista, entrada) {
  if (!entrada) return lista;
  const i = lista.findIndex((e) => e.id === entrada.id);
  if (i >= 0) {
    const copia = lista.slice();
    copia[i] = entrada;
    return copia;
  }
  return [...lista, entrada].slice(0, MAX_LINKED_ACCOUNTS);
}

export function removeAccount(lista, id) {
  return lista.filter((e) => e.id !== id);
}

/** Las que se pueden elegir al cambiar (todas menos la activa). */
export function switchTargets(lista, currentId) {
  return lista.filter((e) => e.id !== currentId);
}

/**
 * ¿Puede agregarse esta cuenta nueva? Devuelve null si sí, o el motivo.
 * @param {string} currentId cuenta con la sesión abierta
 * @param {string} newId cuenta en la que acaba de iniciar sesión
 */
export function canLinkAccount(lista, currentId, newId) {
  if (!newId) return 'No pudimos identificar esa cuenta.';
  if (newId === currentId) return 'Esa ya es la cuenta con la que estás ahora.';
  if (lista.some((e) => e.id === newId)) return 'Esa cuenta ya está en tu lista.';
  if (lista.length >= MAX_LINKED_ACCOUNTS) return `Podés tener hasta ${MAX_LINKED_ACCOUNTS} cuentas en este dispositivo.`;
  return null;
}

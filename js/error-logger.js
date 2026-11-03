// Captura errores no manejados del cliente y los manda a error_logs (Supabase).
// Alternativa liviana a Sentry (no requiere crear cuenta externa). A113-171.

const MAX_LOGS_PER_SESSION = 20;
let loggedCount = 0;

/** true si la página corre en una máquina de desarrollo (vite dev/preview,
 *  pruebas con Playwright, la red de la casa) y no en el sitio publicado.
 *  Desde ahí no se registra nada: la base es la de producción, y hasta
 *  2026-11-03 el 100% de error_logs (213 de 213 en 30 días) venía de
 *  localhost:4173, el script de Speed Insights que fuera de Vercel no existe
 *  ("Unexpected token '<'"), tapando cualquier error real. */
export function isDevHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true; // file:// u otro origen sin host
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

// Claves que jamás deben viajar a la base, ni de queryString ni de hash.
// El caso real: los links de recuperación de contraseña, confirmación de
// email y el callback de Google OAuth vuelven con `#access_token=...&
// refresh_token=...` en el HASH. supabase-js los detecta y limpia la URL
// (detectSessionInUrl, default true), pero ese procesamiento es ASYNC -- hay
// una ventana real, entre que carga la página y que termina, donde
// `window.location.href` todavía tiene el token crudo. Si un error (de
// cualquier cosa, no relacionado) dispara justo en esa ventana, sin este
// filtro el token de sesión de la persona quedaría guardado en texto plano
// en una tabla que los 4 admins pueden leer -- alcanza para tomar la cuenta.
const SENSITIVE_URL_PARAMS = [
  'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
  'token', 'token_hash', 'code', 'apikey',
];

/** Saca el hash entero (ahí viajan los tokens de sesión) y cualquier
 *  parámetro sensible de la query string, sin tocar el resto de la URL. */
export function sanitizeUrlForLogging(href) {
  try {
    const url = new URL(href);
    for (const key of SENSITIVE_URL_PARAMS) url.searchParams.delete(key);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function initErrorLogging(supabaseClient) {
  if (isDevHost(window.location.hostname)) return;

  async function logError(message, stack) {
    if (loggedCount >= MAX_LOGS_PER_SESSION) return;
    loggedCount++;
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      await supabaseClient.from('error_logs').insert({
        message: String(message || 'Error desconocido').slice(0, 2000),
        stack: stack ? String(stack).slice(0, 4000) : null,
        url: sanitizeUrlForLogging(window.location.href),
        user_id: user?.id || null,
        user_agent: navigator.userAgent,
      });
    } catch {
      // El logging nunca debe romper la app.
    }
  }

  window.addEventListener('error', (event) => {
    logError(event.message, event.error?.stack);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    logError(reason?.message || String(reason), reason?.stack);
  });
}

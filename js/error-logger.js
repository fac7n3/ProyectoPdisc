// Captura errores no manejados del cliente y los manda a error_logs (Supabase).
// Alternativa liviana a Sentry (no requiere crear cuenta externa). A113-171.

const MAX_LOGS_PER_SESSION = 20;
let loggedCount = 0;

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

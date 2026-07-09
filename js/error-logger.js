// Captura errores no manejados del cliente y los manda a error_logs (Supabase).
// Alternativa liviana a Sentry (no requiere crear cuenta externa). A113-171.

const MAX_LOGS_PER_SESSION = 20;
let loggedCount = 0;

export function initErrorLogging(supabaseClient) {
  async function logError(message, stack) {
    if (loggedCount >= MAX_LOGS_PER_SESSION) return;
    loggedCount++;
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      await supabaseClient.from('error_logs').insert({
        message: String(message || 'Error desconocido').slice(0, 2000),
        stack: stack ? String(stack).slice(0, 4000) : null,
        url: window.location.href,
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

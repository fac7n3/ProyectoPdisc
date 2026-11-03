// Speed Insights de Vercel (Web Vitals reales de los visitantes).
// Solo se inyecta en el sitio publicado: en vite dev/preview el script
// `/_vercel/speed-insights/script.js` no existe, el servidor devuelve el HTML
// de la página y el navegador tira "Unexpected token '<'" en cada carga
// (era el 100% de lo que llegaba a error_logs, ver isDevHost).
import { injectSpeedInsights } from '@vercel/speed-insights';
import { isDevHost } from './error-logger.js';

if (!isDevHost(window.location.hostname)) {
  injectSpeedInsights({ debug: false });
}

export { injectSpeedInsights };

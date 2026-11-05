import { test as base, expect } from '@playwright/test';

// Funciones de lectura que el sitio público llama por POST /rest/v1/rpc/<nombre>.
// Todo lo demás que no sea GET/HEAD/OPTIONS contra Supabase se corta: estas
// pruebas corren contra la base de producción y no deben escribir nada.
const RPC_DE_LECTURA = /^(get_|search_|same_product_offers|nearby_|list_|featured_category_counts)/;

const esSupabase = (url) => /\.supabase\.co\//.test(url);

/**
 * `test` con tres cosas ya puestas en cada prueba:
 *  - bloqueo de escrituras a Supabase (devuelve 200 vacío y lo anota en `escrituras`),
 *  - recolección de errores de la página (`problemas`): excepciones, console.error,
 *    violaciones de CSP y respuestas >= 400 del propio sitio o de Supabase,
 *  - sin servicios de terceros: cualquier host fuera del sitio y de Supabase es un problema.
 */
export const test = base.extend({
  escrituras: async ({}, use) => use([]),
  problemas: async ({}, use) => use([]),

  page: async ({ page, baseURL, escrituras, problemas }, use) => {
    const origen = new URL(baseURL).origin;

    await page.route('**/*', (route) => {
      const req = route.request();
      const url = req.url();
      if (!esSupabase(url)) return route.continue();
      const metodo = req.method();
      if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return route.continue();
      const rpc = url.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i)?.[1];
      if (metodo === 'POST' && rpc && RPC_DE_LECTURA.test(rpc)) return route.continue();
      escrituras.push(`${metodo} ${url.split('?')[0]}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    page.on('pageerror', (e) => problemas.push(`excepción: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      // Un recurso que falla (404, bloqueado) ya se anota abajo con su URL.
      if (/^Failed to load resource/.test(m.text())) return;
      problemas.push(`console.error: ${m.text()}`);
    });
    page.on('response', (r) => {
      const url = r.url();
      if (r.status() >= 400 && (url.startsWith(origen) || esSupabase(url))) {
        problemas.push(`HTTP ${r.status()}: ${url}`);
      }
    });
    page.on('request', (r) => {
      const { protocol, origin } = new URL(r.url());
      if (!/^https?:$/.test(protocol)) return;
      if (origin !== origen && !esSupabase(r.url())) problemas.push(`host de terceros: ${r.url()}`);
    });
    page.on('requestfailed', (r) => {
      // Una navegación o un video cortado a propósito no cuenta; el resto sí.
      if (/ERR_ABORTED/.test(r.failure()?.errorText || '')) return;
      problemas.push(`request fallido: ${r.url()} (${r.failure()?.errorText})`);
    });

    await use(page);
  },
});

export { expect };

/** Falla con la lista completa de problemas, para ver todo junto y no de a uno. */
export function sinProblemas(problemas) {
  expect(problemas, `Problemas en la página:\n  ${problemas.join('\n  ')}`).toEqual([]);
}

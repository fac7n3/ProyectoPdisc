/**
 * Routing Middleware de Vercel (corre antes de servir los archivos estáticos).
 *
 * Solo para los robots que arman la vista previa de un link (WhatsApp,
 * Facebook, Instagram, Telegram, X...): en producto.html y comercio.html les
 * responde una página mínima con el nombre, la foto, el precio y el comercio
 * (js/og-preview-utils.js). Para cualquier otro pedido no hace nada y Vercel
 * sirve la página de siempre. Si la base no responde a tiempo, también deja
 * pasar: el robot ve la vista previa genérica, como antes.
 */
import { isPreviewBot, parseOgTarget, buildPreviewPage } from './js/og-preview-utils.js';

export const config = {
  matcher: ['/pages/producto.html', '/pages/comercio.html'],
  runtime: 'edge',
};

export default async function middleware(request) {
  if (!isPreviewBot(request.headers.get('user-agent'))) return undefined;
  const target = parseOgTarget(request.url);
  if (!target) return undefined;

  const origin = new URL(request.url).origin;
  const page = target.kind === 'product' ? 'producto.html' : 'comercio.html';
  const html = await buildPreviewPage(target, {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    key: process.env.VITE_SUPABASE_ANON_KEY,
    origin,
    url: `${origin}/pages/${page}?id=${target.id}`,
  });
  if (!html) return undefined;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Nunca en la caché compartida: la misma URL para una persona es la página real.
      'cache-control': 'private, max-age=300',
      vary: 'User-Agent',
      'x-bl-preview': target.kind,
    },
  });
}

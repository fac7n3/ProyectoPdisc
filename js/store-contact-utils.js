/**
 * Reemplaza el chat interno (mensajes.html, eliminado) -- "Contactar al
 * vendedor" ahora abre teléfono o WhatsApp según lo que el vendedor eligió
 * en su panel (stores.contact_method). Lógica pura para poder testear sin
 * DOM (node js/store-contact-utils.test.mjs), mismo patrón que
 * storage-utils.js.
 */

/** Deja solo los dígitos de un teléfono (wa.me y tel: los quieren así). */
function digitsOnly(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

/** Mensaje prellenado de WhatsApp: el saludo pedido + una referencia a la
 *  plataforma, para que el vendedor sepa de dónde viene la consulta. */
export function buildWhatsappMessage(productTitle) {
  const trimmed = String(productTitle || '').trim();
  const suffix = 'te escribo desde Baradero Local.';
  return trimmed
    ? `Hola! Quería realizar una consulta sobre "${trimmed}" (${suffix})`
    : `Hola! Quería realizar una consulta (${suffix})`;
}

/**
 * Decide qué botón de contacto mostrar según store.contact_method:
 * 'phone' -> tel: con el número visible, 'whatsapp' -> wa.me con el mensaje
 * prellenado, 'none' (o sin teléfono/whatsapp cargado) -> sin botón.
 * @param {{ contact_method?: string, phone?: string, whatsapp?: string }} store
 * @param {string} [productTitle] contexto opcional para el mensaje de WhatsApp.
 * @returns {{ href: string, label: string, icon: string } | null}
 */
export function buildContactAction(store, productTitle) {
  if (!store) return null;
  const method = store.contact_method || 'phone';
  if (method === 'none') return null;

  if (method === 'whatsapp') {
    const digits = digitsOnly(store.whatsapp);
    if (!digits) return null;
    const text = encodeURIComponent(buildWhatsappMessage(productTitle));
    return { href: `https://wa.me/${digits}?text=${text}`, label: 'Escribir por WhatsApp', icon: 'fa-brands fa-whatsapp' };
  }

  const digits = digitsOnly(store.phone);
  if (!digits) return null;
  return { href: `tel:${digits}`, label: `Llamar: ${store.phone}`, icon: 'fa-solid fa-phone' };
}

/**
 * Normaliza una URL que cargó a mano un comercio o un profesional, para poder
 * usarla como `href`. Devuelve null si no sirve.
 *
 * Existe por dos cosas que pasaban con el valor crudo de la base:
 *
 * 1. **Sin esquema queda relativa.** "instagram.com/mitienda" --que es como
 *    la escribe cualquiera-- puesta en un href no va a Instagram: el
 *    navegador la resuelve contra la página y termina en
 *    `proyectopdisc.vercel.app/pages/instagram.com/mitienda`, un 404. Se le
 *    antepone `https://` cuando no trae esquema.
 * 2. **`javascript:` llegaba entero al href.** El campo es texto libre y lo
 *    edita su dueño desde su panel, sin validación ni en el input
 *    (`type="text"`) ni en la base (columna `text` pelada), así que un
 *    `javascript:...` guardado ahí se dibujaba como link clickeable.
 *    Medido en Chromium: con el `target="_blank"` + `rel="noopener
 *    noreferrer"` que ponen los dos lugares que lo usan (contratar.js y
 *    comercio.js) abre una pestaña nueva y NO llega al origen del sitio; sin
 *    `target="_blank"` sí ejecuta, y la CSP no lo frena porque `script-src`
 *    incluye 'unsafe-inline'. O sea que hoy lo único que separa eso de un XSS
 *    guardado son dos atributos en el call site. Filtrar acá saca esa
 *    dependencia: solo pasan http y https, venga de donde venga.
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
export function safeExternalUrl(raw) {
  // Los caracteres de control se sacan primero: son la forma clásica de
  // partir un "javascript:" en dos para que no lo vea un chequeo de texto
  // ("java\nscript:..."), y el parser de URL los ignora igual.
  const value = String(raw ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!value) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
  let url;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  return url.href;
}

/** Redes sociales que puede cargar un comercio, en el orden en que se muestran. */
export const SOCIAL_NETWORKS = [
  { key: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram' },
  { key: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook' },
  { key: 'tiktok', label: 'TikTok', icon: 'fa-brands fa-tiktok' },
  { key: 'x', label: 'X (Twitter)', icon: 'fa-brands fa-x-twitter' },
  { key: 'youtube', label: 'YouTube', icon: 'fa-brands fa-youtube' },
  { key: 'website', label: 'Sitio web', icon: 'fa-solid fa-globe' },
];

/** Redes sociales configuradas para mostrarse en la página del comercio:
 *  solo las que el vendedor marcó "mostrar" Y tienen un link **usable**
 *  (ver `safeExternalUrl`: se descarta lo que no sea http/https y se
 *  completa el `https://` que falta).
 * @param {Record<string, unknown>} store
 * @returns {{ key: string, label: string, icon: string, url: string }[]}
 */
export function getVisibleSocialLinks(store) {
  if (!store) return [];
  return SOCIAL_NETWORKS
    .map(({ key, label, icon }) => ({
      key,
      label,
      icon,
      url: safeExternalUrl(store[`social_${key}`]),
      show: store[`social_${key}_show`] !== false,
    }))
    .filter((s) => s.show && s.url);
}

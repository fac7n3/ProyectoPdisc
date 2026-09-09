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
 *  solo las que el vendedor marcó "mostrar" Y tienen un link guardado.
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
      url: String(store[`social_${key}`] || '').trim(),
      show: store[`social_${key}_show`] !== false,
    }))
    .filter((s) => s.show && s.url);
}

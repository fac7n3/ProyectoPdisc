/**
 * seo.js — Pone en el <head> la dirección canónica y los datos estructurados
 * (JSON-LD). La lógica vive en seo-utils.js (con tests).
 *
 * La canónica se pone sola en cada página pública al importar este módulo
 * (lo importa auth-utils.js, que corre en todas). Producto y comercio llaman
 * a setJsonLd() cuando terminan de cargar sus datos.
 */
import { canonicalUrl, serializeJsonLd } from './seo-utils.js';

export function applyCanonical() {
  const href = canonicalUrl(window.location.href);
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!href) { link?.remove(); return null; }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
  return href;
}

/** Reemplaza (o crea) el bloque JSON-LD identificado por `key`. */
export function setJsonLd(key, data) {
  const id = `bl-jsonld-${key}`;
  document.getElementById(id)?.remove();
  if (!data) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = id;
  script.textContent = serializeJsonLd(data);
  document.head.appendChild(script);
}

applyCanonical();

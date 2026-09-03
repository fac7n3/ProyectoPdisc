/**
 * Ayudas del autocompletado de direcciones (Nominatim / OpenStreetMap).
 *
 * En Baradero OSM no tiene la numeración de las casas: Nominatim devuelve la
 * calle sin `house_number` y la devuelve varias veces, una por cada tramo
 * mapeado. Por eso "Mitre 1234" mostraba dos filas idénticas ("Mitre" y
 * "Mitre") y, al elegir una, el input quedaba en "Mitre" — le borraba el
 * número a la persona. Acá se deduplican las filas por calle y se conserva el
 * número ya escrito.
 *
 * Sin DOM a propósito, para poder correr `node js/address-suggest-utils.test.mjs`.
 */

/** Número de puerta ya escrito: "Mitre 1234" -> "1234". */
export function houseNumberFrom(text) {
  const m = String(text || '').trim().match(/(\d{1,5})\s*$/);
  return m ? m[1] : '';
}

/** Nombre de la calle de un resultado de Nominatim. */
export function streetOf(item) {
  const a = item?.address || {};
  return (
    a.road ||
    a.pedestrian ||
    a.footway ||
    a.residential ||
    String(item?.display_name || '').split(',')[0].trim()
  );
}

/** Barrio/localidad, para distinguir dos calles con el mismo nombre. */
export function areaOf(item) {
  const a = item?.address || {};
  const street = streetOf(item);
  const parts = [
    a.neighbourhood || a.suburb || a.residential,
    a.town || a.village || a.city,
    a.state,
  ];
  return [...new Set(parts.filter((p) => p && p !== street))].join(', ');
}

/** Texto que va al input al elegir la sugerencia. */
export function suggestionLabel(item, typedNumber = '') {
  const street = streetOf(item);
  const num = item?.address?.house_number || typedNumber;
  return num ? `${street} ${num}` : street;
}

/** Una fila por calle: Nominatim repite la misma calle una vez por tramo. */
export function dedupeByStreet(results, limit = 5) {
  const seen = new Set();
  const out = [];
  for (const item of results || []) {
    const key = `${streetOf(item)}|${areaOf(item)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

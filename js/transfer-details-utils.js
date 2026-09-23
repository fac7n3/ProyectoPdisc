/**
 * Transferencia bancaria: qué datos se le muestran al cliente para pagar y
 * cómo se copian. Lógica pura, sin DOM ni Supabase, para poder testearla con
 * `node js/transfer-details-utils.test.mjs` (mismo patrón que cart-totals.js).
 * La parte visual vive en js/transfer-details.js.
 *
 * Los datos salen de `stores` (migraciones 69 y 106): alias, CBU/CVU,
 * titular y banco en columnas propias, más `transfer_info` como texto libre
 * de "otros datos" (y lo único que tienen los comercios que cargaron sus
 * datos antes de la 106).
 */

/** Deja solo los dígitos (CBU, teléfonos, montos). */
export function digitsOnly(value) {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

/** CBU/CVU: 22 dígitos. Acepta espacios/guiones al tipear, se valida limpio. */
export function normalizeCbu(value) {
  return digitsOnly(value);
}

export function isValidCbu(value) {
  return /^[0-9]{22}$/.test(normalizeCbu(value));
}

/** Alias bancario: 6 a 20 caracteres, letras, números, punto y guion. */
export function normalizeAlias(value) {
  return String(value ?? '').trim();
}

export function isValidAlias(value) {
  return /^[A-Za-z0-9.-]{6,20}$/.test(normalizeAlias(value));
}

/** Muestra un CBU de 22 dígitos en bloques de 4 para que se pueda leer y
 *  comparar a ojo; lo que se COPIA es siempre la versión sin espacios. */
export function formatCbuForDisplay(cbu) {
  const digits = normalizeCbu(cbu);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Número de pedido corto, el mismo que muestra "Mis compras" (perfil.js). */
export function shortOrderRef(orderId) {
  return String(orderId || '').split('-')[0].toUpperCase();
}

/**
 * Monto para pegar en la app del banco: pesos enteros sin separadores
 * ("18000", no "$ 18.000"), que es lo que acepta cualquier campo de importe.
 */
export function amountForCopy(total) {
  return String(Math.round(Number(total) || 0));
}

/** Mensaje prellenado para avisarle al comercio que ya se transfirió. */
export function buildTransferWhatsappMessage({ storeName, orderRef, amountLabel }) {
  const store = String(storeName || '').trim();
  const saludo = store ? `Hola ${store}!` : 'Hola!';
  return `${saludo} Te hice la transferencia del pedido #${orderRef} por ${amountLabel}. ` +
    'Ya subí (o voy a subir) el comprobante en Baradero Local.';
}

/**
 * Lista ordenada de los datos bancarios que se muestran, solo los cargados.
 * `copy` es lo que va al portapapeles (null = el dato no tiene botón copiar).
 * @param {object} store fila de `stores` con las columnas transfer_*
 * @returns {{ key: string, label: string, display: string, copy: string|null }[]}
 */
export function buildBankFields(store) {
  if (!store) return [];
  const fields = [];

  const alias = normalizeAlias(store.transfer_alias);
  if (alias) fields.push({ key: 'alias', label: 'Alias', display: alias, copy: alias });

  const cbu = normalizeCbu(store.transfer_cbu);
  if (cbu) fields.push({ key: 'cbu', label: 'CBU / CVU', display: formatCbuForDisplay(cbu), copy: cbu });

  const holder = String(store.transfer_holder ?? '').trim();
  if (holder) fields.push({ key: 'holder', label: 'Titular', display: holder, copy: holder });

  const bank = String(store.transfer_bank ?? '').trim();
  if (bank) fields.push({ key: 'bank', label: 'Banco', display: bank, copy: null });

  return fields;
}

/**
 * Texto libre extra (`transfer_info`), o null. Si es idéntico al alias o al
 * CBU no se repite: la migración 106 copió al alias el texto de los comercios
 * que solo tenían eso cargado, sin borrarlo (ver el comentario ahí).
 */
export function extraTransferNotes(store) {
  const notes = String(store?.transfer_info ?? '').trim();
  if (!notes) return null;
  const alias = normalizeAlias(store.transfer_alias);
  const cbu = normalizeCbu(store.transfer_cbu);
  if ((alias && notes.toLowerCase() === alias.toLowerCase()) || (cbu && digitsOnly(notes) === cbu && /^[\d\s-]+$/.test(notes))) {
    return null;
  }
  return notes;
}

/** ¿El comercio cargó ALGÚN dato para transferirle? */
export function hasTransferData(store) {
  return buildBankFields(store).length > 0 || Boolean(extraTransferNotes(store));
}

/**
 * Datos de contacto del comercio para esta pantalla. Respeta lo que eligió el
 * vendedor en su panel (`contact_method`): con 'none' no se muestra ningún
 * número, igual que en la ficha del producto. Solo WhatsApp -- el comprador
 * nunca puede llamar al vendedor, solo escribirle (ver store-contact-utils.js).
 * @returns {{ whatsapp: string|null, whatsappDigits: string|null }}
 */
export function buildContactInfo(store) {
  const empty = { whatsapp: null, whatsappDigits: null };
  if (!store || store.contact_method === 'none') return empty;

  const whatsapp = String(store.whatsapp ?? '').trim();
  return {
    whatsapp: digitsOnly(whatsapp) ? whatsapp : null,
    whatsappDigits: digitsOnly(whatsapp) || null,
  };
}

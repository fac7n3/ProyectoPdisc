// Validaciones de inputs compartidas (cliente). El servidor repite las
// mismas reglas (constraints en la DB) — nunca confiar solo en esto. F1-04.

/**
 * Validar CUIT argentino: 11 dígitos + dígito verificador (módulo 11).
 * Acepta con o sin guiones ("20-12345678-9" o "20123456789").
 * @param {string} cuit
 * @returns {boolean}
 */
export function isValidCuit(cuit) {
  const clean = String(cuit || '').replace(/[^0-9]/g, '');
  if (clean.length !== 11) return false;

  const digits = clean.split('').map(Number);
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += digits[i] * multipliers[i];

  const mod = sum % 11;
  const expected = 11 - mod;
  const checkDigit = expected === 11 ? 0 : expected === 10 ? 9 : expected;

  return checkDigit === digits[10];
}

/** Formatear un CUIT limpio (11 dígitos) como "XX-XXXXXXXX-X". */
export function formatCuit(cuit) {
  const clean = String(cuit || '').replace(/[^0-9]/g, '');
  if (clean.length !== 11) return cuit;
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
}

/** Nombre de comercio: texto no vacío, largo razonable. */
export function isValidShopName(name) {
  const trimmed = String(name || '').trim();
  return trimmed.length >= 3 && trimmed.length <= 100;
}

/** Teléfono: solo dígitos/espacios/guiones/paréntesis, longitud razonable. */
export function isValidPhone(phone) {
  const trimmed = String(phone || '').trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/[^0-9]/g, '');
  return digits.length >= 6 && digits.length <= 15 && /^[0-9\s\-()+ ]+$/.test(trimmed);
}

/** Título de producto: mismo mínimo que el CHECK de la DB (char_length >= 3). */
export function isValidProductTitle(title) {
  const trimmed = String(title || '').trim();
  return trimmed.length >= 3 && trimmed.length <= 150;
}

/** Precio: entero positivo (pesos, sin decimales). */
export function isValidPrice(price) {
  const n = Number(price);
  return Number.isInteger(n) && n > 0;
}

/** Stock: entero no negativo. */
export function isValidStock(stock) {
  const n = Number(stock);
  return Number.isInteger(n) && n >= 0;
}

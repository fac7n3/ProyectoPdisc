// Sugerencias del buscador (autocompletado) armadas con los títulos que devuelve
// el RPC search_products: "agu" -> "agua", "agua saborizada", "agua mineral".
// Funciones puras, sin DOM ni red, para poder probarlas en Node
// (js/search-suggest.test.mjs).

// Las mismas palabras de relleno que ignora search_products (migración 169).
const STOP = new Set(['a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'los', 'o', 'para', 'por', 'u', 'un', 'una', 'unas', 'unos', 'y']);

/** "Lápiz N°2" -> "lapiz n 2": lo mismo que hace search_norm en la base. */
export function normalizeSearchText(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Palabras del título tal como se escriben (con acentos), en minúscula. */
function titleWords(title) {
  return (title || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** ¿La palabra del título es la que se está escribiendo (o su singular/plural)? */
function wordMatches(word, token) {
  if (word.startsWith(token)) return true;
  // "zapatillas" escrito, "zapatilla" en el título.
  return word.length >= 4 && token.startsWith(word) && token.length - word.length <= 2;
}

/**
 * Sugerencias de texto para completar la búsqueda.
 *
 * @param {string} query            lo que la persona escribió
 * @param {Array<{title: string}>} products  resultados de search_products, en su orden
 * @param {{ corrected?: string|null, limit?: number }} [opts]
 *   corrected: `corrected_query` del RPC (la consulta con las palabras corregidas);
 *   si viene, las sugerencias se arman con esa.
 * @returns {string[]} frases para buscar, la más repetida primero
 */
export function buildTermSuggestions(query, products, { corrected = null, limit = 4 } = {}) {
  const typed = normalizeSearchText(query);
  const base = normalizeSearchText(corrected) || typed;
  let tokens = base.split(' ').filter(Boolean);
  if (tokens.some((t) => !STOP.has(t))) tokens = tokens.filter((t) => !STOP.has(t));
  // Con una sola letra cualquier título "coincide": no hay nada útil que sugerir.
  if (!tokens.length || tokens.every((t) => t.length < 2)) return [];

  const found = new Map(); // frase normalizada -> { text, count, rank, size }
  const add = (words, rank) => {
    const text = words.join(' ');
    const key = normalizeSearchText(text);
    if (!key || key === typed) return; // lo que ya está escrito no es una sugerencia
    const prev = found.get(key);
    if (prev) prev.count += 1;
    else found.set(key, { text, count: 1, rank, size: words.length });
  };

  (products || []).forEach((product, rank) => {
    const words = titleWords(product?.title);
    const norm = words.map(normalizeSearchText);
    const positions = tokens.map((t) => norm.findIndex((w) => wordMatches(w, t)));
    if (positions.includes(-1)) return; // el título no tiene todas las palabras

    const lo = Math.min(...positions);
    const hi = Math.max(...positions);
    if (hi - lo > 4) return; // palabras muy separadas: la frase sería medio título

    const phrase = words.slice(lo, hi + 1);
    add(phrase, rank);

    // Una palabra más: "agua" -> "agua mineral"; salta el relleno pero lo deja
    // en la frase ("jabón" -> "jabón de tocador"). No suma medidas ("1kg", "x6").
    let next = hi + 1;
    const extra = [];
    while (next < words.length && STOP.has(norm[next])) extra.push(words[next++]);
    if (next < words.length && !/\d/.test(norm[next]) && norm[next].length > 1) {
      add([...phrase, ...extra, words[next]], rank);
    }
  });

  return [...found.values()]
    // la más repetida; a igual cantidad, la del producto mejor ubicado y la más corta
    .sort((a, b) => b.count - a.count || a.rank - b.rank || a.size - b.size)
    .slice(0, limit)
    .map((s) => s.text);
}

/**
 * Aviso para mostrar arriba de los resultados cuando no son "tal cual" lo que se
 * escribió. Devuelve null si no hay nada que avisar.
 *
 * @param {{ query: string, mode?: string|null, corrected?: string|null }} info
 *   mode / corrected: columnas `match_mode` y `corrected_query` de search_products.
 * @returns {{ before: string, strong: string, after: string } | null}
 *   El texto en tres partes: `strong` va resaltado (puede venir vacío).
 */
export function searchNotice({ query, mode = null, corrected = null }) {
  const fixed = corrected && normalizeSearchText(corrected) !== normalizeSearchText(query) ? corrected : '';

  if (mode === 'parcial') {
    return fixed
      ? { before: 'No encontramos nada con todas esas palabras. Te mostramos lo más parecido a ', strong: fixed, after: '.' }
      : { before: 'No encontramos nada con todas esas palabras. Te mostramos lo más parecido.', strong: '', after: '' };
  }
  if (mode === 'relacionada') {
    return {
      before: fixed ? 'Ningún producto se llama ' : 'Ningún producto se llama así. Estos lo nombran en sus variantes o en la descripción.',
      strong: fixed,
      after: fixed ? '. Estos lo nombran en sus variantes o en la descripción.' : '',
    };
  }
  if (fixed) return { before: 'Te mostramos resultados para ', strong: fixed, after: '.' };
  return null;
}

// Tests de las sugerencias del buscador (js/search-suggest.js).
// Correr con: node js/search-suggest.test.mjs
import assert from 'node:assert/strict';
import { normalizeSearchText, buildTermSuggestions, searchNotice } from './search-suggest.js';

const t = (title) => ({ title });

// ── normalizeSearchText: igual que search_norm de la base ────
assert.equal(normalizeSearchText('  Lápiz N°2  '), 'lapiz n 2');
assert.equal(normalizeSearchText('Coca-Cola'), 'coca cola');
assert.equal(normalizeSearchText('PAÑALES'), 'panales');
assert.equal(normalizeSearchText(null), '');

// ── "agu": la palabra completa y la frase que más se repite ──
const aguas = [t('Agua saborizada Brío'), t('Agua saborizada Levite'), t('Agua mineral Villavicencio')];
assert.deepEqual(buildTermSuggestions('agu', aguas), ['agua', 'agua saborizada', 'agua mineral']);

// Lo que ya está escrito no se sugiere.
assert.deepEqual(buildTermSuggestions('agua', aguas), ['agua saborizada', 'agua mineral']);
assert.deepEqual(buildTermSuggestions('Agua  ', aguas), ['agua saborizada', 'agua mineral']);

// ── Mantiene los acentos del título y salta el relleno ───────
assert.deepEqual(
  buildTermSuggestions('jab', [t('Jabón de tocador Dove 90 g'), t('Jabón líquido para manos Lux')]),
  ['jabón', 'jabón de tocador', 'jabón líquido'],
);

// ── Varias palabras, en cualquier orden ──────────────────────
assert.deepEqual(
  buildTermSuggestions('jabon li', [t('Jabón líquido para manos Lux')]),
  ['jabón líquido', 'jabón líquido para manos'],
);
assert.deepEqual(buildTermSuggestions('dove jab', [t('Jabón Dove Pink pack x4')]), ['jabón dove', 'jabón dove pink']);

// Un título que no tiene todas las palabras no aporta.
assert.deepEqual(buildTermSuggestions('jabon dove', [t('Jabón blanco en pan'), t('Shampoo Dove')]), []);

// Las palabras de relleno de la consulta no se exigen.
assert.deepEqual(buildTermSuggestions('pan de', [t('Pan de campo integral')]), ['pan', 'pan de campo']);

// ── No suma medidas ni números sueltos ───────────────────────
assert.deepEqual(buildTermSuggestions('pan fr', [t('Pan Francés 1kg')]), ['pan francés']);
assert.deepEqual(buildTermSuggestions('alfaj', [t('Alfajores bañados x6')]), ['alfajores', 'alfajores bañados']);

// ── Plural escrito, singular en el título ────────────────────
assert.deepEqual(buildTermSuggestions('zapatillas', [t('Zapatilla urbana negra')]), ['zapatilla', 'zapatilla urbana']);

// ── Con corrección del servidor se arma con la palabra corregida ──
const zapas = [t('Zapatillas con abrojo para chicos'), t('Zapatillas urbanas gris y rosa'), t('Zapatillas urbanas negras hombre')];
assert.deepEqual(
  buildTermSuggestions('sapatiyas', zapas, { corrected: 'zapatillas' }),
  ['zapatillas', 'zapatillas urbanas', 'zapatillas con abrojo'],
);
// Sin la corrección, "sapatiyas" no aparece en ningún título.
assert.deepEqual(buildTermSuggestions('sapatiyas', zapas), []);

// ── Límite y casos vacíos ────────────────────────────────────
assert.equal(buildTermSuggestions('agu', aguas, { limit: 2 }).length, 2);
assert.deepEqual(buildTermSuggestions('', aguas), []);
assert.deepEqual(buildTermSuggestions('a', aguas), []);
assert.deepEqual(buildTermSuggestions('agu', []), []);
assert.deepEqual(buildTermSuggestions('agu', null), []);
assert.deepEqual(buildTermSuggestions('agu', [{ title: null }, {}]), []);

// Palabras muy separadas en el título: no se sugiere medio título.
assert.deepEqual(
  buildTermSuggestions('set tejidos', [t('Set de paños de cocina con bordes tejidos')]),
  [],
);

// ── searchNotice ─────────────────────────────────────────────
assert.equal(searchNotice({ query: 'agua', mode: 'todas', corrected: null }), null);
assert.equal(searchNotice({ query: 'agua', mode: null, corrected: null }), null);

assert.deepEqual(searchNotice({ query: 'sapatiyas', mode: 'todas', corrected: 'zapatillas' }), {
  before: 'Te mostramos resultados para ', strong: 'zapatillas', after: '.',
});
// La "corrección" que es lo mismo que se escribió (solo cambian acentos o mayúsculas) no se avisa.
assert.equal(searchNotice({ query: 'Pantalón', mode: 'todas', corrected: 'pantalon' }), null);

const parcial = searchNotice({ query: 'coca cola zero 2 litros', mode: 'parcial' });
assert.equal(parcial.strong, '');
assert.match(parcial.before, /todas esas palabras/);

const parcialCorregido = searchNotice({ query: 'sapatiyas rojas', mode: 'parcial', corrected: 'zapatillas rojas' });
assert.equal(parcialCorregido.strong, 'zapatillas rojas');

const relacionada = searchNotice({ query: 'tonica', mode: 'relacionada' });
assert.equal(relacionada.strong, '');
assert.match(relacionada.before, /variantes o en la descripción/);

const relacionadaCorregida = searchNotice({ query: 'ierba', mode: 'relacionada', corrected: 'yerba' });
assert.equal(relacionadaCorregida.strong, 'yerba');
assert.match(relacionadaCorregida.after, /variantes o en la descripción/);

console.log('search-suggest: todo bien');

import assert from 'node:assert/strict';
import {
  cartLineKey,
  itemLineKey,
  missingOptionNames,
  buildSelectionSnapshot,
  describeSelectedOptions,
  checkSelection,
  sortOptionGroups,
} from './product-options-utils.js';

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const COLOR = {
  id: 'g-color', name: 'Color', position: 0,
  values: [
    { id: 'v-rojo', value: 'Rojo', is_available: true, position: 0 },
    { id: 'v-azul', value: 'Azul', is_available: true, position: 1 },
    { id: 'v-verde', value: 'Verde', is_available: false, position: 2 },
  ],
};
const TALLE = {
  id: 'g-talle', name: 'Talle', position: 1,
  values: [
    { id: 'v-s', value: 'S', is_available: true, position: 0 },
    { id: 'v-m', value: 'M', is_available: true, position: 1 },
  ],
};
const GRUPOS = [COLOR, TALLE];

console.log('\n--- clave de línea del carrito ---');

ok('sin opciones la clave es el id pelado (carritos viejos siguen andando)', () => {
  assert.equal(cartLineKey('p1'), 'p1');
  assert.equal(cartLineKey('p1', []), 'p1');
  assert.equal(itemLineKey({ id: 'p1' }), 'p1');
});

ok('mismo producto con distinta combinación = líneas distintas', () => {
  assert.notEqual(cartLineKey('p1', ['v-rojo', 'v-m']), cartLineKey('p1', ['v-azul', 'v-m']));
});

ok('el orden en que tocó los chips no crea una línea duplicada', () => {
  assert.equal(cartLineKey('p1', ['v-rojo', 'v-m']), cartLineKey('p1', ['v-m', 'v-rojo']));
});

ok('productos distintos con la misma opción no se mezclan', () => {
  assert.notEqual(cartLineKey('p1', ['v-rojo']), cartLineKey('p2', ['v-rojo']));
});

console.log('\n--- qué falta elegir ---');

ok('sin elegir nada faltan los dos grupos, por nombre', () => {
  assert.deepEqual(missingOptionNames(GRUPOS, []), ['Color', 'Talle']);
});

ok('eligiendo el color solo falta el talle', () => {
  assert.deepEqual(missingOptionNames(GRUPOS, ['v-rojo']), ['Talle']);
});

ok('con todo elegido no falta nada', () => {
  assert.deepEqual(missingOptionNames(GRUPOS, ['v-rojo', 'v-m']), []);
});

ok('un producto sin opciones nunca tiene nada pendiente', () => {
  assert.deepEqual(missingOptionNames([], []), []);
});

console.log('\n--- snapshot y texto ---');

ok('el snapshot sale de los grupos de la base, en el orden de los grupos', () => {
  assert.deepEqual(buildSelectionSnapshot(GRUPOS, ['v-m', 'v-rojo']), [
    { option: 'Color', value: 'Rojo' },
    { option: 'Talle', value: 'M' },
  ]);
});

ok('un id que no pertenece al producto no entra en el snapshot', () => {
  assert.deepEqual(buildSelectionSnapshot(GRUPOS, ['v-de-otro-producto']), []);
});

ok('texto de una línea', () => {
  assert.equal(
    describeSelectedOptions([{ option: 'Color', value: 'Rojo' }, { option: 'Talle', value: 'M' }]),
    'Color: Rojo · Talle: M'
  );
});

ok('sin opciones el texto es vacío (la fila no dibuja nada)', () => {
  assert.equal(describeSelectedOptions([]), '');
  assert.equal(describeSelectedOptions(null), '');
  assert.equal(describeSelectedOptions(undefined), '');
});

console.log('\n--- validación (la misma cuenta que hace create_order) ---');

ok('selección completa y disponible', () => {
  assert.deepEqual(checkSelection(GRUPOS, ['v-rojo', 'v-m']), { ok: true, reason: 'ok' });
});

ok('falta un grupo -> incompleta', () => {
  assert.equal(checkSelection(GRUPOS, ['v-rojo']).reason, 'incompleta');
});

ok('el vendedor marcó ese color como agotado -> no-disponible', () => {
  assert.deepEqual(checkSelection(GRUPOS, ['v-verde', 'v-m']), { ok: false, reason: 'no-disponible' });
});

ok('dos valores del mismo grupo -> rechazado (igual que el RPC)', () => {
  assert.equal(checkSelection([COLOR], ['v-rojo', 'v-azul']).ok, false);
});

ok('ids de relleno además de los correctos -> rechazado (igual que el RPC)', () => {
  assert.equal(checkSelection(GRUPOS, ['v-rojo', 'v-m', 'basura']).ok, false);
});

ok('el vendedor borró el valor elegido -> incompleta', () => {
  assert.equal(checkSelection(GRUPOS, ['v-borrado', 'v-m']).reason, 'incompleta');
});

ok('el vendedor agregó un grupo nuevo despues -> la línea vieja queda incompleta', () => {
  // La línea se guardó cuando el producto solo tenía Color.
  assert.equal(checkSelection(GRUPOS, ['v-rojo']).reason, 'incompleta');
});

ok('producto sin opciones y sin selección -> válido', () => {
  assert.deepEqual(checkSelection([], []), { ok: true, reason: 'ok' });
});

ok('el producto dejó de tener opciones pero la línea tiene una elegida', () => {
  assert.deepEqual(checkSelection([], ['v-rojo']), { ok: false, reason: 'sin-opciones' });
});

console.log('\n--- orden ---');

ok('grupos y valores ordenados por position', () => {
  const desordenado = [
    { id: 'b', name: 'Talle', position: 1, values: [{ id: 'x', value: 'M', position: 1 }, { id: 'y', value: 'S', position: 0 }] },
    { id: 'a', name: 'Color', position: 0, values: [] },
  ];
  const ordenado = sortOptionGroups(desordenado);
  assert.deepEqual(ordenado.map((g) => g.name), ['Color', 'Talle']);
  assert.deepEqual(ordenado[1].values.map((v) => v.value), ['S', 'M']);
});

ok('a igual position desempata alfabético', () => {
  const mismo = [
    { id: 'b', name: 'Sabor', position: 0, values: [] },
    { id: 'a', name: 'Color', position: 0, values: [] },
  ];
  assert.deepEqual(sortOptionGroups(mismo).map((g) => g.name), ['Color', 'Sabor']);
});

ok('sortOptionGroups no muta lo que recibe', () => {
  const original = [{ id: 'b', name: 'Talle', position: 1, values: [] }, { id: 'a', name: 'Color', position: 0, values: [] }];
  const copia = JSON.parse(JSON.stringify(original));
  sortOptionGroups(original);
  assert.deepEqual(original, copia);
});

console.log(`\n${passed} asserts OK\n`);

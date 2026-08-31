/**
 * Chequeo de la lógica del selector de fecha.
 * Correr con:  node js/datepicker.test.mjs
 *
 * Las fechas son el terreno donde más fácil se cuelan bugs silenciosos: el
 * corrimiento por zona horaria, el 29 de febrero, el 31 de un mes de 30.
 */
import assert from 'node:assert/strict';
import {
  daysInMonth, isValidIso, isoToDisplay, displayToIso, maskDate,
  isoInRange, monthGrid, addMonths, todayIso,
} from './datepicker.js';

const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { console.error(`  FALLA  ${name}\n         ${err.message}`); process.exitCode = 1; }
};

console.log('daysInMonth');
check('meses de 30, 31 y febrero', () => {
  assert.equal(daysInMonth(2026, 1), 31);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 2), 28);
});
check('años bisiestos, incluida la regla de los siglos', () => {
  assert.equal(daysInMonth(2024, 2), 29);  // divisible por 4
  assert.equal(daysInMonth(1900, 2), 28);  // divisible por 100, NO bisiesto
  assert.equal(daysInMonth(2000, 2), 29);  // divisible por 400, sí bisiesto
});

console.log('isValidIso');
check('acepta fechas reales', () => {
  assert.ok(isValidIso('1994-03-12'));
  assert.ok(isValidIso('2024-02-29'));
});
check('rechaza fechas que no existen', () => {
  assert.ok(!isValidIso('2026-02-31'), '31 de febrero');
  assert.ok(!isValidIso('2023-02-29'), '29/02 en año no bisiesto');
  assert.ok(!isValidIso('2026-04-31'), '31 de abril');
  assert.ok(!isValidIso('2026-13-01'), 'mes 13');
  assert.ok(!isValidIso('2026-00-10'), 'mes 0');
  assert.ok(!isValidIso('2026-01-00'), 'día 0');
});
check('rechaza formatos raros y valores no string', () => {
  assert.ok(!isValidIso('12/03/1994'));
  assert.ok(!isValidIso('1994-3-12'));
  assert.ok(!isValidIso(''));
  assert.ok(!isValidIso(null));
  assert.ok(!isValidIso(undefined));
  assert.ok(!isValidIso(19940312));
});

console.log('isoToDisplay / displayToIso');
check('van y vuelven sin correr el día', () => {
  // El bug clásico: new Date('1994-03-12') es UTC y en Argentina da 11/03.
  assert.equal(isoToDisplay('1994-03-12'), '12/03/1994');
  assert.equal(displayToIso('12/03/1994'), '1994-03-12');
  assert.equal(displayToIso(isoToDisplay('2024-02-29')), '2024-02-29');
});
check('un 1 de mes no se corre al mes anterior', () => {
  assert.equal(isoToDisplay('2026-01-01'), '01/01/2026');
  assert.equal(displayToIso('01/01/2026'), '2026-01-01');
});
check('devuelven vacío/null ante basura', () => {
  assert.equal(isoToDisplay('2026-02-31'), '');
  assert.equal(isoToDisplay(''), '');
  assert.equal(displayToIso('12/03/94'), null, 'año de 2 dígitos');
  assert.equal(displayToIso('31/02/2026'), null, 'fecha inexistente');
  assert.equal(displayToIso('sin fecha'), null);
  assert.equal(displayToIso(''), null);
  assert.equal(displayToIso(null), null);
});

console.log('maskDate');
check('pone las barras al escribir', () => {
  assert.equal(maskDate('1'), '1');
  assert.equal(maskDate('12'), '12');
  assert.equal(maskDate('123'), '12/3');
  assert.equal(maskDate('1203'), '12/03');
  assert.equal(maskDate('12031994'), '12/03/1994');
});
check('ignora lo que no sea número y corta en 8 dígitos', () => {
  assert.equal(maskDate('12/03/1994'), '12/03/1994');
  assert.equal(maskDate('12ab03'), '12/03');
  assert.equal(maskDate('120319941234'), '12/03/1994');
  assert.equal(maskDate(''), '');
  assert.equal(maskDate(null), '');
});

console.log('isoInRange');
check('respeta los límites, inclusive', () => {
  assert.ok(isoInRange('2026-05-10', '2026-01-01', '2026-12-31'));
  assert.ok(isoInRange('2026-01-01', '2026-01-01', '2026-12-31'), 'el mínimo entra');
  assert.ok(isoInRange('2026-12-31', '2026-01-01', '2026-12-31'), 'el máximo entra');
  assert.ok(!isoInRange('2025-12-31', '2026-01-01', ''));
  assert.ok(!isoInRange('2027-01-01', '', '2026-12-31'));
});
check('sin límites, todo entra', () => {
  assert.ok(isoInRange('1900-01-01', '', ''));
});

console.log('monthGrid');
check('siempre 42 celdas, para que no salte el alto al cambiar de mes', () => {
  assert.equal(monthGrid(2026, 2).length, 42);
  assert.equal(monthGrid(2026, 8).length, 42);
});
check('alinea el 1 en el día de semana correcto (semana de lunes)', () => {
  // 1 de agosto de 2026 cae sábado -> índice 5 con lunes = 0
  const agosto = monthGrid(2026, 8);
  assert.equal(agosto.findIndex((c) => c && c.day === 1), 5);
  // 1 de junio de 2026 cae lunes -> índice 0
  assert.equal(monthGrid(2026, 6).findIndex((c) => c && c.day === 1), 0);
});
check('tiene todos los días del mes y ninguno de más', () => {
  const feb = monthGrid(2024, 2).filter(Boolean); // bisiesto
  assert.equal(feb.length, 29);
  assert.equal(feb[0].iso, '2024-02-01');
  assert.equal(feb[28].iso, '2024-02-29');
  assert.equal(monthGrid(2026, 4).filter(Boolean).length, 30);
});
check('los ISO que arma son válidos y con ceros a la izquierda', () => {
  const enero = monthGrid(2026, 1).filter(Boolean);
  assert.equal(enero[0].iso, '2026-01-01');
  enero.forEach((c) => assert.ok(isValidIso(c.iso), `ISO inválido: ${c.iso}`));
});

console.log('addMonths');
check('cruza el fin de año en los dos sentidos', () => {
  assert.deepEqual(addMonths(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(addMonths(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(addMonths(2026, 8, 5), { year: 2027, month: 1 });
  assert.deepEqual(addMonths(2026, 3, -6), { year: 2025, month: 9 });
});
check('no se mueve con delta 0', () => {
  assert.deepEqual(addMonths(2026, 8, 0), { year: 2026, month: 8 });
});

console.log('todayIso');
check('formato correcto y es una fecha real', () => {
  const hoy = todayIso();
  assert.match(hoy, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(isValidIso(hoy));
});

if (!process.exitCode) console.log('\nTodo bien.');

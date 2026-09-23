// node js/transfer-details-utils.test.mjs
import assert from 'node:assert/strict';
import {
  isValidCbu, normalizeCbu, isValidAlias, formatCbuForDisplay, shortOrderRef,
  amountForCopy, buildBankFields, extraTransferNotes, hasTransferData,
  buildContactInfo, buildTransferWhatsappMessage,
} from './transfer-details-utils.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

test('CBU: 22 dígitos, tolera espacios y guiones al tipear', () => {
  assert.equal(isValidCbu('0110599520000001234567'), true);
  assert.equal(isValidCbu('0110 5995 2000 0001 2345 67'), true);
  assert.equal(normalizeCbu('0110-5995 2000000123456 7'), '0110599520000001234567');
  assert.equal(isValidCbu('011059952000000123456'), false); // 21
  assert.equal(isValidCbu(''), false);
});

test('alias: 6 a 20, letras/números/punto/guion', () => {
  assert.equal(isValidAlias('MIVENTA.BARADERO'), true);
  assert.equal(isValidAlias('  gogo.mp  '), true);
  assert.equal(isValidAlias('corto'), false);
  assert.equal(isValidAlias('con espacio.aca'), false);
  assert.equal(isValidAlias('a'.repeat(21)), false);
});

test('CBU se muestra en bloques de 4 pero se copia limpio', () => {
  assert.equal(formatCbuForDisplay('0110599520000001234567'), '0110 5995 2000 0001 2345 67');
  const [, cbu] = buildBankFields({ transfer_alias: 'MIVENTA.BARADERO', transfer_cbu: '0110 5995 2000 0001 2345 67' });
  assert.equal(cbu.copy, '0110599520000001234567');
  assert.equal(cbu.display, '0110 5995 2000 0001 2345 67');
});

test('solo los datos cargados, en orden alias/CBU/titular/banco; banco sin copiar', () => {
  const fields = buildBankFields({ transfer_bank: 'Banco Nación', transfer_holder: 'Juan Pérez', transfer_alias: 'JUAN.PEREZ.MP' });
  assert.deepEqual(fields.map((f) => f.key), ['alias', 'holder', 'bank']);
  assert.equal(fields[2].copy, null);
  assert.deepEqual(buildBankFields({}), []);
  assert.deepEqual(buildBankFields(null), []);
});

test('comercio viejo con solo transfer_info sigue teniendo datos', () => {
  const legacy = { transfer_info: 'gogo.mp' };
  assert.equal(extraTransferNotes(legacy), 'gogo.mp');
  assert.equal(hasTransferData(legacy), true);
  assert.equal(hasTransferData({ transfer_info: '   ' }), false);
});

test('transfer_info igual al alias (backfill de la 106) no se repite', () => {
  assert.equal(extraTransferNotes({ transfer_info: 'bere.alg', transfer_alias: 'bere.alg' }), null);
  assert.equal(extraTransferNotes({ transfer_info: '0110 5995 2000 0001 2345 67', transfer_cbu: '0110599520000001234567' }), null);
  assert.equal(extraTransferNotes({ transfer_info: 'Avisame por WhatsApp', transfer_alias: 'bere.alg' }), 'Avisame por WhatsApp');
});

test('número de pedido y monto para copiar', () => {
  assert.equal(shortOrderRef('a1b2c3d4-0000-1111-2222-333333333333'), 'A1B2C3D4');
  assert.equal(amountForCopy(18000), '18000');
  assert.equal(amountForCopy('18000.4'), '18000');
});

test('contacto: respeta contact_method=none', () => {
  const store = { contact_method: 'none', whatsapp: '3329 555' };
  assert.deepEqual(buildContactInfo(store), { whatsapp: null, whatsappDigits: null });
});

test('contacto: solo WhatsApp -- el comprador nunca puede llamar', () => {
  const info = buildContactInfo({ contact_method: 'whatsapp', whatsapp: '+54 3329 69-5897' });
  assert.equal(info.whatsappDigits, '543329695897');
  assert.equal('phone' in info, false);
  const noWa = buildContactInfo({ contact_method: 'whatsapp', whatsapp: null });
  assert.equal(noWa.whatsapp, null);
});

test('mensaje de WhatsApp con pedido y monto', () => {
  const msg = buildTransferWhatsappMessage({ storeName: 'gogo', orderRef: 'A1B2C3D4', amountLabel: '$18.000' });
  assert.match(msg, /^Hola gogo!/);
  assert.match(msg, /#A1B2C3D4/);
  assert.match(msg, /\$18\.000/);
});

console.log(`\n${passed} tests ok`);

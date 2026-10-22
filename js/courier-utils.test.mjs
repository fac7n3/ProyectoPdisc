/**
 * Chequeo de la lógica del panel de repartidor.
 * Correr con:  node js/courier-utils.test.mjs
 */
import assert from 'node:assert/strict';
import {
  MAX_ACTIVE, queueLevel, timeAgoLabel, deliveryStage, pickupLevel, pickupCode, canTakeMore, mapsLinks, telHref, normalizeMapsUrl,
} from './courier-utils.js';

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const MIN = 60 * 1000;
const NOW = Date.parse('2026-10-21T15:00:00Z');
const ago = (min) => new Date(NOW - min * MIN).toISOString();

console.log('queueLevel / timeAgoLabel');
check('cola: normal, amarillo a los 5, rojo a los 10', () => {
  assert.equal(queueLevel(4 * MIN), 'normal');
  assert.equal(queueLevel(5 * MIN), 'warning');
  assert.equal(queueLevel(10 * MIN), 'danger');
});
check('etiquetas de tiempo', () => {
  assert.equal(timeAgoLabel(20 * 1000), 'recién');
  assert.equal(timeAgoLabel(11 * MIN), 'hace 11 min');
  assert.equal(timeAgoLabel(65 * MIN), 'hace 1h 05min');
  assert.equal(timeAgoLabel(-5000), 'recién');
});

console.log('deliveryStage / pickupLevel');
check('etapas', () => {
  assert.equal(deliveryStage({ status: 'assigned' }), 'assigned');
  assert.equal(deliveryStage({ status: 'picked_up' }), 'picked_up');
  assert.equal(deliveryStage({ status: 'cancelled' }), 'cancelled');
});
check('retiro sin avisos: normal, ámbar a los 10, rojo a los 20', () => {
  assert.equal(pickupLevel({ status: 'assigned', assigned_at: ago(9) }, NOW), 'normal');
  assert.equal(pickupLevel({ status: 'assigned', assigned_at: ago(10) }, NOW), 'warning');
  assert.equal(pickupLevel({ status: 'assigned', assigned_at: ago(20) }, NOW), 'danger');
});
check('"ya lo tengo encima" frena el reloj 10 minutos y después vuelve a correr', () => {
  const base = { status: 'assigned', assigned_at: ago(25) };
  assert.equal(pickupLevel({ ...base, heads_up_at: ago(3) }, NOW), 'notified');
  assert.equal(pickupLevel({ ...base, heads_up_at: ago(11) }, NOW), 'danger');
});
check('la demora avisada vale mientras no pase el tiempo que dijo', () => {
  const base = { status: 'assigned', assigned_at: ago(25) };
  assert.equal(pickupLevel({ ...base, delay_notice_at: ago(5), delay_minutes: 20 }, NOW), 'notified');
  assert.equal(pickupLevel({ ...base, delay_notice_at: ago(25), delay_minutes: 20 }, NOW), 'danger');
});
check('fuera de la etapa de retiro no hay semáforo', () => {
  assert.equal(pickupLevel({ status: 'picked_up', assigned_at: ago(50) }, NOW), 'none');
  assert.equal(pickupLevel({ status: 'cancelled', assigned_at: ago(50) }, NOW), 'none');
});

console.log('pickupCode / canTakeMore');
check('los 4 dígitos del número de pedido', () => {
  assert.equal(pickupCode(1062), '1062');
  assert.equal(pickupCode('1062'), '1062');
  assert.equal(pickupCode(12345), '2345');
  assert.equal(pickupCode(null), '');
});
check('tope de 3 pedidos a la vez', () => {
  assert.equal(MAX_ACTIVE, 3);
  assert.equal(canTakeMore(0), true);
  assert.equal(canTakeMore(2), true);
  assert.equal(canTakeMore(3), false);
  assert.equal(canTakeMore('3'), false);
});

console.log('mapsLinks / telHref');
check('sin link del comercio: busca la dirección de texto con la ciudad', () => {
  const m = mapsLinks({ address: 'San Martín 789' });
  assert.equal(m.view, 'https://www.google.com/maps/search/?api=1&query=San%20Mart%C3%ADn%20789%2C%20Baradero%2C%20Buenos%20Aires%2C%20Argentina');
  assert.match(m.directions, /maps\/dir\/\?api=1&destination=San%20Mart/);
});
check('si la dirección ya dice Baradero no se repite', () => {
  const m = mapsLinks({ address: 'San Martín 789, Baradero' });
  assert.ok(!decodeURIComponent(m.view).includes('Baradero, Buenos Aires, Argentina, Baradero'));
  assert.equal(decodeURIComponent(m.view).match(/Baradero/gi).length, 1);
});
check('con el link de Google Maps del comercio, "ver" lo usa tal cual', () => {
  const m = mapsLinks({ address: 'San Martín 789', mapsUrl: 'https://maps.app.goo.gl/abc123' });
  assert.equal(m.view, 'https://maps.app.goo.gl/abc123');
  assert.match(m.directions, /dir\/\?api=1/);
});
check('un link raro (javascript:) se descarta y cae a la dirección', () => {
  const m = mapsLinks({ address: 'Mitre 10', mapsUrl: 'javascript:alert(1)' });
  assert.match(m.view, /^https:\/\/www\.google\.com\/maps\/search/);
});
check('sin dirección ni link no hay mapa', () => {
  const m = mapsLinks({});
  assert.equal(m.view, null);
  assert.equal(m.directions, null);
});
check('sin dirección pero con link: ambos lo usan', () => {
  const m = mapsLinks({ mapsUrl: 'https://maps.app.goo.gl/abc123' });
  assert.equal(m.view, 'https://maps.app.goo.gl/abc123');
  assert.equal(m.directions, 'https://maps.app.goo.gl/abc123');
});
check('teléfono: link tel: solo si hay un número usable', () => {
  assert.equal(telHref('+54 9 3329 12-3456'), 'tel:+5493329123456');
  assert.equal(telHref('12'), null);
  assert.equal(telHref(null), null);
});

console.log('normalizeMapsUrl');
check('vacío es válido (es opcional)', () => {
  assert.deepEqual(normalizeMapsUrl(''), { ok: true, value: null });
  assert.deepEqual(normalizeMapsUrl('   '), { ok: true, value: null });
  assert.deepEqual(normalizeMapsUrl(null), { ok: true, value: null });
});
check('acepta los links de Google Maps', () => {
  for (const url of [
    'https://maps.app.goo.gl/abc123',
    'https://goo.gl/maps/abc123',
    'https://www.google.com/maps/place/Mi+Local/@-33.8,-59.5,17z',
    'https://google.com.ar/maps?q=mitre+100',
    'https://maps.google.com/?q=mitre+100',
  ]) assert.equal(normalizeMapsUrl(url).ok, true, url);
});
check('completa el https si falta', () => {
  assert.equal(normalizeMapsUrl('maps.app.goo.gl/abc123').value, 'https://maps.app.goo.gl/abc123');
});
check('rechaza lo que no es de Google Maps', () => {
  for (const url of [
    'https://example.com/maps',
    'https://google.com.evil.com/maps',
    'http://maps.app.goo.gl/abc',
    'javascript:alert(1)',
    'https://www.google.com/search?q=mapa',
    'https://notgoogle.com/maps',
  ]) assert.equal(normalizeMapsUrl(url).ok, false, url);
});

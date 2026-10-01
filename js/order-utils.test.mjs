import assert from 'node:assert/strict';
import {
  orderRef, orderLabel, canPrepare, nextSellerAction, showsPickupCode, timelineSteps,
  eventLabel, formatDueDate, toWhatsappNumber, sellerWhatsappMessage, deliveryQrUrl, buyerSaysPaid,
} from './order-utils.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${e.message}`); }
}

const base = { id: 'acb34461-f7a1-4a59-a768-eaaa0ea879ec', order_number: 1066, status: 'pending', payment_status: 'pending', payment_method: 'transferencia', delivery_method: 'pickup', created_at: '2026-09-30T15:00:00Z' };

test('número de pedido', () => {
  assert.equal(orderLabel(base), '#BL-1066');
  assert.equal(orderRef({ id: base.id }), 'ACB34461');
});

test('transferencia sin pagar: no se prepara ni hay botón', () => {
  assert.equal(canPrepare(base), false);
  assert.equal(nextSellerAction(base), null);
  assert.equal(showsPickupCode(base), false);
});

test('un pedido pendiente sin pago acreditado no se prepara', () => {
  assert.equal(canPrepare({ ...base, payment_method: 'transferencia' }), false);
  assert.equal(canPrepare({ ...base, payment_method: 'mercadopago' }), false);
});

test('pagado con envío: despachar y después entregar con código', () => {
  const o = { ...base, status: 'paid', payment_status: 'paid', delivery_method: 'delivery' };
  assert.equal(nextSellerAction(o).status, 'shipped');
  const shipped = nextSellerAction({ ...o, status: 'shipped' });
  assert.equal(shipped.status, 'completed');
  assert.equal(shipped.needsCode, true);
  assert.equal(nextSellerAction(o, { hasCourier: true }), null);
});

test('cerrados: sin botón ni código', () => {
  for (const status of ['completed', 'cancelled']) {
    assert.equal(nextSellerAction({ ...base, status, payment_status: 'paid' }), null);
    assert.equal(showsPickupCode({ ...base, status, payment_status: 'paid' }), false);
  }
});

test('comprador avisó que pagó', () => {
  assert.equal(buyerSaysPaid(base), false);
  assert.equal(buyerSaysPaid({ ...base, transfer_notified_at: '2026-09-30T16:00:00Z' }), true);
  assert.equal(buyerSaysPaid({ ...base, payment_proofs: [{ status: 'rejected' }] }), false);
  assert.equal(buyerSaysPaid({ ...base, payment_proofs: [{ status: 'pending' }] }), true);
});

test('línea de tiempo: pagado y listo para retirar', () => {
  const o = { ...base, status: 'ready_for_pickup', payment_status: 'paid' };
  const steps = timelineSteps(o, [{ kind: 'paid', created_at: 'P' }, { kind: 'ready_for_pickup', created_at: 'R' }]);
  assert.deepEqual(steps.map((s) => s.done), [true, true, true, false]);
  assert.equal(steps.findIndex((s) => s.current), 3);
  assert.equal(steps[1].date, 'P');
});

test('línea de tiempo: completado marca el último como actual', () => {
  const steps = timelineSteps({ ...base, status: 'completed', payment_status: 'paid' });
  assert.ok(steps.every((s) => s.done));
  assert.equal(steps.findIndex((s) => s.current), 3);
});

test('línea de tiempo: cancelado', () => {
  const steps = timelineSteps({ ...base, status: 'cancelled' }, [{ kind: 'expired', created_at: 'E' }]);
  assert.deepEqual(steps.map((s) => s.label), ['Pedido hecho', 'Cancelado']);
  assert.equal(steps[1].date, 'E');
});

test('eventos según quién mira', () => {
  assert.equal(eventLabel({ kind: 'transfer_notified' }, { viewer: 'buyer' }), 'Avisaste que transferiste');
  assert.equal(eventLabel({ kind: 'transfer_notified' }, { viewer: 'seller' }), 'El comprador avisó que transfirió');
  assert.equal(eventLabel({ kind: 'payment_rejected', note: 'No me llegó' }), 'El comercio no pudo confirmar el pago: No me llegó');
  assert.equal(eventLabel({ kind: 'cancelled', actor: 'buyer' }, { viewer: 'seller' }), 'El comprador lo canceló');
});

test('vencimiento en hora argentina', () => {
  const now = new Date('2026-09-30T15:00:00Z'); // 12:00 en Argentina
  assert.equal(formatDueDate('2026-09-30T21:30:00Z', now), 'hoy a las 18:30');
  assert.equal(formatDueDate('2026-10-01T12:00:00Z', now), 'mañana a las 09:00');
  assert.match(formatDueDate('2026-10-03T15:00:00Z', now), /^el sábado 3\/10 a las 12:00$/);
  // 02:30 UTC del 1/10 todavía es 30/9 en Argentina.
  assert.equal(formatDueDate('2026-10-01T02:30:00Z', now), 'hoy a las 23:30');
  assert.equal(formatDueDate('basura', now), '');
});

test('celulares para WhatsApp', () => {
  assert.equal(toWhatsappNumber('3329 45-6789'), '5493329456789');
  assert.equal(toWhatsappNumber('03329 15 456789'), '5493329456789');
  assert.equal(toWhatsappNumber('+54 9 3329 456789'), '5493329456789');
  assert.equal(toWhatsappNumber('011 15 2345 6789'), '5491123456789');
  assert.equal(toWhatsappNumber('15456789'), '5493329456789');
  assert.equal(toWhatsappNumber('456789'), '5493329456789');
  assert.equal(toWhatsappNumber('123'), null);
  assert.equal(toWhatsappNumber(null), null);
});

test('mensaje del vendedor según el estado', () => {
  const o = { ...base, status: 'ready_for_pickup', payment_status: 'paid' };
  assert.match(sellerWhatsappMessage(o, { storeName: 'facu.cells', buyerName: 'Facundo Echeverría' }),
    /^Hola Facundo! Te escribo de facu\.cells por tu pedido #BL-1066 de Baradero Local\. Ya está listo para retirar/);
  assert.match(sellerWhatsappMessage(base), /¿Pudiste hacer la transferencia\?$/);
});

test('QR: link al panel con pedido y código', () => {
  const url = new URL(deliveryQrUrl('https://proyectopdisc.vercel.app', base, '0418'));
  assert.equal(url.pathname, '/pages/vender.html');
  assert.equal(url.searchParams.get('entregar'), base.id);
  assert.equal(url.searchParams.get('codigo'), '0418');
  assert.equal(url.hash, '#pedidos');
});

if (failed) process.exitCode = 1;

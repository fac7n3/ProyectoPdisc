// Un test por cada mejora del flujo del pedido (la lista de 40 del 2026-09-30),
// numerado igual que la lista. Lo que vive en la base (cancelar, rechazar,
// vencer, avisos) se prueba en db/tests/order_flow.test.sql.
import assert from 'node:assert/strict';
import {
  ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, DELIVERY_METHOD_LABELS, PAYMENT_REJECT_REASONS, SELLER_CANCEL_REASONS,
  orderRef, orderLabel, canPrepare, awaitingTransfer, awaitingMercadoPago, buyerSaysPaid, orderHasCourier,
  pedidosTabMatches, isSellerOrderAlert, nextSellerAction, showsPickupCode, timelineSteps, eventLabel,
  formatDueDate, toWhatsappNumber, sellerWhatsappMessage, deliveryQrUrl,
} from './order-utils.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${e.message}`); }
}

const base = { id: 'acb34461-f7a1-4a59-a768-eaaa0ea879ec', order_number: 1066, status: 'pending', payment_status: 'pending', payment_method: 'transferencia', delivery_method: 'pickup', created_at: '2026-09-30T15:00:00Z' };
const paid = { ...base, status: 'paid', payment_status: 'paid' };
const cash = { ...base, payment_method: 'efectivo' };
const mp = { ...base, payment_method: 'mercadopago' };
const tabsOf = (o) => ['to_confirm', 'pending_payment', 'to_prepare', 'in_progress', 'completed', 'cancelled', 'all']
  .filter((t) => pedidosTabMatches(o, t));

test('1 · "¡Listo! Pedido #BL-…" con lo que devuelve create_order', () => {
  // El carrito arma el título con { id: order_id, order_number } de create_order.
  assert.equal(orderLabel({ id: base.id, order_number: 1067 }), '#BL-1067');
  assert.equal(orderLabel({ order_id: base.id }), '#ACB34461');
});

test('2 · Hasta cuándo transferir, en hora argentina', () => {
  const now = new Date('2026-09-30T15:00:00Z'); // 12:00 en Argentina
  assert.equal(formatDueDate('2026-09-30T21:30:00Z', now), 'hoy a las 18:30');
  assert.equal(formatDueDate('2026-10-01T12:00:00Z', now), 'mañana a las 09:00');
  assert.match(formatDueDate('2026-10-03T15:00:00Z', now), /^el sábado 3\/10 a las 12:00$/);
  // 02:30 UTC del 1/10 todavía es 30/9 en Argentina.
  assert.equal(formatDueDate('2026-10-01T02:30:00Z', now), 'hoy a las 23:30');
  assert.equal(formatDueDate('basura', now), '');
});

test('3 · Efectivo: se prepara sin pagar y se cobra al entregar', () => {
  assert.equal(canPrepare(cash), true);
  assert.equal(nextSellerAction(cash).status, 'ready_for_pickup');
  assert.equal(nextSellerAction({ ...cash, status: 'ready_for_pickup' }).label, 'Cobrado y entregado');
  assert.equal(nextSellerAction({ ...cash, delivery_method: 'delivery', status: 'shipped' }).label, 'Cobrado y entregado');
  assert.equal(eventLabel({ kind: 'paid' }, { paymentMethod: 'efectivo' }), 'Cobrado en efectivo');
  // No espera ningún pago: va directo a "Para preparar".
  assert.deepEqual(tabsOf(cash), ['to_prepare', 'all']);
  assert.equal(PAYMENT_METHOD_LABELS.efectivo, 'Efectivo');
});

test('6 · Reintentar Mercado Pago solo si quedó a medias', () => {
  assert.equal(awaitingMercadoPago(mp), true);
  assert.equal(awaitingMercadoPago({ ...mp, status: 'paid', payment_status: 'paid' }), false);
  assert.equal(awaitingMercadoPago({ ...mp, status: 'cancelled', payment_status: 'rejected' }), false);
  assert.equal(awaitingMercadoPago(base), false);
  assert.deepEqual(tabsOf(mp), ['pending_payment', 'all']);
});

test('7 · El comprador cancela un pedido sin pagar', () => {
  const cancelled = { ...base, status: 'cancelled', payment_status: 'rejected', cancelled_by: 'buyer' };
  assert.equal(eventLabel({ kind: 'cancelled', actor: 'buyer' }, { viewer: 'buyer' }), 'Lo cancelaste');
  assert.equal(eventLabel({ kind: 'cancelled', actor: 'buyer' }, { viewer: 'seller' }), 'El comprador lo canceló');
  assert.equal(awaitingTransfer(cancelled), false);
  assert.deepEqual(tabsOf(cancelled), ['cancelled']);
});

test('8a · Rechazar el pago con motivo: el pedido sigue abierto', () => {
  assert.deepEqual(PAYMENT_REJECT_REASONS, ['No me llegó la transferencia', 'El monto no coincide', 'El comprobante no es válido']);
  assert.equal(eventLabel({ kind: 'payment_rejected', note: 'No me llegó' }), 'El comercio no pudo confirmar el pago: No me llegó');
  // Después del rechazo la base borra transfer_notified_at y el comprobante queda rejected:
  // vuelve a "Esperando pago", no a "Pagos por confirmar".
  const rejected = { ...base, transfer_notified_at: null, payment_proofs: [{ status: 'rejected' }] };
  assert.equal(awaitingTransfer(rejected), true);
  assert.deepEqual(tabsOf(rejected), ['pending_payment', 'all']);
});

test('9 · "Ya transferí", con o sin comprobante', () => {
  assert.equal(buyerSaysPaid(base), false);
  assert.equal(buyerSaysPaid({ ...base, transfer_notified_at: '2026-09-30T16:00:00Z' }), true);
  assert.equal(buyerSaysPaid({ ...base, payment_proofs: [{ status: 'rejected' }] }), false);
  assert.equal(buyerSaysPaid({ ...base, payment_proofs: [{ status: 'pending' }] }), true);
  assert.equal(eventLabel({ kind: 'transfer_notified' }, { viewer: 'buyer' }), 'Avisaste que transferiste');
  assert.equal(eventLabel({ kind: 'transfer_notified' }, { viewer: 'seller' }), 'El comprador avisó que transfirió');
});

test('10 · "Pagos por confirmar" es una pestaña de Pedidos', () => {
  assert.deepEqual(tabsOf({ ...base, payment_proofs: [{ status: 'pending' }] }), ['to_confirm', 'all']);
  assert.deepEqual(tabsOf({ ...base, transfer_notified_at: '2026-09-30T16:00:00Z' }), ['to_confirm', 'all']);
  assert.deepEqual(tabsOf(base), ['pending_payment', 'all']);
  // Un pedido de Mercado Pago nunca espera confirmación manual.
  assert.equal(pedidosTabMatches({ ...mp, transfer_notified_at: 'x' }, 'to_confirm'), false);
});

test('13 · El botón del siguiente paso, retiro y envío', () => {
  assert.equal(nextSellerAction(base), null); // transferencia sin pagar: nada que hacer
  assert.deepEqual(nextSellerAction(paid), { status: 'ready_for_pickup', label: 'Marcar listo para retirar', icon: 'fa-box' });
  const pickupDone = nextSellerAction({ ...paid, status: 'ready_for_pickup' });
  assert.equal(pickupDone.status, 'completed');
  assert.equal(pickupDone.label, 'Marcar entregado');
  const delivery = { ...paid, delivery_method: 'delivery' };
  assert.equal(nextSellerAction(delivery).status, 'shipped');
  assert.equal(nextSellerAction({ ...delivery, status: 'shipped' }).status, 'completed');
  for (const status of ['completed', 'cancelled']) assert.equal(nextSellerAction({ ...paid, status }), null);
  assert.deepEqual(tabsOf(paid), ['to_prepare', 'all']);
  assert.deepEqual(tabsOf({ ...paid, status: 'ready_for_pickup' }), ['in_progress', 'all']);
});

test('13 · Con repartidor no hay botón: lo avanza él', () => {
  const withCourier = { ...paid, delivery_method: 'delivery', deliveries: [{ status: 'assigned' }] };
  assert.equal(orderHasCourier(withCourier), true);
  assert.equal(orderHasCourier({ ...withCourier, deliveries: [{ status: 'cancelled' }] }), false);
  assert.equal(orderHasCourier(paid), false);
  assert.equal(nextSellerAction(withCourier, { hasCourier: true }), null);
  assert.deepEqual(tabsOf(withCourier), ['in_progress', 'all']);
});

test('14 · Cómo se entrega y cómo pagó', () => {
  assert.equal(DELIVERY_METHOD_LABELS.pickup, 'Retiro en el local');
  assert.equal(DELIVERY_METHOD_LABELS.delivery, 'Envío a domicilio');
  assert.deepEqual(Object.keys(PAYMENT_METHOD_LABELS).sort(), ['efectivo', 'mercadopago', 'simulado', 'transferencia']);
  assert.deepEqual(Object.keys(ORDER_STATUS_LABELS).sort(), ['cancelled', 'completed', 'paid', 'pending', 'ready_for_pickup', 'shipped']);
  assert.equal(ORDER_STATUS_LABELS.shipped, 'En camino');
});

test('16 · Cancelar con motivo', () => {
  assert.ok(SELLER_CANCEL_REASONS.includes('No tengo stock'));
  assert.ok(SELLER_CANCEL_REASONS.includes('El comprador me pidió cancelar'));
  assert.equal(eventLabel({ kind: 'cancelled', actor: 'seller', note: 'No tengo stock' }, { viewer: 'buyer' }), 'Cancelado: No tengo stock');
});

test('17 · WhatsApp al comprador: número y mensaje armado', () => {
  assert.equal(toWhatsappNumber('3329 45-6789'), '5493329456789');
  assert.equal(toWhatsappNumber('03329 15 456789'), '5493329456789');
  assert.equal(toWhatsappNumber('+54 9 3329 456789'), '5493329456789');
  assert.equal(toWhatsappNumber('011 15 2345 6789'), '5491123456789');
  assert.equal(toWhatsappNumber('15456789'), '5493329456789');
  assert.equal(toWhatsappNumber('456789'), '5493329456789');
  assert.equal(toWhatsappNumber('123'), null);
  assert.equal(toWhatsappNumber(null), null);

  const ready = { ...paid, status: 'ready_for_pickup' };
  assert.match(sellerWhatsappMessage(ready, { storeName: 'facu.cells', buyerName: 'Facundo Echeverría' }),
    /^Hola Facundo! Te escribo de facu\.cells por tu pedido #BL-1066 de Baradero Local\. Ya está listo para retirar/);
  assert.match(sellerWhatsappMessage(base), /^Hola! Te escribo por tu pedido #BL-1066.*¿Pudiste hacer la transferencia\?$/);
  assert.match(sellerWhatsappMessage({ ...paid, status: 'shipped' }), /Ya salió para tu domicilio\.$/);
  assert.match(sellerWhatsappMessage(paid), /Ya lo estamos preparando\.$/);
  assert.equal(sellerWhatsappMessage({ ...base, status: 'cancelled' }), 'Hola! Te escribo por tu pedido #BL-1066 de Baradero Local.');
});

test('20 · Número de pedido corto, el mismo en todas las pantallas', () => {
  assert.equal(orderRef(base), 'BL-1066'); // el que va en el motivo de la transferencia
  assert.equal(orderLabel(base), '#BL-1066');
  // Sin número (dato faltante): el prefijo del uuid, nunca "undefined".
  assert.equal(orderRef({ id: base.id }), 'ACB34461');
  assert.equal(orderRef({ order_id: base.id }), 'ACB34461');
  assert.equal(orderRef(null), '');
});

test('21 · QR: link al panel con el pedido y el código', () => {
  const url = new URL(deliveryQrUrl('https://proyectopdisc.vercel.app', base, '0418'));
  assert.equal(url.pathname, '/pages/vender.html');
  assert.equal(url.searchParams.get('entregar'), base.id);
  assert.equal(url.searchParams.get('codigo'), '0418');
  assert.equal(url.hash, '#pedidos');
});

test('22 · Código de retiro: se muestra cuando sirve y se pide al entregar', () => {
  assert.equal(showsPickupCode(base), false); // transferencia sin pagar
  assert.equal(showsPickupCode(cash), true);
  assert.equal(showsPickupCode(paid), true);
  assert.equal(showsPickupCode({ ...paid, status: 'ready_for_pickup' }), true);
  assert.equal(showsPickupCode({ ...paid, status: 'shipped' }), true);
  assert.equal(showsPickupCode({ ...paid, status: 'completed' }), false);
  assert.equal(showsPickupCode({ ...paid, status: 'cancelled' }), false);
  assert.equal(nextSellerAction({ ...paid, status: 'ready_for_pickup' }).needsCode, true);
  assert.equal(nextSellerAction(paid).needsCode, undefined); // "listo" no pide código
});

test('29 · Sonido y contador: solo los avisos de pedidos del vendedor', () => {
  for (const type of ['order_created', 'order_paid_seller', 'transfer_notified', 'payment_proof_uploaded', 'order_cancelled_by_buyer', 'revocation_requested']) {
    assert.equal(isSellerOrderAlert({ type }), true, type);
  }
  // Los del comprador o los que no son de pedidos no suenan.
  for (const type of ['order_paid', 'order_shipped', 'new_review', 'stock_alert']) assert.equal(isSellerOrderAlert({ type }), false, type);
  assert.equal(isSellerOrderAlert(null), false);
});

test('34 · Línea de tiempo: pagado y listo para retirar', () => {
  const steps = timelineSteps({ ...paid, status: 'ready_for_pickup' }, [{ kind: 'paid', created_at: 'P' }, { kind: 'ready_for_pickup', created_at: 'R' }]);
  assert.deepEqual(steps.map((s) => s.label), ['Pedido hecho', 'Pago confirmado', 'Listo para retirar', 'Entregado']);
  assert.deepEqual(steps.map((s) => s.done), [true, true, true, false]);
  assert.equal(steps.findIndex((s) => s.current), 3);
  assert.equal(steps[1].date, 'P');
  assert.equal(steps[2].date, 'R');
});

test('34 · Línea de tiempo: envío, efectivo, completado y cancelado', () => {
  assert.equal(timelineSteps({ ...paid, delivery_method: 'delivery' })[2].label, 'En camino');
  const cashSteps = timelineSteps({ ...cash, delivery_method: 'delivery' });
  assert.deepEqual(cashSteps.map((s) => s.label), ['Pedido hecho', 'En camino', 'Recibido y pagado']);
  assert.equal(cashSteps.findIndex((s) => s.current), 1);
  const done = timelineSteps({ ...paid, status: 'completed' });
  assert.ok(done.every((s) => s.done));
  assert.equal(done.findIndex((s) => s.current), 3);
  const cancelled = timelineSteps({ ...base, status: 'cancelled' }, [{ kind: 'expired', created_at: 'E' }]);
  assert.deepEqual(cancelled.map((s) => s.label), ['Pedido hecho', 'Cancelado']);
  assert.equal(cancelled[1].date, 'E');
  // Sin created_at en el pedido, la fecha del alta sale del historial.
  assert.equal(timelineSteps({ ...base, created_at: null }, [{ kind: 'created', created_at: 'C' }])[0].date, 'C');
});

test('35 · Detalle del vendedor: todo el historial tiene texto', () => {
  const kinds = ['created', 'transfer_notified', 'proof_uploaded', 'payment_rejected', 'paid', 'ready_for_pickup',
    'shipped', 'completed', 'cancelled', 'expired', 'revocation_requested', 'revocation_accepted'];
  for (const kind of kinds) {
    for (const viewer of ['buyer', 'seller']) {
      const label = eventLabel({ kind }, { viewer });
      assert.ok(label && label !== kind && !label.includes('undefined'), `${kind}/${viewer}: ${label}`);
    }
  }
  assert.equal(eventLabel({ kind: 'proof_uploaded' }, { viewer: 'seller' }), 'El comprador subió el comprobante');
  assert.equal(eventLabel({ kind: 'algo_nuevo' }), 'algo_nuevo'); // tipo desconocido: no rompe
});

test('36 · Al entregar, se pide la reseña', () => {
  assert.match(sellerWhatsappMessage({ ...paid, status: 'completed' }), /dejanos tu reseña\.$/);
  assert.equal(timelineSteps({ ...paid, status: 'completed' }).at(-1).current, true);
});

test('38 · Arrepentimiento: pedido, aceptado y en la línea de tiempo', () => {
  assert.equal(eventLabel({ kind: 'revocation_requested' }, { viewer: 'buyer' }), 'Pediste el arrepentimiento');
  assert.equal(eventLabel({ kind: 'revocation_requested' }, { viewer: 'seller' }), 'El comprador pidió el arrepentimiento');
  assert.equal(eventLabel({ kind: 'revocation_accepted', note: 'Arrepentimiento de compra aceptado' }),
    'El comercio aceptó el arrepentimiento: Arrepentimiento de compra aceptado');
  const steps = timelineSteps({ ...paid, status: 'cancelled' }, [{ kind: 'revocation_accepted', created_at: 'A' }]);
  assert.equal(steps[1].date, 'A');
});

test('B · Los pedidos con envío tienen acciones del vendedor', () => {
  const delivery = { ...paid, delivery_method: 'delivery' };
  assert.notEqual(nextSellerAction(delivery), null);
  assert.equal(nextSellerAction(delivery).label, 'Marcar despachado');
  assert.equal(nextSellerAction({ ...delivery, status: 'ready_for_pickup' }), null); // envío nunca pasa por "listo para retirar"
});

if (failed) process.exitCode = 1;

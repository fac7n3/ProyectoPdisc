// Avisos del flujo del pedido (mejoras 2, 26, 27 y 28, y arreglos E y G):
// título según quién lo recibe y link a la pantalla correcta. Los inserta el
// trigger orders_after_change (db/tests/order_flow.test.sql); acá se prueba
// cómo se muestran. `node js/notifications-utils.test.mjs`.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// notifications-utils importa el cliente de Supabase y el dropdown (DOM): en
// Node se reemplazan por un stub. cart-utils sincroniza el carrito al cargar
// si no encuentra la marca en sessionStorage.
const STUB = 'data:text/javascript,export const supabase = {}; export const buildDropdown = () => ({});';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './auth-utils.js' || specifier === './dropdown.js') return { url: STUB, shortCircuit: true };
    return next(specifier, context);
  },
});
globalThis.sessionStorage = { getItem: () => '1', setItem() {} };
const { buildNotificationTitle, buildNotificationLink } = await import('./notifications-utils.js');

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${e.message}`); }
}

const ORDER_ID = 'acb34461-f7a1-4a59-a768-eaaa0ea879ec';
const payload = { order_id: ORDER_ID, order_number: 1067, total_price: 2000, payment_method: 'transferencia', delivery_method: 'pickup' };
const n = (type, extra = {}) => ({ type, payload: { ...payload, ...extra } });
const title = (type, extra) => buildNotificationTitle(n(type, extra));
const link = (type, extra) => buildNotificationLink(n(type, extra));
const SELLER_HREF = `./vender.html?order=${ORDER_ID}#pedidos`;
const BUYER_HREF = `./perfil.html?tab=compras&order=${ORDER_ID}`;

test('2 · Recordatorio antes de que venza la transferencia', () => {
  assert.match(title('payment_due_soon', { payment_due_at: '2026-10-02T21:30:00Z' }),
    /^Tu pedido #BL-1067 vence (hoy|mañana|el \S+ \d+\/\d+) a las \d\d:\d\d: completá la transferencia$/);
  assert.equal(title('payment_due_soon'), 'Tu pedido #BL-1067 está por vencer: completá la transferencia');
  assert.equal(link('payment_due_soon').href, BUYER_HREF);
});

test('26 · El comprador recibe un aviso en cada cambio de estado', () => {
  const expected = {
    order_paid: 'Tu pago de $2.000 fue confirmado (pedido #BL-1067)',
    order_ready_for_pickup: 'Tu pedido #BL-1067 está listo para retirar',
    order_shipped: 'Tu pedido #BL-1067 está en camino',
    order_delivered: 'Tu pedido #BL-1067 fue entregado. ¡Contanos qué tal!',
    order_cancelled: 'El comercio canceló tu pedido #BL-1067',
    order_expired: 'Tu pedido #BL-1067 se canceló porque no se completó el pago',
    payment_rejected: 'El comercio no pudo confirmar tu pago del pedido #BL-1067',
    revocation_accepted: 'El comercio aceptó tu arrepentimiento del pedido #BL-1067',
  };
  for (const [type, text] of Object.entries(expected)) {
    assert.equal(title(type), text, type);
    assert.deepEqual(link(type), { href: BUYER_HREF, label: 'Ver pedido' }, type);
  }
});

test('27 · El mismo pago, un texto para cada uno (y sin número, el texto genérico)', () => {
  assert.equal(title('order_paid'), 'Tu pago de $2.000 fue confirmado (pedido #BL-1067)');
  assert.equal(title('order_paid_seller'), '¡Te pagaron el pedido #BL-1067! Ya podés prepararlo');
  assert.equal(title('order_paid', { total_price: null }), 'Tu pago del pedido #BL-1067 fue confirmado');
  // Avisos viejos, de antes de la migración 115: sin order_number en el payload.
  assert.equal(buildNotificationTitle({ type: 'order_paid', payload: { order_id: ORDER_ID } }), 'Tu pago fue confirmado');
  assert.equal(buildNotificationTitle({ type: 'tipo_desconocido', payload: {} }), 'tipo_desconocido');
});

test('27/E · Cada link lleva a la pantalla de quien lo recibe', () => {
  assert.equal(link('order_paid').href, BUYER_HREF); // comprador -> Mis compras
  assert.equal(link('order_paid_seller').href, SELLER_HREF); // vendedor -> su panel (antes iba a Mis compras)
  for (const type of ['order_created', 'transfer_notified', 'payment_proof_uploaded', 'order_cancelled_by_buyer', 'order_expired_seller', 'revocation_requested']) {
    assert.deepEqual(link(type), { href: SELLER_HREF, label: 'Ver pedido' }, type);
  }
  // Sin order_id no hay adónde ir.
  assert.equal(buildNotificationLink({ type: 'order_paid', payload: {} }), null);
});

test('28 · Vendedor: "esperando pago" no es lo mismo que "pagado"', () => {
  assert.equal(title('order_created'), 'Nuevo pedido #BL-1067: esperando la transferencia');
  assert.equal(title('order_created', { payment_method: 'efectivo' }), 'Nuevo pedido #BL-1067: se paga en efectivo, ya podés prepararlo');
  assert.equal(title('order_paid_seller'), '¡Te pagaron el pedido #BL-1067! Ya podés prepararlo');
  assert.equal(title('order_cancelled_by_buyer'), 'El comprador canceló el pedido #BL-1067');
  assert.equal(title('order_expired_seller'), 'El pedido #BL-1067 se canceló por falta de pago (el stock volvió)');
});

test('9 · Al vendedor le llega "avisó que transfirió"', () => {
  assert.equal(title('transfer_notified'), 'El comprador avisó que transfirió el pedido #BL-1067');
});

test('G · Subir el comprobante le avisa al vendedor', () => {
  assert.equal(title('payment_proof_uploaded'), 'Te mandaron el comprobante del pedido #BL-1067');
  assert.equal(link('payment_proof_uploaded').href, SELLER_HREF);
});

if (failed) process.exitCode = 1;

/**
 * Pedidos: número, estados, próximo paso, línea de tiempo, vencimiento y
 * mensajes. Lógica pura (sin DOM ni Supabase) compartida por el panel del
 * vendedor, "Mis compras", el carrito y el repartidor, para que todas las
 * pantallas digan lo mismo del mismo pedido. Tests: `node js/order-utils.test.mjs`.
 *
 * El flujo vive en la base (migración 115): advance_order_status,
 * cancel_order, reject_transfer_payment, etc. Acá solo se decide qué mostrar.
 */

export const ORDER_STATUS_LABELS = {
  pending: 'Pendiente',
  paid: 'Pagado',
  ready_for_pickup: 'Listo para retirar',
  shipped: 'En camino',
  completed: 'Entregado',
  cancelled: 'Cancelado',
};

export const PAYMENT_METHOD_LABELS = {
  mercadopago: 'Mercado Pago',
  transferencia: 'Transferencia',
  simulado: 'Pago simulado',
};

export const DELIVERY_METHOD_LABELS = {
  pickup: 'Retiro en el local',
  delivery: 'Envío a domicilio',
};

export const PAYMENT_REJECT_REASONS = [
  'No me llegó la transferencia',
  'El monto no coincide',
  'El comprobante no es válido',
];

export const SELLER_CANCEL_REASONS = [
  'No tengo stock',
  'El comprador me pidió cancelar',
  'No pude contactar al comprador',
  'El comprador no vino a retirar',
];

const TZ = 'America/Argentina/Buenos_Aires';

/** "BL-1066", para el motivo de la transferencia. Sin número (pedido viejo o dato faltante): el prefijo del uuid. */
export function orderRef(order) {
  if (order?.order_number) return `BL-${order.order_number}`;
  return String(order?.id || order?.order_id || '').split('-')[0].toUpperCase();
}

/** "#BL-1066": el número que ven comprador, vendedor, repartidor y admin. */
export function orderLabel(order) {
  return `#${orderRef(order)}`;
}

/** ¿El comercio ya puede prepararlo? Solo cuando el pago está acreditado. */
export function canPrepare(order) {
  return order.status === 'paid';
}

/** Pedido por transferencia que todavía espera la plata. */
export function awaitingTransfer(order) {
  return order.payment_method === 'transferencia' && order.payment_status === 'pending' && order.status === 'pending';
}

/** Pedido por Mercado Pago que el comprador todavía puede pagar. */
export function awaitingMercadoPago(order) {
  return order.payment_method === 'mercadopago' && order.payment_status === 'pending' && order.status === 'pending';
}

/** El comprador avisó que pagó (botón "Ya transferí" o comprobante sin revisar). */
export function buyerSaysPaid(order) {
  return Boolean(order.transfer_notified_at)
    || (order.payment_proofs || []).some((p) => p.status === 'pending');
}

/**
 * El botón principal del vendedor en la tarjeta, o null si no le toca nada.
 * Con un repartidor asignado no hay paso: lo avanza él.
 * @returns {{ status: string, label: string, icon: string, needsCode?: boolean } | null}
 */
export function nextSellerAction(order, { hasCourier = false } = {}) {
  if (hasCourier || order.status === 'completed' || order.status === 'cancelled') return null;
  const deliverLabel = 'Marcar entregado';

  if (order.delivery_method === 'delivery') {
    if (canPrepare(order)) return { status: 'shipped', label: 'Marcar despachado', icon: 'fa-truck' };
    if (order.status === 'shipped') return { status: 'completed', label: deliverLabel, icon: 'fa-circle-check', needsCode: true };
    return null;
  }
  if (canPrepare(order)) return { status: 'ready_for_pickup', label: 'Marcar listo para retirar', icon: 'fa-box' };
  if (order.status === 'ready_for_pickup') return { status: 'completed', label: deliverLabel, icon: 'fa-circle-check', needsCode: true };
  return null;
}

/** ¿Tiene sentido mostrarle al comprador el código de retiro y el QR? */
export function showsPickupCode(order) {
  return canPrepare(order) || order.status === 'ready_for_pickup' || order.status === 'shipped';
}

/**
 * Pasos de la línea de tiempo (Pedido hecho → Pagado → Listo/En camino →
 * Entregado), con su fecha si ya pasó. Cancelado: dos.
 * @param {object} order
 * @param {{ kind: string, created_at: string }[]} events historial (order_events)
 * @returns {{ key: string, label: string, done: boolean, current: boolean, date: string|null }[]}
 */
export function timelineSteps(order, events = []) {
  const at = (...kinds) => events.find((e) => kinds.includes(e.kind))?.created_at || null;
  const delivery = order.delivery_method === 'delivery';

  if (order.status === 'cancelled') {
    return [
      { key: 'created', label: 'Pedido hecho', done: true, current: false, date: order.created_at || at('created') },
      { key: 'cancelled', label: 'Cancelado', done: true, current: true, date: at('cancelled', 'expired', 'revocation_accepted') },
    ];
  }

  const rank = { pending: 0, paid: 1, ready_for_pickup: 2, shipped: 2, completed: 3 }[order.status] ?? 0;
  const prepared = { key: 'prepared', label: delivery ? 'En camino' : 'Listo para retirar', done: rank >= 2, date: at(delivery ? 'shipped' : 'ready_for_pickup') };
  const steps = [
    { key: 'created', label: 'Pedido hecho', done: true, date: order.created_at || at('created') },
    { key: 'paid', label: 'Pago confirmado', done: order.payment_status === 'paid' || rank >= 1, date: at('paid') },
    prepared,
    { key: 'completed', label: 'Entregado', done: rank >= 3, date: at('completed') },
  ];

  const firstPending = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({ ...s, current: firstPending === -1 ? i === steps.length - 1 : i === firstPending }));
}

const EVENT_LABELS = {
  created: 'Pedido hecho',
  transfer_notified: { buyer: 'Avisaste que transferiste', seller: 'El comprador avisó que transfirió' },
  proof_uploaded: { buyer: 'Subiste el comprobante', seller: 'El comprador subió el comprobante' },
  payment_rejected: 'El comercio no pudo confirmar el pago',
  paid: 'Pago confirmado',
  ready_for_pickup: 'Listo para retirar',
  shipped: 'Despachado',
  completed: 'Entregado',
  cancelled: 'Cancelado',
  expired: 'Se venció el plazo para pagar',
  revocation_requested: { buyer: 'Pediste el arrepentimiento', seller: 'El comprador pidió el arrepentimiento' },
  revocation_accepted: 'El comercio aceptó el arrepentimiento',
};

/** Texto de un evento del historial, según quién lo mira. Incluye el motivo si lo hay. */
export function eventLabel(event, { viewer = 'buyer' } = {}) {
  const entry = EVENT_LABELS[event.kind];
  let label = typeof entry === 'object' && entry ? entry[viewer] : entry || event.kind;
  if (event.kind === 'cancelled' && event.actor === 'buyer') label = viewer === 'buyer' ? 'Lo cancelaste' : 'El comprador lo canceló';
  return event.note ? `${label}: ${event.note}` : label;
}

function ymd(date) {
  return date.toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * "hoy a las 18:30", "mañana a las 09:00" o "el jueves 3/10 a las 18:30".
 * Siempre en hora de Argentina, sin importar dónde corra.
 */
export function formatDueDate(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  const dayDiff = Math.round((Date.parse(ymd(d)) - Date.parse(ymd(now))) / 86400000);
  if (dayDiff === 0) return `hoy a las ${time}`;
  if (dayDiff === 1) return `mañana a las ${time}`;
  const weekday = d.toLocaleDateString('es-AR', { timeZone: TZ, weekday: 'long' });
  const dm = d.toLocaleDateString('es-AR', { timeZone: TZ, day: 'numeric', month: 'numeric' });
  return `el ${weekday} ${dm} a las ${time}`;
}

/**
 * Número de WhatsApp (wa.me) a partir de un celular argentino como lo carga
 * cualquiera: "3329 45-6789", "03329 15 456789", "+54 9 3329 456789". Sin
 * código de área se asume Baradero (3329), que es donde vive el comercio.
 * @returns {string|null} "5493329456789" o null si no se puede armar.
 */
export function toWhatsappNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) {
    d = d.slice(2);
    if (d.startsWith('9')) d = d.slice(1);
  }
  if (d.startsWith('0')) d = d.slice(1);
  // El "15" de los celulares va entre el código de área (2 a 4 dígitos) y el número.
  if (d.length === 12) {
    const i = [4, 3, 2].find((pos) => d.slice(pos, pos + 2) === '15');
    if (i !== undefined) d = d.slice(0, i) + d.slice(i + 2);
  }
  if (d.length === 8 && d.startsWith('15')) d = `3329${d.slice(2)}`;
  if (d.length === 6) d = `3329${d}`;
  return d.length === 10 ? `549${d}` : null;
}

/** Mensaje prellenado del vendedor al comprador, según en qué va el pedido. */
export function sellerWhatsappMessage(order, { storeName = '', buyerName = '' } = {}) {
  const first = String(buyerName || '').trim().split(/\s+/)[0];
  const hi = first ? `Hola ${first}!` : 'Hola!';
  const from = storeName ? ` Te escribo de ${storeName}` : ' Te escribo';
  const intro = `${hi}${from} por tu pedido ${orderLabel(order)} de Baradero Local.`;

  if (order.status === 'cancelled') return `${intro}`;
  if (order.status === 'completed') return `${intro} ¡Gracias por tu compra! Si podés, dejanos tu reseña.`;
  if (order.status === 'ready_for_pickup') {
    return `${intro} Ya está listo para retirar. Traé el código de retiro que ves en "Mis compras".`;
  }
  if (order.status === 'shipped') return `${intro} Ya salió para tu domicilio.`;
  if (awaitingTransfer(order)) return `${intro} ¿Pudiste hacer la transferencia?`;
  return `${intro} Ya lo estamos preparando.`;
}

/**
 * Lo que lleva el QR del comprador: el link al panel del vendedor con el
 * pedido y el código. El vendedor lo escanea con la cámara del celular (sin
 * app aparte) y el panel le ofrece marcarlo entregado.
 */
export function deliveryQrUrl(origin, order, code) {
  const url = new URL('/pages/vender.html', origin);
  url.searchParams.set('entregar', order.id);
  url.searchParams.set('codigo', code);
  url.hash = 'pedidos';
  return url.toString();
}

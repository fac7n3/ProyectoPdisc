// Carrito con varios comercios y Mercado Pago: un pago por comercio, en cadena.
// Mercado Pago cobra con un solo access_token por pago (un comercio), así que
// create_order arma un pedido por comercio y el cliente los paga uno detrás del
// otro: carrito.js manda al primero, y al volver de cada pago "Mis compras"
// (perfil.js) ofrece el siguiente. Sin estado guardado en el navegador: lo que
// falta pagar se deduce de los pedidos pendientes.
import { awaitingMercadoPago } from './order-utils.js';

/**
 * Pedidos de la MISMA compra que el cliente todavía tiene que pagar con Mercado Pago.
 * create_order crea todos los pedidos de una compra en una sola transacción, así que
 * comparten `created_at` exacto: eso los distingue de otro pendiente viejo del mismo
 * cliente. Salen en un orden fijo (por nombre del comercio) para que el "siguiente"
 * no cambie entre una recarga y otra.
 * @param {Array<{id: string, created_at: string, stores?: {name?: string}}>} orders pedidos del cliente
 * @param {string[]} paidOrderIds los que se acaban de pagar (external_reference de la vuelta)
 */
export function pendingChainOrders(orders, paidOrderIds) {
  const stamps = new Set(
    orders.filter((o) => paidOrderIds.includes(o.id)).map((o) => o.created_at),
  );
  return orders
    .filter((o) => !paidOrderIds.includes(o.id) && stamps.has(o.created_at) && awaitingMercadoPago(o))
    .sort((a, b) => (a.stores?.name || '').localeCompare(b.stores?.name || '', 'es') || a.id.localeCompare(b.id));
}

/**
 * ¿Puede pagarse todo el carrito con Mercado Pago? Solo si TODOS los comercios
 * vincularon su cuenta (los que no, cobran por transferencia o efectivo).
 * @param {string[]} storeIds comercios del carrito
 * @param {Map<string, boolean>} linkedByStore
 */
export function allStoresAcceptMp(storeIds, linkedByStore) {
  return storeIds.length > 0 && storeIds.every((id) => linkedByStore.get(id) === true);
}

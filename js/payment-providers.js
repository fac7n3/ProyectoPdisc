// F2-03 (A113-175): interfaz PaymentProvider.
// Cada provider expone la misma forma: { name, pay(orderIds) }, donde pay()
// devuelve { success, message? }. Así carrito.js no necesita saber nada
// del método de pago elegido — solo pide el provider correcto y lo llama.
// Un provider nuevo se agrega acá sin tocar el resto del checkout.

import { supabase } from './auth-utils.js';

const simuladoProvider = {
  name: 'simulado',
  /**
   * Confirma el pago simulado de una o más órdenes (una por tienda si el
   * carrito tenía productos de varios comercios).
   * @param {string[]} orderIds
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async pay(orderIds) {
    const results = await Promise.all(
      orderIds.map((id) => supabase.rpc('confirm_simulated_payment', { p_order_id: id }))
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      return { success: false, message: failed.error.message };
    }
    return { success: true };
  },
};

const transferenciaProvider = {
  name: 'transferencia',
  /**
   * A diferencia de "simulado", acá no hay nada que confirmar en el momento:
   * la orden queda pending hasta que el cliente sube el comprobante (desde
   * "Mis compras", perfil.js) y el vendedor lo confirma
   * (confirm_transfer_payment, F2-04). pay() no llama a nada — solo le avisa
   * a carrito.js que el pago quedó pendiente para que muestre el mensaje
   * correcto en vez de "¡pagado!".
   * @returns {Promise<{success: boolean, pending: boolean}>}
   */
  async pay() {
    return { success: true, pending: true };
  },
};

const efectivoProvider = {
  name: 'efectivo',
  /**
   * Efectivo al retirar o al recibir: no hay nada que pagar ahora. El
   * comercio ya puede preparar el pedido y lo marca cobrado al entregarlo
   * (advance_order_status, migración 115).
   * @returns {Promise<{success: boolean, pending: boolean}>}
   */
  async pay() {
    return { success: true, pending: true };
  },
};

/**
 * @param {string} method - 'simulado' | 'transferencia' | 'efectivo'
 * @returns {{name: string, pay: (orderIds: string[]) => Promise<{success: boolean, pending?: boolean, message?: string}>}}
 */
export function getPaymentProvider(method) {
  switch (method) {
    case 'simulado':
      return simuladoProvider;
    case 'transferencia':
      return transferenciaProvider;
    case 'efectivo':
      return efectivoProvider;
    default:
      throw new Error(`Método de pago no soportado todavía: ${method}`);
  }
}

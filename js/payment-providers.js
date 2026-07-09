// F2-03 (A113-175): interfaz PaymentProvider.
// Cada provider expone la misma forma: { name, pay(orderIds) }, donde pay()
// devuelve { success, message? }. Así carrito.js no necesita saber nada
// del método de pago elegido — solo pide el provider correcto y lo llama.
// Providers futuros (F2-04 transferencia, F2-07 MercadoPago) se agregan acá
// sin tocar el resto del checkout.

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

/**
 * @param {string} method - 'simulado' | 'transferencia' | 'mercadopago'
 * @returns {{name: string, pay: (orderIds: string[]) => Promise<{success: boolean, message?: string}>}}
 */
export function getPaymentProvider(method) {
  switch (method) {
    case 'simulado':
      return simuladoProvider;
    default:
      throw new Error(`Método de pago no soportado todavía: ${method}`);
  }
}

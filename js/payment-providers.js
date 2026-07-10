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

const mercadopagoProvider = {
  name: 'mercadopago',
  /**
   * A diferencia de simulado/transferencia, acá no hay nada que confirmar en
   * el cliente: mp-create-preference (Edge Function) arma el checkout
   * hospedado de Mercado Pago y esta función redirige el navegador ahí. La
   * confirmación real llega después por webhook (mp-webhook, server-side)
   * cuando Mercado Pago efectivamente acredita el pago — carrito.js no debe
   * mostrar "¡pagado!", la orden queda pending hasta que llegue el webhook.
   * @returns {Promise<{success: boolean, message?: string, redirecting?: boolean}>}
   */
  async pay(orderIds) {
    const { data, error } = await supabase.functions.invoke('mp-create-preference', {
      body: { order_ids: orderIds },
    });
    if (error || !data || data.error) {
      return { success: false, message: data?.error || error?.message || 'No se pudo iniciar el pago con Mercado Pago.' };
    }
    // Con el modelo actual de MP (credenciales de prueba + usuario comprador
    // de prueba, no el viejo sandbox separado) el link correcto es init_point;
    // sandbox_init_point queda de respaldo por si la cuenta todavía lo usa.
    const redirectUrl = data.init_point || data.sandbox_init_point;
    if (!redirectUrl) {
      return { success: false, message: 'Mercado Pago no devolvió un link de pago.' };
    }
    window.location.href = redirectUrl;
    return { success: true, redirecting: true };
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

/**
 * @param {string} method - 'simulado' | 'transferencia' | 'mercadopago'
 * @returns {{name: string, pay: (orderIds: string[]) => Promise<{success: boolean, pending?: boolean, redirecting?: boolean, message?: string}>}}
 */
export function getPaymentProvider(method) {
  switch (method) {
    case 'simulado':
      return simuladoProvider;
    case 'transferencia':
      return transferenciaProvider;
    case 'mercadopago':
      return mercadopagoProvider;
    default:
      throw new Error(`Método de pago no soportado todavía: ${method}`);
  }
}

// Qué productos mira la persona, guardado en este navegador (localStorage), para
// armar "Productos recomendados" del inicio. La lógica de pesos y reparto está
// en interests-utils.js. Nada acá puede romper la página: sin localStorage
// (ventana privada, bloqueado) simplemente no se recuerda nada.
import { VIEWED_KEY, addView, normalizeViews } from './interests-utils.js';

export function loadViewedProducts() {
  try {
    return normalizeViews(JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]'));
  } catch {
    return [];
  }
}

/** Anota que la persona abrió el detalle de este producto. */
export function rememberViewedProduct(productId) {
  if (!productId) return;
  try {
    localStorage.setItem(VIEWED_KEY, JSON.stringify(addView(loadViewedProducts(), productId, Date.now())));
  } catch {
    // sin almacenamiento, no se recuerda
  }
}

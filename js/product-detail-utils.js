/**
 * product-detail-utils.js — Pedido del detalle de un producto (modal de
 * producto + producto.html).
 *
 * Lógica pura, sin DOM ni supabase: `rpc` y `legacy` se inyectan, así se puede
 * correr con `node js/product-detail-utils.test.mjs`. El cableado real a
 * Supabase vive en js/product-detail-api.js.
 *
 * Por qué existe: apretar un producto tardaba mucho. El modal armaba el
 * detalle con una consulta con joins anidados que, con las policies de RLS
 * encadenadas, le costaba ~1 s a la base (p95 ~5 s) más 3 pedidos de red.
 * La migración 118 (get_product_detail) lo resuelve en una sola consulta que
 * tarda unos pocos ms. Ver db/schema/118_get_product_detail_rpc.sql.
 *
 * Dos cosas que hace este módulo:
 *
 * 1. **Respaldo si la función todavía no está en la base.** Si PostgREST dice
 *    que `get_product_detail` no existe (la 118 sin aplicar), se usan las
 *    consultas de siempre y se acuerda de no volver a probar el RPC en cada
 *    click. Así el orden de publicación (código vs. migración) no importa.
 *
 * 2. **Pedido adelantado.** Cuando el mouse se queda sobre una tarjeta (o se
 *    apoya el dedo), se pide el detalle sin esperar el click; el click lo
 *    consume una sola vez. La entrada vence a los 15 s y se descarta si falla:
 *    nada de datos viejos (stock, precio) dando vueltas ni de errores
 *    pegados. Solo se adelanta por la función nueva: si falta en la base, no
 *    se adelanta nada (el respaldo es la consulta pesada y no conviene
 *    dispararla por cada tarjeta que alguien frena con el mouse).
 */

/** Cuánto espera un pedido adelantado a que lo consuma un click. */
export const PREFETCH_TTL_MS = 15000;

/**
 * ¿Es el error de "esa función no existe en la base"? PostgREST responde
 * PGRST202 (HTTP 404) cuando una función no está en su schema cache; 42883 es
 * el `undefined_function` de Postgres, por si llegara directo.
 */
export function isMissingFunctionError(error) {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  return /could not find the function/i.test(String(error.message || ''));
}

/** Error de "no existe o no lo podés ver": el modal lo muestra como cualquier otro fallo. */
function notFoundError() {
  const err = new Error('Producto no encontrado');
  err.code = 'PRODUCT_NOT_FOUND';
  return err;
}

/**
 * @param {object} deps
 * @param {(productId: string) => Promise<object|null>} deps.rpc
 *   Llama a get_product_detail. Devuelve el objeto, `null` si no existe o no es
 *   visible, y TIRA si hay un error de la API.
 * @param {(productId: string) => Promise<object|null>} deps.legacy
 *   Las consultas de siempre, mismo formato de salida que el RPC. Solo se usa
 *   si la función no existe en la base.
 * @param {() => number} [deps.now]
 * @param {number} [deps.ttlMs]
 * @returns {{ fetch: (productId: string) => Promise<object>, prefetch: (productId: string) => void }}
 */
export function createProductDetailFetcher({ rpc, legacy, now = Date.now, ttlMs = PREFETCH_TTL_MS }) {
  let rpcMissing = false;
  /** productId -> { promise, at } */
  const early = new Map();

  /**
   * `adelantado`: lo pide el hover/toque, no un click. Ese pedido solo vale la
   * pena por la vía barata: las consultas de respaldo son las pesadas (~1 s de
   * base cada una), y dispararlas por cada tarjeta que alguien frena con el
   * mouse empeoraría justo la saturación que esto viene a curar.
   */
  async function load(productId, { adelantado = false } = {}) {
    let detail;
    if (!rpcMissing) {
      try {
        detail = await rpc(productId);
      } catch (err) {
        // Cualquier otro error (red, 500) se propaga: reintentar por la vía
        // vieja duplicaría la espera, y lo más probable es que falle igual.
        if (!isMissingFunctionError(err)) throw err;
        rpcMissing = true;
        if (adelantado) throw err; // el click se encarga, por el respaldo
        detail = await legacy(productId);
      }
    } else {
      detail = await legacy(productId);
    }
    if (!detail) throw notFoundError();
    return detail;
  }

  const isFresh = (entry) => !!entry && now() - entry.at < ttlMs;

  function prefetch(productId) {
    // Sin la función en la base no hay vía barata: no se adelanta nada.
    if (!productId || rpcMissing) return;
    // Barrido de lo vencido, para que el mapa no crezca con cada tarjeta que
    // alguien pasó con el mouse y nunca abrió.
    for (const [id, entry] of early) {
      if (!isFresh(entry)) early.delete(id);
    }
    if (early.has(productId)) return;

    const entry = { promise: load(productId, { adelantado: true }), at: now() };
    // Un pedido adelantado que falla no se guarda: el click lo reintenta. (El
    // .catch también evita el aviso de "unhandled rejection" si nadie lo usa.)
    entry.promise.catch(() => {
      if (early.get(productId) === entry) early.delete(productId);
    });
    early.set(productId, entry);
  }

  function fetchDetail(productId) {
    const entry = early.get(productId);
    early.delete(productId); // se consume una sola vez
    return isFresh(entry) ? entry.promise : load(productId);
  }

  return { fetch: fetchDetail, prefetch };
}

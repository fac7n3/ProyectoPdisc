// Lógica pura (sin DOM ni Supabase) de los combos de "Impulsá tus ventas".
// Correr los tests con `node js/boost-utils.test.mjs`.
//
// El estado de un combo viaja en `boost_purchases` (migración 131): `active`
// con `ends_at` en el pasado es un combo VENCIDO (no hay un estado guardado
// para eso, así que acá siempre se compara contra la hora).

/** Una compra `pending` más vieja que esto se considera abandonada. */
export const PENDING_WINDOW_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Servicios que son un banner del inicio (hay que asignarles el espacio a mano). */
export const BANNER_SERVICE_IDS = ['banner_chico', 'banner_mediano', 'banner_grande'];

/**
 * @param {Array<{plan_id:string,status:string,starts_at?:string|null,ends_at?:string|null,created_at:string}>} purchases
 * @param {number} [nowMs]
 * @returns {{ active: null | { planId:string, endsAt:Date, daysLeft:number },
 *             pending: boolean, needsReview: boolean }}
 */
export function describeBoostState(purchases, nowMs = Date.now()) {
  let active = null;
  let pending = false;
  let needsReview = false;

  for (const p of purchases || []) {
    // Las compras de servicios sueltos (sin plan_id) no son un plan: van aparte.
    if (!p.plan_id) continue;
    if (p.status === 'active' && p.starts_at && p.ends_at) {
      const start = new Date(p.starts_at).getTime();
      const end = new Date(p.ends_at).getTime();
      if (nowMs >= start && nowMs < end && (!active || end > active.endsAt.getTime())) {
        active = { planId: p.plan_id, endsAt: new Date(end), daysLeft: Math.max(1, Math.ceil((end - nowMs) / DAY_MS)) };
      }
    } else if (p.status === 'pending') {
      if (nowMs - new Date(p.created_at).getTime() < PENDING_WINDOW_MS) pending = true;
    } else if (p.status === 'needs_review') {
      needsReview = true;
    }
  }
  return { active, pending, needsReview };
}

/**
 * Qué muestra el botón de cada combo según el estado.
 *  - sin combo vigente: "Elegir este combo"
 *  - mismo combo vigente: "Renovar" (la base lo suma a continuación del actual)
 *  - otro combo vigente: deshabilitado (create_boost_purchase también lo rechaza)
 * @returns {{ label: string, disabled: boolean, hint: string|null }}
 */
export function planAction(planId, state) {
  const { active } = state;
  if (!active) return { label: 'Elegir este combo', disabled: false, hint: null };
  if (active.planId === planId) return { label: 'Renovar 30 días más', disabled: false, hint: 'Tu combo actual' };
  return { label: 'Elegir este combo', disabled: true, hint: 'Podés cambiarlo cuando termine el actual' };
}

/** 'DD/MM/YYYY' en hora de Argentina (no la del navegador: evita que cambie el día). */
export function formatBoostDate(date) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
}

/**
 * Mensaje para volver de Mercado Pago (`?boost=success|pending|failure`).
 * @returns {{ message: string, tone: 'success'|'error', poll: boolean } | null}
 */
export function boostReturnMessage(param) {
  switch (param) {
    case 'success':
      return { message: 'Recibimos tu pago. En un momento activamos tu combo.', tone: 'success', poll: true };
    case 'pending':
      return { message: 'Tu pago está pendiente de acreditación. Cuando se acredite activamos tu combo.', tone: 'success', poll: true };
    case 'failure':
      return { message: 'No se completó el pago del combo. No se te cobró nada.', tone: 'error', poll: false };
    default:
      return null;
  }
}


// ---------------------------------------------------------------------------
// Servicios individuales y planes con composición (migración 160)
// ---------------------------------------------------------------------------

/** Etiqueta del tipo de servicio (`boost_services.kind`). */
export const SERVICE_KIND_LABEL = {
  banner: 'Banner', social: 'Difusión', products: 'Productos',
  ranking: 'Búsquedas', profile: 'Perfil', stats: 'Métricas',
};

/** Qué incluye un plan: [{ id, name, quantity, price }] en el orden del catálogo. */
export function planBreakdown(planId, items, services) {
  const byId = new Map((services || []).map((s) => [s.id, s]));
  return (items || [])
    .filter((it) => it.plan_id === planId && byId.has(it.service_id))
    .map((it) => {
      const sv = byId.get(it.service_id);
      return { id: sv.id, name: sv.name, quantity: it.quantity, price: sv.price, sort: sv.sort_order ?? 0 };
    })
    .sort((a, b) => a.sort - b.sort)
    .map(({ sort, ...rest }) => rest);
}

/**
 * Precio de los servicios del plan comprados por separado y cuánto se ahorra
 * con el plan. `savings` nunca es negativo; `percent` va redondeado.
 */
export function planSavings(plan, items, services) {
  const listPrice = planBreakdown(plan.id, items, services)
    .reduce((sum, it) => sum + it.price * it.quantity, 0);
  const savings = Math.max(0, listPrice - plan.price);
  return { listPrice, savings, percent: listPrice > 0 ? Math.round((savings / listPrice) * 100) : 0 };
}

/** Pasa las filas de get_store_benefits a { service_id: unidades vigentes }. */
export function holdingsMap(rows) {
  const out = {};
  for (const r of rows || []) out[r.service_id] = r.held ?? 0;
  return out;
}

/**
 * Cuánto puede comprar el comercio de un servicio, dado lo que ya tiene vigente.
 * @returns {{ held:number, max:number|null, remaining:number|null, canBuy:boolean, maxQty:number }}
 *   `maxQty` es el tope del selector de cantidad (10 si el servicio no tiene tope).
 */
export function serviceAvailability(service, held = 0) {
  const max = service.max_per_store ?? null;
  const remaining = max == null ? null : Math.max(0, max - held);
  const canBuy = max == null || remaining > 0;
  return { held, max, remaining, canBuy, maxQty: max == null ? 10 : Math.max(1, remaining) };
}

/** Texto corto de "cuántos tenés": "Tenés 1 de 2" / "Tenés 3 (sin tope)". */
export function holdingLabel(service, held = 0) {
  const { max, remaining } = serviceAvailability(service, held);
  if (max == null) return held > 0 ? `Tenés ${held} · sin tope por comercio` : 'Sin tope por comercio';
  if (remaining === 0) return `Tenés ${held} de ${max} · máximo alcanzado`;
  return `Tenés ${held} de ${max} · podés sumar ${remaining}`;
}

/** Líneas de "Límites" de un servicio, sacadas de los datos (no de texto escrito a mano). */
export function serviceLimitLines(service) {
  const lines = [];
  lines.push(service.max_per_store == null
    ? 'Sin tope de unidades por comercio.'
    : `Máximo ${service.max_per_store} ${service.max_per_store === 1 ? 'unidad vigente' : 'unidades vigentes'} a la vez por comercio (cuentan las que vienen dentro de un plan).`);
  if (service.slot_note) lines.push(service.slot_note);
  lines.push(`Dura ${service.duration_days} días desde que se acredita el pago.`);
  return lines;
}

/** Costo por día, redondeado ("$200 por día"). */
export function pricePerDay(price, days) {
  return days > 0 ? Math.round(price / days) : price;
}

/**
 * Planes que traen este servicio, con lo que se ahorra comprando el plan.
 * @returns {Array<{ id:string, name:string, quantity:number, savings:number }>}
 */
export function plansIncluding(serviceId, plans, items, services) {
  return (plans || [])
    .map((plan) => {
      const it = (items || []).find((x) => x.plan_id === plan.id && x.service_id === serviceId);
      return it ? { id: plan.id, name: plan.name, quantity: it.quantity, savings: planSavings(plan, items, services).savings } : null;
    })
    .filter(Boolean);
}

/**
 * Servicios sueltos vigentes (los regalados también): [{ serviceId, quantity, endsAt }].
 */
export function activeServicePurchases(purchases, nowMs = Date.now()) {
  const out = [];
  for (const p of purchases || []) {
    if (!p.service_id || p.status !== 'active' || !p.starts_at || !p.ends_at) continue;
    const start = new Date(p.starts_at).getTime();
    const end = new Date(p.ends_at).getTime();
    if (nowMs >= start && nowMs < end) out.push({ serviceId: p.service_id, quantity: p.quantity ?? 1, endsAt: new Date(end) });
  }
  return out;
}

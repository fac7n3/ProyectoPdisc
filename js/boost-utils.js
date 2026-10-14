// Lógica pura (sin DOM ni Supabase) de los combos de "Impulsá tus ventas".
// Correr los tests con `node js/boost-utils.test.mjs`.
//
// El estado de un combo viaja en `boost_purchases` (migración 131): `active`
// con `ends_at` en el pasado es un combo VENCIDO (no hay un estado guardado
// para eso, así que acá siempre se compara contra la hora).

/** Una compra `pending` más vieja que esto se considera abandonada. */
export const PENDING_WINDOW_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Ids de combos que incluyen un banner del inicio (hay que asignarles el espacio a mano). */
export const PLANS_WITH_BANNER = ['barrio', 'baradero'];

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

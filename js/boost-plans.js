// Combos para "Impulsar tus ventas" (panel de vendedor, sección `impulsar`).
//
// Tres combos acumulativos: cada uno incluye todo lo del anterior y suma algo.
// Los beneficios son los espacios reales del inicio (pages/home.html):
//   - fila    -> carrusel "Locales destacados", debajo del banner principal
//   - mosaico -> uno de los banners chicos del mosaico de promociones
//   - orden   -> los productos salen más arriba que los de otros comercios
//   - banner  -> banner principal (hero) del inicio
// La fila y el orden son automáticos mientras el combo esté vigente (home.js
// lee get_active_boosts). Los banners los asigna el equipo (home_promos): el
// comercio carga la imagen en "Banner del inicio".
//
// El PRECIO y el NOMBRE salen de la tabla boost_plans (migración 131), nunca de
// acá: es lo mismo que cobra la Edge Function, así que la pantalla no puede
// mostrar un monto distinto al que se paga. Acá solo viven los textos.

import { planAction } from './boost-utils.js';

const BANNER_NOTE = ' Cargás la imagen en "Banner del inicio" y el equipo te asigna el lugar.';

const PLAN_COPY = {
  local: {
    tagline: 'Que te vean apenas entran al inicio.',
    perks: [
      'Tu comercio aparece en la fila de locales destacados, justo debajo del banner del inicio.',
    ],
  },
  barrio: {
    tagline: 'Más lugares donde te encuentren y tus productos primero.',
    featured: true,
    includes: 'Todo lo del Combo Local, más:',
    perks: [
      `Una imagen o publicidad de tu comercio en uno de los banners chicos del inicio.${BANNER_NOTE}`,
      'Tus productos aparecen más arriba que los de otros comercios.',
    ],
  },
  baradero: {
    tagline: 'Toda la vidriera del inicio para tu comercio.',
    includes: 'Todo lo del Combo Barrio, más:',
    perks: [
      `Una imagen o publicidad de tu comercio en el banner principal del inicio.${BANNER_NOTE}`,
    ],
  },
};

/**
 * Dibuja la grilla de combos dentro de `container`.
 * @param {HTMLElement} container
 * @param {Array<{id:string,name:string,price:number,duration_days:number}>} plans filas de boost_plans, ya ordenadas
 * @param {ReturnType<import('./boost-utils.js').describeBoostState>} state
 * @param {(plan: {id:string,name:string,price:number,duration_days:number}) => void} onChoose
 * @param {(price: number) => string} formatPrice
 */
export function renderBoostPlans(container, plans, state, onChoose, formatPrice) {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const grid = el('div', 'bp-grid');
  plans.forEach((plan) => {
    const copy = PLAN_COPY[plan.id] || { tagline: '', perks: [] };
    const action = planAction(plan.id, state);
    const isCurrent = state.active?.planId === plan.id;

    const card = el('article', copy.featured ? 'bp-card bp-card--featured' : 'bp-card');
    card.dataset.plan = plan.id;
    if (isCurrent) card.appendChild(el('span', 'bp-card__badge', 'Tu combo actual'));
    else if (copy.featured) card.appendChild(el('span', 'bp-card__badge', 'El más elegido'));

    card.appendChild(el('h3', 'bp-card__name', plan.name));
    card.appendChild(el('p', 'bp-card__tagline', copy.tagline));

    const priceBox = el('div', 'bp-card__price');
    priceBox.appendChild(el('span', 'bp-card__amount', formatPrice(plan.price)));
    priceBox.appendChild(el('span', 'bp-card__per', `por ${plan.duration_days} días`));
    card.appendChild(priceBox);

    const btn = el('button', 'bp-card__btn', action.label);
    btn.type = 'button';
    btn.disabled = action.disabled;
    if (action.disabled) btn.title = action.hint || '';
    btn.addEventListener('click', () => onChoose(plan));
    card.appendChild(btn);
    if (action.disabled && action.hint) card.appendChild(el('p', 'bp-card__hint', action.hint));

    if (copy.includes) card.appendChild(el('p', 'bp-card__includes', copy.includes));
    const list = el('ul', 'bp-card__perks');
    copy.perks.forEach((perk) => list.appendChild(el('li', null, perk)));
    card.appendChild(list);

    grid.appendChild(card);
  });

  container.replaceChildren(grid);
}

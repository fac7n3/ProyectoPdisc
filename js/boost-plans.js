// Combos para "Impulsar tus ventas" (panel de vendedor, sección `impulsar`).
//
// Tres combos acumulativos: cada uno incluye todo lo del anterior y suma algo.
// Los beneficios son los espacios reales del inicio (pages/home.html):
//   - "fila"    -> carrusel "Locales destacados", debajo del banner principal
//   - "banner"  -> banner principal (hero) del inicio
//   - "mosaico" -> uno de los banners chicos del mosaico de promociones
//   - "orden"   -> los productos salen más arriba que los de otros comercios
//
// PRECIOS: son valores de arranque (pesos enteros, por mes). Para cambiarlos
// alcanza con editar `price` acá; la pantalla no los repite en ningún otro lado.

export const BOOST_PLANS = [
  {
    id: 'local',
    name: 'Combo Local',
    tagline: 'Que te vean apenas entran al inicio.',
    price: 9900,
    perks: [
      'Tu comercio aparece en la fila de locales destacados, justo debajo del banner del inicio.',
    ],
  },
  {
    id: 'barrio',
    name: 'Combo Barrio',
    tagline: 'Más lugares donde te encuentren y tus productos primero.',
    price: 19900,
    featured: true,
    includes: 'Todo lo del Combo Local, más:',
    perks: [
      'Una imagen o publicidad de tu comercio en uno de los banners chicos del inicio.',
      'Tus productos aparecen más arriba que los de otros comercios.',
    ],
  },
  {
    id: 'baradero',
    name: 'Combo Baradero',
    tagline: 'Toda la vidriera del inicio para tu comercio.',
    price: 34900,
    includes: 'Todo lo del Combo Barrio, más:',
    perks: [
      'Una imagen o publicidad de tu comercio en el banner principal del inicio.',
    ],
  },
];

/**
 * Dibuja la grilla de combos dentro de `container`.
 * @param {HTMLElement} container
 * @param {(plan: typeof BOOST_PLANS[number]) => void} onChoose se llama al tocar "Elegir este combo"
 * @param {(price: number) => string} formatPrice
 */
export function renderBoostPlans(container, onChoose, formatPrice) {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const grid = el('div', 'bp-grid');
  BOOST_PLANS.forEach((plan) => {
    const card = el('article', plan.featured ? 'bp-card bp-card--featured' : 'bp-card');
    card.dataset.plan = plan.id;
    if (plan.featured) card.appendChild(el('span', 'bp-card__badge', 'El más elegido'));

    card.appendChild(el('h3', 'bp-card__name', plan.name));
    card.appendChild(el('p', 'bp-card__tagline', plan.tagline));

    const priceBox = el('div', 'bp-card__price');
    priceBox.appendChild(el('span', 'bp-card__amount', formatPrice(plan.price)));
    priceBox.appendChild(el('span', 'bp-card__per', 'por mes'));
    card.appendChild(priceBox);

    const btn = el('button', 'bp-card__btn', 'Elegir este combo');
    btn.type = 'button';
    btn.addEventListener('click', () => onChoose(plan));
    card.appendChild(btn);

    if (plan.includes) card.appendChild(el('p', 'bp-card__includes', plan.includes));
    const list = el('ul', 'bp-card__perks');
    plan.perks.forEach((perk) => {
      const li = el('li', null, perk);
      list.appendChild(li);
    });
    card.appendChild(list);

    grid.appendChild(card);
  });

  container.replaceChildren(grid);
}

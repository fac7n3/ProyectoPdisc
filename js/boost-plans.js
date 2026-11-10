// "Impulsá tus ventas" (panel de vendedor, sección `impulsar`): planes y
// servicios individuales.
//
// Planes (Base / Intermedio / Pro): cada uno es un paquete de servicios; lo que
// incluye sale de boost_plan_items (migración 160), no de acá. Servicios sueltos:
// una tarjeta por servicio de boost_services, desplegable con para qué sirve,
// ejemplos, por qué conviene y límites.
//
// El PRECIO, el NOMBRE y los TOPES salen de la base (boost_plans, boost_services):
// es lo mismo que cobra la Edge Function, así que la pantalla no puede mostrar un
// monto distinto al que se paga. Acá solo viven los textos de venta.
//
// Qué pasa después de comprar:
//   - "Negocios principales" -> el comercio entra a la fila "Locales destacados"
//     del inicio (automático, home.js lee get_active_benefits).
//   - "Productos recomendados" -> sus productos salen más arriba (automático).
//   - Banners -> el comercio carga la imagen en "Banner del inicio" y el equipo
//     le asigna el lugar (home_promos).
//   - El resto lo activa el equipo.

import {
  planAction, planBreakdown, planSavings, serviceAvailability, holdingLabel,
  serviceLimitLines, pricePerDay, plansIncluding, SERVICE_KIND_LABEL,
} from './boost-utils.js';

const PLAN_COPY = {
  base: { tagline: 'Para empezar a mostrarte en el inicio.' },
  intermedio: { tagline: 'Más lugares y tu comercio destacado.', featured: true },
  pro: { tagline: 'Toda la vidriera del inicio, al mejor precio.' },
};

/** Lo que ya incluye el plan gratis de todos los comercios (planilla de costos). */
export const FREE_PLAN_FEATURES = [
  'Perfil de la tienda: logo, banner, descripción, horarios y ubicación',
  'Alta del comercio, con validación de CUIT y aprobación del admin',
  'Gestión de pedidos y confirmación de transferencias',
  'Empleados con acceso al comercio',
  'Mensajes con clientes y reseñas recibidas',
  'Espacios de promos en el inicio (hasta 3 por espacio)',
  'Panel con estadísticas y novedades',
  'Cupones propios',
  'Gestión de productos con stock, ofertas, varias fotos y videos',
];

// Textos de venta de cada servicio. `what`: qué es y para qué sirve; `examples`:
// usos concretos; `why`: por qué conviene. Los límites y precios NO van acá.
const SERVICE_COPY = {
  banner_chico: {
    what: 'Un banner pequeño con una foto, un título y un enlace, que se muestra en el inicio de Baradero Local. Sirve para dar a conocer una promo, un producto o tu comercio de forma simple.',
    examples: [
      'Una panadería anuncia «Medialunas calientes de 8 a 10».',
      'Una ferretería promociona «Llevá 2 y pagá 1 en pinturas».',
      'Una peluquería avisa «Turnos libres este sábado».',
    ],
    why: [
      'Es la puerta de entrada más económica a la publicidad en el sitio.',
      'Con un segundo banner podés mostrar dos promos distintas a la vez.',
      'Ideal para probar cuánta gente llega antes de pasar a un banner más grande.',
    ],
  },
  banner_mediano: {
    what: 'Un banner de tamaño medio con foto, descripción y enlace. Tiene más espacio para contar qué ofrecés, así que se nota más y explica mejor que uno chico.',
    examples: [
      'Un kiosco muestra su nueva línea de golosinas con una descripción de precios.',
      'Una librería anuncia la lista de útiles escolares con enlace a su tienda.',
      'Una verdulería promociona el cajón de frutas de la semana.',
    ],
    why: [
      'Más tamaño y más texto: el vecino entiende la oferta sin entrar a buscarla.',
      'Es un punto intermedio entre el banner chico y el grande.',
      'Viene incluido en los planes Intermedio y Pro.',
    ],
  },
  banner_grande: {
    what: 'El espacio de máxima visibilidad: un banner con hasta 5 fotografías que rotan en tandas. Podés contar cinco mensajes distintos en un mismo lugar privilegiado.',
    examples: [
      'Una tienda de ropa muestra cinco looks de la nueva temporada.',
      'Una farmacia rota sus servicios: perfumería, dermocosmética, turnos, envíos y promos.',
      'Un supermercado anuncia sus cinco ofertas de la semana.',
    ],
    why: [
      'Cinco fotos en un solo espacio: más mensajes con una sola contratación.',
      'Es lo primero que ve quien entra al inicio.',
      'Si lo necesitás junto con otros servicios, el Plan Pro lo trae incluido y sale más barato.',
    ],
  },
  redes_sociales: {
    what: 'Difundimos tu comercio fuera de la plataforma: cuando subís una historia, nosotros la resubimos en nuestras redes sociales, con tu imagen, tu texto y los enlaces a tu tienda. Te sirve para llegar a gente que todavía no entró a Baradero Local.',
    examples: [
      'Una pizzería sube la historia con su menú del fin de semana y nosotros la resubimos.',
      'Un comercio nuevo sube su apertura con el enlace a su tienda y la resubimos.',
      'Una florería sube su catálogo para el Día de la Madre y también lo difundimos.',
    ],
    why: [
      'No hay tope de historias: todas las que subas las resubimos.',
      'Llegás a vecinos que no están buscando en la plataforma.',
      'Tus historias llevan enlaces directos a tu tienda.',
      'Está incluido en los tres planes.',
    ],
  },
  productos_recomendados: {
    what: 'Tus productos aparecen destacados en «Productos recomendados» del inicio, con imagen, precio y datos. Cada unidad destaca un artículo para que los vecinos lo vean primero.',
    examples: [
      'Una heladería destaca su pote de 1 kg en un día de calor.',
      'Un negocio de limpieza pone en vidriera su combo de productos de hogar.',
      'Una zapatería destaca el calzado de la nueva temporada.',
    ],
    why: [
      'Tus productos salen más arriba que los de otros comercios, justo donde el vecino mira.',
      'Podés elegir cuántos y cuáles destacar: ideal para rotar ofertas.',
      'Cada unidad destaca un producto distinto, así que tenés varias chances de vender.',
    ],
  },
  posicionamiento_vendedor: {
    what: 'Tu comercio recibe prioridad estándar en los resultados de búsqueda: cuando alguien busca un producto o un rubro, te mostramos antes que a comercios sin posicionamiento.',
    examples: [
      'Alguien busca «pan» y tu panadería aparece entre los primeros resultados.',
      'Alguien busca «pintura» y tu ferretería sale antes que otras.',
      'Alguien busca un regalo y tu comercio aparece más arriba.',
    ],
    why: [
      'Llegás a personas que ya están buscando lo que vendés: son las que más compran.',
      'Mejora tu visibilidad todos los días, sin tener que armar una promo.',
      'Viene incluido en los planes Intermedio y Pro.',
    ],
  },
  posicionamiento_pro: {
    what: 'Prioridad superior en las búsquedas: tu comercio tiene mayor exposición en los resultados que con el posicionamiento estándar.',
    examples: [
      'En un rubro con mucha competencia, tu comercio queda entre los primeros.',
      'En fechas de mucha búsqueda (Día del Niño, Navidad), tus productos se ven antes.',
      'Cuando alguien busca un producto que vendés, aparecés arriba de comercios con posicionamiento estándar.',
    ],
    why: [
      'Es el nivel más alto de exposición en resultados de búsqueda.',
      'Pensado para rubros con muchos competidores.',
      'Está incluido en el Plan Pro, junto con el posicionamiento estándar.',
    ],
  },
  negocios_principales: {
    what: 'Tu comercio aparece en la fila de «Locales destacados» del inicio, con logo, nombre, categoría y perfil. Es la vidriera de tu comercio como marca, no de un producto en particular.',
    examples: [
      'Una panadería de barrio se hace conocida entre quienes recién entran al sitio.',
      'Un comercio nuevo se presenta a toda la ciudad.',
      'Una tienda con buenas reseñas muestra su perfil completo.',
    ],
    why: [
      'Quien entra al inicio ve tu logo y tu nombre sin buscar nada.',
      'Construye reconocimiento para que te elijan la próxima vez.',
      'Se activa solo apenas se acredita el pago.',
    ],
  },
  estadisticas_pro: {
    what: 'Estadísticas de cuántas personas ven tus redes y cuántas hacen click en tu perfil y en tus publicaciones. Sirve para saber qué funciona y dónde conviene invertir.',
    examples: [
      'Descubrís qué publicación generó más visitas a tu tienda.',
      'Comparás cuántos clicks recibió tu perfil antes y después de una promo.',
      'Decidís si te conviene renovar un banner según cuánto rindió.',
    ],
    why: [
      'Dejás de adivinar: ves qué publicidad te trae gente.',
      'Te ayuda a no gastar en lo que no rinde.',
      'Viene incluida en el Plan Pro.',
    ],
  },
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const listOf = (cls, lines) => {
  const ul = el('ul', cls);
  lines.forEach((l) => ul.appendChild(el('li', null, l)));
  return ul;
};

/**
 * Dibuja la grilla de planes dentro de `container`.
 * @param {HTMLElement} container
 * @param {Array<{id:string,name:string,price:number,duration_days:number}>} plans filas de boost_plans, ya ordenadas
 * @param {ReturnType<import('./boost-utils.js').describeBoostState>} state
 * @param {(plan: {id:string,name:string,price:number,duration_days:number}) => void} onChoose
 * @param {(price: number) => string} formatPrice
 * @param {{ items: Array<{plan_id:string,service_id:string,quantity:number}>, services: Array<object> }} catalog
 */
export function renderBoostPlans(container, plans, state, onChoose, formatPrice, catalog = { items: [], services: [] }) {
  const grid = el('div', 'bp-grid');
  plans.forEach((plan) => {
    const copy = PLAN_COPY[plan.id] || { tagline: '' };
    const action = planAction(plan.id, state);
    const isCurrent = state.active?.planId === plan.id;
    const { listPrice, savings, percent } = planSavings(plan, catalog.items, catalog.services);
    const hasDiscount = savings > 0;

    const card = el('article', copy.featured && !hasDiscount ? 'bp-card bp-card--featured' : hasDiscount ? 'bp-card bp-card--discount' : 'bp-card');
    card.dataset.plan = plan.id;
    if (isCurrent) card.appendChild(el('span', 'bp-card__badge', 'Tu combo actual'));
    else if (hasDiscount) card.appendChild(el('span', 'bp-card__badge bp-card__badge--hot', 'SUPER DESCUENTO'));
    else if (copy.featured) card.appendChild(el('span', 'bp-card__badge', 'Recomendado'));

    card.appendChild(el('h3', 'bp-card__name', plan.name));
    card.appendChild(el('p', 'bp-card__tagline', copy.tagline));

    const priceBox = el('div', 'bp-card__price');
    priceBox.appendChild(el('span', 'bp-card__old', hasDiscount ? `${formatPrice(listPrice)} por separado` : ''));
    priceBox.appendChild(el('span', 'bp-card__amount', formatPrice(plan.price)));
    priceBox.appendChild(el('span', 'bp-card__per', `por ${plan.duration_days} días`));
    card.appendChild(priceBox);
    card.appendChild(el('span', hasDiscount ? 'bp-card__save' : 'bp-card__save bp-card__save--none',
      hasDiscount ? `Ahorrás ${formatPrice(savings)} (${percent}%)` : ' '));

    const btn = el('button', 'bp-card__btn', action.label);
    btn.type = 'button';
    btn.disabled = action.disabled;
    if (action.disabled) btn.title = action.hint || '';
    btn.addEventListener('click', () => onChoose(plan));
    card.appendChild(btn);
    if (action.disabled && action.hint) card.appendChild(el('p', 'bp-card__hint', action.hint));

    card.appendChild(el('p', 'bp-card__includes', 'Incluye:'));
    const list = el('ul', 'bp-card__perks');
    planBreakdown(plan.id, catalog.items, catalog.services).forEach((it) => {
      const li = el('li');
      li.append(el('strong', null, String(it.quantity)), ` ${it.name}`);
      list.appendChild(li);
    });
    card.appendChild(list);

    grid.appendChild(card);
  });

  const free = el('div', 'bp-free');
  const freeTitle = el('strong', null, 'Gratis para todos los comercios: ');
  free.append(freeTitle, FREE_PLAN_FEATURES.map((f) => f.charAt(0).toLowerCase() + f.slice(1)).join(' · ') + '.');

  container.replaceChildren(grid, free);
}

/** Ids de servicios desplegados, para que un refresco de la pantalla no los cierre. */
const openServices = new Set();

/**
 * Dibuja el catálogo de servicios individuales dentro de `container`.
 * @param {HTMLElement} container
 * @param {Array<object>} services filas de boost_services, ya ordenadas
 * @param {Record<string, number>} holdings unidades vigentes por servicio (get_store_benefits)
 * @param {{ plans: Array<object>, items: Array<object> }} catalog para "incluido en el plan X"
 * @param {(service: object, quantity: number) => void} onBuy
 * @param {(price: number) => string} formatPrice
 */
export function renderBoostServices(container, services, holdings, catalog, onBuy, formatPrice) {
  const grid = el('div', 'bs-grid');

  services.forEach((service) => {
    const copy = SERVICE_COPY[service.id] || { what: service.purpose, examples: [], why: [] };
    const held = holdings[service.id] ?? 0;
    const avail = serviceAvailability(service, held);

    const card = el('article', 'bs-card');
    card.dataset.service = service.id;

    const top = el('div', 'bs-card__top');
    top.appendChild(el('h4', 'bs-card__name', service.name));
    top.appendChild(el('span', `bs-type bs-type--${service.kind}`, SERVICE_KIND_LABEL[service.kind] || service.kind));
    card.appendChild(top);

    const dl = el('dl', 'bs-card__facts');
    [['Contiene', service.contents], ['Para qué sirve', service.purpose]].forEach(([k, v]) => {
      const row = el('div');
      row.append(el('dt', null, k), el('dd', null, v));
      dl.appendChild(row);
    });
    card.appendChild(dl);

    card.appendChild(el('p', avail.canBuy ? 'bs-card__held' : 'bs-card__held bs-card__held--max', holdingLabel(service, held)));

    // Desplegable: para qué sirve en detalle, ejemplos, por qué conviene y límites.
    const more = el('details', 'bs-more');
    if (openServices.has(service.id)) more.open = true;
    more.addEventListener('toggle', () => {
      if (more.open) openServices.add(service.id); else openServices.delete(service.id);
    });
    more.appendChild(el('summary', 'bs-more__summary', 'Ver detalles, ejemplos y límites'));

    const body = el('div', 'bs-more__body');
    const section = (title, content) => {
      const s = el('section', 'bs-more__sec');
      s.appendChild(el('h5', null, title));
      s.appendChild(content);
      body.appendChild(s);
    };
    section('Para qué sirve', el('p', null, copy.what));
    if (copy.examples.length) section('Ejemplos de uso', listOf('bs-more__list', copy.examples));

    const why = [...copy.why];
    why.push(`Equivale a ${formatPrice(pricePerDay(service.price, service.duration_days))} por día.`);
    const included = plansIncluding(service.id, catalog.plans, catalog.items, catalog.services).filter((p) => p.savings > 0);
    if (included.length) {
      why.push(`Si necesitás varios servicios juntos, el ${included.map((p) => p.name).join(' o el ')} te sale más barato (ahorrás hasta ${formatPrice(Math.max(...included.map((p) => p.savings)))}).`);
    }
    section('Por qué conviene', listOf('bs-more__list bs-more__list--why', why));
    section('Límites', listOf('bs-more__list', serviceLimitLines(service)));
    more.appendChild(body);
    card.appendChild(more);

    const foot = el('div', 'bs-card__foot');
    const price = el('span', 'bs-card__price');
    price.append(formatPrice(service.price), el('small', null, avail.maxQty > 1 ? ' c/u · 30 días' : ` · ${service.duration_days} días`));
    foot.appendChild(price);

    const buy = el('span', 'bs-card__buy');
    let qty = 1;
    const btn = el('button', 'bs-card__btn');
    btn.type = 'button';
    btn.disabled = !avail.canBuy;
    const refreshBtn = () => {
      btn.textContent = !avail.canBuy ? (avail.max === 1 ? 'Ya lo tenés' : 'Máximo alcanzado')
        : qty > 1 ? `Comprar ${formatPrice(service.price * qty)}` : 'Comprar';
    };

    if (avail.canBuy && avail.maxQty > 1) {
      const stepper = el('span', 'bs-qty');
      const minus = el('button', 'bs-qty__btn', '−');
      const value = el('span', 'bs-qty__value', '1');
      const plus = el('button', 'bs-qty__btn', '+');
      minus.type = 'button'; plus.type = 'button';
      minus.setAttribute('aria-label', 'Menos unidades');
      plus.setAttribute('aria-label', 'Más unidades');
      const sync = () => {
        value.textContent = String(qty);
        minus.disabled = qty <= 1;
        plus.disabled = qty >= avail.maxQty;
        refreshBtn();
      };
      minus.addEventListener('click', () => { qty = Math.max(1, qty - 1); sync(); });
      plus.addEventListener('click', () => { qty = Math.min(avail.maxQty, qty + 1); sync(); });
      stepper.append(minus, value, plus);
      buy.appendChild(stepper);
      sync();
    } else {
      refreshBtn();
    }

    btn.addEventListener('click', () => onBuy(service, qty));
    buy.appendChild(btn);
    foot.appendChild(buy);
    card.appendChild(foot);

    grid.appendChild(card);
  });

  container.replaceChildren(grid);
}

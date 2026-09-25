/**
 * Panel de autogestión del profesional/técnico (pages/profesional.html).
 *
 * Antes esto era un bloque adentro de vender.html que solo dejaba pausar la
 * publicación y editar cuatro campos -- ni siquiera la foto, que se subía una
 * vez en el alta y después había que pedirle a Soporte que la cambiara.
 *
 * El alta sigue estando en vender.html (pestaña "Ofrecer un servicio"); esta
 * página es solo para quien ya está publicado. Reusa el shell del panel del
 * vendedor (vender-shell.js) para que los dos se manejen igual.
 */

import { supabase, guardPage, showToast, setLoading } from './auth-utils.js';
import { initVenderShell } from './vender-shell.js';
import { loadPanelOnboardingSeen, showPanelOnboarding } from './panel-onboarding-utils.js';
import { initNotificationsBell } from './nav-utils.js';
import { PROFESSIONAL_CATEGORIES, categoryLabel, categoryIcon } from './professional-categories.js';
import { SOCIAL_NETWORKS } from './store-contact-utils.js';
import { buildDropdown } from './dropdown.js';
import { isValidShopName, isValidPhone } from './validation-utils.js';
import { removeStoredObjects } from './storage-utils.js';
import { renderNotificationsSection } from './notifications-utils.js';
import { renderSupportSection } from './support-utils.js';
import { initServicios } from './profesional-servicios.js';
import { initDisponibilidad } from './profesional-disponibilidad.js';
import { initGaleria } from './profesional-galeria.js';
import { initConsultas } from './profesional-consultas.js';
import { initResenas } from './profesional-resenas.js';
import { initMetricas } from './profesional-metricas.js';
import { confirmDialog } from './confirm-dialog.js';
import './speed-insights.js';

const MAX_FOTO_BYTES = 2 * 1024 * 1024;
const BUCKET_FOTO = 'professional-photos';

/** Estado de la página. `prof` es la fila de `professionals` de esta cuenta. */
const estado = { user: null, prof: null, categoriaDropdown: null };

// Copy de las tarjetas de bienvenida al panel (js/panel-onboarding-utils.js).
// Clave = mismo valor que data-section en el sidebar (pages/profesional.html).
const PROF_SECTION_COPY = {
  resumen: { icon: 'fa-solid fa-house', title: 'Resumen', desc: 'Cómo viene tu actividad: consultas, reseñas y lo más importante de un vistazo.' },
  perfil: { icon: 'fa-regular fa-id-card', title: 'Mis datos', desc: 'Tu nombre, oficio y descripción: lo primero que lee un vecino que busca ayuda.' },
  servicios: { icon: 'fa-solid fa-screwdriver-wrench', title: 'Servicios y precios', desc: 'Los trabajos que ofrecés y cuánto cobrás por cada uno.' },
  disponibilidad: { icon: 'fa-regular fa-clock', title: 'Horarios y zona', desc: 'Cuándo estás disponible y hasta dónde llegás a trabajar.' },
  galeria: { icon: 'fa-regular fa-images', title: 'Fotos de trabajos', desc: 'Mostrá trabajos que ya hiciste: es lo que más convence a un vecino nuevo.' },
  consultas: { icon: 'fa-regular fa-comments', title: 'Consultas', desc: 'Los mensajes de vecinos interesados en contratarte.' },
  resenas: { icon: 'fa-regular fa-star', title: 'Reseñas', desc: 'Lo que opinan quienes ya te contrataron.' },
  metricas: { icon: 'fa-solid fa-chart-line', title: 'Estadísticas', desc: 'Cuántos vecinos vieron tu publicación y te contactaron.' },
  notificaciones: { icon: 'fa-regular fa-bell', title: 'Notificaciones', desc: 'Avisos de consultas nuevas y reseñas.' },
  soporte: { icon: 'fa-solid fa-headset', title: 'Soporte', desc: '¿Necesitás una mano? Escribinos.' },
};

function buildProfOnboardingSections() {
  const keys = new Set();
  document.querySelectorAll('#mc-sidebar [data-section]').forEach((el) => keys.add(el.dataset.section));
  return [...keys].map((k) => PROF_SECTION_COPY[k]).filter(Boolean);
}

async function maybeShowProfOnboarding() {
  if (await loadPanelOnboardingSeen('profesional')) return;
  const nombre = (estado.prof?.full_name || '').trim().split(/\s+/)[0];
  showPanelOnboarding({
    panelKey: 'profesional',
    title: '¡Bienvenido a tu panel de profesional/técnico!',
    greeting: nombre ? `Hola ${nombre}, así vas a manejar tu publicación en Contratar:` : 'Así vas a manejar tu publicación en Contratar:',
    sections: buildProfOnboardingSections(),
  });
}

/** Columnas de `professionals` que usa el panel, con las 12 de redes. */
const COLUMNAS = [
  'id', 'owner_id', 'full_name', 'category', 'specialty', 'description',
  'phone', 'whatsapp', 'photo_url', 'is_active', 'serves_24h',
  ...SOCIAL_NETWORKS.flatMap(({ key }) => [`social_${key}`, `social_${key}_show`]),
].join(', ');

/** Helper de DOM: nunca innerHTML con datos de la persona. */
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** Ícono de FontAwesome. Es el único lugar donde se usa innerHTML, y siempre
 *  con una constante del código, nunca con algo que haya cargado alguien. */
function icono(clases) {
  const i = document.createElement('i');
  i.className = clases;
  i.setAttribute('aria-hidden', 'true');
  return i;
}

/* ================= Arranque y ruteo de estado ================= */

/**
 * Resuelve en cuál de los tres estados está la cuenta: publicada, con
 * solicitud sin resolver, o nada (y ahí se va al alta).
 */
async function arrancar(user) {
  estado.user = user;

  // Sin .single()/.maybeSingle() a propósito: `professionals` no tiene unique
  // por owner_id, y en este proyecto ya pasó que una cuenta con dos filas
  // rompiera el panel entero por el error de coerción (js/vender.js, cuentas
  // con varias tiendas). Con limit(1) el peor caso es mostrar una de las dos.
  const { data: profs, error } = await supabase
    .from('professionals')
    .select(COLUMNAS)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('Error cargando el profesional:', error);
    mostrarEstadoSolicitud(null, 'No pudimos cargar tu panel. Probá recargar la página.');
    return;
  }

  if (profs?.length) {
    estado.prof = profs[0];
    montarPanel();
    return;
  }

  // Todavía no está publicado: puede tener una solicitud esperando.
  const { data: solicitudes } = await supabase
    .from('professional_requests')
    .select('id, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);

  const solicitud = solicitudes?.[0];
  if (solicitud && solicitud.status !== 'approved') {
    mostrarEstadoSolicitud(solicitud);
    return;
  }

  // Ni publicado ni con solicitud: no tiene nada que administrar todavía, va
  // al alta con la pestaña de servicios ya elegida.
  window.location.replace('./vender.html?tipo=servicio');
}

function mostrarEstadoSolicitud(solicitud, mensajeError) {
  document.getElementById('prof-state-loading')?.setAttribute('hidden', '');
  const vista = document.getElementById('prof-status-view');
  const titulo = document.getElementById('prof-status-title');
  const cuerpo = document.getElementById('prof-status-body');
  if (!vista) return;

  if (mensajeError) {
    titulo.textContent = 'No pudimos abrir tu panel';
    cuerpo.textContent = mensajeError;
  } else if (solicitud?.status === 'rejected') {
    titulo.textContent = 'Tu solicitud no fue aprobada';
    cuerpo.textContent =
      'Podés escribirnos por Soporte para saber por qué y volver a intentarlo.';
  } else {
    titulo.textContent = 'Tu solicitud está en revisión';
    cuerpo.textContent =
      'Un administrador la va a revisar en breve. Cuando la aprueben te avisamos y este panel se abre solo.';
  }

  vista.hidden = false;
}

/** Revela el panel y engancha todas las secciones. */
function montarPanel() {
  document.getElementById('prof-state-loading')?.setAttribute('hidden', '');
  document.getElementById('prof-panel-view').hidden = false;
  document.getElementById('oficios-mode-badge')?.removeAttribute('hidden');

  const nombre = estado.prof.full_name || 'Tu publicación';
  document.getElementById('of-sidebar-name').textContent = nombre;
  document.getElementById('of-greeting-name').textContent = nombre.split(' ')[0] || 'vecino';

  const preview = document.getElementById('of-preview-link');
  if (preview) preview.href = `./contratar.html?pro=${estado.prof.id}`;

  document.getElementById('of-logout')?.addEventListener('click', () => {
    window.location.href = './home.html';
  });

  // El shell necesita las secciones ya en el DOM: se cablea antes de pedir
  // datos, igual que loadDashboard() en vender.js.
  initVenderShell();
  maybeShowProfOnboarding();
  initNotificationsBell();

  initPerfil();

  const ctx = {
    get prof() { return estado.prof; },
    user: estado.user,
    el,
    icono,
    alMostrar,
    onProfChange: aplicarCambioDeProf,
    refrescarResumen: renderResumen,
  };
  initServicios(ctx);
  initDisponibilidad(ctx);
  initGaleria(ctx);
  initConsultas(ctx);
  initResenas(ctx);
  initMetricas(ctx);

  renderNotificationsSection(document.getElementById('of-notifications'), estado.user.id);
  renderSupportSection(document.getElementById('of-support'));

  renderResumen();
}

/**
 * Corre `cargar` la primera vez que se muestra esa sección, no al abrir el
 * panel: así entrar a "Mis datos" no dispara además las consultas de
 * servicios, horarios, fotos, consultas, reseñas y métricas.
 * @param {string} seccion valor de data-section
 * @param {() => void} cargar
 */
function alMostrar(seccion, cargar) {
  let hecho = false;
  const revisar = () => {
    if (hecho || window.location.hash.replace('#', '') !== seccion) return;
    hecho = true;
    cargar();
  };
  window.addEventListener('hashchange', revisar);
  revisar();
}

/** Las secciones avisan por acá cuando cambian la fila (ej. el switch 24 h). */
function aplicarCambioDeProf(cambios) {
  estado.prof = { ...estado.prof, ...cambios };
}

/* ================= Resumen ================= */

function statCard({ icono: claseIcono, variante, titulo, valor, sub }) {
  const card = el('div', 'rs-card rs-stat');
  const top = el('div', 'rs-stat__top');
  const chip = el('div', `rs-stat__icon rs-stat__icon--${variante}`);
  chip.appendChild(icono(claseIcono));
  top.appendChild(chip);
  top.appendChild(el('span', 'rs-stat__title', titulo));
  card.appendChild(top);
  card.appendChild(el('div', 'rs-stat__value', valor));
  if (sub) card.appendChild(el('div', 'rs-stat__sub', sub));
  return card;
}

async function renderResumen() {
  const cont = document.getElementById('of-resumen-stats');
  if (!cont) return;
  const prof = estado.prof;

  const desde = new Date();
  desde.setDate(desde.getDate() - 30);
  const desdeISO = desde.toISOString().slice(0, 10);

  const [consultas, resenas, metricas, servicios] = await Promise.all([
    supabase
      .from('professional_inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', prof.id)
      .eq('status', 'new'),
    supabase
      .from('reviews')
      .select('rating')
      .eq('target_type', 'professional')
      .eq('target_id', prof.id)
      .eq('is_hidden', false),
    supabase
      .from('professional_metrics_daily')
      .select('event_type, count')
      .eq('professional_id', prof.id)
      .gte('day', desdeISO),
    supabase
      .from('professional_services')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', prof.id),
  ]);

  const nuevas = consultas.count || 0;
  const puntajes = (resenas.data || []).map((r) => Number(r.rating)).filter(Number.isFinite);
  const promedio = puntajes.length
    ? (puntajes.reduce((a, b) => a + b, 0) / puntajes.length).toFixed(1)
    : null;
  const visitas = (metricas.data || [])
    .filter((m) => m.event_type === 'profile_view')
    .reduce((a, m) => a + Number(m.count || 0), 0);

  cont.replaceChildren(
    statCard({
      icono: prof.is_active ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-pause',
      variante: prof.is_active ? 'sales' : 'orders',
      titulo: 'Tu publicación',
      valor: prof.is_active ? 'Activa' : 'Pausada',
      sub: prof.is_active ? 'Te pueden encontrar en Contratar' : 'No aparecés en el directorio',
    }),
    statCard({
      icono: 'fa-solid fa-envelope',
      variante: 'orders',
      titulo: 'Consultas nuevas',
      valor: String(nuevas),
      sub: nuevas ? 'Te están esperando' : 'Ninguna pendiente',
    }),
    statCard({
      icono: 'fa-solid fa-star',
      variante: 'rep',
      titulo: 'Tu calificación',
      valor: promedio ? `${promedio} ★` : 'Sin reseñas',
      sub: puntajes.length ? `${puntajes.length} reseña${puntajes.length === 1 ? '' : 's'}` : 'Todavía nadie te calificó',
    }),
    statCard({
      icono: 'fa-solid fa-eye',
      variante: 'money',
      titulo: 'Visitas (30 días)',
      valor: String(visitas),
      sub: 'Cuántos miraron tu tarjeta',
    })
  );

  renderResumenCards(servicios.count || 0, nuevas);
}

/** Dos tarjetas de "lo que te falta hacer", debajo de los números. */
function renderResumenCards(cantServicios, consultasNuevas) {
  const cont = document.getElementById('of-resumen-cards');
  if (!cont) return;

  const irA = (seccion) => () => { window.location.hash = seccion; };

  const pendientes = [];
  if (!cantServicios) {
    pendientes.push({
      titulo: 'Cargá tus servicios y precios',
      sub: 'El vecino que sabe cuánto sale, llama. El que no sabe, sigue buscando.',
      seccion: 'servicios',
    });
  }
  if (!estado.prof.photo_url) {
    pendientes.push({
      titulo: 'Subí tu foto',
      sub: 'Una cara o un logo da mucha más confianza que el ícono gris.',
      seccion: 'perfil',
    });
  }
  if (consultasNuevas) {
    pendientes.push({
      titulo: `Tenés ${consultasNuevas} consulta${consultasNuevas === 1 ? '' : 's'} sin responder`,
      sub: 'Contestar rápido es la diferencia entre conseguir el trabajo o no.',
      seccion: 'consultas',
    });
  }

  const card = el('div', 'rs-card');
  const titulo = el('div', 'rs-card__title');
  titulo.appendChild(icono('fa-solid fa-list-check'));
  titulo.appendChild(el('span', null, pendientes.length ? 'Para mejorar tu publicación' : 'Todo en orden'));
  card.appendChild(titulo);

  if (!pendientes.length) {
    card.appendChild(el('p', 'rs-empty', 'Tu publicación está completa. Cuando entre una consulta te avisamos.'));
  } else {
    for (const p of pendientes) {
      const fila = el('div', 'rs-help-row');
      const izq = el('div');
      izq.appendChild(el('div', 'rs-help-row__title', p.titulo));
      izq.appendChild(el('div', 'rs-help-row__sub', p.sub));
      fila.appendChild(izq);
      fila.appendChild(icono('fa-solid fa-chevron-right'));
      fila.addEventListener('click', irA(p.seccion));
      card.appendChild(fila);
    }
  }

  const ayuda = el('div', 'rs-card');
  const tAyuda = el('div', 'rs-card__title');
  tAyuda.appendChild(icono('fa-solid fa-eye'));
  tAyuda.appendChild(el('span', null, 'Cómo te ven'));
  ayuda.appendChild(tAyuda);
  ayuda.appendChild(el('p', 'rs-empty', 'Mirá tu tarjeta como la ve un vecino que te busca en Contratar.'));
  const verBtn = el('button', 'rs-link', 'Ver mi perfil público →');
  verBtn.type = 'button';
  verBtn.addEventListener('click', () => {
    window.open(`./contratar.html?pro=${estado.prof.id}`, '_blank', 'noopener');
  });
  ayuda.appendChild(verBtn);

  cont.replaceChildren(card, ayuda);
}

/* ================= Mis datos ================= */

function initPerfil() {
  const prof = estado.prof;

  document.getElementById('of-name').value = prof.full_name || '';
  document.getElementById('of-specialty').value = prof.specialty || '';
  document.getElementById('of-description').value = prof.description || '';
  document.getElementById('of-phone').value = prof.phone || '';
  document.getElementById('of-whatsapp').value = prof.whatsapp || '';

  // El proyecto no usa <select> nativo: no se puede estilar y desentona al
  // lado de los inputs (ver js/perfil.js).
  estado.categoriaDropdown = buildDropdown({
    options: PROFESSIONAL_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
    value: prof.category || PROFESSIONAL_CATEGORIES[0].value,
    ariaLabel: 'Rubro',
  });
  document.getElementById('of-category-slot').replaceChildren(estado.categoriaDropdown.element);

  renderRedes();
  renderFoto();
  renderBotonPausa();
  renderVistaPrevia();

  document.getElementById('of-photo-input')?.addEventListener('change', subirFoto);
  document.getElementById('of-photo-remove')?.addEventListener('click', quitarFoto);
  document.getElementById('of-profile-form')?.addEventListener('submit', guardarPerfil);
}

/** Las 6 tarjetas de redes se arman acá y no en el HTML: son el mismo bloque
 *  repetido seis veces, y así sale de una sola fuente (SOCIAL_NETWORKS). */
function renderRedes() {
  const grid = document.getElementById('of-social-grid');
  if (!grid) return;

  grid.replaceChildren(...SOCIAL_NETWORKS.map(({ key, label, icon }) => {
    const card = el('div', 'prof-social-card');

    const head = el('div', 'prof-social-card__head');
    const chip = el('span', 'prof-social-card__icon');
    chip.appendChild(icono(icon));
    head.appendChild(chip);
    const lbl = el('label', 'prof-social-card__label', label);
    lbl.htmlFor = `of-social-${key}`;
    head.appendChild(lbl);
    card.appendChild(head);

    const input = el('input', 'form-input');
    input.type = 'text';
    input.id = `of-social-${key}`;
    input.placeholder = key === 'website' ? 'https://tu-sitio.com' : `https://${key}.com/tu-usuario`;
    input.value = estado.prof[`social_${key}`] || '';
    card.appendChild(input);

    const toggle = el('label', 'social-toggle');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.id = `of-social-${key}-show`;
    check.checked = estado.prof[`social_${key}_show`] !== false;
    check.setAttribute('aria-label', `Mostrar ${label}`);
    toggle.appendChild(check);
    toggle.appendChild(el('span', 'social-toggle__track'));
    card.appendChild(toggle);

    return card;
  }));
}

function renderFoto() {
  const preview = document.getElementById('of-photo-preview');
  const quitar = document.getElementById('of-photo-remove');
  if (!preview) return;

  if (estado.prof.photo_url) {
    const img = document.createElement('img');
    img.src = estado.prof.photo_url;
    img.alt = 'Tu foto de perfil';
    preview.replaceChildren(img);
    quitar?.removeAttribute('hidden');
  } else {
    preview.replaceChildren(icono('fa-solid fa-user'));
    quitar?.setAttribute('hidden', '');
  }
}

function renderBotonPausa() {
  const cont = document.getElementById('of-publish-toggle');
  if (!cont) return;
  const activa = estado.prof.is_active;

  const tag = el('span', `of-tag ${activa ? 'of-tag--on' : 'of-tag--off'}`, activa ? 'Publicada' : 'Pausada');
  const btn = el('button', 'of-btn of-btn--ghost of-btn--sm', activa ? 'Pausar publicación' : 'Reactivar');
  btn.type = 'button';
  btn.addEventListener('click', () => alternarPausa(btn));

  const wrap = el('div', 'of-row__actions');
  wrap.append(tag, btn);
  cont.replaceChildren(wrap);
}

async function alternarPausa(btn) {
  const nuevoEstado = !estado.prof.is_active;
  if (!nuevoEstado && !(await confirmDialog('Si pausás tu publicación dejás de aparecer en Contratar hasta que la reactives.', { confirmText: 'Sí, pausar', danger: true }))) {
    return;
  }

  btn.disabled = true;
  const { error } = await supabase
    .from('professionals')
    .update({ is_active: nuevoEstado })
    .eq('id', estado.prof.id);
  btn.disabled = false;

  if (error) {
    console.error('Error al pausar/reactivar:', error);
    showToast('No pudimos cambiar el estado de tu publicación.');
    return;
  }

  estado.prof.is_active = nuevoEstado;
  renderBotonPausa();
  renderResumen();
  showToast(nuevoEstado ? 'Tu publicación está activa de nuevo.' : 'Tu publicación quedó pausada.', 'success');
}

async function subirFoto(event) {
  const archivo = event.target.files?.[0];
  event.target.value = '';
  if (!archivo) return;

  const msg = document.getElementById('of-photo-msg');
  if (archivo.size > MAX_FOTO_BYTES) {
    if (msg) msg.textContent = 'La foto no puede pesar más de 2 MB.';
    return;
  }
  if (msg) msg.textContent = 'Subiendo…';

  const anterior = estado.prof.photo_url;
  const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase();
  const ruta = `${estado.user.id}/${Date.now()}.${ext}`;

  const { error: errSubida } = await supabase.storage.from(BUCKET_FOTO).upload(ruta, archivo);
  if (errSubida) {
    console.error('Error subiendo la foto:', errSubida);
    if (msg) msg.textContent = 'No pudimos subir la foto. Probá de nuevo.';
    return;
  }

  const { data } = supabase.storage.from(BUCKET_FOTO).getPublicUrl(ruta);
  const url = data?.publicUrl;

  const { error } = await supabase
    .from('professionals')
    .update({ photo_url: url })
    .eq('id', estado.prof.id);

  if (error) {
    console.error('Error guardando la foto:', error);
    if (msg) msg.textContent = 'La foto se subió pero no se pudo guardar.';
    return;
  }

  estado.prof.photo_url = url;
  // La anterior queda huérfana en el bucket si no se borra -- mismo problema
  // que ya se corrigió con las fotos de producto (js/storage-utils.js).
  if (anterior) await removeStoredObjects(supabase, BUCKET_FOTO, [anterior]);

  if (msg) msg.textContent = '';
  renderFoto();
  renderVistaPrevia();
  renderResumen();
  showToast('Foto actualizada.', 'success');
}

async function quitarFoto() {
  if (!estado.prof.photo_url) return;
  if (!(await confirmDialog('¿Sacamos tu foto de la publicación?', { confirmText: 'Sacar', danger: true }))) return;

  const anterior = estado.prof.photo_url;
  const { error } = await supabase
    .from('professionals')
    .update({ photo_url: null })
    .eq('id', estado.prof.id);

  if (error) {
    console.error('Error quitando la foto:', error);
    showToast('No pudimos quitar la foto.');
    return;
  }

  estado.prof.photo_url = null;
  await removeStoredObjects(supabase, BUCKET_FOTO, [anterior]);
  renderFoto();
  renderVistaPrevia();
  showToast('Foto quitada.', 'success');
}

async function guardarPerfil(event) {
  event.preventDefault();
  const btn = event.target.querySelector('button[type="submit"]');

  const nombre = document.getElementById('of-name').value.trim();
  const especialidad = document.getElementById('of-specialty').value.trim();
  const telefono = document.getElementById('of-phone').value.trim();
  const whatsapp = document.getElementById('of-whatsapp').value.trim();

  if (!isValidShopName(nombre)) {
    showToast('Tu nombre tiene que tener entre 3 y 100 caracteres.');
    return;
  }
  if (!isValidShopName(especialidad)) {
    showToast('El oficio tiene que tener entre 3 y 100 caracteres.');
    return;
  }
  if (!isValidPhone(telefono)) {
    showToast('Revisá el teléfono: va con código de área, sin espacios ni guiones.');
    return;
  }
  if (whatsapp && !isValidPhone(whatsapp)) {
    showToast('Revisá el WhatsApp: va con código de país, por ejemplo 5493329123456.');
    return;
  }

  const cambios = {
    full_name: nombre,
    specialty: especialidad,
    description: document.getElementById('of-description').value.trim() || null,
    phone: telefono,
    whatsapp: whatsapp || null,
    category: estado.categoriaDropdown?.getValue() || estado.prof.category,
  };

  for (const { key } of SOCIAL_NETWORKS) {
    cambios[`social_${key}`] = document.getElementById(`of-social-${key}`).value.trim() || null;
    cambios[`social_${key}_show`] = document.getElementById(`of-social-${key}-show`).checked;
  }

  setLoading(btn, true);
  const { error } = await supabase
    .from('professionals')
    .update(cambios)
    .eq('id', estado.prof.id);
  setLoading(btn, false, 'Guardar cambios');

  if (error) {
    console.error('Error guardando el perfil:', error);
    showToast('No pudimos guardar los cambios.');
    return;
  }

  estado.prof = { ...estado.prof, ...cambios };
  document.getElementById('of-sidebar-name').textContent = estado.prof.full_name;
  renderVistaPrevia();
  renderResumen();
  showToast('Listo, tus datos quedaron actualizados.', 'success');
}

/** Tarjeta de muestra: lo mismo que va a ver un vecino en Contratar. */
function renderVistaPrevia() {
  const cont = document.getElementById('of-preview');
  if (!cont) return;
  const prof = estado.prof;

  const card = el('div', 'of-preview__card');

  const foto = el('div', 'of-preview__photo');
  if (prof.photo_url) {
    const img = document.createElement('img');
    img.src = prof.photo_url;
    img.alt = '';
    foto.appendChild(img);
  } else {
    foto.appendChild(icono('fa-solid fa-user'));
  }
  card.appendChild(foto);

  const info = el('div');
  info.appendChild(el('div', 'of-preview__name', prof.full_name || 'Tu nombre'));
  const meta = el('div', 'of-preview__meta');
  meta.appendChild(icono(categoryIcon(prof.category)));
  meta.appendChild(el('span', null, categoryLabel(prof.category)));
  if (prof.specialty) {
    meta.appendChild(el('span', 'of-tag of-tag--closed', prof.specialty));
  }
  info.appendChild(meta);
  card.appendChild(info);

  cont.replaceChildren(el('p', 'of-sub', 'Así te ve un vecino en Contratar:'), card);
  cont.hidden = false;
}

/* ================= Inicio ================= */

guardPage({
  requireAuth: true,
  onReady: (user) => { arrancar(user); },
});

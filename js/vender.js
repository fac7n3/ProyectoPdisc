import { supabase, showToast, setLoading, guardPage } from './auth-utils.js';
import { formatPrice, parsePrice, buildPriceRow } from './cart-utils.js';
import { isValidCuit, isValidShopName, isValidPhone, isValidProductTitle, isValidPrice, isValidStock } from './validation-utils.js';
import { renderNotificationsSection } from './notifications-utils.js';
import { subscribeToChanges, createRefresher, isEditingWithin } from './realtime-utils.js';
import { renderSupportSection, submitSupportTicket } from './support-utils.js';
import { initNotificationsBell } from './nav-utils.js';
import { initVenderShell } from './vender-shell.js';
import { loadPanelOnboardingSeen, showPanelOnboarding } from './panel-onboarding-utils.js';
import { removeStoredObjects, getImageDimensions, fileToDataUrl } from './storage-utils.js';
import { upgradeDateInputs } from './datepicker.js';
import { PROFESSIONAL_CATEGORIES, categoryLabel } from './professional-categories.js';
import { sortOptionGroups, describeSelectedOptions } from './product-options-utils.js';
import { SOCIAL_NETWORKS } from './store-contact-utils.js';
import { isValidAlias, normalizeAlias, isValidCbu, normalizeCbu, formatCbuForDisplay } from './transfer-details-utils.js';
import { buildDropdown } from './dropdown.js';
import { buildPromoEditorCard } from './home-promos-editor.js';
import { confirmDialog, formDialog } from './confirm-dialog.js';
import {
  ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, DELIVERY_METHOD_LABELS, PAYMENT_REJECT_REASONS, SELLER_CANCEL_REASONS,
  orderLabel, orderRef, canPrepare, awaitingTransfer, buyerSaysPaid, nextSellerAction, timelineSteps, eventLabel,
  formatDueDate, toWhatsappNumber, sellerWhatsappMessage,
} from './order-utils.js';
import { PHONE_COUNTRY_OPTIONS, DEFAULT_PHONE_DIAL, splitPhone } from './phone-countries.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

/** Un número (o string) de pesos a texto con separador de miles ("1500" -> "1.500"). */
function formatMoneyValue(n) {
  const digits = String(n ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('es-AR') : '';
}

/**
 * Pone el separador de miles en un input de precio mientras el vendedor
 * escribe (ej. "1500" -> "1.500"), para que no lo tenga que tipear él mismo.
 * El input queda como type="text": el valor real (sin puntos) se saca con
 * parsePrice() al leerlo, nunca con Number()/parseInt() directo sobre
 * input.value (interpretaría el "." como separador decimal).
 */
function attachMoneyFormatting(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    input.value = formatMoneyValue(input.value);
  });
}

// --- Verificar si es vendedor y mostrar la vista correcta ---
async function checkSellerState(user) {
  const registerView = document.getElementById('register-view');
  const dashboardView = document.getElementById('dashboard-view');
  const stateLoader = document.getElementById('vender-state-loading');
  const shopNameLabel = document.getElementById('dash-shop-name');
  const hamburgerBtn = document.getElementById('mc-hamburger');
  const vendorBadge = document.getElementById('vendor-mode-badge');
  const oficiosBadge = document.getElementById('oficios-mode-badge');

  // Apaga el "Cargando tu comercio…" y revela la vista que corresponda. Sin
  // esto, register-view/dashboard-view quedaban visibles por defecto (guardPage
  // ya destapó #contenido-principal antes de que esta función termine de
  // consultar la DB) y se veía el alta de comercio de más incluso para quien
  // ya tenía uno.
  const reveal = (view) => {
    if (stateLoader) stateLoader.style.display = 'none';
    registerView.style.display = view === 'register' ? 'block' : 'none';
    dashboardView.style.display = view === 'dashboard' ? 'flex' : 'none';
    // El botón hamburguesa abre el sidebar de dashboard-view (mc-sidebar) --
    // en register-view (alta de comercio/profesional, o el mini panel de
    // profesional ya publicado) no hay sidebar que abrir, así que en mobile
    // quedaba un círculo de tres líneas sin ninguna función. Estilo inline
    // (no una clase) para pisar el `display: inline-flex` que le pone la
    // media query de <900px cuando corresponde ocultarlo.
    if (hamburgerBtn) hamburgerBtn.style.display = view === 'dashboard' ? '' : 'none';
    // "Modo Vendedor" solo tiene sentido en dashboard-view (comercio real).
    // El de Oficios ya no se prende nunca acá: desde que el panel del
    // profesional vive en profesional.html, esta página es solo el alta.
    if (vendorBadge) vendorBadge.hidden = view !== 'dashboard';
    if (oficiosBadge) oficiosBadge.hidden = true;
  };

  if (!user) return; // guardPage ya se encarga de redirigir

  // El rol "real" vive en el JWT (app_metadata), no en profiles.role, que puede
  // quedar desincronizado tras cambios de rol (ver F12-17 / migración 53). Si el
  // JWT ya dice vendedor/admin (caso común) revelamos el shell al instante sin
  // esperar el round-trip a profiles: eso hacía que el dashboard tardara en
  // aparecer. profiles queda solo como fallback si el JWT no trae el rol todavía.
  const appRole = user.app_metadata?.role;

  let isSeller = ['vendedor', 'admin'].includes(appRole);
  if (!isSeller) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    isSeller = ['vendedor', 'admin'].includes(profile?.role);
  }

  if (isSeller) {
    reveal('dashboard'); // shell "Mi cuenta" (sidebar + contenido)
    await loadDashboard(user);
    return;
  }

  // F12-16: ¿es empleado de algún comercio? No necesita rol propio de vendedor.
  // Sin .maybeSingle(): esa misma cuenta podría (en teoría) ser empleada de
  // más de un comercio -- .limit(1) evita el mismo error de coerción que
  // rompía loadDashboard() con varias tiendas (ver ahí el comentario largo).
  const { data: staffRows } = await supabase
    .from('store_staff')
    .select('store_id, permissions')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);
  const staffRow = staffRows?.[0];

  if (staffRow) {
    reveal('dashboard'); // shell "Mi cuenta"
    await loadDashboard(user, staffRow.store_id, staffRow.permissions);
    return;
  }

  // ¿Tiene una solicitud de vendedor?
  const { data: req } = await supabase
    .from('seller_requests')
    .select('status, shop_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (req) {
    reveal('dashboard');

    // Solicitud APROBADA: es vendedor aunque profiles.role no lo refleje (desincronización
    // de rol) -- mostrar el panel real, no el aviso de "pendiente".
    if (req.status === 'approved') {
      await loadDashboard(user);
      return;
    }

    // Pendiente o rechazada: todavía no hay panel. Ocultamos el sidebar y todas las
    // secciones, y mostramos el estado.
    shopNameLabel.textContent = `${req.shop_name} (Estado: ${req.status})`;
    const sidebar = document.getElementById('mc-sidebar');
    if (sidebar) sidebar.style.display = 'none';
    document.querySelectorAll('.mc-content .mc-section').forEach((s) => { s.hidden = true; });
    const notice = document.getElementById('mc-pending-notice');
    if (notice) {
      notice.style.display = 'block';
      notice.textContent = `Tu solicitud para "${req.shop_name}" está en estado: ${req.status}. Te avisaremos cuando esté aprobada.`;
    }
    watchRequestStatus('seller_requests', user.id, req.status);
    return;
  }

  // Sin comercio ni solicitud de comercio: ¿ya está publicado como profesional?
  // Si lo está, su panel es una página aparte (pages/profesional.html): acá
  // solo queda el alta.
  const { data: prof } = await supabase
    .from('professionals')
    .select('id')
    .eq('owner_id', user.id)
    .limit(1);

  if (prof?.length) {
    window.location.replace('./profesional.html');
    return;
  }

  const { data: profReq } = await supabase
    .from('professional_requests')
    .select('status, full_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profReq) {
    reveal('register');
    showProfessionalStatus(profReq.status === 'pending'
      ? `Tu solicitud para publicarte como ${profReq.full_name} está pendiente de aprobación. Te avisaremos cuando esté lista.`
      : `Tu solicitud para publicarte como ${profReq.full_name} fue rechazada. Escribinos por Soporte si tenés dudas.`);
    watchRequestStatus('professional_requests', user.id, profReq.status);
    return;
  }

  reveal('register');
  const tipo = new URLSearchParams(window.location.search).get('tipo');
  showRegisterForms(tipo === 'servicio' ? 'profesional' : 'comercio');
}

/**
 * Con la solicitud en revisión, la página queda escuchando su fila: cuando el
 * admin la aprueba (o la rechaza) se pasa sola al panel nuevo, sin que la
 * persona tenga que recargar. Antes de recargar se renueva la sesión, porque
 * la aprobación cambia el rol del JWT (app_metadata.role) y el token viejo
 * todavía dice "cliente".
 */
function watchRequestStatus(table, userId, currentStatus) {
  let reloading = false;
  const reloadIfChanged = (status) => {
    if (reloading || !status || status === currentStatus) return;
    reloading = true;
    supabase.auth.refreshSession()
      .catch(() => { /* sin sesión renovada igual se recarga: checkSellerState mira la DB */ })
      .finally(() => window.location.reload());
  };
  subscribeToChanges(`solicitud-${table}`, [
    { table, event: 'UPDATE', filter: `user_id=eq.${userId}` },
  ], (change) => reloadIfChanged(change.new?.status), {
    onResync: async () => {
      const { data } = await supabase.from(table).select('status').eq('user_id', userId).maybeSingle();
      reloadIfChanged(data?.status);
    },
  });
}

/** Alterna entre el toggle+formularios y el estado de una solicitud de profesional
 *  ya enviada (pendiente/aprobada/rechazada) -- todo dentro de #register-view. */
function showRegisterForms(defaultTab = 'comercio') {
  const toggle = document.querySelector('.register-type-toggle');
  if (toggle) toggle.style.display = 'flex';
  document.getElementById('professional-status-view').style.display = 'none';
  setRegisterTab(defaultTab);
}

function setRegisterTab(tab) {
  const isComercio = tab === 'comercio';
  document.getElementById('comercio-form-wrap').style.display = isComercio ? 'block' : 'none';
  document.getElementById('profesional-form-wrap').style.display = isComercio ? 'none' : 'block';
  const btnComercio = document.getElementById('toggle-comercio');
  const btnProfesional = document.getElementById('toggle-profesional');
  btnComercio?.classList.toggle('is-active', isComercio);
  btnComercio?.setAttribute('aria-selected', String(isComercio));
  btnProfesional?.classList.toggle('is-active', !isComercio);
  btnProfesional?.setAttribute('aria-selected', String(!isComercio));
}

function showProfessionalStatus(message) {
  const toggle = document.querySelector('.register-type-toggle');
  if (toggle) toggle.style.display = 'none';
  document.getElementById('comercio-form-wrap').style.display = 'none';
  document.getElementById('profesional-form-wrap').style.display = 'none';
  const statusView = document.getElementById('professional-status-view');
  statusView.style.display = 'block';
  document.getElementById('professional-status-body').textContent = message;
}

// --- Inicializar formulario y eventos ---

/**
 * Categorías del sitio. Se cachean porque las usan dos controles distintos
 * --el select de rubros del alta de comercio y la grilla de categoría del alta
 * de producto-- y antes el segundo se armaba copiando el HTML del primero, lo
 * que ataba uno al otro y dependía de cuál se inicializara antes.
 */
let categoriesCache = [];

/** Selectores de fecha propios, por id. Los arma upgradeDateInputs(). */
let datePickers = {};

async function loadCategories() {
  const { data: categories, error } = await supabase
    .from('categories')
    .select('name, slug, icon')
    .order('name');

  if (error || !categories) {
    console.error('No se pudieron cargar las categorías:', error);
    // Sin categorías no se puede completar ninguno de los dos formularios:
    // conviene decirlo, antes quedaba un "Cargando rubros..." para siempre.
    ['prod-category-options', 'shop-category-options'].forEach((id) => {
      const grid = document.getElementById(id);
      if (grid) grid.textContent = 'No se pudieron cargar los rubros. Recargá la página.';
    });
    return;
  }

  categoriesCache = categories;

  // Los tres controles de categoría se re-dibujan acá: cualquiera de los
  // formularios puede haberse armado antes de que resolviera este fetch, así
  // que el orden de inicialización deja de importar.
  renderProductCategoryOptions();
  renderShopCategoryOptions();
  renderStoreCategoryOptions();
}

/**
 * Grilla de categorías. La usan el alta de producto (radio: una sola) y el
 * alta de comercio (checkbox: uno o más rubros); el marcado y los estilos son
 * los mismos, solo cambia el tipo de input.
 */
function renderCategoryPicker(gridId, { name, type, required = false }) {
  const grid = document.getElementById(gridId);
  if (!grid || !categoriesCache.length) return;

  // Conservar lo elegido si ya había algo marcado (ej. al re-dibujar).
  const previos = new Set(
    [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value)
  );

  grid.textContent = '';

  categoriesCache.forEach((c) => {
    const label = document.createElement('label');
    label.className = 'catpick__opt';

    const input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.value = c.slug;
    input.className = 'catpick__input';
    if (required) input.required = true;
    if (previos.has(c.slug)) input.checked = true;
    label.appendChild(input);

    const icon = document.createElement('i');
    // El ícono viene de la DB; se acota a clases de Font Awesome por las dudas.
    icon.className = `${(c.icon || 'fa-solid fa-tag').replace(/[^a-zA-Z0-9 -]/g, '')} catpick__icon`;
    icon.setAttribute('aria-hidden', 'true');
    label.appendChild(icon);

    const nameEl = document.createElement('span');
    nameEl.className = 'catpick__name';
    nameEl.textContent = c.name;
    label.appendChild(nameEl);

    const check = document.createElement('i');
    check.className = 'fa-solid fa-check catpick__check';
    check.setAttribute('aria-hidden', 'true');
    label.appendChild(check);

    grid.appendChild(label);
  });
}

/** Alta de producto: una sola categoría. */
function renderProductCategoryOptions() {
  renderCategoryPicker('prod-category-options', {
    name: 'prod-category', type: 'radio', required: true,
  });
}

/**
 * Alta de comercio: uno o más rubros. Sin `required` en los checkbox: en un
 * grupo de checkbox el required es por casilla (obligaría a marcarlas TODAS),
 * así que el mínimo de uno lo valida el submit, como ya lo hacía.
 */
function renderShopCategoryOptions() {
  renderCategoryPicker('shop-category-options', {
    name: 'shop-category', type: 'checkbox',
  });
}

/** Slug de la categoría elegida en el alta de producto ('' si ninguna). */
function getProductCategorySlug() {
  return document.querySelector('input[name="prod-category"]:checked')?.value || '';
}

/**
 * Zapatería: el rubro donde "Talle" es lo primero que se carga. Es solo una
 * ayuda de la interfaz (lista ya llamada "Talle" + botones con los números de
 * calzado): el dato guardado es el de siempre, una lista de opciones.
 */
const SHOE_CATEGORY_SLUG = 'zapateria';
const SHOE_SIZES = Array.from({ length: 14 }, (_, i) => String(33 + i)); // 33 a 46
const SHOE_COMMON_RANGE = SHOE_SIZES.filter((n) => Number(n) >= 35 && Number(n) <= 44);

function isShoeProduct() {
  return getProductCategorySlug() === SHOE_CATEGORY_SLUG;
}

/** ¿Esta lista de opciones es la de talles? (el nombre lo escribe el vendedor) */
function isSizeGroupName(name) {
  return /^(talles?|n[uú]meros?|calzado)$/i.test(String(name || '').trim());
}

/** Marca una categoría (se usa al editar un producto ya guardado). */
function setProductCategorySlug(slug) {
  document.querySelectorAll('input[name="prod-category"]').forEach((r) => {
    r.checked = r.value === slug;
  });
}

/** Rubros marcados en el alta de comercio. */
function getShopCategorySlugs() {
  return [...document.querySelectorAll('input[name="shop-category"]:checked')].map((i) => i.value);
}

/**
 * Categoría del comercio (Perfil de mi comercio, `stores.category_slug`):
 * una sola, como el alta de producto -- a diferencia del "Rubro(s)" del alta
 * de comercio (checkbox, uno o más), acá se guarda un único rubro principal.
 */
let pendingStoreCategorySlug = null; // por si loadDashboard resuelve antes que loadCategories

function renderStoreCategoryOptions() {
  renderCategoryPicker('store-category-options', {
    name: 'store-category', type: 'radio', required: true,
  });
  // loadDashboard() puede resolver antes que este fetch de categorías: si ya
  // había un rubro pendiente de marcar (ver setStoreCategorySlug), se aplica
  // recién ahora que existen los radios para marcarlo.
  if (pendingStoreCategorySlug) setStoreCategorySlug(pendingStoreCategorySlug);
}

/** Marca el rubro del comercio (se usa al precargar el perfil). */
function setStoreCategorySlug(slug) {
  pendingStoreCategorySlug = slug || null;
  document.querySelectorAll('input[name="store-category"]').forEach((r) => {
    r.checked = r.value === slug;
  });
}

/** Slug del rubro elegido en el perfil del comercio ('' si ninguno). */
function getStoreCategorySlug() {
  return document.querySelector('input[name="store-category"]:checked')?.value || '';
}

function initVenderPage(user) {
  const form = document.getElementById('seller-form');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const logoutBtn = document.getElementById('btn-logout-seller');

  // Cargar categorías y estado del vendedor
  loadCategories();
  checkSellerState(user);
  initNotificationsBell();

  // Manejar registro de comercio
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nameInput = document.getElementById('shop-name').value.trim();
    const cuitInput = document.getElementById('shop-cuit').value.trim();
    // P2-10: se puede elegir más de un rubro (era un <select multiple>, ahora
    // una grilla de checkbox -- el Ctrl+click no existía en un teléfono).
    const categoriesInput = getShopCategorySlugs();
    const addressInput = document.getElementById('shop-address').value.trim();
    const phoneInput = document.getElementById('shop-phone').value.trim();

    if (!isValidShopName(nameInput)) {
      showToast("El nombre del comercio debe tener entre 3 y 100 caracteres.", "error");
      return;
    }
    if (!isValidCuit(cuitInput)) {
      showToast("El CUIT ingresado no es válido. Verificá el formato (11 dígitos) y el dígito verificador.", "error");
      return;
    }
    if (categoriesInput.length === 0) {
      showToast("Elegí al menos un rubro.", "error");
      return;
    }
    if (!addressInput) {
      showToast("Ingresá la dirección de tu comercio.", "error");
      return;
    }
    if (!isValidPhone(phoneInput)) {
      showToast("El teléfono ingresado no es válido.", "error");
      return;
    }

    if (submitBtn) setLoading(submitBtn, true, "Registrarme");

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      showToast("Sesión inválida.", "error");
      if (submitBtn) setLoading(submitBtn, false, "Registrarme");
      return;
    }

    const { error } = await supabase
      .from('seller_requests')
      .insert({ 
        user_id: user.id, 
        shop_name: nameInput,
        cuit: cuitInput,
        category_slugs: categoriesInput,
        address: addressInput,
        phone: phoneInput
      });

    if (error) {
      console.error("Error al solicitar ser vendedor:", error);
      showToast("Hubo un error al procesar tu solicitud.", "error");
    } else {
      showToast("¡Solicitud enviada exitosamente! Revisaremos tus datos.", "success");
      await checkSellerState();
    }
    
    if (submitBtn) setLoading(submitBtn, false, "Registrarme");
  });

  // Manejar botón de volver al inicio
  logoutBtn?.addEventListener('click', () => {
    window.location.replace('./home.html');
  });

  // Toggle "Vender productos" / "Ofrecer un servicio"
  document.getElementById('toggle-comercio')?.addEventListener('click', () => setRegisterTab('comercio'));
  document.getElementById('toggle-profesional')?.addEventListener('click', () => setRegisterTab('profesional'));

  loadProfessionalCategories();
  setupProfessionalPhotoPicker();

  // Manejar alta de profesional/técnico
  const profForm = document.getElementById('professional-form');
  const profSubmitBtn = profForm?.querySelector('button[type="submit"]');
  profForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameInput = document.getElementById('prof-name').value.trim();
    const categoryInput = document.getElementById('prof-category').value;
    const specialtyInput = document.getElementById('prof-specialty').value.trim();
    const descriptionInput = document.getElementById('prof-description').value.trim();
    const phoneInput = document.getElementById('prof-phone').value.trim();
    const whatsappInput = document.getElementById('prof-whatsapp').value.trim();

    if (!isValidShopName(nameInput)) {
      showToast("El nombre debe tener entre 3 y 100 caracteres.", "error");
      return;
    }
    if (!categoryInput) {
      showToast("Elegí una categoría.", "error");
      return;
    }
    if (!isValidShopName(specialtyInput)) {
      showToast("Contá tu oficio o especialidad (entre 3 y 100 caracteres).", "error");
      return;
    }
    if (!isValidPhone(phoneInput)) {
      showToast("El teléfono ingresado no es válido.", "error");
      return;
    }
    if (whatsappInput && !isValidPhone(whatsappInput)) {
      showToast("El WhatsApp ingresado no es válido.", "error");
      return;
    }

    if (profSubmitBtn) setLoading(profSubmitBtn, true, "Enviar solicitud");

    const { data: { user: currentUser } } = await supabase.auth.getUser();

    if (!currentUser) {
      showToast("Sesión inválida.", "error");
      if (profSubmitBtn) setLoading(profSubmitBtn, false, "Enviar solicitud");
      return;
    }

    const { error } = await supabase
      .from('professional_requests')
      .insert({
        user_id: currentUser.id,
        full_name: nameInput,
        category: categoryInput,
        specialty: specialtyInput,
        description: descriptionInput || null,
        phone: phoneInput,
        whatsapp: whatsappInput || null,
        photo_url: profPhotoUrl,
      });

    if (error) {
      console.error("Error al solicitar publicarse como profesional:", error);
      showToast("Hubo un error al procesar tu solicitud.", "error");
    } else {
      showToast("¡Solicitud enviada! Revisaremos tus datos antes de publicarte.", "success");
      profPhotoUrl = null;
      await checkSellerState(currentUser);
    }

    if (profSubmitBtn) setLoading(profSubmitBtn, false, "Enviar solicitud");
  });
}

/** Llena el <select> de categorías del alta de profesional. */
function loadProfessionalCategories() {
  const select = document.getElementById('prof-category');
  if (!select) return;
  PROFESSIONAL_CATEGORIES.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.value;
    opt.textContent = cat.label;
    select.appendChild(opt);
  });
}

// Foto/logo del alta de profesional: se sube apenas se elige el archivo
// (igual que el avatar de Mi perfil), la URL pública viaja en el insert de
// professional_requests recién al enviar el formulario.
const MAX_PROF_PHOTO_BYTES = 2 * 1024 * 1024;
let profPhotoUrl = null;

function setupProfessionalPhotoPicker() {
  const input = document.getElementById('prof-photo');
  const preview = document.getElementById('prof-photo-preview');
  if (!input || !preview) return;

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > MAX_PROF_PHOTO_BYTES) {
      showToast('Esa imagen pesa más de 2 MB. Probá con una más liviana.', 'error');
      input.value = '';
      return;
    }

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      showToast('Sesión inválida.', 'error');
      input.value = '';
      return;
    }

    const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5);
    const path = `${currentUser.id}/${Date.now()}.${ext || 'jpg'}`;

    const { error: upErr } = await supabase.storage
      .from('professional-photos')
      .upload(path, file, { contentType: file.type || 'image/jpeg' });

    if (upErr) {
      console.error('Error al subir la foto:', upErr);
      showToast('No se pudo subir la foto.', 'error');
      input.value = '';
      return;
    }

    const { data: pub } = supabase.storage.from('professional-photos').getPublicUrl(path);
    profPhotoUrl = pub?.publicUrl || null;

    preview.textContent = '';
    const img = document.createElement('img');
    img.src = profPhotoUrl;
    img.alt = '';
    preview.appendChild(img);
  });
}

// --- Vista y Lógica de Vendedor (Dashboard) ---
let currentStoreId = null;
let editingProductId = null; // F5-02: null = alta nueva, id = editando ese producto
let currentStoreHasProfile = false; // F12-15: onboarding -- ver renderOnboardingChecklist
// Migración 107: sin alias bancario no se pueden publicar productos nuevos
// (la base lo rechaza con un trigger). Arranca en null = "todavía no se
// sabe", para no mostrar el aviso por un instante a quien sí lo tiene.
let currentStoreHasAlias = null;
let currentProductCount = 0;
let currentActiveProductCount = 0; // Resumen: productos activos (para la card de pendientes)
let currentInactiveProductCount = 0; // Resumen: productos pausados/inactivos
let currentUserFirstName = 'vendedor'; // Resumen: nombre para el saludo "¡Hola, {nombre}!"
let currentUserId = null; // Resumen: para detectar preguntas sin responder (último mensaje no es mío)
let isStoreOwner = true; // F12-16: false si el usuario entra como empleado (store_staff), no dueño

/**
 * Secciones operativas que el dueño puede prender/apagar por empleado
 * (store_staff.permissions, migración 83). Las exclusivas del dueño (perfil
 * del comercio, cupones, empleados) ni "Resumen"/"Publicaciones preview" van
 * acá -- nunca se le ofrecen al empleado como opción, siempre están o
 * siempre ocultas según sea dueño o no.
 */
const STAFF_PERMISSION_SECTIONS = [
  { key: 'publicaciones', label: 'Publicaciones' },
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'resenas', label: 'Reseñas' },
  { key: 'notificaciones', label: 'Notificaciones' },
  { key: 'soporte', label: 'Soporte' },
];

/** Default fail-open (todo true) si por lo que sea `permissions` no llegó (fila vieja, error de red). */
function staffPermissionsWithDefaults(permissions) {
  const result = {};
  STAFF_PERMISSION_SECTIONS.forEach(({ key }) => {
    result[key] = permissions ? permissions[key] !== false : true;
  });
  return result;
}

// Sección "Publicaciones" (rediseño ML): productos cacheados + ventas por producto
// + estado de los filtros client-side (búsqueda por título / estado activo-pausado).
let pubProducts = [];
let pubSalesByProduct = new Map();
let pubSearch = '';
let pubStatus = 'all'; // 'all' | 'active' | 'inactive'
// Selección múltiple ("Seleccionar varios"): modo prendido/apagado + ids tildados.
// Los ids se podan en cada render a lo que está visible -- ver renderPublicaciones().
let pubSelectMode = false;
const pubSelected = new Set();

// Sección "Pedidos" (stats + tabs + tabla): pedidos cacheados (con sus
// order_items/producto) + estado de los filtros client-side (búsqueda,
// pestaña de estado, orden, filtro de entrega del menú "Filtros").
let ordCache = [];
let currentStoreName = '';
let ordPhoneByClientId = new Map();
let ordNameByClientId = new Map();
let ordSearch = '';
let pedidosTab = 'all'; // 'all' | 'to_confirm' | 'pending_payment' | 'to_prepare' | 'in_progress' | 'completed' | 'cancelled'
let pedidosSort = 'recent'; // 'recent' | 'oldest' | 'amount_desc' | 'amount_asc'
let pedidosDeliveryFilter = 'all'; // 'all' | 'pickup' | 'delivery'

const STORE_SELECT_COLUMNS = 'id, name, category_slug, logo_url, address, description, zone, hours, delivery_fee, free_shipping_threshold, mp_collector_id, mp_split_pilot, contact_method, whatsapp, social_instagram, social_instagram_show, social_facebook, social_facebook_show, social_tiktok, social_tiktok_show, social_x, social_x_show, social_youtube, social_youtube_show, social_website, social_website_show';

// Copy de las tarjetas de bienvenida al panel (js/panel-onboarding-utils.js).
// Clave = mismo valor que data-section en el sidebar (pages/vender.html).
const VENDOR_SECTION_COPY = {
  resumen: { icon: 'fa-solid fa-chart-simple', title: 'Resumen', desc: 'De un vistazo: cómo viene tu comercio hoy — pedidos, ventas y lo que necesita tu atención.' },
  'perfil-comercio': { icon: 'fa-solid fa-pen', title: 'Perfil de mi comercio', desc: 'Los datos que ve un vecino antes de comprarte: nombre, horarios, dirección y medios de pago.' },
  publicaciones: { icon: 'fa-solid fa-image', title: 'Publicaciones', desc: 'Acá cargás y editás lo que vendés: fotos, precios y stock de cada producto.' },
  pedidos: { icon: 'fa-solid fa-receipt', title: 'Pedidos', desc: 'Los pedidos que te van llegando: confirmá los pagos, prepará cada uno y avisá cuando esté listo.' },
  resenas: { icon: 'fa-regular fa-star', title: 'Reseñas', desc: 'Lo que opinan tus clientes de tu comercio y de cada producto, apenas lo escriben.' },
  recomendaciones: { icon: 'fa-regular fa-lightbulb', title: 'Recomendaciones', desc: 'Consejos simples para vender más y destacarte entre los comercios de Baradero.' },
  cupones: { icon: 'fa-solid fa-ticket', title: 'Mis cupones', desc: 'Códigos de descuento para atraer más ventas a tu comercio.' },
  'promo-inicio': { icon: 'fa-solid fa-bullhorn', title: 'Banner del inicio', desc: 'Si te asignamos un banner en la página de inicio, acá cargás la imagen y a qué publicación lleva.' },
  empleados: { icon: 'fa-solid fa-users', title: 'Empleados', desc: 'Sumá a quien te ayuda en el mostrador y elegí a qué secciones puede entrar.' },
  notificaciones: { icon: 'fa-regular fa-bell', title: 'Notificaciones', desc: 'Avisos de pedidos nuevos, pagos y novedades de tu comercio.' },
  soporte: { icon: 'fa-solid fa-headset', title: 'Soporte', desc: '¿Algo no anda como esperabas? Escribinos y te ayudamos.' },
};

// Arma las tarjetas SOLO con lo que el sidebar realmente muestra a esta
// cuenta (ya filtrado por dueño/empleado y permisos más arriba, en
// loadDashboard) -- así un empleado sin "Empleados"/"Cupones" no ve esas
// tarjetas tampoco en la bienvenida.
function buildVendorOnboardingSections() {
  const keys = new Set();
  document.querySelectorAll('#mc-sidebar [data-section]').forEach((el) => keys.add(el.dataset.section));
  return [...keys].map((k) => VENDOR_SECTION_COPY[k]).filter(Boolean);
}

async function maybeShowVendorOnboarding() {
  if (await loadPanelOnboardingSeen('vendedor')) return;
  showPanelOnboarding({
    panelKey: 'vendedor',
    title: '¡Bienvenido a tu panel de vendedor!',
    greeting: 'Acá vas a manejar tu comercio en Baradero Local. Esto es lo que hace cada sección:',
    sections: buildVendorOnboardingSections(),
  });
}

/**
 * F12-16: multi-usuario por comercio. `staffStoreId` viene seteado cuando
 * quien entra no es el dueño sino un empleado (store_staff) -- en ese caso
 * se carga la tienda por id en vez de por owner_id, y se ocultan las
 * secciones exclusivas del dueño (perfil del comercio, cupones, empleados)
 * más las que el dueño le haya destildado (`staffPermissions`, migración 83).
 * Paridad total en lo operativo (productos/pedidos/comprobantes) vía las
 * policies aditivas de 49_store_staff.sql -- nunca se tocó el acceso del dueño.
 */
async function loadDashboard(user, staffStoreId, staffPermissions) {
  isStoreOwner = !staffStoreId;

  // Cache-first del nombre de la tienda: lo pintamos al instante desde
  // localStorage (mismo patrón que bl_catbar_cache) para que el header no
  // muestre "Tu Comercio" y salte al nombre real en cada navegación.
  const shopNameEl = document.getElementById('dash-shop-name');
  const SHOP_NAME_KEY = `bl_vender_shopname_${user.id}`;
  try {
    const cachedName = localStorage.getItem(SHOP_NAME_KEY);
    if (cachedName && shopNameEl) shopNameEl.textContent = cachedName;
  } catch { /* localStorage bloqueado: ignorar */ }

  // Sin .single(): algunas cuentas (datos de seed/test) llegaron a tener más
  // de un registro en `stores` con el mismo owner_id -- .single() tira error
  // de coerción PostgREST apenas hay 2+ filas ("JSON object requested,
  // multiple rows returned") y el panel quedaba en blanco (reveal('dashboard')
  // ya había pasado, pero loadDashboard cortaba acá arriba, antes de cablear
  // el sidebar/las secciones). Con .limit(1) + tomar la primera fila, el
  // panel siempre carga aunque la cuenta tenga varias tiendas -- se queda con
  // la más nueva.
  const { data: stores, error } = await supabase
    .from('stores')
    .select(STORE_SELECT_COLUMNS)
    .eq(isStoreOwner ? 'owner_id' : 'id', isStoreOwner ? user.id : staffStoreId)
    .order('created_at', { ascending: false })
    .limit(1);
  const store = stores?.[0];

  if (error || !store) {
    console.error("Error al cargar la tienda", error);
    return;
  }

  currentStoreId = store.id;
  currentStoreName = store.name || '';
  const previewLink = document.getElementById('preview-store-link');
  if (previewLink) previewLink.href = `./comercio.html?id=${store.id}`;
  currentStoreHasProfile = Boolean(store.description && store.description.trim());
  loadStoreAliasState(store.id);
  const shopLabel = isStoreOwner ? store.name : `${store.name} (como empleado)`;
  if (shopNameEl) shopNameEl.textContent = shopLabel;
  try { localStorage.setItem(SHOP_NAME_KEY, shopLabel); } catch { /* ignore */ }
  currentUserId = user.id;
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || store.name;
  currentUserFirstName = fullName ? fullName.trim().split(/\s+/)[0] : 'vendedor';
  const greetingName = document.getElementById('resumen-greeting-name');
  if (greetingName) greetingName.textContent = currentUserFirstName;

  // Secciones exclusivas del dueño -- un empleado no las ve.
  ['store-profile-section', 'my-coupons-section', 'store-staff-section', 'home-promo-section'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = isStoreOwner ? '' : 'none';
  });
  // Ítems del sidebar exclusivos del dueño (shell "Mi cuenta"): un empleado no los ve.
  document.querySelectorAll('.mc-navitem--owner').forEach((item) => {
    item.style.display = isStoreOwner ? '' : 'none';
  });

  // Permisos por sección (migración 83): además de lo exclusivo del dueño,
  // un empleado puede tener secciones operativas destildadas. Se sacan del
  // DOM (nav item + <section>, ambos comparten el mismo data-section) en vez
  // de solo ocultarlas -- así el shell (que muestra cualquier data-section
  // presente en el DOM que matchee el hash, ver showActiveSection en
  // vender-shell.js) no las revela igual si alguien toca el hash a mano.
  if (!isStoreOwner) {
    const perms = staffPermissionsWithDefaults(staffPermissions);
    STAFF_PERMISSION_SECTIONS.forEach(({ key }) => {
      if (!perms[key]) {
        document.querySelectorAll(`[data-section="${key}"]`).forEach((el) => el.remove());
      }
    });
  }

  // Cablear el shell YA (sidebar interactivo + mostrar la sección correcta del
  // hash al instante), ANTES de la cadena de renders de datos. Antes esto era lo
  // último: el sidebar aparecía pero no respondía a clicks hasta que resolvían
  // ~10 fetches, y un deep-link (#pedidos) mostraba "Resumen" y saltaba. Ambas
  // funciones solo cablean listeners/nav sobre DOM estático; cada sección
  // rellena su propio placeholder por detrás a medida que llega su data.
  setupDashboardEvents();
  // El dueño entra directo a "Perfil de mi comercio" (a pedido del usuario,
  // 2026-09-16); un empleado no tiene esa sección y sigue cayendo en "Resumen".
  initVenderShell({ defaultSection: isStoreOwner ? 'perfil-comercio' : 'resumen' });
  maybeShowVendorOnboarding();

  if (isStoreOwner) {
    fillStoreProfileForm(store);
  }

  const notificacionesContainer = document.getElementById('notificaciones-container');
  if (notificacionesContainer) await renderNotificationsSection(notificacionesContainer, user.id, { scope: 'comercio' });

  const supportContainer = document.getElementById('support-container');
  if (supportContainer) await renderSupportSection(supportContainer);

  // fetchProducts primero (setea currentActiveProductCount, que lee renderResumen);
  // el resto son renders independientes → en paralelo, cada sección pinta apenas
  // tiene sus datos en vez de esperar a los de las demás secciones.
  await fetchProducts();
  await Promise.all([
    renderAllOrders(),
    renderResumen(),
    renderResenas(),
  ]);

  if (isStoreOwner) {
    await Promise.all([renderMyCoupons(), renderStoreStaff(), renderHomePromo(store.name)]);
  }

  applyOrderDeepLink();
  applyDeliverDeepLink();
  initOrdersLive();
  initReviewsLive();
  initOrderAlerts();
}

// --- Sección "Reseñas" (tiempo real) ---
// Lo que escribieron los clientes sobre el comercio (target_type 'store') y
// sobre cada uno de sus productos ('product'). Las reseñas no tienen una FK al
// comercio, así que se piden en dos consultas: las del comercio por su id, y
// las de los productos por la lista de ids que ya tiene cargada Publicaciones.
// Cada reseña nueva (o editada, o escondida por un moderador) llega por
// Realtime y la lista se redibuja sola; la nueva se marca unos segundos.
// El aviso emergente (migración 119) muestra el mismo texto que la tarjeta.
const REVIEW_COLUMNS = 'id, target_type, target_id, rating, comment, created_at, owner_reply, owner_replied_at';
let resenasCache = [];
let resenasKnownIds = null; // null hasta la primera carga: ahí nada es "nueva"
let resenasFilter = 'all'; // 'all' | 'store' | 'product'

function reviewStars(rating) {
  const r = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function isMyReviewTarget(targetType, targetId) {
  if (targetType === 'store') return targetId === currentStoreId;
  if (targetType === 'product') return pubProducts.some((p) => p.id === targetId);
  return false;
}

async function fetchMyReviews() {
  if (!currentStoreId) return null;
  const productIds = pubProducts.map((p) => p.id);
  const [storeRes, productRes] = await Promise.all([
    supabase.from('reviews').select(REVIEW_COLUMNS).eq('target_type', 'store').eq('target_id', currentStoreId).eq('is_hidden', false),
    productIds.length
      ? supabase.from('reviews').select(REVIEW_COLUMNS).eq('target_type', 'product').in('target_id', productIds).eq('is_hidden', false)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (storeRes.error || productRes.error) {
    console.error('Error al cargar las reseñas del comercio:', storeRes.error || productRes.error);
    return null;
  }
  return [...(storeRes.data || []), ...(productRes.data || [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function buildReviewCard(review, { isNew }) {
  const card = rsEl('article', 'rv-card' + (isNew ? ' rv-card--new' : ''));
  card.dataset.reviewId = review.id;

  const top = rsEl('div', 'rv-card__top');
  const stars = rsEl('span', 'rv-card__stars', reviewStars(review.rating));
  stars.setAttribute('aria-label', `${review.rating} de 5 estrellas`);
  if (isNew) stars.appendChild(rsEl('span', 'rv-card__new', 'Nueva'));
  top.appendChild(stars);
  top.appendChild(rsEl('span', 'rv-card__date', new Date(review.created_at).toLocaleString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })));
  card.appendChild(top);

  const comment = (review.comment || '').trim();
  card.appendChild(rsEl('p', 'rv-card__comment' + (comment ? '' : ' rv-card__comment--empty'), comment || 'Dejó solo las estrellas, sin comentario.'));

  if (review.target_type === 'product') {
    const product = pubProducts.find((p) => p.id === review.target_id);
    const target = rsEl('a', 'rv-card__target');
    target.href = `./producto.html?id=${encodeURIComponent(review.target_id)}`;
    target.appendChild(rsEl('i', 'fa-solid fa-box'));
    target.appendChild(document.createTextNode(product?.title || 'Producto'));
    card.appendChild(target);
  } else {
    const target = rsEl('span', 'rv-card__target');
    target.appendChild(rsEl('i', 'fa-solid fa-store'));
    target.appendChild(document.createTextNode('Tu comercio'));
    card.appendChild(target);
  }

  if (review.owner_reply) {
    const reply = rsEl('div', 'rv-card__reply');
    reply.appendChild(rsEl('strong', null, 'Tu respuesta'));
    reply.appendChild(document.createTextNode(review.owner_reply));
    card.appendChild(reply);
  }
  return card;
}

function renderResenasView(newIds) {
  const list = document.getElementById('resenas-list');
  const summary = document.getElementById('resenas-summary');
  if (!list || !summary) return;

  // Resumen: siempre sobre todas, el filtro no lo cambia.
  summary.replaceChildren();
  if (resenasCache.length) {
    const avg = resenasCache.reduce((sum, r) => sum + r.rating, 0) / resenasCache.length;
    summary.appendChild(rsEl('span', 'rv-summary__score', avg.toFixed(1)));
    summary.appendChild(rsEl('span', 'rv-summary__stars', reviewStars(avg)));
    const nStore = resenasCache.filter((r) => r.target_type === 'store').length;
    const nProd = resenasCache.length - nStore;
    summary.appendChild(rsEl('span', 'rv-summary__count', `${resenasCache.length} reseña${resenasCache.length === 1 ? '' : 's'} · ${nStore} del comercio · ${nProd} de productos`));
  }

  const visible = resenasFilter === 'all' ? resenasCache : resenasCache.filter((r) => r.target_type === resenasFilter);
  if (!visible.length) {
    const empty = rsEl('div', 'rv-empty');
    empty.appendChild(rsEl('i', 'fa-regular fa-star'));
    empty.appendChild(rsEl('p', null, resenasCache.length
      ? 'No hay reseñas en esta categoría.'
      : 'Todavía no te dejaron reseñas. Cuando alguien escriba una, la vas a ver acá al instante.'));
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...visible.map((r) => buildReviewCard(r, { isNew: newIds.has(r.id) })));
}

async function renderResenas() {
  const reviews = await fetchMyReviews();
  if (!reviews) return; // falló la consulta: se deja lo que había
  const newIds = new Set();
  if (resenasKnownIds) reviews.forEach((r) => { if (!resenasKnownIds.has(r.id)) newIds.add(r.id); });
  resenasKnownIds = new Set(reviews.map((r) => r.id));
  resenasCache = reviews;
  renderResenasView(newIds);
}

function initReviewsLive() {
  if (!currentStoreId) return;

  document.getElementById('resenas-filters')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.pub-chip');
    if (!chip) return;
    resenasFilter = chip.dataset.filter;
    document.querySelectorAll('#resenas-filters .pub-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    renderResenasView(new Set());
  });

  const refreshResenas = createRefresher(renderResenas, { delay: 400 });
  // La reputación del Resumen (promedio y cantidad) sale de las mismas reseñas.
  const refreshResumenForReviews = createRefresher(renderResumen, { delay: 1500 });
  const refreshAll = () => { refreshResenas(); refreshResumenForReviews(); };

  // Sin filtro de servidor: `reviews` no tiene store_id y los productos del
  // comercio cambian (se publica uno nuevo y su reseña tiene que entrar sin
  // recargar). Las reseñas son públicas, así que no llega nada que otro no
  // pueda leer ya; acá se descarta lo que no es de este comercio.
  subscribeToChanges('resenas-comercio', [{ table: 'reviews' }], (change) => {
    if (change.eventType === 'DELETE') {
      if (resenasCache.some((r) => r.id === change.old?.id)) refreshAll();
      return;
    }
    const row = change.new || {};
    if (isMyReviewTarget(row.target_type, row.target_id) || resenasCache.some((r) => r.id === row.id)) refreshAll();
  }, { onResync: refreshAll });

  // Segundo camino: el aviso de "nueva reseña" también dispara la recarga, por
  // si el evento de la tabla se perdió.
  window.addEventListener('bl:new-notifications', (e) => {
    if ((e.detail || []).some((n) => n?.type === 'new_review')) refreshAll();
  });
}

// --- Tiempo real: pedidos, resumen y stock sin recargar ---
// Antes, un pedido nuevo (o un pago confirmado, un "ya transferí", una
// cancelación del comprador) recién aparecía al recargar, o a los 30s cuando
// el polling de notificaciones lo detectaba -- y un empleado, que no recibe
// esas notificaciones, no se enteraba nunca. Ahora el panel escucha los
// pedidos de su comercio por Supabase Realtime (migración 117) y se actualiza
// solo, en todos los dispositivos donde esté abierto. La RLS de `orders` y
// `payment_proofs` ya limita lo que llega al dueño y a sus empleados.

let refreshOrdersLive = () => {};

function initOrdersLive() {
  if (!currentStoreId) return;

  const pedidosList = () => document.getElementById('pedidos-list');
  refreshOrdersLive = createRefresher(renderAllOrders, {
    isBusy: () => isEditingWithin(pedidosList()),
  });
  // El resumen hace varias consultas: va con más margen, para que una ráfaga
  // de cambios (pedido + pago + stock) termine en una sola recarga.
  const refreshResumen = createRefresher(renderResumen, { delay: 1500 });
  // Stock y "vendidos" de Publicaciones: solo cambian con un pedido nuevo o
  // uno cancelado (el stock vuelve). No se redibuja con un menú de "⋯" abierto.
  const refreshProducts = createRefresher(fetchProducts, {
    delay: 1500,
    isBusy: () => Boolean(document.querySelector('.pub-actions__menu:not([hidden])')),
  });

  const onOrderChange = (change) => {
    refreshOrdersLive();
    refreshResumen();
    if (change.eventType === 'INSERT' || change.new?.status === 'cancelled') refreshProducts();
  };

  subscribeToChanges('pedidos-comercio', [
    { table: 'orders', filter: `store_id=eq.${currentStoreId}` },
    // Comprobante subido o revisado: la tarjeta del pedido muestra su estado.
    // Sin filtro (la tabla no tiene store_id): la RLS deja pasar solo los de
    // este comercio.
    { table: 'payment_proofs' },
  ], onOrderChange, {
    onResync: () => {
      refreshOrdersLive();
      refreshResumen();
      refreshProducts();
    },
  });
}

/**
 * A113-271: al venir de una notificación de pedido (`vender.html?order=<id>#pedidos`)
 * precarga el buscador de "Pedidos" con el número del pedido (#BL-1066) y
 * abre su detalle.
 */
function applyOrderDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order');
  if (!orderId) return;

  const order = ordCache.find((o) => o.id === orderId);
  const ref = order ? orderRef(order) : orderId.split('-')[0].toUpperCase();
  const searchInput = document.getElementById('pedidos-search');
  if (searchInput) searchInput.value = ref;
  ordSearch = ref;
  setPedidosTab('all');
  if (order) openOrderDetail(order);

  const url = new URL(window.location);
  url.searchParams.delete('order');
  window.history.replaceState({}, '', url);
}

// --- F5-06: gestión de pedidos ---
// Flujo completo (migración 115): cada paso pasa por un RPC que valida quién
// puede hacerlo y avisa al comprador (trigger orders_after_change). Qué botón
// mostrar en cada estado sale de js/order-utils.js, compartido con "Mis compras".

const ORDER_STATUS_BADGE_VARIANT = {
  pending: 'pending',
  paid: 'active',
  shipped: 'shipped',
  ready_for_pickup: 'ready',
  completed: 'active',
  cancelled: 'cancelled',
};

const ORDER_SELECT = 'id, order_number, client_id, status, payment_status, payment_method, delivery_method, shipping_address, delivery_fee, total_price, created_at, payment_due_at, transfer_notified_at, cancel_reason, cancelled_by, revocation_requested_at, revocation_resolved_at, order_items(quantity, price, title, selected_options, products(title, image_url)), payment_proofs(id, status, receipt_url, created_at), deliveries(id, status)';

async function renderAllOrders() {
  if (!currentStoreId) return;

  const { data: orders, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('store_id', currentStoreId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error al cargar pedidos:', error);
    ordCache = [];
    renderPedidos();
    return;
  }

  ordCache = orders || [];

  // F12-05: orders.client_id no tiene FK a profiles (sí a auth.users), así
  // que PostgREST no puede embeberlo en el select de arriba -- hace falta
  // una segunda consulta. RLS nueva (profiles_select_order_participants)
  // es la que permite verlo: solo clientes que efectivamente compraron acá.
  const clientIds = [...new Set(ordCache.map((o) => o.client_id).filter(Boolean))];
  const { data: clientProfiles } = clientIds.length
    ? await supabase.from('profiles').select('id, phone, full_name').in('id', clientIds)
    : { data: [] };
  ordPhoneByClientId = new Map((clientProfiles || []).map((p) => [p.id, p.phone]));
  ordNameByClientId = new Map((clientProfiles || []).map((p) => [p.id, p.full_name]));

  renderPedidos();
  refreshOpenOrderDetail();
}

/** Con un repartidor asignado, el pedido lo avanza él, no el comercio. */
function orderHasCourier(order) {
  return (order.deliveries || []).some((d) => d.status !== 'cancelled');
}

/** El último comprobante sin revisar, si hay. */
function pendingProof(order) {
  return (order.payment_proofs || [])
    .filter((p) => p.status === 'pending')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

/** Ícono + nombre del primer producto del pedido, con "· N productos" si tiene más de uno. */
function buildPedidoProductCell(order) {
  const cell = document.createElement('div');
  cell.className = 'pd-cell-product';
  const items = order.order_items || [];
  const first = items[0];

  const thumb = document.createElement('img');
  thumb.className = 'pd-cell-product__thumb';
  thumb.src = first?.products?.image_url || '/img/no-image.svg';
  thumb.alt = '';
  thumb.loading = 'lazy';
  cell.appendChild(thumb);

  const info = document.createElement('div');
  const name = document.createElement('span');
  name.className = 'pd-cell-product__name';
  // `title` (textContent) es el nombre congelado al momento de la compra
  // (order_items.title); el join a products es solo el respaldo para pedidos
  // viejos que no lo tienen.
  const productName = first?.title || first?.products?.title || 'Producto eliminado';
  name.textContent = `${first?.quantity > 1 ? `${first.quantity}x ` : ''}${productName}`;
  name.title = productName;
  info.appendChild(name);

  // Qué le pidieron exactamente. Sin esto el vendedor no sabe de qué color despachar.
  const firstOptions = describeSelectedOptions(first?.selected_options);
  if (firstOptions) {
    const opts = document.createElement('span');
    opts.className = 'pd-cell-product__options';
    opts.textContent = firstOptions;
    info.appendChild(opts);
  }

  if (items.length > 1) {
    // Con varios ítems se listan los demás (hasta 3) en vez del conteo pelado:
    // "2 productos" no alcanza para preparar el pedido si cada uno tiene su
    // color. El resto queda como conteo; el detalle los muestra todos.
    const rest = items.slice(1);
    rest.slice(0, 3).forEach((it) => {
      const line = document.createElement('span');
      line.className = 'pd-cell-product__sub';
      const itOptions = describeSelectedOptions(it.selected_options);
      line.textContent = `${it.quantity}x ${it.title || it.products?.title || 'Producto'}${itOptions ? ` — ${itOptions}` : ''}`;
      info.appendChild(line);
    });
    if (rest.length > 3) {
      const more = document.createElement('span');
      more.className = 'pd-cell-product__sub';
      more.textContent = `+${rest.length - 3} producto${rest.length - 3 === 1 ? '' : 's'} más`;
      info.appendChild(more);
    }
  } else {
    const sub = document.createElement('span');
    sub.className = 'pd-cell-product__sub';
    sub.textContent = '1 producto';
    info.appendChild(sub);
  }

  cell.appendChild(info);
  return cell;
}

/** Link de WhatsApp al comprador con el mensaje según el estado, o null sin celular. */
function buyerWhatsappHref(order) {
  const number = toWhatsappNumber(ordPhoneByClientId.get(order.client_id));
  if (!number) return null;
  const text = sellerWhatsappMessage(order, {
    storeName: currentStoreName,
    buyerName: ordNameByClientId.get(order.client_id),
  });
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function buildPedidoBuyerCell(order) {
  const cell = document.createElement('div');
  cell.className = 'pd-cell-buyer';
  const name = ordNameByClientId.get(order.client_id) || 'Comprador';
  const phone = ordPhoneByClientId.get(order.client_id);

  const avatar = document.createElement('div');
  avatar.className = 'pd-cell-buyer__avatar';
  avatar.textContent = name.trim().charAt(0).toUpperCase() || '?';
  cell.appendChild(avatar);

  const info = document.createElement('div');
  const nameEl = rsEl('span', 'pd-cell-buyer__name', name);
  nameEl.title = name;
  info.appendChild(nameEl);
  // El comprador solo puede escribirle al vendedor por WhatsApp (ver
  // store-contact-utils.js) -- nunca llamarlo. Al revés sí: acá el vendedor
  // tiene el celular del comprador, por si necesita escribirle o llamarlo.
  info.appendChild(rsEl('span', 'pd-cell-buyer__loc', phone || 'Sin celular cargado'));
  cell.appendChild(info);

  const waHref = buyerWhatsappHref(order);
  if (waHref) {
    const wa = document.createElement('a');
    wa.className = 'pd-wa';
    wa.href = waHref;
    wa.target = '_blank';
    wa.rel = 'noopener noreferrer';
    wa.setAttribute('aria-label', `Escribirle a ${name} por WhatsApp`);
    wa.title = 'Escribirle por WhatsApp';
    wa.innerHTML = '<i class="fa-brands fa-whatsapp" aria-hidden="true"></i>';
    cell.appendChild(wa);
  }

  return cell;
}

function ordChip(text, variant = '', icon = '') {
  const chip = rsEl('span', `ord-chip${variant ? ` ord-chip--${variant}` : ''}`);
  if (icon) chip.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i> `;
  chip.appendChild(document.createTextNode(text));
  return chip;
}

/** Cómo paga, cómo se entrega y lo que necesita atención, en chips. */
function buildOrderChips(order) {
  const chips = rsEl('div', 'ord-chips');
  chips.appendChild(ordChip(PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method || 'Pago', '',
    order.payment_method === 'efectivo' ? 'fa-money-bill-wave' : 'fa-credit-card'));
  chips.appendChild(ordChip(order.delivery_method === 'delivery' ? 'Envío' : 'Retiro', '',
    order.delivery_method === 'delivery' ? 'fa-truck' : 'fa-store'));

  if (awaitingTransfer(order)) {
    if (pendingProof(order)) chips.appendChild(ordChip('Mandó comprobante', 'warn', 'fa-receipt'));
    else if (order.transfer_notified_at) chips.appendChild(ordChip('Avisó que transfirió', 'warn', 'fa-bell'));
    else if (order.payment_due_at) chips.appendChild(ordChip(`Vence ${formatDueDate(order.payment_due_at)}`, '', 'fa-clock'));
  }
  if (order.revocation_requested_at && !order.revocation_resolved_at && order.status !== 'cancelled') {
    chips.appendChild(ordChip('Pidió arrepentimiento', 'danger', 'fa-rotate-left'));
  }
  if (orderHasCourier(order)) chips.appendChild(ordChip('Lo lleva un repartidor', 'info', 'fa-motorcycle'));
  return chips;
}

/**
 * Lo que el vendedor tiene que hacer con este pedido ahora (o por qué está
 * cerrado). Se usa en la tarjeta y en el detalle, así los dos ofrecen lo mismo.
 */
function buildOrderActionBlock(order) {
  if (order.status === 'cancelled') {
    const reason = order.cancel_reason ? `: ${order.cancel_reason}` : '';
    const who = order.cancelled_by === 'buyer' ? 'Lo canceló el comprador' : order.cancelled_by === 'system' ? 'Se canceló solo' : 'Cancelado';
    return rsEl('p', 'ord-note', `${who}${reason}`);
  }

  const block = rsEl('div', 'ord-action');

  if (awaitingTransfer(order)) {
    block.classList.add('ord-action--pay');
    const proof = pendingProof(order);
    let text;
    if (proof) text = `El comprador mandó el comprobante de ${formatPrice(order.total_price)}. Revisá tu cuenta y confirmá.`;
    else if (order.transfer_notified_at) text = `El comprador avisó que transfirió ${formatPrice(order.total_price)}. Revisá tu cuenta y confirmá.`;
    else text = `Esperando la transferencia de ${formatPrice(order.total_price)}${order.payment_due_at ? `. Vence ${formatDueDate(order.payment_due_at)}` : ''}.`;
    block.appendChild(rsEl('p', 'ord-action__text', text));

    if (!isStoreOwner) {
      block.appendChild(rsEl('p', 'ord-action__hint', 'El dueño del comercio es quien confirma los pagos.'));
      return block;
    }

    const btns = rsEl('div', 'ord-action__btns');
    const confirmBtn = rsEl('button', 'form-btn ord-action__primary', 'Confirmar pago');
    confirmBtn.type = 'button';
    confirmBtn.addEventListener('click', () => confirmOrderTransferPayment(order, confirmBtn));
    const rejectBtn = rsEl('button', 'btn-outline ord-action__secondary', 'Rechazar');
    rejectBtn.type = 'button';
    rejectBtn.addEventListener('click', () => rejectOrderTransferPayment(order));
    btns.append(confirmBtn, rejectBtn);
    block.appendChild(btns);
    if (proof) {
      const proofBtn = rsEl('button', 'ord-link', 'Ver comprobante');
      proofBtn.type = 'button';
      proofBtn.addEventListener('click', () => openProofFile(proof.receipt_url));
      block.appendChild(proofBtn);
    }
    return block;
  }

  const next = nextSellerAction(order, { hasCourier: orderHasCourier(order) });
  if (next) {
    if (order.payment_method === 'efectivo' && order.payment_status === 'pending') {
      block.appendChild(rsEl('p', 'ord-action__text', `Se paga en efectivo: cobrale ${formatPrice(order.total_price)} al entregar.`));
    }
    const btn = rsEl('button', 'form-btn ord-action__primary');
    btn.type = 'button';
    btn.innerHTML = `<i class="fa-solid ${next.icon}" aria-hidden="true"></i> `;
    btn.appendChild(document.createTextNode(next.label));
    btn.addEventListener('click', () => advanceOrder(order, next, btn));
    block.appendChild(btn);
  }

  if (isStoreOwner && order.revocation_requested_at && !order.revocation_resolved_at) {
    block.appendChild(rsEl('p', 'ord-action__text', 'El comprador pidió el arrepentimiento de la compra (tiene derecho por ley). Coordiná la devolución y aceptalo: el pedido se cancela y el stock vuelve.'));
    const revBtn = rsEl('button', 'btn-outline ord-action__secondary', 'Aceptar arrepentimiento');
    revBtn.type = 'button';
    revBtn.addEventListener('click', () => acceptOrderRevocation(order));
    block.appendChild(revBtn);
  }

  return block.childElementCount ? block : null;
}

/** Tarjeta vertical de un pedido: N° + fecha y estado, chips, productos, comprador, qué hacer y al pie el total. */
function buildPedidoCard(order) {
  const card = rsEl('article', 'pd-card');

  const head = rsEl('div', 'pd-card__head');
  const orderInfo = document.createElement('div');
  orderInfo.appendChild(rsEl('span', 'pd-cell-order', orderLabel(order)));
  orderInfo.appendChild(rsEl('span', 'pd-cell-order__date', new Date(order.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })));
  head.appendChild(orderInfo);
  head.appendChild(rsEl('span', `pub-status pub-status--${ORDER_STATUS_BADGE_VARIANT[order.status] || 'paused'}`, ORDER_STATUS_LABELS[order.status] || order.status));
  card.appendChild(head);

  card.appendChild(buildOrderChips(order));

  const productSection = rsEl('div', 'pd-card__section');
  productSection.appendChild(buildPedidoProductCell(order));
  card.appendChild(productSection);

  const buyerSection = rsEl('div', 'pd-card__section');
  buyerSection.appendChild(buildPedidoBuyerCell(order));
  if (order.delivery_method === 'delivery' && order.shipping_address) {
    buyerSection.appendChild(rsEl('p', 'pd-card__address', `Entregar en: ${order.shipping_address}`));
  }
  card.appendChild(buyerSection);

  const action = buildOrderActionBlock(order);
  if (action) card.appendChild(action);

  const foot = rsEl('div', 'pd-card__foot');
  const totalWrap = document.createElement('div');
  totalWrap.appendChild(rsEl('span', 'pd-card__total-label', 'Total'));
  totalWrap.appendChild(rsEl('span', 'pd-cell-total', formatPrice(order.total_price)));
  foot.appendChild(totalWrap);

  const actionsWrap = rsEl('div', 'pd-row-actions');
  const detailBtn = rsEl('button', 'pd-detail-btn', 'Detalle');
  detailBtn.type = 'button';
  detailBtn.addEventListener('click', () => openOrderDetail(order));
  actionsWrap.appendChild(detailBtn);
  const kebab = buildOrdActions(order);
  if (kebab) actionsWrap.appendChild(kebab);
  foot.appendChild(actionsWrap);
  card.appendChild(foot);

  return card;
}

/** Menú de acciones (⋮) del pedido -- mismo componente que buildPubActions, sin kebab si no hay ninguna acción disponible. */
function buildOrdActions(order) {
  const menu = document.createElement('div');
  menu.className = 'pub-actions__menu';
  menu.hidden = true;

  const waHref = buyerWhatsappHref(order);
  if (waHref) {
    menu.appendChild(pubMenuItem('Escribir por WhatsApp', 'fa-comment', () => {
      closePubMenus();
      window.open(waHref, '_blank', 'noopener,noreferrer');
    }));
  }

  if (order.status !== 'completed' && order.status !== 'cancelled') {
    menu.appendChild(pubMenuItem('Cancelar pedido', 'fa-ban', () => {
      closePubMenus();
      cancelOrderBySeller(order);
    }, true));
  }

  if (!menu.childElementCount) return null;

  const wrap = document.createElement('div');
  wrap.className = 'pub-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'pub-actions__toggle';
  toggleBtn.setAttribute('aria-label', 'Acciones del pedido');
  const dots = document.createElement('i');
  dots.className = 'fa-solid fa-ellipsis-vertical';
  toggleBtn.appendChild(dots);
  wrap.appendChild(toggleBtn);
  wrap.appendChild(menu);

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closePubMenus();
    menu.hidden = !willOpen;
  });

  return wrap;
}

// --- Detalle del pedido (35) + línea de tiempo (34) ---

let detailOrderId = null;

function buildTimeline(order, events) {
  const list = rsEl('ol', 'ord-timeline');
  timelineSteps(order, events).forEach((step) => {
    const li = rsEl('li', 'ord-timeline__step');
    if (step.done) li.classList.add('is-done');
    if (step.current) li.classList.add('is-current');
    if (step.key === 'cancelled') li.classList.add('is-cancelled');
    li.appendChild(document.createTextNode(step.label));
    if (step.date) {
      li.appendChild(rsEl('span', 'ord-timeline__date', new Date(step.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })));
    }
    list.appendChild(li);
  });
  return list;
}

function detailSection(title, ...children) {
  const section = rsEl('section', 'pd-detail__section');
  section.appendChild(rsEl('h3', 'pd-detail__h', title));
  children.filter(Boolean).forEach((c) => section.appendChild(c));
  return section;
}

function detailRow(label, value) {
  const row = rsEl('div', 'pd-detail__row');
  row.append(rsEl('span', 'pd-detail__label', label), rsEl('span', 'pd-detail__value', value));
  return row;
}

function renderOrderDetail(order, events) {
  const body = document.getElementById('pd-detail-body');
  if (!body) return;
  body.textContent = '';

  const head = rsEl('div', 'pd-detail__head');
  const title = rsEl('div');
  title.appendChild(rsEl('h2', 'pd-detail__title', `Pedido ${orderLabel(order)}`));
  title.appendChild(rsEl('p', 'pd-detail__sub', new Date(order.created_at).toLocaleString('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })));
  head.append(title, rsEl('span', `pub-status pub-status--${ORDER_STATUS_BADGE_VARIANT[order.status] || 'paused'}`, ORDER_STATUS_LABELS[order.status] || order.status));
  body.appendChild(head);

  body.appendChild(buildTimeline(order, events || []));

  const action = buildOrderActionBlock(order);
  if (action) body.appendChild(action);

  // Productos + cuentas. El descuento no se guarda aparte: sale de la diferencia.
  const items = rsEl('ul', 'pd-detail__items');
  let itemsTotal = 0;
  (order.order_items || []).forEach((it) => {
    const lineTotal = it.price * it.quantity;
    itemsTotal += lineTotal;
    const li = rsEl('li', 'pd-detail__item');
    const img = document.createElement('img');
    img.src = it.products?.image_url || '/img/no-image.svg';
    img.alt = '';
    img.loading = 'lazy';
    const text = rsEl('div');
    text.appendChild(rsEl('span', 'pd-detail__item-name', `${it.quantity}x ${it.title || it.products?.title || 'Producto'}`));
    const opts = describeSelectedOptions(it.selected_options);
    if (opts) text.appendChild(rsEl('span', 'pd-cell-product__options', opts));
    li.append(img, text, rsEl('span', 'pd-detail__item-price', formatPrice(lineTotal)));
    items.appendChild(li);
  });
  const fee = order.delivery_method === 'delivery' ? (order.delivery_fee || 0) : 0;
  const discount = itemsTotal + fee - order.total_price;
  body.appendChild(detailSection('Productos', items,
    detailRow('Productos', formatPrice(itemsTotal)),
    order.delivery_method === 'delivery' ? detailRow('Envío', fee ? formatPrice(fee) : 'Gratis') : null,
    discount > 0 ? detailRow('Descuento', `-${formatPrice(discount)}`) : null,
    detailRow('Total', formatPrice(order.total_price)),
  ));

  body.appendChild(detailSection('Entrega',
    detailRow('Forma', DELIVERY_METHOD_LABELS[order.delivery_method] || '-'),
    order.delivery_method === 'delivery' ? detailRow('Dirección', order.shipping_address || 'Sin dirección') : null,
    orderHasCourier(order) ? detailRow('Repartidor', 'Asignado') : null,
  ));

  const proofs = [...(order.payment_proofs || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const proofList = proofs.length ? rsEl('div', 'pd-detail__proofs') : null;
  proofs.forEach((p, i) => {
    const btn = rsEl('button', 'ord-link', `Comprobante ${proofs.length - i} (${{ pending: 'sin revisar', confirmed: 'confirmado', rejected: 'rechazado' }[p.status] || p.status})`);
    btn.type = 'button';
    btn.addEventListener('click', () => openProofFile(p.receipt_url));
    proofList.appendChild(btn);
  });
  body.appendChild(detailSection('Pago',
    detailRow('Medio', PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method || '-'),
    detailRow('Estado', { pending: 'Pendiente', paid: 'Pagado', rejected: 'Rechazado', needs_review: 'Para revisar' }[order.payment_status] || order.payment_status),
    awaitingTransfer(order) && order.payment_due_at ? detailRow('Vence', formatDueDate(order.payment_due_at)) : null,
    proofList,
  ));

  const buyerName = ordNameByClientId.get(order.client_id) || 'Comprador';
  const waHref = buyerWhatsappHref(order);
  let wa = null;
  if (waHref) {
    wa = document.createElement('a');
    wa.className = 'btn-outline pd-detail__wa';
    wa.href = waHref;
    wa.target = '_blank';
    wa.rel = 'noopener noreferrer';
    wa.innerHTML = '<i class="fa-brands fa-whatsapp" aria-hidden="true"></i> ';
    wa.appendChild(document.createTextNode('Escribirle por WhatsApp'));
  }
  body.appendChild(detailSection('Comprador',
    detailRow('Nombre', buyerName),
    detailRow('Celular', ordPhoneByClientId.get(order.client_id) || 'Sin cargar'),
    wa,
  ));

  const history = rsEl('ol', 'ord-events');
  if (events === null) {
    history.appendChild(rsEl('li', 'ord-events__item', 'Cargando…'));
  } else {
    [...events].reverse().forEach((e) => {
      const li = rsEl('li', 'ord-events__item');
      li.appendChild(rsEl('span', 'ord-events__date', new Date(e.created_at).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })));
      li.appendChild(rsEl('span', 'ord-events__text', eventLabel(e, { viewer: 'seller', paymentMethod: order.payment_method })));
      history.appendChild(li);
    });
  }
  body.appendChild(detailSection('Historial', history));

  if (order.status !== 'completed' && order.status !== 'cancelled') {
    const cancelBtn = rsEl('button', 'ord-link ord-link--danger', 'Cancelar pedido');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => cancelOrderBySeller(order));
    body.appendChild(cancelBtn);
  }
}

async function openOrderDetail(order) {
  const dialog = document.getElementById('pd-detail');
  if (!dialog) return;
  detailOrderId = order.id;
  renderOrderDetail(order, null);
  if (!dialog.open) dialog.showModal();

  const { data: events, error } = await supabase
    .from('order_events')
    .select('kind, note, actor, created_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: true });
  if (error) console.error('Error al cargar el historial del pedido:', error);
  if (detailOrderId === order.id && dialog.open) renderOrderDetail(order, events || []);
}

/** Después de cada cambio se recarga la lista: si el detalle estaba abierto, se redibuja con los datos nuevos. */
function refreshOpenOrderDetail() {
  const dialog = document.getElementById('pd-detail');
  if (!dialog?.open || !detailOrderId) return;
  const order = ordCache.find((o) => o.id === detailOrderId);
  if (order) openOrderDetail(order);
}

function initOrderDetailDialog() {
  const dialog = document.getElementById('pd-detail');
  if (!dialog) return;
  document.getElementById('pd-detail-close')?.addEventListener('click', () => dialog.close());
  // Click en el fondo oscuro (fuera de la tarjeta) cierra, igual que el resto de los carteles.
  dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { detailOrderId = null; });
}

// --- Acciones del vendedor sobre un pedido ---

/** Corre un RPC del flujo del pedido, avisa el resultado y recarga la lista. */
async function runOrderRpc(fn, args, successMsg, btn) {
  if (btn) btn.disabled = true;
  const { error } = await supabase.rpc(fn, args);
  if (error) {
    if (btn) btn.disabled = false;
    console.error(`Error en ${fn}:`, error);
    showToast(error.message || 'No se pudo actualizar el pedido.', 'error');
    return false;
  }
  showToast(successMsg, 'success');
  await renderAllOrders();
  return true;
}

async function confirmOrderTransferPayment(order, btn) {
  const ok = await confirmDialog(
    `¿Ya te llegó la transferencia de ${formatPrice(order.total_price)}? Revisá tu cuenta antes de confirmar: al comprador le avisamos que el pedido está pagado.`,
    { title: `Confirmar pago del pedido ${orderLabel(order)}`, confirmText: 'Sí, me llegó' },
  );
  if (!ok) return;
  await runOrderRpc('seller_confirm_transfer_payment', { p_order_id: order.id }, 'Pago confirmado. Ya podés preparar el pedido.', btn);
}

async function rejectOrderTransferPayment(order) {
  const res = await formDialog(
    'Contanos por qué. Se lo avisamos al comprador para que lo resuelva: el pedido sigue abierto y le damos un día más para pagar.',
    { title: `Rechazar el pago del pedido ${orderLabel(order)}`, confirmText: 'Rechazar pago', danger: true, choices: PAYMENT_REJECT_REASONS },
  );
  if (!res) return;
  await runOrderRpc('reject_transfer_payment', { p_order_id: order.id, p_reason: res.value }, 'Le avisamos al comprador el motivo.');
}

async function advanceOrder(order, next, btn) {
  if (next.status === 'completed') {
    await deliverOrder(order);
    return;
  }
  const question = next.status === 'ready_for_pickup'
    ? `¿El pedido ${orderLabel(order)} ya está listo para retirar? Le avisamos al comprador.`
    : `¿Ya salió el pedido ${orderLabel(order)}? Le avisamos al comprador que está en camino.`;
  const ok = await confirmDialog(question, { confirmText: next.label });
  if (!ok) return;
  await runOrderRpc('advance_order_status', { p_order_id: order.id, p_status: next.status },
    next.status === 'ready_for_pickup' ? 'Listo. Le avisamos al comprador que puede pasar a retirarlo.' : 'Listo. Le avisamos al comprador que va en camino.', btn);
}

/** Entregar pidiendo el código de retiro (o el que trae el QR escaneado). */
async function deliverOrder(order, presetCode = '') {
  const cash = order.payment_method === 'efectivo' && order.payment_status === 'pending';
  const res = await formDialog(
    `Pedile al comprador el código de 4 números que tiene en "Mis compras" (o escaneá su QR con la cámara).${cash ? ` Cobrale ${formatPrice(order.total_price)} en efectivo.` : ''}`,
    {
      title: `Entregar el pedido ${orderLabel(order)}`,
      confirmText: cash ? 'Cobrado y entregado' : 'Entregar',
      input: { label: 'Código de retiro', placeholder: '0000', inputMode: 'numeric', maxLength: 4, pattern: /^\d{4}$/, value: presetCode },
      extraText: 'Entregar sin código',
    },
  );
  if (!res) return;
  if (res.extra) {
    const sure = await confirmDialog('¿Entregar sin el código? Hacelo solo si conocés a quien lo retira: el código es lo que prueba que es el comprador.', { confirmText: 'Entregar igual', danger: true });
    if (!sure) return;
  }
  await runOrderRpc('advance_order_status', {
    p_order_id: order.id, p_status: 'completed', p_code: res.extra ? null : res.value, p_skip_code: res.extra,
  }, '¡Entregado! Le avisamos al comprador.');
}

async function cancelOrderBySeller(order) {
  const paid = order.payment_status === 'paid';
  const res = await formDialog(
    paid
      ? `Este pedido ya está pagado: si lo cancelás, tenés que devolverle ${formatPrice(order.total_price)} al comprador. Contanos por qué, se lo avisamos.`
      : 'Contanos por qué, se lo avisamos al comprador. El stock vuelve a tus publicaciones.',
    { title: `Cancelar el pedido ${orderLabel(order)}`, confirmText: 'Cancelar pedido', cancelText: 'Volver', danger: true, choices: SELLER_CANCEL_REASONS },
  );
  if (!res) return;
  await runOrderRpc('cancel_order', { p_order_id: order.id, p_reason: res.value }, 'Pedido cancelado. Le avisamos al comprador.');
}

async function acceptOrderRevocation(order) {
  const ok = await confirmDialog(
    `El pedido ${orderLabel(order)} se cancela y el stock vuelve. Acordate de coordinar con el comprador la devolución del producto y de la plata.`,
    { title: 'Aceptar arrepentimiento', confirmText: 'Aceptar', danger: true },
  );
  if (!ok) return;
  await runOrderRpc('accept_order_revocation', { p_order_id: order.id }, 'Arrepentimiento aceptado. Le avisamos al comprador.');
}

/**
 * Abre un comprobante (bucket privado) con una URL firmada. La pestaña se
 * abre ANTES del await: el bloqueador de popups de Safari/Firefox corta
 * window.open() en cuanto termina el gesto del usuario, y el await de
 * createSignedUrl lo termina (mismo fix que js/support-utils.js openAttachment()).
 */
async function openProofFile(path) {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    tab?.close();
    showToast('No se pudo abrir el comprobante.', 'error');
    return;
  }
  if (tab) tab.location.replace(data.signedUrl);
  else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

/**
 * QR del comprador (21): al escanearlo con la cámara del celular se abre
 * `vender.html?entregar=<id>&codigo=1234#pedidos`, y acá se ofrece entregar
 * ese pedido con el código ya cargado.
 */
function applyDeliverDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('entregar');
  if (!orderId) return;
  const code = (params.get('codigo') || '').replace(/\D/g, '').slice(0, 4);

  const url = new URL(window.location);
  url.searchParams.delete('entregar');
  url.searchParams.delete('codigo');
  window.history.replaceState({}, '', url);

  const order = ordCache.find((o) => o.id === orderId);
  if (!order) {
    showToast('Ese pedido no es de tu comercio, o no está entre tus últimos pedidos.', 'error');
    return;
  }
  location.hash = 'pedidos';
  if (order.status === 'completed' || order.status === 'cancelled' || orderHasCourier(order) || !nextSellerAction(order)) {
    showToast(order.status === 'completed' ? `El pedido ${orderLabel(order)} ya estaba entregado.` : `El pedido ${orderLabel(order)} no se puede entregar ahora.`, order.status === 'completed' ? 'success' : 'error');
    openOrderDetail(order);
    return;
  }
  deliverOrder(order, code);
}

// --- Aviso de pedido nuevo en el panel (29): sonido + contador en la pestaña ---

const SELLER_ALERT_TYPES = new Set(['order_created', 'order_paid_seller', 'transfer_notified', 'payment_proof_uploaded', 'order_cancelled_by_buyer', 'revocation_requested']);
let unseenOrderAlerts = 0;
let baseDocumentTitle = document.title;

function playOrderChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch { /* sin audio (navegador viejo o bloqueado): no pasa nada */ }
}

function initOrderAlerts() {
  baseDocumentTitle = document.title;
  window.addEventListener('bl:new-notifications', (e) => {
    const relevant = (e.detail || []).filter((n) => SELLER_ALERT_TYPES.has(n.type));
    if (!relevant.length) return;
    playOrderChime();
    // La lista ya se actualiza sola por Realtime (initOrdersLive); esto es por
    // si el aviso llega antes: el refresher junta las dos en una sola recarga.
    refreshOrdersLive();
    if (document.hidden) {
      unseenOrderAlerts += relevant.length;
      document.title = `(${unseenOrderAlerts}) ${baseDocumentTitle}`;
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && unseenOrderAlerts) {
      unseenOrderAlerts = 0;
      document.title = baseDocumentTitle;
    }
  });
}

// --- Pestañas, filtros y estadísticas ---

function pedidosTabMatches(order, tab) {
  switch (tab) {
    case 'to_confirm': return awaitingTransfer(order) && buyerSaysPaid(order);
    // Esperando que el comprador pague (el efectivo se cobra al entregar: no espera nada).
    case 'pending_payment': return order.status === 'pending' && order.payment_status === 'pending'
      && order.payment_method !== 'efectivo' && !(awaitingTransfer(order) && buyerSaysPaid(order));
    case 'to_prepare': return canPrepare(order) && !orderHasCourier(order);
    case 'in_progress': return order.status === 'ready_for_pickup' || order.status === 'shipped'
      || (order.status === 'paid' && orderHasCourier(order));
    case 'completed': return order.status === 'completed';
    case 'cancelled': return order.status === 'cancelled';
    // "Todos" no incluye los cancelados: tienen su propia pestaña.
    default: return order.status !== 'cancelled';
  }
}

function sortPedidos(list, sort) {
  const copy = [...list];
  if (sort === 'oldest') return copy.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (sort === 'amount_desc') return copy.sort((a, b) => b.total_price - a.total_price);
  if (sort === 'amount_asc') return copy.sort((a, b) => a.total_price - b.total_price);
  return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renderPedidosEmptyState(title, sub) {
  const list = document.getElementById('pedidos-list');
  const box = document.getElementById('pedidos-empty');
  if (list) list.hidden = true;
  if (!box) return;
  box.hidden = false;
  box.className = 'pub-empty';
  box.innerHTML = '';
  box.appendChild(rsEl('i', 'fa-regular fa-rectangle-list pub-empty__icon'));
  box.appendChild(rsEl('p', 'pub-empty__title', title));
  box.appendChild(rsEl('p', 'pub-empty__sub', sub));
}

function pdStat(icon, variant, title, value, sub) {
  const card = rsEl('div', 'pd-stat');
  const top = rsEl('div', 'pd-stat__top');
  const iconEl = rsEl('div', `pd-stat__icon pd-stat__icon--${variant}`);
  iconEl.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  top.appendChild(iconEl);
  top.appendChild(rsEl('div', 'pd-stat__title', title));
  card.appendChild(top);
  card.appendChild(rsEl('div', 'pd-stat__value', value));
  if (sub) card.appendChild(rsEl('div', 'pd-stat__sub', sub));
  return card;
}

const PEDIDOS_COUNTED_TABS = ['to_confirm', 'pending_payment', 'to_prepare', 'in_progress', 'completed', 'cancelled'];

/** Franja de stats + contadores de las pestañas. */
function renderPedidosStats() {
  const dash = document.getElementById('pedidos-dash');
  if (!dash) return;
  dash.textContent = '';

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const byTab = Object.fromEntries(PEDIDOS_COUNTED_TABS.map((tab) => [tab, ordCache.filter((o) => pedidosTabMatches(o, tab))]));
  const total30d = ordCache.filter((o) => new Date(o.created_at) >= thirtyDaysAgo);
  const sum = (arr) => arr.reduce((s, o) => s + o.total_price, 0);

  dash.appendChild(pdStat('fa-bag-shopping', 'total', 'Total de pedidos', String(total30d.length), 'Últimos 30 días'));
  dash.appendChild(pdStat('fa-hourglass-half', 'pending', 'Pagos por confirmar', String(byTab.to_confirm.length), formatPrice(sum(byTab.to_confirm))));
  dash.appendChild(pdStat('fa-box-open', 'shipping', 'Para preparar', String(byTab.to_prepare.length), formatPrice(sum(byTab.to_prepare))));
  dash.appendChild(pdStat('fa-circle-check', 'completed', 'Entregados', String(byTab.completed.length), formatPrice(sum(byTab.completed))));
  dash.appendChild(pdStat('fa-circle-xmark', 'cancelled', 'Cancelados', String(byTab.cancelled.length), formatPrice(sum(byTab.cancelled))));

  PEDIDOS_COUNTED_TABS.forEach((tab) => {
    const el = document.getElementById(`pd-tab-count-${tab}`);
    if (el) el.textContent = byTab[tab].length ? `(${byTab[tab].length})` : '';
  });
}

function renderPedidosTips() {
  const list = document.getElementById('pedidos-tips');
  if (!list || list.childElementCount) return; // contenido estático: se arma una sola vez
  [
    'Marcá cada paso (listo, despachado, entregado): al comprador le llega el aviso solo.',
    'Pedí el código de retiro al entregar: así sabés que es el comprador.',
    'Confirmá las transferencias apenas veas la plata: el pedido no se puede preparar antes.',
  ].forEach((text) => {
    const li = document.createElement('li');
    li.innerHTML = '<i class="fa-solid fa-circle-check"></i> ';
    li.appendChild(document.createTextNode(text));
    list.appendChild(li);
  });
}

/** Aplica pestaña + filtros del menú "Filtros" + búsqueda (N° de pedido, comprador o producto) sobre ordCache y renderiza las tarjetas. */
function renderPedidos() {
  renderPedidosStats();

  const list = document.getElementById('pedidos-list');
  if (!list) return;
  list.textContent = '';

  if (!ordCache.length) {
    renderPedidosEmptyState('Todavía no tenés pedidos', 'Cuando alguien te compre, vas a verlo acá.');
    return;
  }

  let filtered = ordCache.filter((o) => pedidosTabMatches(o, pedidosTab));
  if (pedidosDeliveryFilter !== 'all') filtered = filtered.filter((o) => o.delivery_method === pedidosDeliveryFilter);

  const term = ordSearch.trim().toLowerCase();
  if (term) {
    // "#BL-1066", "bl1066" o "1066" buscan el número de pedido.
    const numberTerm = term.replace(/^#?\s*bl-?\s*/, '');
    filtered = filtered.filter((o) => {
      const numberMatch = /^\d+$/.test(numberTerm) && String(o.order_number || '').includes(numberTerm);
      const idMatch = o.id.split('-')[0].toLowerCase().includes(term);
      const phone = (ordPhoneByClientId.get(o.client_id) || '').toLowerCase();
      const name = (ordNameByClientId.get(o.client_id) || '').toLowerCase();
      const productMatch = (o.order_items || []).some((it) => (it.title || it.products?.title || '').toLowerCase().includes(term));
      return numberMatch || idMatch || phone.includes(term) || name.includes(term) || productMatch;
    });
  }

  filtered = sortPedidos(filtered, pedidosSort);

  if (!filtered.length) {
    renderPedidosEmptyState('No hay pedidos que coincidan', 'Probá con otra búsqueda o filtro.');
    return;
  }

  list.hidden = false;
  const emptyBox = document.getElementById('pedidos-empty');
  if (emptyBox) emptyBox.hidden = true;
  filtered.forEach((o) => list.appendChild(buildPedidoCard(o)));
}

/** Navega a "Pedidos" con una pestaña puntual ya seleccionada (usado desde Resumen). */
function goToPedidos(tab) {
  location.hash = 'pedidos';
  setPedidosTab(tab);
}

function setPedidosTab(tab) {
  pedidosTab = tab;
  document.querySelectorAll('#pedidos-tabs .pd-tab').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === tab));
  // El resaltado del sidebar lo maneja el shell por `data-section`
  // (js/vender-shell.js). Acá había una línea que lo pisaba según la pestaña:
  // hacía falta cuando dos entradas apuntaban a esta misma sección, y con una
  // sola apagaba "Pedidos" apenas mirabas una pestaña que no fuera "Todos".
  renderPedidos();
}

/** Wire de los controles de la sección Pedidos (búsqueda, pestañas, menú Filtros, atajos del sidebar, detalle). Una sola vez. */
function initPedidosControls() {
  document.getElementById('pedidos-search')?.addEventListener('input', (e) => {
    ordSearch = e.target.value;
    renderPedidos();
  });

  document.querySelectorAll('#pedidos-tabs .pd-tab').forEach((tab) => {
    tab.addEventListener('click', () => setPedidosTab(tab.dataset.tab));
  });

  const filtersBtn = document.getElementById('pedidos-filters-btn');
  const filtersMenu = document.getElementById('pedidos-filters-menu');
  filtersBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = filtersMenu.hidden;
    filtersMenu.hidden = !willOpen;
    filtersBtn.setAttribute('aria-expanded', String(willOpen));
    filtersBtn.classList.toggle('is-active', willOpen);
  });
  document.addEventListener('click', (e) => {
    if (filtersMenu && !filtersMenu.hidden && !filtersMenu.contains(e.target) && e.target !== filtersBtn) {
      filtersMenu.hidden = true;
      filtersBtn?.setAttribute('aria-expanded', 'false');
      filtersBtn?.classList.remove('is-active');
    }
  });
  filtersMenu?.querySelectorAll('input[name="pd-sort"]').forEach((input) => {
    input.addEventListener('change', () => { pedidosSort = input.value; renderPedidos(); });
  });
  filtersMenu?.querySelectorAll('input[name="pd-delivery"]').forEach((input) => {
    input.addEventListener('change', () => { pedidosDeliveryFilter = input.value; renderPedidos(); });
  });

  // Entrar a Pedidos desde el sidebar muestra la lista completa: si quedó
  // filtrada de la visita anterior, volver a tocar la sección y ver menos
  // pedidos de los que hay parece que faltan.
  document.querySelectorAll('.mc-navitem[data-section="pedidos"]').forEach((item) => {
    item.addEventListener('click', () => setPedidosTab('all'));
  });

  renderPedidosTips();
  initOrderDetailDialog();
}

// --- Logo del comercio (Perfil de mi comercio) ---
// Mismo patrón que la foto de perfil de Mi perfil y que el logo editable
// desde la propia vista del comercio (comercio.js, buildStoreLogo): se sube
// y se guarda apenas se elige el archivo, sin esperar al "Guardar cambios"
// del resto del formulario. Bucket store-logos, migración 74_store_logo.sql.
const MAX_STORE_LOGO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
let currentStoreLogoUrl = null;

function paintStoreLogo(url) {
  currentStoreLogoUrl = url || null;
  const preview = document.getElementById('store-logo-preview');
  const removeBtn = document.getElementById('store-logo-remove-btn');
  if (removeBtn) removeBtn.hidden = !currentStoreLogoUrl;
  if (!preview) return;

  preview.textContent = '';
  if (currentStoreLogoUrl) {
    const img = document.createElement('img');
    img.src = currentStoreLogoUrl;
    img.alt = 'Logo del comercio';
    preview.appendChild(img);
  } else {
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-store';
    icon.setAttribute('aria-hidden', 'true');
    preview.appendChild(icon);
  }
}

// Tamaño del cuadro de recorte en CSS px -- tiene que coincidir con el
// .logo-crop-frame del <style> de vender.html. La salida se recorta a una
// resolución fija (LOGO_CROP_OUTPUT), de sobra para un logo, sin depender
// del tamaño real en pantalla del recuadro.
const LOGO_CROP_FRAME = 240;
const LOGO_CROP_OUTPUT = 640;

/**
 * Deja acomodar (arrastrar) la imagen elegida dentro de un cuadro y
 * devuelve el recorte resultante -- se abre SIEMPRE al elegir un archivo,
 * sea cuadrado o no: un solo flujo previsible ("elegís imagen -> la
 * acomodás -> confirmás") en vez de que a veces aparezca y a veces no.
 * El cuadro muestra la imagen escalada para cubrirlo entero (el lado más
 * chico ocupa el 100% del cuadro); solo hay margen para arrastrar en el
 * eje que sobra. Si la imagen ya es cuadrada no sobra nada en ningún eje
 * (offset fijo en 0,0): el cuadro se ve completo de entrada y arrastrar no
 * hace nada, sin que haga falta un caso aparte para saltear el recortador.
 * Al confirmar, un <canvas> recorta exactamente el cuadrado visible a
 * resolución fija.
 * @param {{dataUrl: string, width: number, height: number, mimeType: string}} img
 * @returns {Promise<{blob: Blob, type: string} | null>} null si se canceló
 */
function openLogoCropper({ dataUrl, width, height, mimeType }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('store-logo-crop-overlay');
    const frame = document.getElementById('store-logo-crop-frame');
    const imgEl = document.getElementById('store-logo-crop-img');
    const cancelBtn = document.getElementById('store-logo-crop-cancel');
    const saveBtn = document.getElementById('store-logo-crop-save');
    if (!overlay || !frame || !imgEl || !cancelBtn || !saveBtn) { resolve(null); return; }

    // "cover" del cuadro: el lado más chico de la imagen mide justo
    // LOGO_CROP_FRAME, el más grande sobra -- ese sobrante es el único
    // margen de arrastre posible en ese eje.
    const scale = LOGO_CROP_FRAME / Math.min(width, height);
    const scaledW = width * scale;
    const scaledH = height * scale;
    const minOffsetX = LOGO_CROP_FRAME - scaledW; // <= 0; 0 si no sobra nada en este eje
    const minOffsetY = LOGO_CROP_FRAME - scaledH;
    let offsetX = minOffsetX / 2; // arranca centrada
    let offsetY = minOffsetY / 2;

    imgEl.src = dataUrl;
    imgEl.style.width = `${scaledW}px`;
    imgEl.style.height = `${scaledH}px`;
    const paint = () => { imgEl.style.transform = `translate(${offsetX}px, ${offsetY}px)`; };
    paint();

    const clamp = (value, min) => Math.min(0, Math.max(min, value));
    let dragging = false;
    let startX = 0, startY = 0, startOffsetX = 0, startOffsetY = 0;

    const onPointerDown = (e) => {
      dragging = true;
      frame.classList.add('is-dragging');
      startX = e.clientX;
      startY = e.clientY;
      startOffsetX = offsetX;
      startOffsetY = offsetY;
      frame.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      offsetX = clamp(startOffsetX + (e.clientX - startX), minOffsetX);
      offsetY = clamp(startOffsetY + (e.clientY - startY), minOffsetY);
      paint();
    };
    const onPointerUp = () => {
      dragging = false;
      frame.classList.remove('is-dragging');
    };

    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerup', onPointerUp);
    frame.addEventListener('pointercancel', onPointerUp);

    const cleanup = () => {
      frame.removeEventListener('pointerdown', onPointerDown);
      frame.removeEventListener('pointermove', onPointerMove);
      frame.removeEventListener('pointerup', onPointerUp);
      frame.removeEventListener('pointercancel', onPointerUp);
      cancelBtn.removeEventListener('click', onCancel);
      saveBtn.removeEventListener('click', onSave);
      overlay.hidden = true;
      imgEl.src = '';
      imgEl.style.transform = '';
    };

    function onCancel() {
      cleanup();
      resolve(null);
    }

    async function onSave() {
      // decode() asegura que la imagen ya esté lista para dibujar -- por
      // las dudas de que se apriete "Usar esta imagen" antes de que el
      // data: URL termine de decodificarse (rarísimo, pero drawImage con
      // una imagen todavía no decodificada saldría en blanco).
      await imgEl.decode?.().catch(() => {});
      // El recorte visible del cuadro (en px del recuadro) corresponde a un
      // cuadrado de lado min(width,height) en la imagen ORIGINAL -- dividir
      // por "scale" convierte de px del recuadro a px reales de la imagen.
      // drawImage usa siempre el tamaño natural de <img>, no el CSS
      // (width/height/transform) que se le puso para mostrarla arrastrable.
      const srcSize = Math.min(width, height);
      const srcX = -offsetX / scale;
      const srcY = -offsetY / scale;
      const canvas = document.createElement('canvas');
      canvas.width = LOGO_CROP_OUTPUT;
      canvas.height = LOGO_CROP_OUTPUT;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgEl, srcX, srcY, srcSize, srcSize, 0, 0, LOGO_CROP_OUTPUT, LOGO_CROP_OUTPUT);
      // PNG/WebP se mantienen (por la transparencia, típica en un logo);
      // cualquier otra cosa sale como JPEG.
      const outType = mimeType === 'image/png' || mimeType === 'image/webp' ? mimeType : 'image/jpeg';
      canvas.toBlob((blob) => {
        cleanup();
        resolve(blob ? { blob, type: outType } : null);
      }, outType, 0.92);
    }

    cancelBtn.addEventListener('click', onCancel);
    saveBtn.addEventListener('click', onSave);

    overlay.hidden = false;
  });
}

function setupStoreLogoPicker() {
  const pickBtn = document.getElementById('store-logo-pick-btn');
  const removeBtn = document.getElementById('store-logo-remove-btn');
  const fileInput = document.getElementById('store-logo-file');
  const errorEl = document.getElementById('store-logo-error');
  if (!pickBtn || !fileInput) return;

  const fail = (msg) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };
  const clearFail = () => { if (errorEl) errorEl.hidden = true; };

  // Compartida entre el único camino de subida que queda: siempre pasa por
  // el recortador, así que siempre sube el Blob que salió del <canvas>.
  const uploadStoreLogo = async (blob, contentType) => {
    pickBtn.disabled = true;
    pickBtn.textContent = 'Subiendo…';
    const previousUrl = currentStoreLogoUrl;

    try {
      const ext = (contentType.split('/').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5);
      // La carpeta tiene que ser el uid del dueño: es lo que exige la policy del bucket.
      const path = `${currentUserId}/${Date.now()}.${ext || 'jpg'}`;

      const { error: upErr } = await supabase.storage
        .from('store-logos')
        .upload(path, blob, { contentType });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('store-logos').getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error('No se pudo obtener la URL del logo.');

      const { error: dbErr } = await supabase.from('stores').update({ logo_url: publicUrl }).eq('id', currentStoreId);
      if (dbErr) throw dbErr;

      paintStoreLogo(publicUrl);
      await removeStoredObjects(supabase, 'store-logos', [previousUrl]);
      showToast('Listo, guardamos el logo.', 'success');
    } catch (err) {
      console.error('Error al subir el logo:', err);
      fail(err.message || 'No pudimos subir el logo. Probá de nuevo.');
    } finally {
      pickBtn.disabled = false;
      pickBtn.textContent = 'Elegir imagen';
    }
  };

  pickBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    clearFail();

    // file.type puede venir vacío (algunos navegadores/SO no reconocen la
    // extensión, típico con HEIC de iPhone) -- ahí no hay de qué quejarse
    // todavía, se termina de ver si se puede leer más abajo.
    if (file.type && !ACCEPTED_LOGO_TYPES.includes(file.type)) {
      fail('Tiene que ser una imagen JPG, PNG o WebP.');
      fileInput.value = '';
      return;
    }

    if (file.size > MAX_STORE_LOGO_BYTES) {
      fail('Esa imagen pesa más de 5 MB. Probá con una más liviana.');
      fileInput.value = '';
      return;
    }

    let width, height, dataUrl;
    try {
      ({ width, height } = await getImageDimensions(file));
      dataUrl = await fileToDataUrl(file);
    } catch {
      // El caso más común: una foto de iPhone en formato HEIC/HEIF, que
      // Chrome/Edge en Windows no pueden decodificar (Safari sí) -- por
      // eso el mensaje sugiere puntualmente convertirla, no un genérico
      // "probá con otro archivo" que no dice qué hay que cambiar.
      fail('No pudimos leer esa imagen. Si la sacaste con un iPhone puede estar en formato HEIC: abrila y guardala/exportala como JPG o PNG, y volvé a intentar.');
      fileInput.value = '';
      return;
    }

    // Se abre siempre, cuadrada o no -- ver el porqué en el comentario de
    // openLogoCropper.
    const cropped = await openLogoCropper({ dataUrl, width, height, mimeType: file.type });
    fileInput.value = '';
    if (!cropped) return; // canceló el recorte

    await uploadStoreLogo(cropped.blob, cropped.type);
  });

  removeBtn?.addEventListener('click', async () => {
    if (!(await confirmDialog('¿Sacamos el logo del comercio?', { confirmText: 'Sacar', danger: true }))) return;
    clearFail();
    removeBtn.disabled = true;
    const previousUrl = currentStoreLogoUrl;

    try {
      const { error: dbErr } = await supabase.from('stores').update({ logo_url: null }).eq('id', currentStoreId);
      if (dbErr) throw dbErr;

      paintStoreLogo(null);
      await removeStoredObjects(supabase, 'store-logos', [previousUrl]);
      showToast('Sacamos el logo.', 'success');
    } catch (err) {
      console.error('Error al quitar el logo:', err);
      fail(err.message || 'No pudimos sacar el logo. Probá de nuevo.');
    } finally {
      removeBtn.disabled = false;
    }
  });
}

/** F5-08: precarga el form de perfil del comercio con los datos actuales. */
function fillStoreProfileForm(store) {
  const nameInput = document.getElementById('store-name');
  const addressInput = document.getElementById('store-address');
  const zoneInput = document.getElementById('store-zone');
  const hoursInput = document.getElementById('store-hours');
  const descInput = document.getElementById('store-description');
  const whatsappInput = document.getElementById('store-whatsapp');
  const transferInfoInput = document.getElementById('store-transfer-info');

  if (nameInput) nameInput.value = store.name || '';
  setStoreCategorySlug(store.category_slug || null);
  paintStoreLogo(store.logo_url || null);
  if (addressInput) addressInput.value = store.address || '';
  if (zoneInput) zoneInput.value = store.zone || '';
  // hours se guarda como un string JSON simple (ej: '"Lunes a viernes 9 a 18hs"')
  if (hoursInput) hoursInput.value = typeof store.hours === 'string' ? store.hours : '';
  if (descInput) descInput.value = store.description || '';

  // Cómo lo contactan los clientes: WhatsApp o ninguno (ya no "teléfono" --
  // era un número aparte, stores.phone, que quedaba duplicado con este).
  // Las cuentas que todavía tengan el viejo contact_method='phone' guardado
  // caen acá en "whatsapp": si no tienen número cargado, el submit las va a
  // frenar con el error de "ingresá un WhatsApp válido" hasta que lo agreguen.
  const contactMethod = store.contact_method === 'none' ? 'none' : 'whatsapp';
  document.querySelectorAll('input[name="store-contact-method"]').forEach((radio) => {
    radio.checked = radio.value === contactMethod;
  });
  const { dial, number } = splitPhone(store.whatsapp);
  if (storeWhatsappDial) storeWhatsappDial.setValue(store.whatsapp ? dial : DEFAULT_PHONE_DIAL);
  if (whatsappInput) whatsappInput.value = store.whatsapp ? number : '';
  toggleStoreWhatsappField(contactMethod);

  // Redes sociales: un link + un check "mostrar" por red (ver SOCIAL_NETWORKS).
  SOCIAL_NETWORKS.forEach(({ key }) => {
    const urlInput = document.getElementById(`store-social-${key}`);
    const showInput = document.getElementById(`store-social-${key}-show`);
    if (urlInput) urlInput.value = store[`social_${key}`] || '';
    if (showInput) showInput.checked = store[`social_${key}_show`] !== false;
  });

  // A113-299: texto libre (CBU/alias/banco) que ve el cliente al elegir
  // transferencia. Fetch aparte (no en STORE_SELECT_COLUMNS) a propósito: la
  // columna `stores.transfer_info` viene de una migración nueva
  // (66_store_transfer_info.sql) que puede no estar aplicada todavía en
  // algunas bases -- si se pidiera en el select principal, un 400 ahí
  // tumbaría TODO el dashboard del vendedor en vez de dejar este campo vacío.
  // Migración 106: alias/CBU/titular/banco en columnas propias. Si esa
  // migración faltara, el select da error y se reintenta solo con
  // transfer_info (los campos nuevos quedan vacíos, el resto anda).
  if (transferInfoInput) {
    const fill = (data) => {
      transferInfoInput.value = data?.transfer_info || '';
      TRANSFER_FIELD_IDS.forEach(([col, id]) => {
        const input = document.getElementById(id);
        if (!input) return;
        const value = data?.[col] || '';
        input.value = col === 'transfer_cbu' && value ? formatCbuForDisplay(value) : value;
      });
    };
    supabase.from('stores').select('transfer_info, transfer_alias, transfer_cbu, transfer_holder, transfer_bank').eq('id', store.id).single()
      .then(async ({ data, error }) => {
        if (!error) { fill(data); return; }
        console.error('Error al cargar los datos de transferencia (se reintenta sin las columnas nuevas):', error);
        const legacy = await supabase.from('stores').select('transfer_info').eq('id', store.id).single();
        if (legacy.error) { console.error('Error al cargar los datos de transferencia:', legacy.error); return; }
        fill(legacy.data);
      });
  }
}

/**
 * Migración 107: ¿el comercio tiene alias? Consulta aparte (no en
 * STORE_SELECT_COLUMNS), mismo criterio que los datos de transferencia: si la
 * columna faltara, no se cae todo el panel. Ante un error se asume que SÍ
 * tiene -- la base igual lo valida al guardar, y bloquear a alguien por una
 * consulta fallida sería peor que dejarlo llegar a ese error.
 */
async function loadStoreAliasState(storeId) {
  const { data, error } = await supabase.from('stores').select('transfer_alias').eq('id', storeId).single();
  if (error) {
    console.error('Error al consultar el alias del comercio:', error);
    currentStoreHasAlias = true;
  } else {
    currentStoreHasAlias = Boolean(data?.transfer_alias?.trim());
  }
  updateAliasGate();
  renderOnboardingChecklist(currentProductCount > 0);
}

/** Muestra u oculta el aviso "Cargá tu alias" de Publicaciones. */
function updateAliasGate() {
  const gate = document.getElementById('pub-alias-gate');
  if (!gate) return;
  gate.hidden = currentStoreHasAlias !== false;

  // El empleado no puede editar el perfil del comercio (sección solo del dueño).
  const btn = document.getElementById('pub-alias-gate-btn');
  const text = document.getElementById('pub-alias-gate-text');
  if (btn) btn.hidden = !isStoreOwner;
  if (text && !isStoreOwner) {
    text.textContent = 'Es el dato que ven los clientes para pagar por transferencia. Pedile al dueño del comercio que lo cargue en "Perfil de mi comercio"; mientras tanto no se pueden publicar productos nuevos.';
  }
}

/** Lleva al campo Alias del perfil del comercio. */
function goToAliasField() {
  const focusAlias = () => {
    const input = document.getElementById('store-transfer-alias');
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
  };
  // El shell muestra la sección recién en el hashchange (que llega después,
  // no en el mismo tick): hasta entonces el campo está oculto y no toma foco.
  if (location.hash === '#perfil-comercio') {
    focusAlias();
    return;
  }
  window.addEventListener('hashchange', () => setTimeout(focusAlias, 0), { once: true });
  location.hash = 'perfil-comercio';
}

/** Intento de publicar sin alias: no abre el form, resalta el aviso. */
function blockPublishWithoutAlias() {
  updateAliasGate();
  const gate = document.getElementById('pub-alias-gate');
  showToast(isStoreOwner
    ? 'Primero cargá el alias de tu comercio: sin él no se pueden publicar productos.'
    : 'El comercio todavía no cargó su alias: sin él no se pueden publicar productos.', 'error');
  if (gate) {
    gate.scrollIntoView({ behavior: 'smooth', block: 'center' });
    gate.classList.remove('is-flash');
    void gate.offsetWidth; // reinicia la animación si se aprieta dos veces
    gate.classList.add('is-flash');
  }
}

/** Columna de `stores` -> id del input en el form "Transferencia bancaria". */
const TRANSFER_FIELD_IDS = [
  ['transfer_alias', 'store-transfer-alias'],
  ['transfer_cbu', 'store-transfer-cbu'],
  ['transfer_holder', 'store-transfer-holder'],
  ['transfer_bank', 'store-transfer-bank'],
];

/**
 * Lee y valida el bloque "Transferencia bancaria". Se valida acá con las
 * mismas reglas que los checks de la migración 106 para avisar QUÉ está mal
 * en vez de devolver un error genérico de la base.
 * @returns {{ ok: true, values: object } | { ok: false, message: string, field: string }}
 */
function readTransferFields() {
  const val = (id) => document.getElementById(id)?.value.trim() || '';
  const alias = normalizeAlias(val('store-transfer-alias'));
  const cbuRaw = val('store-transfer-cbu');
  const cbu = normalizeCbu(cbuRaw);

  if (alias && !isValidAlias(alias)) {
    return { ok: false, field: 'store-transfer-alias', message: 'El alias tiene que tener entre 6 y 20 caracteres: letras, números, punto o guion, sin espacios.' };
  }
  if (cbuRaw && !isValidCbu(cbu)) {
    return { ok: false, field: 'store-transfer-cbu', message: `El CBU/CVU tiene que tener 22 números (cargaste ${cbu.length}).` };
  }
  return {
    ok: true,
    values: {
      transfer_alias: alias || null,
      transfer_cbu: cbu || null,
      transfer_holder: val('store-transfer-holder') || null,
      transfer_bank: val('store-transfer-bank') || null,
      transfer_info: val('store-transfer-info') || null,
    },
  };
}

/** Solo se pide el número si van a contactar por WhatsApp -- si no, no tiene sentido pedirlo. */
function toggleStoreWhatsappField(contactMethod) {
  const field = document.getElementById('store-whatsapp-field');
  if (!field) return;
  // Con style.display en vez de [hidden]: .pf-field ya trae display:flex, que
  // por especificidad le gana al [hidden] del user-agent (mismo gotcha que
  // .store-header__logo--placeholder en comercio.js).
  field.style.display = contactMethod === 'whatsapp' ? '' : 'none';
}

// Selector de característica de país para el WhatsApp del comercio (mismo
// componente y misma lista que el teléfono de "Mi perfil"/direcciones).
let storeWhatsappDial = null;

function setupStoreProfileForm() {
  const form = document.getElementById('store-profile-form');
  if (!form) return;

  const dialSlot = document.getElementById('store-whatsapp-dial-slot');
  if (dialSlot && !storeWhatsappDial) {
    storeWhatsappDial = buildDropdown({
      options: PHONE_COUNTRY_OPTIONS, value: DEFAULT_PHONE_DIAL, ariaLabel: 'Característica de país',
    });
    dialSlot.appendChild(storeWhatsappDial.element);
  }

  document.querySelectorAll('input[name="store-contact-method"]').forEach((radio) => {
    radio.addEventListener('change', () => toggleStoreWhatsappField(radio.value));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    setLoading(submitBtn, true, 'Guardar perfil');

    const nameValue = document.getElementById('store-name').value.trim();
    if (!isValidShopName(nameValue)) {
      showToast('Ingresá un nombre de comercio válido (entre 3 y 100 caracteres).', 'error');
      setLoading(submitBtn, false, 'Guardar perfil');
      return;
    }

    const transfer = readTransferFields();
    if (!transfer.ok) {
      showToast(transfer.message, 'error');
      document.getElementById(transfer.field)?.focus();
      setLoading(submitBtn, false, 'Guardar perfil');
      return;
    }

    const categorySlugValue = getStoreCategorySlug();
    if (!categorySlugValue) {
      showToast('Elegí una categoría para tu comercio.', 'error');
      setLoading(submitBtn, false, 'Guardar perfil');
      return;
    }

    const hoursValue = document.getElementById('store-hours').value.trim();

    const contactMethodInput = document.querySelector('input[name="store-contact-method"]:checked');
    const contactMethodValue = contactMethodInput ? contactMethodInput.value : 'whatsapp';
    const whatsappValue = document.getElementById('store-whatsapp').value.trim();

    if (contactMethodValue === 'whatsapp' && !isValidPhone(whatsappValue)) {
      showToast('Ingresá un número de WhatsApp válido para que los clientes te contacten por ahí.', 'error');
      setLoading(submitBtn, false, 'Guardar perfil');
      return;
    }
    const whatsappDialValue = storeWhatsappDial ? storeWhatsappDial.getValue() : DEFAULT_PHONE_DIAL;

    const descriptionValue = document.getElementById('store-description').value.trim();

    const socialFields = {};
    SOCIAL_NETWORKS.forEach(({ key }) => {
      socialFields[`social_${key}`] = document.getElementById(`store-social-${key}`).value.trim() || null;
      socialFields[`social_${key}_show`] = document.getElementById(`store-social-${key}-show`).checked;
    });

    const { error } = await supabase
      .from('stores')
      .update({
        name: nameValue,
        category_slug: categorySlugValue,
        address: document.getElementById('store-address').value.trim() || null,
        zone: document.getElementById('store-zone').value.trim() || null,
        hours: hoursValue || null,
        description: descriptionValue || null,
        contact_method: contactMethodValue,
        whatsapp: whatsappValue ? `${whatsappDialValue} ${whatsappValue}` : null,
        ...socialFields,
      })
      .eq('id', currentStoreId);

    // A113-299: aparte del resto (ver por qué en fillStoreProfileForm) -- si
    // la migración 66 todavía no está aplicada, que falle esto solo y no
    // todo el guardado del perfil.
    // Migración 106: si las columnas nuevas no existieran, se guarda al
    // menos el texto libre en vez de perder todo.
    let { error: transferError } = await supabase
      .from('stores')
      .update(transfer.values)
      .eq('id', currentStoreId);
    if (!transferError) {
      // Habilita (o vuelve a bloquear) "Publicar" sin recargar el panel.
      currentStoreHasAlias = Boolean(transfer.values.transfer_alias);
      updateAliasGate();
    }
    if (transferError) {
      console.error('Error al guardar los datos de transferencia (se reintenta solo con transfer_info):', transferError);
      ({ error: transferError } = await supabase
        .from('stores')
        .update({ transfer_info: transfer.values.transfer_info })
        .eq('id', currentStoreId));
      if (transferError) console.error('Error al guardar los datos de transferencia:', transferError);
    }

    if (error) {
      console.error('Error al guardar el perfil del comercio:', error);
      showToast('No se pudo guardar el perfil.', 'error');
    } else {
      showToast('Perfil del comercio actualizado.', 'success');
      // F12-15: onboarding -- si acaba de completar el perfil, el checklist se actualiza solo.
      currentStoreHasProfile = Boolean(descriptionValue);
      renderOnboardingChecklist(currentProductCount > 0);
      // El nombre pudo haber cambiado: refresca el header del sidebar y su cache
      // (esta sección solo la ve el dueño, nunca un empleado -- ver loadDashboard).
      const shopNameEl = document.getElementById('dash-shop-name');
      if (shopNameEl) shopNameEl.textContent = nameValue;
      if (currentUserId) {
        try { localStorage.setItem(`bl_vender_shopname_${currentUserId}`, nameValue); } catch { /* ignore */ }
      }
    }
    setLoading(submitBtn, false, 'Guardar perfil');
  });
}

// --- Banner del inicio (home_promos, migración 108) ---
// El admin elige qué comercio ocupa cada espacio de banner del home; acá el
// dueño carga la imagen y la publicación de los espacios de SU comercio.

const HOME_PROMO_PROS = [
  'Aparecés en la portada del inicio: lo primero que ve cualquiera que entra al sitio, antes de buscar nada.',
  'Más clicks directos a tu publicación, sin que el vecino tenga que buscarte o encontrarte de casualidad.',
  'Te destacás como comercio activo y recomendado, no uno más en la lista de resultados.',
  'Lo usás para lo que más te convenga en el momento: una oferta puntual, un producto nuevo, o simplemente darte a conocer.',
  'No tiene costo extra: es un espacio que se asigna, no se paga aparte.',
  'Podés cambiar la imagen y la publicación cuando quieras, sin esperar a nadie.',
];

const HOME_PROMO_CONS = [
  'Solo te encuentran buscando o navegando por categoría: te perdés a la mayoría, que entra directo al inicio.',
  'Quedás al mismo nivel que cualquier otro comercio, sin nada que te distinga de entrada.',
  'Tus ofertas o novedades no tienen ningún lugar destacado donde mostrarse.',
];

function buildHomePromoEmptyState(storeName) {
  const empty = document.createElement('div');
  empty.className = 'hp-empty';

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-bullhorn';
  icon.setAttribute('aria-hidden', 'true');
  empty.appendChild(icon);

  const text = document.createElement('p');
  text.textContent = 'Tu comercio todavía no tiene un espacio en el inicio. Si querés destacar una promoción, escribinos desde Soporte.';
  empty.appendChild(text);

  const perks = document.createElement('div');
  perks.className = 'hp-empty__perks';

  function perkGroup(modifier, title, items) {
    const group = document.createElement('div');
    group.className = `hp-empty__perk-group hp-empty__perk-group--${modifier}`;
    const h = document.createElement('h4');
    h.className = 'hp-empty__perk-title';
    h.textContent = title;
    group.appendChild(h);
    const list = document.createElement('ul');
    list.className = 'hp-empty__perk-list';
    items.forEach((txt) => {
      const li = document.createElement('li');
      li.textContent = txt;
      list.appendChild(li);
    });
    group.appendChild(list);
    return group;
  }

  perks.append(
    perkGroup('pro', 'Con un banner asignado', HOME_PROMO_PROS),
    perkGroup('con', 'Sin un banner asignado', HOME_PROMO_CONS),
  );
  empty.appendChild(perks);

  const askBtn = document.createElement('button');
  askBtn.type = 'button';
  askBtn.className = 'hp-btn hp-btn--primary';
  askBtn.textContent = 'Pedir este espacio';
  askBtn.addEventListener('click', async () => {
    if (!(await confirmDialog('¿Le avisamos al equipo de Baradero Local que querés un espacio de banner en el inicio?', { confirmText: 'Pedirlo' }))) return;
    askBtn.disabled = true;
    askBtn.textContent = 'Enviando…';
    try {
      await submitSupportTicket(
        'Quiero un espacio de banner en el inicio',
        `Hola! Quiero pedir un espacio de banner en la página de inicio para destacar las promociones de ${storeName || 'mi comercio'}. Gracias!`,
      );
      showToast('Listo, le avisamos al equipo. Te contestamos por Soporte.', 'success');
      askBtn.textContent = 'Ya lo pedimos ✓';
    } catch (err) {
      console.error('Error al pedir el espacio de banner:', err);
      showToast('No se pudo enviar el pedido. Probá de nuevo.', 'error');
      askBtn.disabled = false;
      askBtn.textContent = 'Pedir este espacio';
    }
  });
  empty.appendChild(askBtn);

  return empty;
}

async function renderHomePromo(storeName) {
  const container = document.getElementById('home-promo-container');
  if (!container || !currentStoreId) return;

  const { data, error } = await supabase
    .from('home_promos')
    .select('id, slot, store_id, product_id, image_url, title, is_active')
    .eq('store_id', currentStoreId)
    .order('slot');

  container.textContent = '';
  if (error) {
    console.error('Error al cargar la promo del inicio:', error);
    const p = document.createElement('p');
    p.className = 'hp-error';
    p.textContent = 'No pudimos cargar tu espacio en el inicio.';
    container.appendChild(p);
    return;
  }

  if (!data?.length) {
    container.appendChild(buildHomePromoEmptyState(storeName));
    return;
  }

  data.forEach((promo) => {
    container.appendChild(buildPromoEditorCard({
      promo,
      mode: 'seller',
      storeName,
      onSaved: () => renderHomePromo(storeName),
    }));
  });
}

// --- F12-03: cupones propios del vendedor (solo los de su propia tienda) ---

async function renderMyCoupons() {
  const container = document.getElementById('my-coupons-container');
  if (!container || !currentStoreId) return;
  container.textContent = '';

  const { data, error } = await supabase
    .from('coupons')
    .select('id, code, discount_percentage, is_active, expires_at')
    .eq('store_id', currentStoreId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar cupones:', error);
    const errorMsg = document.createElement('p');
    errorMsg.style.color = 'var(--bl-text-secondary)';
    errorMsg.textContent = 'Error al cargar tus cupones.';
    container.appendChild(errorMsg);
    return;
  }

  if (!data || data.length === 0) {
    renderCouponsEmpty(container);
    return;
  }

  data.forEach((coupon) => container.appendChild(buildCouponRow(coupon)));
}

function renderCouponsEmpty(container) {
  const box = document.createElement('div');
  box.className = 'pub-empty';
  const icon = document.createElement('i');
  icon.className = 'fa-regular fa-rectangle-list pub-empty__icon';
  box.appendChild(icon);
  const title = document.createElement('p');
  title.className = 'pub-empty__title';
  title.textContent = 'Todavía no creaste ningún cupón';
  box.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'pub-empty__sub';
  sub.textContent = 'Usá el formulario de arriba para crear el primero.';
  box.appendChild(sub);
  container.appendChild(box);
}

/** Fila estilo ML, mismo patrón que buildPubRow (Publicaciones): kebab con Activar/Desactivar + Borrar. */
function buildCouponRow(coupon) {
  const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();

  const row = document.createElement('div');
  row.className = 'pub-row' + (coupon.is_active && !isExpired ? '' : ' pub-row--paused');

  const icon = document.createElement('div');
  icon.className = 'pub-row__thumb pub-row__thumb--icon';
  const iconEl = document.createElement('i');
  iconEl.className = 'fa-solid fa-ticket';
  icon.appendChild(iconEl);
  row.appendChild(icon);

  const main = document.createElement('div');
  main.className = 'pub-row__main';
  const title = document.createElement('span');
  title.className = 'pub-row__title';
  title.textContent = coupon.code;
  main.appendChild(title);
  const sub = document.createElement('span');
  sub.style.cssText = 'display: block; color: var(--bl-text-secondary); font-size: 0.85rem;';
  sub.textContent = `${coupon.discount_percentage}% de descuento` + (coupon.expires_at ? ` · Vence ${new Date(coupon.expires_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` : '');
  main.appendChild(sub);
  row.appendChild(main);

  const statusCell = document.createElement('div');
  statusCell.className = 'pub-row__cell';
  const badge = document.createElement('span');
  const statusVariant = isExpired ? 'cancelled' : (coupon.is_active ? 'active' : 'paused');
  const statusLabel = isExpired ? 'Vencido' : (coupon.is_active ? 'Activo' : 'Inactivo');
  badge.className = `pub-status pub-status--${statusVariant}`;
  badge.textContent = statusLabel;
  statusCell.appendChild(badge);
  row.appendChild(statusCell);

  const wrap = document.createElement('div');
  wrap.className = 'pub-actions';
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'pub-actions__toggle';
  toggleBtn.setAttribute('aria-label', 'Acciones del cupón');
  const dots = document.createElement('i');
  dots.className = 'fa-solid fa-ellipsis-vertical';
  toggleBtn.appendChild(dots);
  wrap.appendChild(toggleBtn);

  const menu = document.createElement('div');
  menu.className = 'pub-actions__menu';
  menu.hidden = true;
  menu.appendChild(pubMenuItem(coupon.is_active ? 'Desactivar' : 'Activar', coupon.is_active ? 'fa-eye-slash' : 'fa-eye', async () => {
    closePubMenus();
    const { error: updateError } = await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id);
    if (updateError) {
      showToast('No se pudo actualizar el cupón.', 'error');
      console.error(updateError);
      return;
    }
    renderMyCoupons();
  }));
  menu.appendChild(pubMenuItem('Borrar', 'fa-trash', async () => {
    closePubMenus();
    if (!(await confirmDialog(`¿Borrar el cupón "${coupon.code}"?`, { confirmText: 'Borrar', danger: true }))) return;
    const { error: deleteError } = await supabase.from('coupons').delete().eq('id', coupon.id);
    if (deleteError) {
      showToast('No se pudo borrar el cupón.', 'error');
      console.error(deleteError);
      return;
    }
    showToast('Cupón borrado.', 'success');
    renderMyCoupons();
  }, true));
  wrap.appendChild(menu);

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closePubMenus();
    menu.hidden = !willOpen;
  });

  row.appendChild(wrap);
  return row;
}

function setupMyCouponForm() {
  const form = document.getElementById('my-coupon-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('my-coupon-code').value.trim().toUpperCase();
    const discountNum = parseInt(document.getElementById('my-coupon-discount').value, 10);
    const expiresAt = document.getElementById('my-coupon-expires').value;

    if (!code || !Number.isInteger(discountNum) || discountNum < 1 || discountNum > 100) {
      showToast('Código y descuento (1-100) son obligatorios.', 'error');
      return;
    }

    const { error } = await supabase.from('coupons').insert({
      code,
      discount_percentage: discountNum,
      expires_at: expiresAt || null,
      is_active: true,
      store_id: currentStoreId,
    });

    if (error) {
      showToast('No se pudo crear el cupón (¿el código ya está en uso?).', 'error');
      console.error(error);
      return;
    }

    showToast('Cupón creado — ya se puede usar en el checkout.', 'success');
    form.reset();
    renderMyCoupons();
  });
}

// --- F12-16: empleados del comercio (solo el dueño ve/gestiona esta sección) ---

function renderStaffEmpty(container) {
  const empty = document.createElement('div');
  empty.className = 'pub-empty';
  empty.innerHTML = '<i class="fa-solid fa-users"></i><p>Todavía no agregaste ningún empleado.</p>';
  container.appendChild(empty);
}

function buildStaffRow(s, email) {
  const row = document.createElement('div');
  row.className = 'pub-row';
  row.style.cssText = 'flex-direction: column; align-items: stretch; gap: 0;';

  const top = document.createElement('div');
  top.style.cssText = 'display: flex; align-items: center; gap: 1rem; width: 100%;';

  const thumb = document.createElement('div');
  thumb.className = 'pub-row__thumb pub-row__thumb--icon';
  thumb.innerHTML = '<i class="fa-solid fa-user"></i>';
  top.appendChild(thumb);

  const main = document.createElement('div');
  main.className = 'pub-row__main';
  const title = document.createElement('p');
  title.className = 'pub-row__title';
  title.textContent = email || 'Cuenta eliminada';
  const sub = document.createElement('p');
  sub.className = 'pub-row__subtitle';
  sub.textContent = `Agregado el ${new Date(s.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`;
  main.appendChild(title);
  main.appendChild(sub);
  top.appendChild(main);

  // Única acción disponible: se muestra como botón visible, no kebab (mismo criterio que Pagos por confirmar).
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-outline';
  removeBtn.style.cssText = 'border-color: #ef4444; color: #ef4444; padding: 0.5rem 1rem; white-space: nowrap;';
  removeBtn.textContent = 'Quitar acceso';
  removeBtn.addEventListener('click', async () => {
    if (!(await confirmDialog(`¿Quitarle el acceso a este panel a "${title.textContent}"?`, { confirmText: 'Quitar acceso', danger: true }))) return;
    const { error: deleteError } = await supabase.from('store_staff').delete().eq('id', s.id);
    if (deleteError) {
      showToast('No se pudo quitar el acceso.', 'error');
      console.error(deleteError);
      return;
    }
    showToast('Acceso quitado.', 'success');
    renderStoreStaff();
  });
  top.appendChild(removeBtn);
  row.appendChild(top);

  // Qué secciones del panel ve este empleado (migración 83). Cada check
  // guarda solo al tocarlo (merge sobre `permissions`, no reemplaza todo el
  // objeto -- evita pisar un cambio que haya guardado otra pestaña).
  const perms = staffPermissionsWithDefaults(s.permissions);
  const permsWrap = document.createElement('div');
  permsWrap.className = 'staff-perms';
  STAFF_PERMISSION_SECTIONS.forEach(({ key, label }) => {
    const check = document.createElement('label');
    check.className = 'pf-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = perms[key];
    input.addEventListener('change', async () => {
      input.disabled = true;
      const nextPermissions = { ...perms, [key]: input.checked };
      const { error: updateError } = await supabase
        .from('store_staff')
        .update({ permissions: nextPermissions })
        .eq('id', s.id);
      input.disabled = false;
      if (updateError) {
        input.checked = !input.checked; // revertir el check
        showToast('No se pudo guardar el permiso.', 'error');
        console.error(updateError);
        return;
      }
      perms[key] = input.checked;
      s.permissions = nextPermissions;
    });
    check.appendChild(input);
    check.appendChild(document.createTextNode(label));
    permsWrap.appendChild(check);
  });
  row.appendChild(permsWrap);

  return row;
}

async function renderStoreStaff() {
  const container = document.getElementById('store-staff-container');
  if (!container || !currentStoreId) return;
  container.textContent = '';

  const { data: staff, error } = await supabase
    .from('store_staff')
    .select('id, user_id, created_at, permissions')
    .eq('store_id', currentStoreId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar empleados:', error);
    const errorMsg = document.createElement('p');
    errorMsg.style.color = 'var(--bl-text-secondary)';
    errorMsg.textContent = 'Error al cargar la lista de empleados.';
    container.appendChild(errorMsg);
    return;
  }

  if (!staff || staff.length === 0) {
    renderStaffEmpty(container);
    return;
  }

  // store_staff.user_id referencia auth.users, no profiles -> segunda consulta
  // por los emails (mismo patrón que phoneByClientId en perfil.js, F12-05).
  const userIds = staff.map((s) => s.user_id);
  const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', userIds);
  const emailByUserId = new Map((profiles || []).map((p) => [p.id, p.email]));

  staff.forEach((s) => container.appendChild(buildStaffRow(s, emailByUserId.get(s.user_id))));
}

function setupStoreStaffForm() {
  const form = document.getElementById('store-staff-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('store-staff-email');
    const email = emailInput.value.trim();
    if (!email) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    setLoading(submitBtn, true, 'Agregar');

    const { error } = await supabase.rpc('add_store_staff', { p_store_id: currentStoreId, p_email: email });

    if (error) {
      showToast(error.message || 'No se pudo agregar al empleado.', 'error');
      console.error(error);
    } else {
      showToast('Empleado agregado — ya puede entrar a este panel.', 'success');
      form.reset();
      renderStoreStaff();
    }
    setLoading(submitBtn, false, 'Agregar');
  });
}

/**
 * Sección "Resumen" (rediseño ML con paleta propia): saludo + fila de 4 stats
 * (reputación / ventas brutas 7d / dinero disponible / ventas totales 30d) +
 * card "Impulsá tus ventas" + pendientes (publicaciones/ventas) + Novedades +
 * "¿Necesitás ayuda?" + Métricas de negocio (línea 7d + torta por categoría
 * 30d). Datos reales -- vacíos hasta que haya reseñas/ventas/mensajes.
 * Reemplaza loadDashboardStats + el insights provisional (F12-13).
 */
function rsEl(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function rsReputationLabel(avgRating, reviewCount) {
  if (!reviewCount) return 'Sin calificar';
  if (avgRating >= 4.5) return 'Excelente';
  if (avgRating >= 4) return 'Muy buena';
  if (avgRating >= 3) return 'Buena';
  if (avgRating >= 2) return 'Regular';
  return 'Mala';
}

function rsStatCard({ area, icon, iconVariant, title, value, sub, delta, action }) {
  const card = rsEl('div', 'rs-card rs-stat');
  card.style.gridArea = area;

  const top = rsEl('div', 'rs-stat__top');
  const iconEl = rsEl('div', `rs-stat__icon rs-stat__icon--${iconVariant}`);
  iconEl.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  top.appendChild(iconEl);
  top.appendChild(rsEl('div', 'rs-stat__title', title));
  card.appendChild(top);

  card.appendChild(rsEl('div', 'rs-stat__value', value));
  if (sub) card.appendChild(rsEl('div', 'rs-stat__sub', sub));

  if (delta) {
    const deltaEl = rsEl('div', 'rs-stat__delta' + (delta.positive === false ? ' rs-stat__delta--down' : ''));
    deltaEl.innerHTML = `<i class="fa-solid fa-arrow-${delta.positive === false ? 'down' : 'up'}"></i> `;
    deltaEl.appendChild(document.createTextNode(delta.text));
    card.appendChild(deltaEl);
  }

  if (action) {
    let control;
    if (action.href) {
      control = document.createElement('a');
      control.href = action.href;
    } else {
      control = document.createElement('button');
      control.type = 'button';
      control.addEventListener('click', action.onClick);
    }
    control.className = 'rs-link';
    control.appendChild(document.createTextNode(action.label + ' '));
    control.appendChild(rsEl('i', 'fa-solid fa-chevron-right'));
    card.appendChild(control);
  }

  return card;
}

function rsPendingCard(title, icon, area, rows, footer) {
  const card = rsEl('div', 'rs-card rs-pend');
  card.style.gridArea = area;
  const titleEl = rsEl('div', 'rs-card__title');
  titleEl.innerHTML = `<i class="fa-solid ${icon}"></i> `;
  titleEl.appendChild(document.createTextNode(title));
  card.appendChild(titleEl);

  rows.forEach((r) => {
    const row = rsEl('div', 'rs-pending-row');
    row.addEventListener('click', () => {
      if (r.href) window.location.href = r.href;
      else if (r.section === 'pedidos') goToPedidos(r.tab || 'all');
      else location.hash = r.section;
      // "Publicaciones inactivas" abre la lista ya filtrada por las pausadas.
      if (r.pubStatus) document.querySelector(`#pub-toolbar .pub-chip[data-status="${r.pubStatus}"]`)?.click();
    });
    row.appendChild(rsEl('span', 'rs-pending-row__label', r.label));
    const right = rsEl('span', 'rs-pending-row__right');
    right.appendChild(rsEl('span', 'rs-badge' + (r.alert ? ' rs-badge--alert' : ''), String(r.count)));
    right.appendChild(rsEl('i', 'fa-solid fa-chevron-right'));
    row.appendChild(right);
    card.appendChild(row);
  });

  if (footer) {
    const link = rsEl('button', 'rs-link', footer.label + ' ›');
    link.type = 'button';
    link.addEventListener('click', () => { location.hash = footer.section; });
    card.appendChild(link);
  }
  return card;
}

function rsPromoCard() {
  const card = rsEl('div', 'rs-promo');

  const nextBtn = rsEl('button', 'rs-promo__next');
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Ver más promociones');
  nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
  nextBtn.addEventListener('click', () => showToast('Por ahora tenés una sola promoción disponible.', 'success'));
  card.appendChild(nextBtn);

  const icon = rsEl('div', 'rs-promo__icon');
  icon.innerHTML = '<i class="fa-solid fa-store"></i>';
  card.appendChild(icon);

  card.appendChild(rsEl('div', 'rs-promo__title', 'Impulsá tus ventas'));
  card.appendChild(rsEl('div', 'rs-promo__text', 'Destacá tus publicaciones y llegá a más compradores en Baradero.'));
  const btn = rsEl('button', 'rs-promo__btn', 'Promocionar mis publicaciones');
  btn.type = 'button';
  btn.addEventListener('click', () => showToast('Muy pronto vas a poder promocionar tus publicaciones desde acá.', 'success'));
  card.appendChild(btn);

  return card;
}

function rsNoveltyCard() {
  const card = rsEl('div', 'rs-card');
  const title = rsEl('div', 'rs-card__title');
  title.innerHTML = '<i class="fa-solid fa-bell"></i> ';
  title.appendChild(document.createTextNode('Novedades'));
  card.appendChild(title);
  card.appendChild(rsEl('div', 'rs-empty', 'Aún no tenés novedades. Acá vas a ver los comunicados del equipo cuando estén disponibles.'));
  return card;
}

/**
 * "Recomendaciones para impulsar tus ventas": tarjeta del Resumen que lleva a la
 * sección Recomendaciones. Va debajo de Novedades (rsResumenRightColumn).
 */
function rsRecommendationsCard() {
  const card = rsEl('div', 'rs-card');
  const title = rsEl('div', 'rs-card__title');
  title.innerHTML = '<i class="fa-regular fa-lightbulb"></i> ';
  title.appendChild(document.createTextNode('Recomendaciones para impulsar tus ventas'));
  card.appendChild(title);
  card.appendChild(rsEl('div', 'rs-empty', 'Acá vas a encontrar ideas simples para vender más: cómo mostrar mejor tus productos, atender tus pedidos y destacarte entre los comercios de Baradero.'));
  const link = rsEl('button', 'rs-link', 'Ir a recomendaciones ›');
  link.type = 'button';
  link.addEventListener('click', () => { location.hash = 'recomendaciones'; });
  card.appendChild(link);
  return card;
}

function rsHelpCard() {
  const card = rsEl('div', 'rs-card');
  const title = rsEl('div', 'rs-card__title');
  title.innerHTML = '<i class="fa-solid fa-headset"></i> ';
  title.appendChild(document.createTextNode('¿Necesitás ayuda?'));
  card.appendChild(title);
  card.appendChild(rsEl('div', 'rs-empty', 'Nuestro equipo está para ayudarte.'));

  const rows = [
    { title: 'Chat en vivo', sub: 'Muy pronto', onClick: () => showToast('El chat en vivo va a estar disponible próximamente. Mientras tanto, podés escribirnos por correo o dejarnos un reclamo en Soporte.', 'success') },
    { title: 'Centro de ayuda', sub: 'Preguntas frecuentes', onClick: () => { location.hash = 'soporte'; } },
    { title: 'Soporte por correo', sub: 'soporte@baraderolocal.com.ar', href: 'mailto:soporte@baraderolocal.com.ar' },
  ];
  rows.forEach((r) => {
    const row = rsEl('div', 'rs-help-row');
    if (r.href) {
      row.addEventListener('click', () => { window.location.href = r.href; });
    } else {
      row.addEventListener('click', r.onClick);
    }
    const left = rsEl('div');
    left.appendChild(rsEl('div', 'rs-help-row__title', r.title));
    left.appendChild(rsEl('div', 'rs-help-row__sub', r.sub));
    row.appendChild(left);
    row.appendChild(rsEl('i', 'fa-solid fa-chevron-right'));
    card.appendChild(row);
  });
  return card;
}

/**
 * Línea de ventas por día (SVG, sin librería). `formatValue` da el texto del eje
 * Y (pesos por defecto; la de cantidad de ventas pasa enteros); `labelEvery`
 * espacia las fechas del eje X cuando hay muchos días (la de 30 días).
 */
function rsLineChart(dailyTotals, { formatValue = formatPrice, labelEvery = 1, minMax = 1 } = {}) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const W = 480, H = 160, padL = 46, padR = 8, padT = 10, padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxTotal = Math.max(minMax, ...dailyTotals.map((d) => d.total));
  const n = dailyTotals.length;
  const stepX = n > 1 ? chartW / (n - 1) : 0;
  const points = dailyTotals.map((d, i) => ({
    x: padL + stepX * i,
    y: padT + chartH - (d.total / maxTotal) * chartH,
    d,
  }));

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'rs-line');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  [0, 0.5, 1].forEach((frac) => {
    const y = padT + chartH * (1 - frac);
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('class', 'rs-line__grid');
    line.setAttribute('x1', String(padL));
    line.setAttribute('x2', String(W - padR));
    line.setAttribute('y1', y.toFixed(1));
    line.setAttribute('y2', y.toFixed(1));
    svg.appendChild(line);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('class', 'rs-line__axis');
    label.setAttribute('x', '2');
    label.setAttribute('y', (y + 3).toFixed(1));
    label.textContent = formatValue(Math.round(maxTotal * frac));
    svg.appendChild(label);
  });

  points.forEach((p, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return;
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('class', 'rs-line__axis');
    label.setAttribute('x', p.x.toFixed(1));
    label.setAttribute('y', String(H - 4));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = p.d.day.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    svg.appendChild(label);
  });

  const baseline = (padT + chartH).toFixed(1);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${points[points.length - 1].x.toFixed(1)},${baseline} L${points[0].x.toFixed(1)},${baseline} Z`;

  const area = document.createElementNS(svgNS, 'path');
  area.setAttribute('class', 'rs-line__area');
  area.setAttribute('d', areaD);
  svg.appendChild(area);

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('class', 'rs-line__path');
  path.setAttribute('d', pathD);
  svg.appendChild(path);

  points.forEach((p) => {
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('class', 'rs-line__dot');
    dot.setAttribute('cx', p.x.toFixed(1));
    dot.setAttribute('cy', p.y.toFixed(1));
    dot.setAttribute('r', '3');
    svg.appendChild(dot);
  });

  return svg;
}

function rsMetricsCard(dailyTotals, sales7d, pctChange, catItems30d) {
  const card = rsEl('div', 'rs-card');
  const title = rsEl('div', 'rs-card__title');
  title.innerHTML = '<i class="fa-solid fa-chart-line"></i> ';
  title.appendChild(document.createTextNode('Métricas de negocio'));
  card.appendChild(title);

  const metrics = rsEl('div', 'rs-metrics');

  // Columna izquierda: ventas brutas de los últimos 7 días (línea)
  const left = rsEl('div');
  left.id = 'resumen-sales-gross';
  left.style.scrollMarginTop = '1rem';
  left.appendChild(rsEl('div', 'rs-metrics__label', 'Ventas brutas de los últimos 7 días'));
  left.appendChild(rsEl('div', 'rs-metrics__figure', formatPrice(sales7d)));
  if (pctChange !== null) {
    const delta = rsEl('div', 'rs-stat__delta' + (pctChange < 0 ? ' rs-stat__delta--down' : ''));
    delta.innerHTML = `<i class="fa-solid fa-arrow-${pctChange < 0 ? 'down' : 'up'}"></i> `;
    delta.appendChild(document.createTextNode(`${Math.abs(pctChange)}% vs. semana anterior`));
    left.appendChild(delta);
  }
  left.appendChild(rsLineChart(dailyTotals));
  metrics.appendChild(left);

  // Columna derecha: torta por categoría (últimos 30 días)
  const right = rsEl('div');
  right.appendChild(rsEl('div', 'rs-metrics__label', 'Ventas por categoría (últimos 30 días)'));

  const byCat = new Map();
  catItems30d.forEach((it) => {
    const name = it.products?.categories?.name || 'Otros';
    byCat.set(name, (byCat.get(name) || 0) + it.quantity * it.price);
  });
  const entries = [...byCat.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    right.appendChild(rsEl('div', 'rs-empty', 'Todavía no hay ventas en los últimos 30 días para mostrar el desglose por categoría.'));
  } else {
    const total = entries.reduce((s, [, v]) => s + v, 0);
    const palette = ['#0e7490', '#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#64748b'];
    const top = entries.slice(0, 6);
    const restVal = entries.slice(6).reduce((s, [, v]) => s + v, 0);
    const slices = restVal > 0 ? [...top, ['Otras', restVal]] : top;

    let acc = 0;
    const stops = slices.map(([, v], i) => {
      const start = (acc / total) * 360;
      acc += v;
      const end = (acc / total) * 360;
      return `${palette[i % palette.length]} ${start}deg ${end}deg`;
    });

    const pieWrap = rsEl('div', 'rs-pie');
    const chartWrap = rsEl('div', 'rs-pie__chart-wrap');
    const chart = rsEl('div', 'rs-pie__chart');
    chart.style.background = `conic-gradient(${stops.join(', ')})`;
    chartWrap.appendChild(chart);
    chartWrap.appendChild(rsEl('div', 'rs-pie__hole'));
    pieWrap.appendChild(chartWrap);

    const legend = rsEl('div', 'rs-pie__legend');
    slices.forEach(([name, v], i) => {
      const item = rsEl('div', 'rs-pie__item');
      const dot = rsEl('span', 'rs-pie__dot');
      dot.style.background = palette[i % palette.length];
      item.appendChild(dot);
      item.appendChild(rsEl('span', 'rs-pie__name', name));
      item.appendChild(rsEl('span', 'rs-pie__pct', `${Math.round((v / total) * 100)}%`));
      item.appendChild(rsEl('span', 'rs-pie__amount', formatPrice(v)));
      legend.appendChild(item);
    });
    pieWrap.appendChild(legend);
    right.appendChild(pieWrap);
  }
  metrics.appendChild(right);

  card.appendChild(metrics);
  return card;
}

/** "Ventas totales de los últimos 30 días": cantidad de ventas por día (misma línea que Métricas de negocio). */
function rsSales30Card(dailyCounts, total30d, pctChange) {
  const card = rsEl('div', 'rs-card rs-sales30');
  card.id = 'resumen-sales30';
  const title = rsEl('div', 'rs-card__title');
  title.innerHTML = '<i class="fa-solid fa-chart-line"></i> ';
  title.appendChild(document.createTextNode('Ventas totales de los últimos 30 días'));
  card.appendChild(title);

  card.appendChild(rsEl('div', 'rs-metrics__label', 'Cantidad de ventas por día'));
  card.appendChild(rsEl('div', 'rs-metrics__figure', String(total30d)));
  if (pctChange !== null) {
    const delta = rsEl('div', 'rs-stat__delta' + (pctChange < 0 ? ' rs-stat__delta--down' : ''));
    delta.innerHTML = `<i class="fa-solid fa-arrow-${pctChange < 0 ? 'down' : 'up'}"></i> `;
    delta.appendChild(document.createTextNode(`${Math.abs(pctChange)}% vs. 30 días anteriores`));
    card.appendChild(delta);
  }
  // minMax 2 + enteros: el eje Y marca 0 / 1 / 2 en vez de decimales sin sentido.
  const peak = Math.max(2, ...dailyCounts.map((d) => d.total));
  card.appendChild(rsLineChart(dailyCounts, {
    formatValue: (v) => String(v),
    labelEvery: 5,
    minMax: peak % 2 === 0 ? peak : peak + 1,
  }));
  return card;
}

/** Día local (YYYY-MM-DD): toISOString() es UTC y corría de día las ventas de la noche en Argentina (UTC-3). */
function localDayKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function renderResumen() {
  const dash = document.getElementById('resumen-dash');
  const grid2 = document.getElementById('resumen-grid2');
  const metricsContainer = document.getElementById('resumen-metrics');
  if (!dash || !grid2 || !metricsContainer || !currentStoreId) return;

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const prevSevenDaysAgo = new Date(sevenDaysAgo);
  prevSevenDaysAgo.setDate(prevSevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [rev, ord, cat, pay] = await Promise.all([
    supabase.from('reviews').select('rating, client_id').eq('target_type', 'store').eq('target_id', currentStoreId).eq('is_hidden', false),
    supabase.from('orders').select('total_price, created_at, status, client_id').eq('store_id', currentStoreId).eq('payment_status', 'paid'),
    supabase.from('order_items').select('quantity, price, products(categories(name)), orders!inner(store_id, payment_status, created_at)').eq('orders.store_id', currentStoreId).eq('orders.payment_status', 'paid'),
    supabase.from('orders').select('id, status, payment_status, payment_method, transfer_notified_at, payment_proofs(status), deliveries(status)').eq('store_id', currentStoreId).in('status', ['pending', 'paid']),
  ]);

  const reviews = rev.data || [];
  const paidOrders = ord.data || [];
  const catItems = cat.data || [];
  // Mismos criterios que las pestañas de Pedidos (pedidosTabMatches).
  const openOrders = pay.data || [];
  const pendingPayCount = openOrders.filter((o) => pedidosTabMatches(o, 'to_confirm')).length;
  const toPrepareCount = openOrders.filter((o) => pedidosTabMatches(o, 'to_prepare')).length;

  const reviewCount = reviews.length;
  const avgRating = reviewCount ? reviews.reduce((s, r) => s + r.rating, 0) / reviewCount : 0;
  const deliveredCount = paidOrders.filter((o) => o.status === 'completed').length;

  const sales7d = paidOrders.filter((o) => new Date(o.created_at) >= sevenDaysAgo).reduce((s, o) => s + o.total_price, 0);
  const salesPrev7d = paidOrders
    .filter((o) => { const d = new Date(o.created_at); return d >= prevSevenDaysAgo && d < sevenDaysAgo; })
    .reduce((s, o) => s + o.total_price, 0);
  const pctChange = salesPrev7d > 0 ? Math.round(((sales7d - salesPrev7d) / salesPrev7d) * 100) : null;

  const orders30dCount = paidOrders.filter((o) => new Date(o.created_at) >= thirtyDaysAgo).length;

  const dailyTotals = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(sevenDaysAgo);
    day.setDate(day.getDate() + i);
    const key = localDayKey(day);
    const total = paidOrders.filter((o) => localDayKey(new Date(o.created_at)) === key).reduce((s, o) => s + o.total_price, 0);
    dailyTotals.push({ day, total });
  }
  // Cantidad de ventas por día en los últimos 30 días + comparación con los 30 anteriores.
  const countByDay = new Map();
  paidOrders.forEach((o) => {
    const k = localDayKey(new Date(o.created_at));
    countByDay.set(k, (countByDay.get(k) || 0) + 1);
  });
  const dailyCounts = [];
  for (let i = 0; i < 30; i++) {
    const day = new Date(thirtyDaysAgo);
    day.setDate(day.getDate() + i);
    dailyCounts.push({ day, total: countByDay.get(localDayKey(day)) || 0 });
  }
  const prevThirtyDaysAgo = new Date(thirtyDaysAgo);
  prevThirtyDaysAgo.setDate(prevThirtyDaysAgo.getDate() - 30);
  const ordersPrev30dCount = paidOrders.filter((o) => { const d = new Date(o.created_at); return d >= prevThirtyDaysAgo && d < thirtyDaysAgo; }).length;
  const pctChange30d = ordersPrev30dCount > 0 ? Math.round(((orders30dCount - ordersPrev30dCount) / ordersPrev30dCount) * 100) : null;
  const catItems30d = catItems.filter((it) => it.orders?.created_at && new Date(it.orders.created_at) >= thirtyDaysAgo);

  // Fila superior: 3 stats + "Impulsá tus ventas"
  dash.textContent = '';
  dash.appendChild(rsStatCard({
    area: 's1', icon: 'fa-star', iconVariant: 'rep', title: 'Reputación',
    value: rsReputationLabel(avgRating, reviewCount),
    sub: reviewCount ? `${avgRating.toFixed(1)} / 5 ★ · ${reviewCount} reseña${reviewCount === 1 ? '' : 's'}` : 'Sumá tus primeras reseñas',
    action: { label: 'Ver detalle', href: `./comercio.html?id=${currentStoreId}#store-reviews` },
  }));
  dash.appendChild(rsStatCard({
    area: 's2', icon: 'fa-sack-dollar', iconVariant: 'sales', title: 'Ventas brutas',
    value: formatPrice(sales7d), sub: 'Últimos 7 días',
    delta: pctChange !== null ? { text: `${Math.abs(pctChange)}% vs. semana anterior`, positive: pctChange >= 0 } : null,
    action: { label: 'Ver detalle', onClick: () => document.getElementById('resumen-sales-gross')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
  }));
  dash.appendChild(rsStatCard({
    area: 's3', icon: 'fa-cart-shopping', iconVariant: 'orders', title: 'Ventas totales',
    value: String(orders30dCount), sub: 'Últimos 30 días',
    action: { label: 'Ver detalle', onClick: () => document.getElementById('resumen-sales30')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
  }));
  dash.appendChild(rsPromoCard());

  dash.appendChild(rsPendingCard('Estado de tus publicaciones', 'fa-clipboard-list', 'p1', [
    { label: 'Publicaciones activas', count: currentActiveProductCount, section: 'publicaciones' },
    { label: 'Publicaciones inactivas', count: currentInactiveProductCount, section: 'publicaciones', pubStatus: 'inactive' },
  ], { label: 'Ir a publicaciones', section: 'publicaciones' }));

  dash.appendChild(rsPendingCard('Estado de tus ventas', 'fa-truck-fast', 'p2', [
    { label: 'Pagos por confirmar', count: pendingPayCount, section: 'pedidos', tab: 'to_confirm', alert: pendingPayCount > 0 },
    { label: 'Pedidos para preparar', count: toPrepareCount, section: 'pedidos', tab: 'to_prepare', alert: toPrepareCount > 0 },
    { label: 'Entregados', count: deliveredCount, section: 'pedidos', tab: 'completed' },
  ], { label: 'Ir a pedidos', section: 'pedidos' }));

  // Novedades / ¿Necesitás ayuda?
  grid2.textContent = '';
  grid2.appendChild(rsHelpCard());
  const rightCol = rsEl('div', 'rs-col');
  rightCol.appendChild(rsNoveltyCard());
  rightCol.appendChild(rsRecommendationsCard());
  grid2.appendChild(rightCol);

  // Métricas de negocio
  metricsContainer.textContent = '';
  metricsContainer.appendChild(rsMetricsCard(dailyTotals, sales7d, pctChange, catItems30d));
  metricsContainer.appendChild(rsSales30Card(dailyCounts, orders30dCount, pctChange30d));
}

// (El insights provisional F12-13 se reemplazó por renderResumen, arriba.)

/**
 * F12-15: onboarding para el vendedor recién aprobado -- antes caía a un
 * dashboard vacío sin ninguna guía. Se basa en el estado real (perfil
 * completo / al menos un producto cargado), no en una preferencia guardada
 * de "descartado" -- una vez cumplidos los dos pasos, desaparece solo y no
 * vuelve a aparecer (no hay forma de "reabrirlo" a propósito, no hace falta).
 */
function renderOnboardingChecklist(hasProducts) {
  const container = document.getElementById('onboarding-container');
  if (!container) return;

  container.textContent = '';

  // F12-16: el checklist apunta a acciones exclusivas del dueño (perfil,
  // publicar producto) -- un empleado no las puede hacer, no tiene sentido mostrárselo.
  if (!isStoreOwner || (currentStoreHasProfile && currentStoreHasAlias !== false && hasProducts)) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  const title = document.createElement('h2');
  title.style.cssText = 'font-size: 1.25rem; margin-bottom: 0.35rem;';
  title.textContent = '¡Bienvenido a Baradero Local!';
  container.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.style.cssText = 'color: var(--bl-text-secondary, #4a5568); margin-bottom: 1rem; font-size: 0.9rem;';
  subtitle.textContent = 'Completá estos pasos para que tu comercio esté listo para vender:';
  container.appendChild(subtitle);

  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;';

  const steps = [
    {
      done: currentStoreHasProfile,
      label: 'Completá el perfil de tu comercio (dirección, horarios, descripción)',
      onClick: () => document.getElementById('store-profile-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    },
    {
      done: currentStoreHasAlias !== false,
      label: 'Cargá tu alias para cobrar por transferencia (obligatorio para publicar)',
      onClick: goToAliasField,
    },
    {
      done: hasProducts,
      label: 'Publicá tu primer producto',
      onClick: () => document.getElementById('btn-show-add-product')?.click(),
    },
  ];

  steps.forEach((step) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = `display: flex; align-items: center; gap: 0.6rem; padding: 0.65rem 0.9rem; border-radius: var(--bl-radius-md, 0.5rem); text-align: left; width: 100%; cursor: pointer; background: ${step.done ? '#d1fae5' : 'var(--bl-surface-alt, #f0f4f8)'}; border: 1px solid ${step.done ? '#a7f3d0' : 'var(--bl-border, #e2e8f0)'};`;
    btn.addEventListener('click', step.onClick);

    const icon = document.createElement('i');
    icon.className = step.done ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
    icon.style.color = step.done ? '#059669' : 'var(--bl-text-muted, #94a3b8)';
    btn.appendChild(icon);

    const text = document.createElement('span');
    text.textContent = step.label;
    if (step.done) text.style.cssText = 'text-decoration: line-through; color: var(--bl-text-muted, #94a3b8);';
    btn.appendChild(text);

    list.appendChild(btn);
  });

  container.appendChild(list);
}

async function fetchProducts() {
  if (!currentStoreId) return;

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', currentStoreId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error al cargar productos", error);
    return;
  }

  // Resumen: "Productos Activos" -- solo los is_active (para la card de pendientes).
  currentActiveProductCount = products.filter((p) => p.is_active).length;
  currentInactiveProductCount = products.length - currentActiveProductCount;
  const statProducts = document.getElementById('stat-products-count');
  if (statProducts) statProducts.textContent = currentActiveProductCount;

  // F12-15: onboarding -- cuenta cualquier producto (activo o no), "publicar el
  // primer producto" ya está cumplido aunque después lo haya desactivado.
  currentProductCount = products.length;
  renderOnboardingChecklist(currentProductCount > 0);

  // Cache para el filtrado client-side + conteo de ventas por producto (ML).
  pubProducts = products;
  await loadSalesByProduct();
  renderPublicaciones();
}

/**
 * Ventas por producto: unidades vendidas en órdenes pagadas de la tienda.
 * Mismo patrón de embed `orders!inner(...)` que renderResumen() -- una sola
 * consulta, agrupada en memoria por product_id.
 */
async function loadSalesByProduct() {
  pubSalesByProduct = new Map();
  if (!currentStoreId) return;

  const { data, error } = await supabase
    .from('order_items')
    .select('product_id, quantity, orders!inner(store_id, payment_status)')
    .eq('orders.store_id', currentStoreId)
    .eq('orders.payment_status', 'paid');

  if (error) {
    console.error('Error al cargar ventas por producto:', error);
    return;
  }

  (data || []).forEach((it) => {
    if (!it.product_id) return;
    pubSalesByProduct.set(it.product_id, (pubSalesByProduct.get(it.product_id) || 0) + (it.quantity || 0));
  });
}

/** Cierra cualquier menú de acciones (⋮) de fila que esté abierto. */
function closePubMenus() {
  document.querySelectorAll('.pub-actions__menu').forEach((m) => { m.hidden = true; });
}

function pubCellLabel(text) {
  const label = document.createElement('span');
  label.className = 'pub-row__cell-label';
  label.textContent = text;
  return label;
}

function pubMenuItem(text, iconClass, onClick, danger) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pub-actions__item' + (danger ? ' pub-actions__item--danger' : '');
  const icon = document.createElement('i');
  icon.className = `fa-solid ${iconClass}`;
  btn.appendChild(icon);
  btn.append(` ${text}`);
  btn.addEventListener('click', onClick);
  return btn;
}

function buildPubActions(p) {
  const wrap = document.createElement('div');
  wrap.className = 'pub-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'pub-actions__toggle';
  toggleBtn.setAttribute('aria-label', 'Acciones de la publicación');
  const dots = document.createElement('i');
  dots.className = 'fa-solid fa-ellipsis-vertical';
  toggleBtn.appendChild(dots);
  wrap.appendChild(toggleBtn);

  const menu = document.createElement('div');
  menu.className = 'pub-actions__menu';
  menu.hidden = true;

  // Editar -- reusa el flujo de edición existente (F5-02).
  menu.appendChild(pubMenuItem('Editar', 'fa-pen', () => {
    closePubMenus();
    openEditProductForm(p.id);
  }));

  // Pausar / Reactivar -- togglea is_active (misma lógica de siempre).
  menu.appendChild(pubMenuItem(p.is_active ? 'Pausar' : 'Reactivar', p.is_active ? 'fa-eye-slash' : 'fa-eye', async () => {
    closePubMenus();
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) {
      showToast('No se pudo actualizar el producto.', 'error');
      console.error(error);
      return;
    }
    showToast(p.is_active ? 'Publicación pausada' : 'Publicación activada', 'success');
    fetchProducts();
  }));

  // Ver publicación -- link a la página de detalle pública.
  const view = document.createElement('a');
  view.className = 'pub-actions__item';
  view.href = `producto.html?id=${p.id}`;
  const viewIcon = document.createElement('i');
  viewIcon.className = 'fa-solid fa-arrow-up-right-from-square';
  view.appendChild(viewIcon);
  view.append(' Ver publicación');
  menu.appendChild(view);

  // Eliminar (misma confirmación/advertencia que antes).
  menu.appendChild(pubMenuItem('Eliminar', 'fa-trash', async () => {
    closePubMenus();
    // El texto viejo avisaba que "esto fallará si el producto ya fue comprado":
    // no es cierto. `order_items.product_id` es ON DELETE SET NULL (verificado
    // contra la base), así que la venta sobrevive con el producto en NULL.
    const ok = await confirmDialog(
      '¿Eliminar esta publicación? No se puede deshacer. Las ventas que ya hiciste quedan en tu historial.',
      { confirmText: 'Eliminar', danger: true }
    );
    if (!ok) return;

    // Las URLs se leen ANTES de borrar: al irse el producto, product_images se
    // va en cascada y ya no habría forma de saber qué archivos quedaron sueltos.
    const { data: imgRows } = await supabase
      .from('product_images')
      .select('url')
      .eq('product_id', p.id);
    const imageUrls = [p.image_url, ...(imgRows || []).map((r) => r.url)];

    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) {
      showToast('No se pudo eliminar el producto.', 'error');
      console.error(error);
      return;
    }
    await removeStoredObjects(supabase, 'products', imageUrls);
    fetchProducts();
  }, true));

  wrap.appendChild(menu);

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closePubMenus();
    menu.hidden = !willOpen;
  });

  return wrap;
}

/** Fila de publicación estilo ML: miniatura + título/precio + stock + ventas + estado + acciones. */
function buildPubRow(p) {
  const row = document.createElement('div');
  row.className = 'pub-row' + (p.is_active ? '' : ' pub-row--paused');

  if (pubSelectMode) {
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'pub-row__check';
    check.checked = pubSelected.has(p.id);
    check.setAttribute('aria-label', `Seleccionar "${p.title}"`);
    row.classList.toggle('pub-row--checked', check.checked);
    check.addEventListener('change', () => {
      if (check.checked) pubSelected.add(p.id);
      else pubSelected.delete(p.id);
      row.classList.toggle('pub-row--checked', check.checked);
      updatePubBulkBar();
    });
    row.appendChild(check);
  }

  const thumb = document.createElement('img');
  thumb.className = 'pub-row__thumb';
  thumb.src = p.image_url || '/img/no-image.svg';
  thumb.alt = p.title || 'Producto';
  thumb.loading = 'lazy';
  row.appendChild(thumb);

  const main = document.createElement('div');
  main.className = 'pub-row__main';
  const title = document.createElement('a');
  title.className = 'pub-row__title';
  title.href = `producto.html?id=${p.id}`;
  title.textContent = p.title;
  main.appendChild(title);
  // buildPriceRow (F5-05): precio tachado + badge -N% respetando offer_expires_at vencido.
  main.appendChild(buildPriceRow(p));
  row.appendChild(main);

  const stockCell = document.createElement('div');
  stockCell.className = 'pub-row__cell';
  stockCell.appendChild(pubCellLabel('Stock'));
  const stockVal = document.createElement('span');
  stockVal.className = 'pub-row__cell-val' + ((p.stock ?? 0) <= 0 ? ' pub-row__cell-val--zero' : '');
  stockVal.textContent = p.stock ?? 0;
  stockCell.appendChild(stockVal);
  row.appendChild(stockCell);

  const salesCell = document.createElement('div');
  salesCell.className = 'pub-row__cell';
  salesCell.appendChild(pubCellLabel('Ventas'));
  const salesVal = document.createElement('span');
  salesVal.className = 'pub-row__cell-val';
  salesVal.textContent = pubSalesByProduct.get(p.id) || 0;
  salesCell.appendChild(salesVal);
  row.appendChild(salesCell);

  const statusCell = document.createElement('div');
  statusCell.className = 'pub-row__cell';
  const badge = document.createElement('span');
  badge.className = 'pub-status ' + (p.is_active ? 'pub-status--active' : 'pub-status--paused');
  badge.textContent = p.is_active ? 'Activa' : 'Pausada';
  statusCell.appendChild(badge);
  row.appendChild(statusCell);

  row.appendChild(buildPubActions(p));
  return row;
}

function renderPubEmpty(list) {
  const box = document.createElement('div');
  box.className = 'pub-empty';
  const icon = document.createElement('i');
  icon.className = 'fa-regular fa-rectangle-list pub-empty__icon';
  box.appendChild(icon);
  const title = document.createElement('p');
  title.className = 'pub-empty__title';
  title.textContent = 'Todavía no tenés publicaciones';
  box.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'pub-empty__sub';
  sub.textContent = 'Publicá tu primer producto para empezar a vender.';
  box.appendChild(sub);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pub-empty__btn';
  btn.textContent = 'Publicar ahora';
  btn.addEventListener('click', () => document.getElementById('btn-show-add-product')?.click());
  box.appendChild(btn);
  list.appendChild(box);
}

/** Aplica los filtros client-side (búsqueda + estado) sobre pubProducts y renderiza. */
function renderPublicaciones() {
  const list = document.getElementById('pub-list');
  if (!list) return;
  list.textContent = '';

  const countEl = document.getElementById('pub-count');

  if (!pubProducts.length) {
    if (countEl) countEl.textContent = '0 publicaciones';
    pubSelected.clear();
    updatePubBulkBar();
    renderPubEmpty(list);
    return;
  }

  const term = pubSearch.trim().toLowerCase();
  const filtered = pubProducts.filter((p) => {
    if (pubStatus === 'active' && !p.is_active) return false;
    if (pubStatus === 'inactive' && p.is_active) return false;
    if (term && !(p.title || '').toLowerCase().includes(term)) return false;
    return true;
  });

  if (countEl) {
    countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'publicación' : 'publicaciones'}`;
  }

  // La selección se limita SIEMPRE a lo que se está viendo: si alguien tilda
  // tres, después filtra por "Pausadas" y toca el tacho, no puede llevarse
  // puesta una publicación que ya no tiene en pantalla.
  const visibles = new Set(filtered.map((p) => p.id));
  pubSelected.forEach((id) => { if (!visibles.has(id)) pubSelected.delete(id); });
  updatePubBulkBar();

  if (!filtered.length) {
    const note = document.createElement('p');
    note.className = 'pub-nomatch';
    note.textContent = 'No hay publicaciones que coincidan con el filtro.';
    list.appendChild(note);
    return;
  }

  filtered.forEach((p) => list.appendChild(buildPubRow(p)));
}

/** Refresca el contador y habilita/deshabilita el tacho y el pausar del lote. */
function updatePubBulkBar() {
  // Con menos de dos publicaciones en la cuenta no hay nada que seleccionar "en
  // varios": el botón queda deshabilitado (y se apaga el modo si quedó prendido
  // porque se borró una publicación).
  const toggleBtn = document.getElementById('pub-select-toggle');
  const canSelectMany = pubProducts.length >= 2;
  if (toggleBtn) {
    toggleBtn.disabled = !canSelectMany;
    toggleBtn.title = canSelectMany ? '' : 'Necesitás al menos dos publicaciones para seleccionar varias';
  }
  if (!canSelectMany && pubSelectMode) {
    setPubSelectMode(false);
    return;
  }

  const actions = document.getElementById('pub-bulk-actions');
  if (!actions) return;
  actions.hidden = !pubSelectMode;

  const n = pubSelected.size;
  const countEl = document.getElementById('pub-bulk-count');
  if (countEl) {
    countEl.textContent = n === 0
      ? 'Ninguna seleccionada'
      : `${n} ${n === 1 ? 'seleccionada' : 'seleccionadas'}`;
  }
  ['pub-bulk-delete', 'pub-bulk-pause'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = n === 0;
  });
}

/** Prende/apaga el modo selección. Al apagarlo se pierde lo tildado, a propósito. */
function setPubSelectMode(on) {
  pubSelectMode = on;
  if (!on) pubSelected.clear();
  const toggle = document.getElementById('pub-select-toggle');
  if (toggle) toggle.setAttribute('aria-pressed', String(on));
  renderPublicaciones();
}

/**
 * Eliminar en lote.
 *
 * `order_items.product_id` es ON DELETE SET NULL (verificado contra la base),
 * así que borrar un producto ya vendido no falla: la venta sobrevive con el
 * producto en NULL y el comercio conserva su historial.
 *
 * Las URLs de las fotos se leen ANTES del delete: `product_images` se va en
 * cascada y después no habría forma de saber qué archivos quedaron sueltos en
 * el bucket (mismo criterio que el borrado de a uno).
 */
async function bulkDeletePublicaciones() {
  const ids = [...pubSelected];
  if (!ids.length) return;

  const ok = await confirmDialog('¿Estás seguro de eliminar estas publicaciones?', {
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    danger: true,
  });
  if (!ok) return;

  const { data: imgRows } = await supabase
    .from('product_images')
    .select('url')
    .in('product_id', ids);
  const imageUrls = [
    ...pubProducts.filter((p) => ids.includes(p.id)).map((p) => p.image_url),
    ...(imgRows || []).map((r) => r.url),
  ];

  // `.select('id')` para saber cuántas filas se fueron de verdad: si la RLS
  // rechazara alguna, Supabase no tira error, devuelve menos filas.
  const { data: borradas, error } = await supabase
    .from('products')
    .delete()
    .in('id', ids)
    .select('id');

  if (error) {
    showToast('No se pudieron eliminar las publicaciones.', 'error');
    console.error(error);
    return;
  }

  await removeStoredObjects(supabase, 'products', imageUrls);

  const n = (borradas || []).length;
  if (n < ids.length) {
    showToast(`Se eliminaron ${n} de ${ids.length} publicaciones.`, 'error');
  } else {
    showToast(n === 1 ? 'Publicación eliminada' : `${n} publicaciones eliminadas`, 'success');
  }
  setPubSelectMode(false);
  fetchProducts();
}

/** Pausar en lote (is_active = false). Una que ya estaba pausada no cambia nada. */
async function bulkPausePublicaciones() {
  const ids = [...pubSelected];
  if (!ids.length) return;

  const ok = await confirmDialog('¿Estás seguro de pausar las publicaciones?', {
    confirmText: 'Pausar',
    cancelText: 'Cancelar',
  });
  if (!ok) return;

  const { data: pausadas, error } = await supabase
    .from('products')
    .update({ is_active: false })
    .in('id', ids)
    .select('id');

  if (error) {
    showToast('No se pudieron pausar las publicaciones.', 'error');
    console.error(error);
    return;
  }

  const n = (pausadas || []).length;
  showToast(n === 1 ? 'Publicación pausada' : `${n} publicaciones pausadas`, 'success');
  setPubSelectMode(false);
  fetchProducts();
}

/** Wire de los controles de la sección Publicaciones (menú Publicar, búsqueda, chips). Una sola vez. */
function initPublicacionesControls() {
  const menuBtn = document.getElementById('btn-publish-menu');
  const menu = document.getElementById('pub-publish-menu');
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      menuBtn.setAttribute('aria-expanded', String(willOpen));
    });
    menu.querySelectorAll('button, a').forEach((el) => el.addEventListener('click', () => {
      menu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
    }));
    document.addEventListener('click', () => {
      if (!menu.hidden) {
        menu.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // "Masivamente": stub (la fuente por código de barras todavía no está definida).
  document.getElementById('btn-bulk-publish')?.addEventListener('click', () => {
    showToast('Publicación masiva: próximamente.', 'default');
  });

  document.getElementById('pub-search')?.addEventListener('input', (e) => {
    pubSearch = e.target.value;
    renderPublicaciones();
  });

  // Scopeado a #pub-toolbar: ningún otro filtro de la página usa .pub-chip
  // fuera de acá (Pedidos usa sus propias .pd-tab), pero se deja el scope
  // por si alguna sección futura reutiliza la clase.
  document.querySelectorAll('#pub-toolbar .pub-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      pubStatus = chip.dataset.status;
      document.querySelectorAll('#pub-toolbar .pub-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
      renderPublicaciones();
    });
  });

  // "Seleccionar varios" + las dos acciones en lote.
  document.getElementById('pub-select-toggle')?.addEventListener('click', () => {
    setPubSelectMode(!pubSelectMode);
  });
  document.getElementById('pub-bulk-delete')?.addEventListener('click', bulkDeletePublicaciones);
  document.getElementById('pub-bulk-pause')?.addEventListener('click', bulkPausePublicaciones);

  // Cerrar los menús de acciones (⋮) de fila al clickear afuera.
  document.addEventListener('click', closePubMenus);
}

/** F5-02: trae el producto y precarga el form de alta como form de edición. */
async function openEditProductForm(productId) {
  const { data: product, error } = await supabase
    .from('products')
    .select('*, categories ( slug )')
    .eq('id', productId)
    .single();

  if (error || !product) {
    showToast('No se pudo cargar el producto para editar.', 'error');
    console.error(error);
    return;
  }

  editingProductId = productId;

  document.getElementById('prod-name').value = product.title || '';
  document.getElementById('prod-price').value = formatMoneyValue(product.price);
  document.getElementById('prod-stock').value = product.stock ?? '';
  document.getElementById('prod-compare-price').value = formatMoneyValue(product.compare_at_price);
  // Vía el picker, no por .value: escribir el input oculto directo cargaría el
  // valor pero dejaría el campo visible en blanco.
  datePickers['prod-offer-expires']?.setValue(product.offer_expires_at ?? '');
  document.getElementById('prod-desc').value = product.description || '';
  setProductCategorySlug(product.categories?.slug || '');

  const formTitle = document.getElementById('add-product-form-title');
  if (formTitle) formTitle.textContent = 'Editar producto';
  const submitBtn = document.querySelector('#add-product-form button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Guardar cambios';

  openProductForm();
  await hydrateProductGallery(product);

  // El modo no se guarda en la base: se deduce de si el producto ya tiene
  // opciones cargadas, que es el dato real.
  const { data: existingGroups } = await supabase
    .from('product_options')
    .select('id')
    .eq('product_id', productId)
    .limit(1);
  setProductMode(existingGroups?.length ? 'variants' : 'single');
  await renderProductOptionsManager(productId);

  // Al final, no antes: la galería y las opciones todavía pueden cambiar el
  // alto de la página (fotos que van cargando, opciones que se agregan).
  scrollToProductForm();
}

/* --- Galería de fotos del form (portada + adicionales en una sola grilla) ---
 *
 * El lado cliente (js/producto.js, js/product-modal.js) arma la galería como
 * [products.image_url, ...product_images ordenadas por position]. O sea: la
 * portada vive en products.image_url y NO como fila de product_images, o se
 * vería duplicada. persistProductImages() es el único lugar que escribe esto.
 *
 * productImages es el orden final y el índice 0 es la portada:
 *   { kind: 'saved', url }            -> ya está en storage
 *   { kind: 'new', file, previewUrl } -> elegida recién, todavía sin subir
 */
let productImages = [];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
let galleryDragFrom = null;
/**
 * Fotos que el producto tenía al abrirse el formulario. Al guardar, las que ya
 * no estén acá se borran del bucket: sin esta foto del "antes" no hay forma de
 * saber cuáles quitó el vendedor, y quedaban acumulándose en storage.
 * (No se puede listar la carpeta: el bucket `products` no tiene policy de
 * SELECT, así que list() devolvería vacío sin avisar.)
 */
let savedImageUrlsAtLoad = [];

/** Carga en la galería la portada + las adicionales de un producto ya guardado. */
async function hydrateProductGallery(product) {
  resetProductGallery();
  if (product.image_url) productImages.push({ kind: 'saved', url: product.image_url });

  const { data: extra, error } = await supabase
    .from('product_images')
    .select('url, position')
    .eq('product_id', product.id)
    .order('position', { ascending: true });

  if (error) console.error('No se pudieron cargar las fotos del producto:', error);
  (extra || []).forEach((row) => productImages.push({ kind: 'saved', url: row.url }));

  savedImageUrlsAtLoad = productImages.map((item) => item.url);
  renderProductGallery();
}

/** Vacía la galería, liberando las previews en memoria de las fotos sin subir. */
function resetProductGallery() {
  productImages.forEach((item) => {
    if (item.kind === 'new') URL.revokeObjectURL(item.previewUrl);
  });
  productImages = [];
  savedImageUrlsAtLoad = [];
  renderProductGallery();
}

/** Envuelve en rojo unos segundos el campo que hay que corregir y lo enfoca. */
function flagInvalidField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('is-invalid');
  void el.offsetWidth; // reinicia la animación si ya estaba marcado
  el.classList.add('is-invalid');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (el.matches('input, textarea, select')) el.focus({ preventScroll: true });
  setTimeout(() => el.classList.remove('is-invalid'), 3500);
}

/**
 * Traduce el error de la base a un motivo legible. Los triggers/RLS del
 * proyecto ya devuelven mensajes en español; los códigos genéricos de
 * Postgres se explican acá.
 */
function describeProductSaveError(error, isEditing) {
  const action = isEditing ? 'guardar los cambios' : 'publicar el producto';
  const msg = String(error?.message || '');
  const looksSpanish = /[áéíóúñ¿]|\b(debés|tenés|falta|inválid|no se puede|no podés)\b/i.test(msg);
  if (error?.code === 'P0001' && msg && looksSpanish) return msg;
  switch (error?.code) {
    case '42501': return `No tenés permiso para ${action} en este comercio.`;
    case '23502': {
      const col = msg.match(/column "(\w+)"/);
      return `No se pudo ${action}: falta completar un dato obligatorio${col ? ` (${col[1]})` : ''}.`;
    }
    case '23514': return `No se pudo ${action}: algún valor (precio, stock o texto) no es válido.`;
    case '23505': return `No se pudo ${action}: ya existe un producto igual.`;
    case '22001': return `No se pudo ${action}: hay un texto demasiado largo.`;
    case '22P02': case '22003': return `No se pudo ${action}: el precio o el stock tienen un valor no válido.`;
    default: break;
  }
  if (!navigator.onLine || /failed to fetch|network/i.test(msg)) return `No se pudo ${action}: revisá tu conexión a internet.`;
  return msg ? `No se pudo ${action}: ${msg}` : `No se pudo ${action}. Probá de nuevo en un momento.`;
}

/** Suma archivos elegidos a la galería, descartando los que no sirven. */
function addFilesToGallery(files) {
  Array.from(files || []).forEach((file) => {
    if (!file.type.startsWith('image/')) {
      showToast(`"${file.name}" no es una imagen.`, 'error');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast(`"${file.name}" pesa más de 5 MB.`, 'error');
      return;
    }
    productImages.push({ kind: 'new', file, previewUrl: URL.createObjectURL(file) });
  });
  renderProductGallery();
}

function moveGalleryImage(from, to) {
  if (from == null || to == null || from === to) return;
  const [moved] = productImages.splice(from, 1);
  productImages.splice(to, 0, moved);
  renderProductGallery();
}

function renderProductGallery() {
  const grid = document.getElementById('prod-gallery');
  if (!grid) return;
  grid.textContent = '';

  productImages.forEach((item, index) => {
    const cell = document.createElement('div');
    cell.className = 'pubform__photo';
    cell.draggable = true;

    const img = document.createElement('img');
    img.src = item.kind === 'new' ? item.previewUrl : item.url;
    img.alt = index === 0 ? 'Foto de portada' : `Foto ${index + 1}`;
    cell.appendChild(img);

    if (index === 0) {
      const badge = document.createElement('span');
      badge.className = 'pubform__badge';
      badge.textContent = 'Portada';
      cell.appendChild(badge);
    } else {
      // El drag&drop HTML5 no existe en touch: sin este botón, desde el celular
      // no habría forma de cambiar la portada.
      const coverBtn = document.createElement('button');
      coverBtn.type = 'button';
      coverBtn.className = 'pubform__photo-cover';
      coverBtn.textContent = 'Hacer portada';
      coverBtn.addEventListener('click', () => moveGalleryImage(index, 0));
      cell.appendChild(coverBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'pubform__photo-del';
    delBtn.setAttribute('aria-label', `Quitar foto ${index + 1}`);
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => {
      const [removed] = productImages.splice(index, 1);
      if (removed?.kind === 'new') URL.revokeObjectURL(removed.previewUrl);
      renderProductGallery();
    });
    cell.appendChild(delBtn);

    cell.addEventListener('dragstart', () => {
      galleryDragFrom = index;
      cell.classList.add('is-dragging');
    });
    cell.addEventListener('dragend', () => {
      galleryDragFrom = null;
      cell.classList.remove('is-dragging');
      grid.querySelectorAll('.pubform__photo').forEach((c) => c.classList.remove('is-over'));
    });
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (galleryDragFrom !== null && galleryDragFrom !== index) cell.classList.add('is-over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('is-over'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('is-over');
      moveGalleryImage(galleryDragFrom, index);
      galleryDragFrom = null;
    });

    grid.appendChild(cell);
  });
}

/** Muestra el form. Va ANTES del listado en el HTML (no lo reemplaza): los
 *  productos ya publicados se corren para abajo, el vendedor los sigue
 *  viendo mientras carga uno nuevo. No hace scroll acá adentro a propósito:
 *  al editar, todavía falta cargar la galería y las variantes (async, con
 *  fotos reales de por medio) -- si el scroll "smooth" arranca antes de que
 *  termine ese trabajo, el cambio de alto de la página a mitad de la
 *  animación lo deja a mitad de camino en vez de arriba del todo. Cada lugar
 *  que llama a esta función hace su propio scroll al final, cuando ya no va
 *  a cambiar más el alto de la página. */
function openProductForm() {
  const container = document.getElementById('add-product-form-container');
  if (container) container.hidden = false;
  // "Seleccionar varios" es del listado: mientras se crea o edita una
  // publicación no tiene que verse (y se sale del modo selección).
  if (pubSelectMode) setPubSelectMode(false);
  const bulk = document.getElementById('pub-bulk');
  if (bulk) bulk.hidden = true;
}

/** Al alta o editar un producto: llevar el scroll arriba de todo, donde
 *  arranca el formulario -- para que el vendedor no tenga que scrollear
 *  manualmente desde donde estaba mirando la lista. */
function scrollToProductForm() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Vuelve al listado (que nunca se fue -- solo se oculta el form). */
function closeProductForm() {
  const container = document.getElementById('add-product-form-container');
  if (container) container.hidden = true;
  const bulk = document.getElementById('pub-bulk');
  if (bulk) bulk.hidden = false;
}

/** F5-04: sube una foto al bucket 'products' y devuelve su URL pública (null si falló). */
async function uploadProductImage(productId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  const path = `${productId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from('products').upload(path, file);
  if (uploadError) {
    console.error('Error al subir la foto:', uploadError);
    showToast(`No se pudo subir ${file.name}.`, 'error');
    return null;
  }
  return supabase.storage.from('products').getPublicUrl(path).data.publicUrl;
}

/**
 * Sube las fotos nuevas y deja product_images con TODAS menos la portada.
 * Devuelve la URL de portada, que el llamador guarda en products.image_url.
 *
 * Reescribe las filas de cero (borrar + insertar) en vez de diffear: así la
 * portada nunca queda además como fila (se vería duplicada en la vista de
 * cliente) y position siempre coincide con el orden que ve el vendedor.
 * ponytail: reinserta todas las filas en cada guardado; si un producto llegara
 * a tener decenas de fotos, diffear.
 */
async function persistProductImages(productId) {
  const urls = [];
  for (const item of productImages) {
    if (item.kind === 'saved') {
      urls.push(item.url);
      continue;
    }
    const url = await uploadProductImage(productId, item.file);
    if (url) urls.push(url);
  }

  const { error: deleteError } = await supabase.from('product_images').delete().eq('product_id', productId);
  if (deleteError) {
    console.error('No se pudieron limpiar las fotos previas:', deleteError);
    showToast('No se pudo guardar el orden de las fotos.', 'error');
    return urls[0] ?? null;
  }

  const rest = urls.slice(1).map((url, position) => ({ product_id: productId, url, position }));
  let wroteOk = true;
  if (rest.length) {
    const { error: insertError } = await supabase.from('product_images').insert(rest);
    if (insertError) {
      console.error('No se pudieron guardar las fotos adicionales:', insertError);
      showToast('No se pudieron guardar las fotos adicionales.', 'error');
      wroteOk = false;
    }
  }

  // Recién con la DB ya escrita se sabe qué fotos quedaron: las que el vendedor
  // sacó se borran del bucket. Si la escritura falló no se toca nada -- borrar
  // un archivo que todavía referencia una fila sería peor que dejar basura.
  if (wroteOk) {
    const kept = new Set(urls);
    await removeStoredObjects(supabase, 'products', savedImageUrlsAtLoad.filter((u) => !kept.has(u)));
    savedImageUrlsAtLoad = [...urls];
  }

  return urls[0] ?? null;
}

/**
 * Modo de publicación: "Un solo producto" o "Variantes de un mismo producto".
 *
 * Lo eligió el usuario como primer paso del formulario para que quien sube un
 * producto simple no tenga que ver (ni entender) nada de opciones. Es solo de
 * interfaz: no se guarda en la base, porque el dato real es si el producto
 * tiene filas en `product_options` o no.
 */
function getProductMode() {
  return document.querySelector('input[name="prod-mode"]:checked')?.value || 'single';
}

function setProductMode(mode) {
  const radio = document.querySelector(`input[name="prod-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  applyProductMode();
}

/** Muestra u oculta el bloque de opciones según el modo y si ya hay producto. */
function applyProductMode() {
  const section = document.getElementById('prod-options-section');
  const pending = document.getElementById('prod-options-pending');
  const list = document.getElementById('prod-options-list');
  if (!section) return;

  const variants = getProductMode() === 'variants';
  section.hidden = !variants;

  // En un alta nueva no hay product_id contra el cual guardar: se avisa y se
  // esconde el editor hasta el primer guardado.
  const isNew = !editingProductId;
  if (pending) pending.hidden = !(variants && isNew);
  // El editor entero (listas + "Agregar otro tipo") vive dentro de #prod-options-list,
  // así que esconder ese contenedor alcanza. Antes había que esconder también un
  // bloque `.popt-add` aparte, que era el paso previo de "crear un tipo".
  if (list) list.hidden = variants && isNew;
}

/**
 * Volver a "Un solo producto" con opciones ya cargadas las borra.
 *
 * No alcanza con ocultar el bloque: las opciones viven en la base desde que se
 * cargan, así que un producto "simple" con `product_options` seguiría
 * pidiéndole al cliente que elija un color, y el vendedor no vería por qué.
 * Se avisa antes porque es destructivo.
 */
async function handleProductModeChange() {
  if (getProductMode() === 'variants' || !editingProductId) {
    applyProductMode();
    return;
  }

  const { data: groups } = await supabase
    .from('product_options')
    .select('id')
    .eq('product_id', editingProductId);

  if (groups && groups.length > 0) {
    const ok = await confirmDialog(
      'Este producto tiene opciones cargadas. Al pasarlo a "Un solo producto" se van a borrar. ' +
      'Los pedidos que ya se hicieron no se tocan.',
      { confirmText: 'Sí, borrarlas', danger: true }
    );
    if (!ok) {
      setProductMode('variants');
      return;
    }
    const { error } = await supabase.from('product_options').delete().eq('product_id', editingProductId);
    if (error) {
      showToast('No se pudieron borrar las opciones.', 'error');
      console.error(error);
      setProductMode('variants');
      return;
    }
    await renderProductOptionsManager(editingProductId);
  }

  applyProductMode();
}

/**
 * Editor de opciones del producto (color / sabor / talle …).
 *
 * Reemplaza al manager de "variantes" de F5-03, que dejaba cargar nombre +
 * precio + stock por variante pero **no se integraba con el carrito**: el
 * cliente solo veía una lista con un "consultá con el vendedor". La tabla
 * `product_variants` quedó sin un solo registro en producción; se deja en la
 * base sin uso (mismo criterio que las tablas de `repartidor`) y el frontend
 * pasa a `product_options` / `product_option_values`, que sí llegan hasta el
 * pedido (migración 102).
 *
 * Cada grupo es una fila con sus valores como chips. Un chip se apaga
 * ("agotado") con un click en el ojo y se borra con la X. Todo guarda al
 * instante contra la base, igual que la galería de fotos — no espera al
 * "Guardar producto" de abajo.
 */
async function renderProductOptionsManager(productId) {
  const container = document.getElementById('prod-options-list');
  if (!container) return;
  container.textContent = '';

  const { data: groups, error } = await supabase
    .from('product_options')
    .select('id, name, position, product_option_values(id, value, is_available, position)')
    .eq('product_id', productId)
    .order('position');

  if (error) {
    console.error('Error al cargar las opciones del producto:', error);
    const failed = document.createElement('p');
    failed.className = 'popt-empty';
    failed.textContent = 'No pudimos cargar las opciones. Recargá la página.';
    container.appendChild(failed);
    return;
  }

  const sorted = sortOptionGroups((groups || []).map((g) => ({ ...g, values: g.product_option_values || [] })));

  // Sin opciones todavía: en vez de pedir que cree "un tipo de opción" primero,
  // ya se le muestra UNA lista lista para escribir. El paso previo era el que no
  // se entendía: un vendedor creó un tipo llamado "rosa", que es un valor.
  // La lista en borrador no existe en la base hasta que carga la primera opción
  // (ver agregarValor), así que abrir el formulario no deja grupos vacíos dando
  // vueltas.
  const grupos = sorted.length ? sorted : [{ id: null, name: isShoeProduct() ? 'Talle' : 'Color', values: [] }];
  grupos.forEach((group) => container.appendChild(buildOptionGroupRow(group, productId)));

  // El segundo tipo es el caso raro (una remera con Color Y Talle), así que va
  // como un agregado discreto al final y no como el primer paso obligatorio.
  const addGroup = document.createElement('button');
  addGroup.type = 'button';
  addGroup.className = 'popt-add-group';
  addGroup.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i> Agregar otro tipo de opción';
  addGroup.addEventListener('click', () => {
    addGroup.before(buildOptionGroupRow({ id: null, name: '', values: [] }, productId));
    container.querySelector('.popt-group:last-of-type .popt-group__name-input')?.focus();
  });
  container.appendChild(addGroup);
}

/**
 * Una lista de opciones: su nombre (editable), las opciones cargadas y el alta.
 *
 * `group.id` en null = lista en borrador, todavía no existe en la base. Se crea
 * recién al cargar la primera opción: así el vendedor ve una lista lista para
 * escribir desde el arranque sin que queden grupos vacíos si se arrepiente.
 */
function buildOptionGroupRow(group, productId) {
  const row = document.createElement('div');
  row.className = 'popt-group';

  const head = document.createElement('div');
  head.className = 'popt-group__head';

  // El nombre es un input y no un texto fijo: es lo que ve el cliente arriba de
  // los chips ("Color", "Sabor"), y el vendedor tiene que poder corregirlo sin
  // borrar la lista entera. El datalist sugiere los habituales sin encerrarlo.
  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'form-input popt-group__name-input';
  name.value = group.name || '';
  name.maxLength = 40;
  name.placeholder = 'Ej: Color';
  name.setAttribute('list', 'popt-name-suggestions');
  name.setAttribute('aria-label', 'Nombre de la lista de opciones (lo ve el cliente)');
  name.addEventListener('change', async () => {
    const nuevo = name.value.trim();
    if (!group.id || !nuevo || nuevo === group.name) return;
    const { error } = await supabase.from('product_options').update({ name: nuevo }).eq('id', group.id);
    if (error) {
      showToast(error.code === '23505' ? `Ya tenés una lista llamada "${nuevo}".` : 'No se pudo cambiar el nombre.', 'error');
      name.value = group.name;
      return;
    }
    group.name = nuevo;
  });
  head.appendChild(name);

  const removeGroup = document.createElement('button');
  removeGroup.type = 'button';
  removeGroup.className = 'popt-group__remove';
  removeGroup.setAttribute('aria-label', 'Borrar esta lista de opciones');
  removeGroup.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
  removeGroup.addEventListener('click', async () => {
    // Una lista en borrador no está en la base: se saca del DOM y listo.
    if (!group.id) { row.remove(); return; }
    if (!(await confirmDialog(`¿Borrar "${group.name}" y todas sus opciones? Los pedidos ya hechos no se tocan.`, { confirmText: 'Borrar', danger: true }))) return;
    const { error } = await supabase.from('product_options').delete().eq('id', group.id);
    if (error) {
      showToast('No se pudo borrar la lista.', 'error');
      console.error(error);
      return;
    }
    await renderProductOptionsManager(productId);
  });
  head.appendChild(removeGroup);
  row.appendChild(head);

  const chips = document.createElement('div');
  chips.className = 'popt-chips';
  (group.values || []).forEach((value) => chips.appendChild(buildOptionValueChip(value, group, productId)));
  row.appendChild(chips);

  const addWrap = document.createElement('div');
  addWrap.className = 'popt-add__row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-input';
  input.maxLength = 40;
  input.placeholder = 'Escribí una opción (ej: Rosa)';
  input.setAttribute('aria-label', 'Agregar una opción a esta lista');
  addWrap.appendChild(input);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn-outline';
  addBtn.textContent = 'Agregar';

  /** Crea la lista en la base si todavía es un borrador. false = no se pudo. */
  const asegurarLista = async () => {
    if (group.id) return true;
    const nombreLista = name.value.trim();
    if (!nombreLista) {
      showToast('Poné un nombre a la lista (ej: Color, Sabor, Talle).', 'error');
      name.focus();
      return false;
    }
    const { data, error } = await supabase
      .from('product_options')
      .insert({
        product_id: productId,
        name: nombreLista,
        position: document.querySelectorAll('#prod-options-list .popt-group').length - 1,
      })
      .select('id')
      .single();
    if (error) {
      showToast(error.code === '23505' ? `Ya tenés una lista llamada "${nombreLista}".` : 'No se pudo crear la lista.', 'error');
      console.error(error);
      return false;
    }
    group.id = data.id;
    group.name = nombreLista;
    return true;
  };

  /** Inserta una o varias opciones de una (una sola ida a la base). */
  const insertarValores = async (valores) => {
    if (!(await asegurarLista())) return false;
    const base = (group.values || []).length;
    const { error } = await supabase.from('product_option_values').insert(
      valores.map((value, i) => ({ option_id: group.id, value, position: base + i }))
    );
    if (error) {
      // 23505 = unique(option_id, value): ya existe esa opción en la lista.
      showToast(
        error.code === '23505'
          ? (valores.length === 1 ? `"${valores[0]}" ya está cargada.` : 'Alguno de esos talles ya estaba cargado.')
          : 'No se pudo agregar la opción.',
        'error'
      );
      console.error(error);
      return false;
    }
    return true;
  };

  const agregarValor = async () => {
    const value = input.value.trim();
    if (!value) {
      showToast('Escribí la opción (ej: Rosa).', 'error');
      input.focus();
      return;
    }
    if (!(await insertarValores([value]))) return;
    input.value = '';
    await renderProductOptionsManager(productId);
    // Volver al mismo campo: lo normal es cargar varias seguidas.
    document.querySelector('#prod-options-list .popt-group:last-of-type .popt-add__row input')?.focus();
  };

  addBtn.addEventListener('click', agregarValor);
  // Enter agrega sin mandar el formulario del producto entero.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); agregarValor(); }
  });
  addWrap.appendChild(addBtn);
  row.appendChild(addWrap);

  // Zapatería: números de calzado a un toque, para no escribir 35, 36, 37… uno
  // por uno. Aparece solo si el rubro es Zapatería y la lista se llama "Talle"
  // (el nombre es editable, así que se mira de nuevo al escribir).
  const sizes = document.createElement('div');
  sizes.className = 'popt-sizes';
  const sizesTitle = document.createElement('p');
  sizesTitle.className = 'popt-sizes__title';
  sizesTitle.textContent = 'Tocá los talles que tenés:';
  sizes.appendChild(sizesTitle);
  const sizesRow = document.createElement('div');
  sizesRow.className = 'popt-sizes__row';
  sizes.appendChild(sizesRow);

  const cargados = () => new Set((group.values || []).map((v) => String(v.value).trim()));

  SHOE_SIZES.forEach((n) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'popt-size';
    btn.textContent = n;
    btn.dataset.size = n;
    btn.setAttribute('aria-label', `Agregar talle ${n}`);
    if (cargados().has(n)) { btn.disabled = true; btn.classList.add('popt-size--on'); }
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      if (await insertarValores([n])) await renderProductOptionsManager(productId);
      else btn.disabled = false;
    });
    sizesRow.appendChild(btn);
  });

  const rango = document.createElement('button');
  rango.type = 'button';
  rango.className = 'popt-sizes__all';
  rango.textContent = `Cargar del ${SHOE_COMMON_RANGE[0]} al ${SHOE_COMMON_RANGE[SHOE_COMMON_RANGE.length - 1]}`;
  rango.addEventListener('click', async () => {
    const faltan = SHOE_COMMON_RANGE.filter((n) => !cargados().has(n));
    if (!faltan.length) return;
    rango.disabled = true;
    if (await insertarValores(faltan)) await renderProductOptionsManager(productId);
    else rango.disabled = false;
  });
  sizes.appendChild(rango);

  const syncSizes = () => { sizes.hidden = !(isShoeProduct() && isSizeGroupName(name.value)); };
  name.addEventListener('input', syncSizes);
  syncSizes();
  row.appendChild(sizes);

  return row;
}

/** Un valor: el texto, el botón de agotado/disponible y el de borrar. */
function buildOptionValueChip(value, group, productId) {
  const chip = document.createElement('span');
  chip.className = 'popt-chip' + (value.is_available ? '' : ' popt-chip--out');

  const label = document.createElement('span');
  label.className = 'popt-chip__label';
  label.textContent = value.value;
  chip.appendChild(label);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'popt-chip__btn';
  toggle.title = value.is_available ? 'Marcar como agotado' : 'Marcar como disponible';
  toggle.setAttribute('aria-label', `${value.value}: ${value.is_available ? 'marcar como agotado' : 'marcar como disponible'}`);
  toggle.innerHTML = value.is_available
    ? '<i class="fa-regular fa-eye" aria-hidden="true"></i>'
    : '<i class="fa-regular fa-eye-slash" aria-hidden="true"></i>';
  toggle.addEventListener('click', async () => {
    const { error } = await supabase
      .from('product_option_values')
      .update({ is_available: !value.is_available })
      .eq('id', value.id);
    if (error) {
      showToast('No se pudo cambiar la disponibilidad.', 'error');
      console.error(error);
      return;
    }
    await renderProductOptionsManager(productId);
  });
  chip.appendChild(toggle);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'popt-chip__btn popt-chip__btn--danger';
  remove.title = 'Borrar';
  remove.setAttribute('aria-label', `Borrar ${value.value}`);
  remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
  remove.addEventListener('click', async () => {
    const { error } = await supabase.from('product_option_values').delete().eq('id', value.id);
    if (error) {
      showToast('No se pudo borrar el valor.', 'error');
      console.error(error);
      return;
    }
    await renderProductOptionsManager(productId);
  });
  chip.appendChild(remove);

  return chip;
}

function setupDashboardEvents() {
  setupStoreProfileForm();
  setupStoreLogoPicker();
  setupMyCouponForm();
  setupStoreStaffForm();
  initPublicacionesControls();
  initPedidosControls();

  attachMoneyFormatting(document.getElementById('prod-price'));
  attachMoneyFormatting(document.getElementById('prod-compare-price'));

  document.querySelectorAll('input[name="prod-mode"]').forEach((radio) => {
    radio.addEventListener('change', handleProductModeChange);
  });

  // Zapatería: lo que hace falta cargar es el talle, así que se pasa solo a
  // "Variantes" (nunca al revés: no se borra nada). Al cambiar de rubro se
  // redibuja el editor para que aparezca o se vaya la ayuda de talles.
  document.getElementById('prod-category-options')?.addEventListener('change', async () => {
    if (isShoeProduct() && getProductMode() === 'single') {
      setProductMode('variants');
      showToast('En Zapatería cargás los talles disponibles como variantes.', 'success');
    }
    if (editingProductId && getProductMode() === 'variants') {
      await renderProductOptionsManager(editingProductId);
    }
  });

  const btnShowAdd = document.getElementById('btn-show-add-product');
  const btnCancelAdd = document.getElementById('btn-cancel-add-product');
  const addForm = document.getElementById('add-product-form');

  // Grilla de categorías. Antes se armaba copiando el innerHTML del select de
  // rubros del alta de comercio, lo que ataba un control al otro y dependía de
  // cuál se inicializara primero; ahora los dos salen de categoriesCache.
  renderProductCategoryOptions();

  function resetProductForm() {
    editingProductId = null;
    addForm.reset();
    const formTitle = document.getElementById('add-product-form-title');
    if (formTitle) formTitle.textContent = 'Publicar nuevo producto';
    const submitBtn = addForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Guardar producto';
    resetProductGallery();
    const optionsList = document.getElementById('prod-options-list');
    if (optionsList) optionsList.textContent = '';
    setProductMode('single');
  }

  document.getElementById('pub-alias-gate-btn')?.addEventListener('click', goToAliasField);

  btnShowAdd.addEventListener('click', () => {
    if (currentStoreHasAlias === false) {
      blockPublishWithoutAlias();
      return;
    }
    resetProductForm();
    openProductForm();
    scrollToProductForm();
  });

  // Cancelar (abajo) y "Volver a publicaciones" (arriba) hacen lo mismo.
  [btnCancelAdd, document.getElementById('btn-back-publicaciones')].forEach((btn) => {
    btn?.addEventListener('click', () => {
      closeProductForm();
      resetProductForm();
    });
  });

  // Zona de carga: click, teclado y arrastrar-y-soltar caen en el mismo input.
  const dropZone = document.getElementById('prod-drop');
  const imagesInput = document.getElementById('prod-images');
  if (dropZone && imagesInput) {
    dropZone.addEventListener('click', () => imagesInput.click());
    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        imagesInput.click();
      }
    });
    imagesInput.addEventListener('change', () => {
      addFilesToGallery(imagesInput.files);
      // Se limpia para que elegir el mismo archivo otra vez vuelva a disparar change.
      imagesInput.value = '';
    });

    ['dragenter', 'dragover'].forEach((evt) =>
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add('is-over');
      })
    );
    ['dragleave', 'drop'].forEach((evt) =>
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.remove('is-over');
      })
    );
    dropZone.addEventListener('drop', (e) => addFilesToGallery(e.dataTransfer?.files));
  }

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = addForm.querySelector('button[type="submit"]');
    const isEditing = Boolean(editingProductId);
    const submitLabel = isEditing ? 'Guardar cambios' : 'Guardar producto';

    if (!isEditing && currentStoreHasAlias === false) {
      blockPublishWithoutAlias();
      return;
    }

    const titleValue = document.getElementById('prod-name').value.trim();
    // Los precios se tipean con separador de miles (attachMoneyFormatting) --
    // parsePrice() saca el número real, nunca Number()/parseInt() directo
    // sobre el value (interpretaría el "." como separador decimal).
    const priceValue = parsePrice(document.getElementById('prod-price').value);
    const stockValue = document.getElementById('prod-stock').value;
    const comparePriceValue = parsePrice(document.getElementById('prod-compare-price').value);
    const offerExpiresValue = document.getElementById('prod-offer-expires').value;

    if (!isValidProductTitle(titleValue)) {
      showToast("El nombre del producto debe tener entre 3 y 150 caracteres.", "error");
      flagInvalidField('prod-name');
      return;
    }
    if (!isValidPrice(priceValue)) {
      showToast("El precio debe ser un número entero mayor a 0.", "error");
      flagInvalidField('prod-price');
      return;
    }
    if (!isValidStock(stockValue)) {
      showToast("El stock debe ser un número entero mayor o igual a 0.", "error");
      flagInvalidField('prod-stock');
      return;
    }
    if (comparePriceValue && (!isValidPrice(comparePriceValue) || comparePriceValue <= priceValue)) {
      showToast("El precio de oferta debe ser un número entero mayor al precio actual.", "error");
      flagInvalidField('prod-compare-price');
      return;
    }

    const catRadios = document.querySelectorAll('input[name="prod-category"]');
    if (Array.from(catRadios).some((r) => r.required) && !getProductCategorySlug()) {
      showToast("Elegí una categoría para el producto.", "error");
      flagInvalidField('prod-category-options');
      return;
    }
    if (!document.getElementById('prod-desc').value.trim()) {
      showToast("Falta la descripción del producto: contales a tus clientes de qué se trata.", "error");
      flagInvalidField('prod-desc');
      return;
    }
    if (productImages.length === 0) {
      showToast("Falta al menos una foto del producto.", "error");
      flagInvalidField('prod-drop');
      return;
    }

    setLoading(btnSubmit, true, submitLabel);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast("Sesión inválida.", "error");
      setLoading(btnSubmit, false, submitLabel);
      return;
    }

    const productData = {
      title: titleValue,
      price: priceValue,
      stock: parseInt(stockValue),
      compare_at_price: comparePriceValue || null,
      offer_expires_at: comparePriceValue && offerExpiresValue ? offerExpiresValue : null,
      category_id: null,
      description: document.getElementById('prod-desc').value.trim(),
      // image_url se setea después de subir las fotos: en un alta todavía no
      // existe el id del producto, que hace falta para la ruta en storage.
    };

    // El select guarda el slug de la categoría; hay que resolver el UUID real
    const slug = getProductCategorySlug();
    const { data: catData } = await supabase.from('categories').select('id').eq('slug', slug).single();
    if (catData) productData.category_id = catData.id;

    let error;
    let savedProductId = editingProductId;
    if (isEditing) {
      ({ error } = await supabase.from('products').update(productData).eq('id', editingProductId));
    } else {
      productData.seller_id = user.id;
      productData.store_id = currentStoreId;
      const { data: inserted, error: insertError } = await supabase.from('products').insert([productData]).select('id').single();
      error = insertError;
      savedProductId = inserted?.id;
    }

    // Migración 107: el trigger avisa con hint 'missing_transfer_alias' (por
    // si el alias se borró desde otra pestaña después de cargar el panel).
    if (error && error.hint === 'missing_transfer_alias') {
      currentStoreHasAlias = false;
      setLoading(btnSubmit, false, submitLabel);
      blockPublishWithoutAlias();
      return;
    }

    if (error) {
      showToast(describeProductSaveError(error, isEditing), "error");
      console.error(error);
      setLoading(btnSubmit, false, submitLabel);
      return;
    }

    // F5-04: recién acá hay id real, que es lo que necesita la ruta en storage.
    // persistProductImages sube las fotos nuevas, reescribe product_images y
    // devuelve la portada para guardarla en products.image_url.
    if (savedProductId) {
      const coverUrl = await persistProductImages(savedProductId);
      const { error: coverError } = await supabase
        .from('products')
        .update({ image_url: coverUrl })
        .eq('id', savedProductId);
      if (coverError) {
        console.error('No se pudo guardar la foto de portada:', coverError);
        showToast('El producto se guardó, pero falló la foto de portada.', 'error');
      }
    }

    // Producto nuevo en modo "Variantes": el formulario NO se cierra. Las
    // opciones se guardan contra el product_id, que recién existe ahora, así
    // que cerrar acá obligaría a volver a entrar a editarlo para cargar los
    // colores -- justo lo que vino a hacer.
    if (!isEditing && savedProductId && getProductMode() === 'variants') {
      showToast('Producto creado. Ahora cargá sus variantes.', 'success');
      editingProductId = savedProductId;
      const formTitle = document.getElementById('add-product-form-title');
      if (formTitle) formTitle.textContent = 'Editar producto';
      if (btnSubmit) btnSubmit.textContent = 'Guardar cambios';
      applyProductMode();
      await renderProductOptionsManager(savedProductId);
      document.getElementById('prod-options-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fetchProducts();
      setLoading(btnSubmit, false, 'Guardar cambios');
      return;
    }

    showToast(isEditing ? "Producto actualizado" : "Producto creado", "success");
    closeProductForm();
    resetProductForm();
    fetchProducts();
    setLoading(btnSubmit, false, submitLabel);
  });
}

// --- Inicialización con Guard ---
// Página PRIVADA: si no hay sesión → redirigir a Login
guardPage({
  requireAuth: true,
  onReady: (user) => {
    // Cambia los <input type="date"> por el selector propio. El valor sigue
    // viajando en ISO por un input oculto con el mismo id, así que las
    // lecturas (getElementById(...).value) no cambian. Se guardan los pickers
    // porque el alta de producto escribe la fecha desde afuera al editar.
    datePickers = upgradeDateInputs();
    initVenderPage(user);
  },
});

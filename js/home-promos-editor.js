/**
 * Tarjeta de edición de un espacio de promo del home (tabla home_promos,
 * migración 107). La comparten dos paneles:
 *  - admin  (admin.js):  elige el comercio del espacio, lo prende/apaga, y
 *    puede cargar él mismo la imagen/publicación;
 *  - seller (vender.js): el dueño del comercio asignado carga la imagen, la
 *    publicación a la que lleva el click y un título. No ve ni puede cambiar
 *    el comercio ni el on/off (lo bloquea además el trigger home_promos_guard).
 * Estilos: bloque .hp-* en home.css (lo cargan las dos páginas).
 */
import { supabase, showToast } from './auth-utils.js';
import { removeStoredObjects } from './storage-utils.js';
import { slotLabel, HOME_PROMO_SLOTS } from './home-promos-utils.js';

const BUCKET = 'home-promos';
const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

let idCounter = 0;
function field(labelText, control, hint) {
  const wrap = el('div', 'hp-field');
  const id = `hp-f-${++idCounter}`;
  control.id = id;
  const label = el('label', 'hp-label', labelText);
  label.htmlFor = id;
  wrap.append(label, control);
  if (hint) wrap.appendChild(el('p', 'hp-hint', hint));
  return wrap;
}

function option(value, text, selected) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  if (selected) o.selected = true;
  return o;
}

/** Publicaciones del comercio, para el selector "A dónde lleva". Se incluye
 *  la que ya estaba elegida aunque esté pausada, marcada, para que no
 *  desaparezca del selector sin avisar. */
async function fetchStoreProducts(storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase
    .from('products')
    .select('id, title, is_active')
    .eq('store_id', storeId)
    .order('title');
  if (error) {
    console.error('Error al cargar las publicaciones del comercio:', error);
    return [];
  }
  return data || [];
}

async function fillProductSelect(select, storeId, selectedId) {
  select.textContent = '';
  select.appendChild(option('', storeId ? 'La página del comercio' : 'Elegí primero un comercio', !selectedId));
  select.disabled = !storeId;
  const products = await fetchStoreProducts(storeId);
  products
    .filter((p) => p.is_active || p.id === selectedId)
    .forEach((p) => {
      select.appendChild(option(p.id, p.is_active ? p.title : `${p.title} (pausada)`, p.id === selectedId));
    });
}

function paintPreview(preview, url) {
  preview.textContent = '';
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Imagen de la promoción';
    preview.appendChild(img);
  } else {
    preview.appendChild(el('span', 'hp-preview__empty', 'Sin imagen: se ve el banner de siempre'));
  }
}

/**
 * @param {object} opts
 * @param {object} opts.promo  fila de home_promos
 * @param {'admin'|'seller'} opts.mode
 * @param {Array<{id:string,name:string}>} [opts.stores]  comercios aprobados (solo admin)
 * @param {string} [opts.storeName]  nombre del comercio (solo seller, para el encabezado)
 * @param {() => void} [opts.onSaved]
 */
export function buildPromoEditorCard({ promo, mode, stores = [], storeName = '', onSaved }) {
  const isAdmin = mode === 'admin';
  const slotInfo = HOME_PROMO_SLOTS.find((s) => s.slot === promo.slot);
  let pendingFile = null;

  const card = el('form', 'hp-card');
  card.noValidate = true;

  const head = el('div', 'hp-card__head');
  head.appendChild(el('h3', 'hp-card__title', slotLabel(promo.slot)));
  const statusText = !promo.store_id
    ? 'Libre'
    : !promo.image_url ? 'Falta la imagen' : promo.is_active ? 'Publicada' : 'Apagada';
  const badge = el('span', `hp-badge hp-badge--${statusText === 'Publicada' ? 'on' : 'off'}`, statusText);
  head.appendChild(badge);
  card.appendChild(head);

  const preview = el('div', 'hp-preview');
  paintPreview(preview, promo.image_url);
  card.appendChild(preview);

  const body = el('div', 'hp-card__body');

  // Comercio (solo admin elige; el vendedor lo ve fijo en el encabezado de su sección).
  let storeSelect = null;
  if (isAdmin) {
    storeSelect = document.createElement('select');
    storeSelect.className = 'hp-input';
    storeSelect.appendChild(option('', 'Ninguno (espacio libre)', !promo.store_id));
    stores.forEach((s) => storeSelect.appendChild(option(s.id, s.name, s.id === promo.store_id)));
    body.appendChild(field('Comercio que puede usar este espacio', storeSelect));
  } else if (storeName) {
    body.appendChild(el('p', 'hp-hint', `Espacio asignado a ${storeName}.`));
  }

  const productSelect = document.createElement('select');
  productSelect.className = 'hp-input';
  body.appendChild(field('Al hacer click lleva a', productSelect, 'Elegí la publicación de la promo. Si la pausás, el banner lleva a la página del comercio.'));
  fillProductSelect(productSelect, promo.store_id, promo.product_id);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'hp-input';
  titleInput.maxLength = 60;
  titleInput.placeholder = 'Ej: Combo hamburguesas';
  titleInput.value = promo.title || '';
  body.appendChild(field('Título (opcional)', titleInput, 'Se muestra chico abajo del banner, junto al nombre del comercio.'));

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = ACCEPTED.join(',');
  fileInput.className = 'hp-file';
  body.appendChild(field('Imagen', fileInput, `JPG, PNG o WebP, hasta 3 MB. Proporción sugerida: ${slotInfo?.ratio || '16:9'}. La imagen se muestra entera, sin recortar.`));

  let activeInput = null;
  if (isAdmin) {
    const row = el('label', 'hp-check');
    activeInput = document.createElement('input');
    activeInput.type = 'checkbox';
    activeInput.checked = promo.is_active;
    row.append(activeInput, document.createTextNode(' Mostrar en el inicio'));
    body.appendChild(row);
  }

  const errorEl = el('p', 'hp-error');
  errorEl.hidden = true;
  body.appendChild(errorEl);

  const actions = el('div', 'hp-actions');
  const saveBtn = el('button', 'hp-btn hp-btn--primary', 'Guardar');
  saveBtn.type = 'submit';
  actions.appendChild(saveBtn);
  if (promo.image_url) {
    const removeImgBtn = el('button', 'hp-btn hp-btn--ghost', 'Quitar imagen');
    removeImgBtn.type = 'button';
    removeImgBtn.addEventListener('click', async () => {
      if (!confirm('¿Sacamos la imagen? El espacio vuelve a mostrar el banner de siempre.')) return;
      removeImgBtn.disabled = true;
      const { error } = await supabase.from('home_promos').update({ image_url: null }).eq('id', promo.id);
      removeImgBtn.disabled = false;
      if (error) { fail(error.message); return; }
      await removeStoredObjects(supabase, BUCKET, [promo.image_url]);
      showToast('Sacamos la imagen.', 'success');
      onSaved?.();
    });
    actions.appendChild(removeImgBtn);
  }
  body.appendChild(actions);
  card.appendChild(body);

  function fail(msg) {
    errorEl.textContent = msg || 'No se pudo guardar. Probá de nuevo.';
    errorEl.hidden = false;
  }

  // Otro comercio = otra promo: el título del anterior no le corresponde
  // (el trigger home_promos_guard igual lo limpia al guardar).
  storeSelect?.addEventListener('change', () => {
    titleInput.value = '';
    fillProductSelect(productSelect, storeSelect.value, null);
  });

  fileInput.addEventListener('change', () => {
    errorEl.hidden = true;
    const file = fileInput.files?.[0];
    pendingFile = null;
    if (!file) { paintPreview(preview, promo.image_url); return; }
    if (!ACCEPTED.includes(file.type)) { fail('Tiene que ser una imagen JPG, PNG o WebP.'); fileInput.value = ''; return; }
    if (file.size > MAX_BYTES) { fail('Esa imagen pesa más de 3 MB. Probá con una más liviana.'); fileInput.value = ''; return; }
    pendingFile = file;
    // Vista previa como data: URL y no con URL.createObjectURL: la CSP de
    // las páginas (img-src) permite data: pero no blob:.
    const reader = new FileReader();
    reader.onload = () => { if (pendingFile === file) paintPreview(preview, reader.result); };
    reader.readAsDataURL(file);
  });

  card.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const newStoreId = isAdmin ? (storeSelect.value || null) : promo.store_id;
    const storeChanged = newStoreId !== promo.store_id;
    if (pendingFile && !newStoreId) { fail('Elegí un comercio antes de subir la imagen.'); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';
    let uploadedUrl = null;

    try {
      // Carpeta = espacio: la policy del bucket deja subir al admin o al
      // dueño del comercio asignado a ESE espacio.
      if (pendingFile) {
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[pendingFile.type];
        const path = `${promo.slot}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pendingFile, { contentType: pendingFile.type });
        if (upErr) throw upErr;
        uploadedUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl || null;
        if (!uploadedUrl) throw new Error('No se pudo obtener la URL de la imagen.');
      }

      const update = {
        product_id: newStoreId ? (productSelect.value || null) : null,
        title: newStoreId ? (titleInput.value.trim() || null) : null,
      };
      if (isAdmin) {
        update.store_id = newStoreId;
        update.is_active = activeInput.checked;
      }
      if (uploadedUrl) update.image_url = uploadedUrl;
      else if (isAdmin && storeChanged) update.image_url = null;

      const { data, error } = await supabase.from('home_promos').update(update).eq('id', promo.id).select('id');
      if (error) throw error;
      // RLS no tira error cuando no deja actualizar: devuelve cero filas.
      if (!data?.length) throw new Error('No tenés permiso para editar este espacio.');

      // La imagen anterior ya no la usa nadie: se borra del bucket.
      if (promo.image_url && (uploadedUrl || (isAdmin && storeChanged))) {
        await removeStoredObjects(supabase, BUCKET, [promo.image_url]);
      }
      showToast('Listo, guardamos la promoción.', 'success');
      onSaved?.();
    } catch (err) {
      console.error('Error al guardar la promoción del inicio:', err);
      if (uploadedUrl) await removeStoredObjects(supabase, BUCKET, [uploadedUrl]);
      fail(err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  });

  return card;
}

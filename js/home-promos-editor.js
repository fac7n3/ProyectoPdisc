/**
 * Tarjeta de edición de un espacio de promo del home (tabla home_promos,
 * migración 108). La comparten dos paneles:
 *  - admin  (admin.js):  elige el comercio del espacio, lo prende/apaga, y
 *    puede cargar él mismo la imagen/publicación;
 *  - seller (vender.js): el dueño del comercio asignado carga la imagen, la
 *    publicación a la que lleva el click y un título. No ve ni puede cambiar
 *    el comercio ni el on/off (lo bloquea además el trigger home_promos_guard).
 * Estilos: bloque .hp-* en home.css (lo cargan las dos páginas).
 */
import { supabase, showToast } from './auth-utils.js';
import { removeStoredObjects } from './storage-utils.js';
import { confirmDialog } from './confirm-dialog.js';
import { slotLabel, HOME_PROMO_SLOTS, PROMO_IMAGE_COLUMNS, promoImages } from './home-promos-utils.js';

import { friendlyError } from './friendly-error.js';
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
    preview.appendChild(el('span', 'hp-preview__empty', 'Sin imagen'));
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
  // Una carga pendiente por cuadro de imagen (hasta 3 por espacio).
  const pendingFiles = PROMO_IMAGE_COLUMNS.map(() => null);

  const card = el('form', 'hp-card');
  card.noValidate = true;

  const head = el('div', 'hp-card__head');
  head.appendChild(el('h3', 'hp-card__title', slotLabel(promo.slot)));
  const statusText = !promo.store_id
    ? 'Libre'
    : !promoImages(promo).length ? 'Falta la imagen' : promo.is_active ? 'Publicada' : 'Apagada';
  const badge = el('span', `hp-badge hp-badge--${statusText === 'Publicada' ? 'on' : 'off'}`, statusText);
  head.appendChild(badge);
  card.appendChild(head);

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

  // Hasta 3 imágenes por espacio: pasan solas en el inicio y, al tocar el
  // banner, se recorren con flechas. Cada cuadro sube la suya.
  const imagesWrap = el('div', 'hp-images');
  imagesWrap.appendChild(el('p', 'hp-label', 'Imágenes (hasta 3)'));
  PROMO_IMAGE_COLUMNS.forEach((column, i) => buildImageBox(column, i));
  imagesWrap.appendChild(el('p', 'hp-hint', `JPG, PNG o WebP, hasta 3 MB cada una. Proporción sugerida: ${slotInfo?.ratio || '16:9'}. Se muestran enteras, sin recortar. Con más de una, pasan solas cada pocos segundos.`));
  body.appendChild(imagesWrap);

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
  body.appendChild(actions);
  card.appendChild(body);

  /** Un cuadro de carga: vista previa chica + selector de archivo + quitar. */
  function buildImageBox(column, i) {
    const box = el('div', 'hp-imgbox');
    const preview = el('div', 'hp-preview hp-preview--thumb');
    paintPreview(preview, promo[column]);

    const side = el('div', 'hp-imgbox__side');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = ACCEPTED.join(',');
    fileInput.className = 'hp-file';
    fileInput.id = `hp-f-${++idCounter}`;
    const label = el('label', 'hp-label', `Imagen ${i + 1}`);
    label.htmlFor = fileInput.id;
    side.append(label, fileInput);

    if (promo[column]) {
      const removeBtn = el('button', 'hp-btn hp-btn--ghost hp-btn--small', 'Quitar');
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', async () => {
        if (!(await confirmDialog(`¿Sacamos la imagen ${i + 1}? Las demás se quedan.`, { confirmText: 'Sacar', danger: true }))) return;
        removeBtn.disabled = true;
        const { error } = await supabase.from('home_promos').update({ [column]: null }).eq('id', promo.id);
        removeBtn.disabled = false;
        if (error) { fail(friendlyError(error, 'No se pudo guardar. Probá de nuevo.')); return; }
        await removeStoredObjects(supabase, BUCKET, [promo[column]]);
        showToast(`Sacamos la imagen ${i + 1}.`, 'success');
        onSaved?.();
      });
      side.appendChild(removeBtn);
    }

    fileInput.addEventListener('change', () => {
      errorEl.hidden = true;
      const file = fileInput.files?.[0];
      pendingFiles[i] = null;
      if (!file) { paintPreview(preview, promo[column]); return; }
      if (!ACCEPTED.includes(file.type)) { fail('Tiene que ser una imagen JPG, PNG o WebP.'); fileInput.value = ''; return; }
      if (file.size > MAX_BYTES) { fail('Esa imagen pesa más de 3 MB. Probá con una más liviana.'); fileInput.value = ''; return; }
      pendingFiles[i] = file;
      // Vista previa como data: URL y no con URL.createObjectURL: la CSP de
      // las páginas (img-src) permite data: pero no blob:.
      const reader = new FileReader();
      reader.onload = () => { if (pendingFiles[i] === file) paintPreview(preview, reader.result); };
      reader.readAsDataURL(file);
    });

    box.append(preview, side);
    imagesWrap.appendChild(box);
  }

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

  card.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const newStoreId = isAdmin ? (storeSelect.value || null) : promo.store_id;
    const storeChanged = newStoreId !== promo.store_id;
    if (pendingFiles.some(Boolean) && !newStoreId) { fail('Elegí un comercio antes de subir la imagen.'); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';
    const uploadedUrls = [];

    try {
      // Carpeta = espacio: la policy del bucket deja subir al admin o al
      // dueño del comercio asignado a ESE espacio.
      const update = {
        product_id: newStoreId ? (productSelect.value || null) : null,
        title: newStoreId ? (titleInput.value.trim() || null) : null,
      };
      if (isAdmin) {
        update.store_id = newStoreId;
        update.is_active = activeInput.checked;
      }

      for (let i = 0; i < PROMO_IMAGE_COLUMNS.length; i += 1) {
        const column = PROMO_IMAGE_COLUMNS[i];
        const file = pendingFiles[i];
        if (file) {
          const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
          const path = `${promo.slot}/${Date.now()}-${i + 1}.${ext}`;
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
          if (upErr) throw upErr;
          const url = supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl || null;
          if (!url) throw new Error('No se pudo obtener la URL de la imagen.');
          uploadedUrls.push(url);
          update[column] = url;
        } else if (isAdmin && storeChanged) {
          // Otro comercio = otras imágenes: las del anterior no le corresponden.
          update[column] = null;
        }
      }

      const { data, error } = await supabase.from('home_promos').update(update).eq('id', promo.id).select('id');
      if (error) throw error;
      // RLS no tira error cuando no deja actualizar: devuelve cero filas.
      if (!data?.length) throw new Error('No tenés permiso para editar este espacio.');

      // Las imágenes anteriores que se reemplazaron ya no las usa nadie: se
      // borran del bucket.
      const replaced = PROMO_IMAGE_COLUMNS
        .filter((column) => promo[column] && column in update && update[column] !== promo[column])
        .map((column) => promo[column]);
      if (replaced.length) await removeStoredObjects(supabase, BUCKET, replaced);
      showToast('Listo, guardamos la promoción.', 'success');
      onSaved?.();
    } catch (err) {
      console.error('Error al guardar la promoción del inicio:', err);
      if (uploadedUrls.length) await removeStoredObjects(supabase, BUCKET, uploadedUrls);
      fail(friendlyError(err, 'No se pudo guardar. Probá de nuevo.'));
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  });

  return card;
}

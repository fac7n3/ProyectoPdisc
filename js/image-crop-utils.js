/**
 * image-crop-utils.js — Reacomodar una imagen antes de subirla.
 *
 * Antes, "Elegir imagen" subía el archivo tal cual y quedaba recortado
 * centrado (`object-fit: cover`) en cualquier lugar donde se mostrara --
 * sin forma de correrlo hacia arriba, abajo, o hacer zoom. Este modal deja
 * elegir qué parte de la foto queda visible (arrastrando, con zoom) y
 * "hornea" ese recorte en un archivo cuadrado nuevo, así se ve igual en
 * todos lados donde se use el logo (no depende de que cada pantalla sepa de
 * un `object-position` guardado aparte).
 *
 * Sin imports: solo maneja DOM/canvas, no sabe nada de Supabase ni de en
 * qué bucket termina subiéndose el resultado -- eso lo resuelve quien llama.
 */

const OUTPUT_SIZE = 512;
const VIEWPORT = 260; // px, cuadrado
const MAX_ZOOM_FACTOR = 3;

/** Extensión que corresponde al Blob que devuelve openImageCropModal(). */
export function cropOutputExt(blob) {
  return blob?.type === 'image/png' ? 'png' : 'jpg';
}

/**
 * Abre el modal de "acomodar imagen" sobre un archivo recién elegido.
 * @param {File} file
 * @returns {Promise<Blob|null>} el recorte final (cuadrado), o null si se canceló
 */
export function openImageCropModal(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    let scale = 1;
    let minScale = 1;
    let offsetX = 0;
    let offsetY = 0;

    const overlay = document.createElement('div');
    overlay.className = 'img-crop-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Acomodar la imagen');

    const box = document.createElement('div');
    box.className = 'img-crop';

    const title = document.createElement('h2');
    title.className = 'img-crop__title';
    title.textContent = 'Acomodá la imagen';
    box.appendChild(title);

    const hint = document.createElement('p');
    hint.className = 'img-crop__hint';
    hint.textContent = 'Arrastrá la imagen para moverla y usá el control para acercar o alejar.';
    box.appendChild(hint);

    const viewport = document.createElement('div');
    viewport.className = 'img-crop__viewport';
    img.className = 'img-crop__img';
    img.draggable = false;
    img.alt = '';
    viewport.appendChild(img);
    box.appendChild(viewport);

    const zoomRow = document.createElement('div');
    zoomRow.className = 'img-crop__zoom';
    const zoomIconSmall = document.createElement('i');
    zoomIconSmall.className = 'fa-regular fa-image img-crop__zoom-icon';
    zoomIconSmall.setAttribute('aria-hidden', 'true');
    const zoomSlider = document.createElement('input');
    zoomSlider.type = 'range';
    zoomSlider.min = '0';
    zoomSlider.max = '100';
    zoomSlider.value = '0';
    zoomSlider.className = 'img-crop__zoom-slider';
    zoomSlider.setAttribute('aria-label', 'Zoom');
    const zoomIconBig = document.createElement('i');
    zoomIconBig.className = 'fa-regular fa-image img-crop__zoom-icon img-crop__zoom-icon--big';
    zoomIconBig.setAttribute('aria-hidden', 'true');
    zoomRow.append(zoomIconSmall, zoomSlider, zoomIconBig);
    box.appendChild(zoomRow);

    const actions = document.createElement('div');
    actions.className = 'img-crop__actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'img-crop__btn';
    cancelBtn.textContent = 'Cancelar';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'img-crop__btn img-crop__btn--primary';
    saveBtn.textContent = 'Listo';
    saveBtn.disabled = true;
    actions.append(cancelBtn, saveBtn);
    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let closed = false;
    function cleanup() {
      if (closed) return;
      closed = true;
      overlay.remove();
      document.removeEventListener('keydown', onEsc);
      URL.revokeObjectURL(objectUrl);
    }
    function finish(result) {
      cleanup();
      resolve(result);
    }
    function onEsc(e) {
      if (e.key === 'Escape') finish(null);
    }
    document.addEventListener('keydown', onEsc);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
    cancelBtn.addEventListener('click', () => finish(null));

    function applyTransform() {
      img.style.width = `${img.naturalWidth * scale}px`;
      img.style.height = `${img.naturalHeight * scale}px`;
      img.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }

    // La imagen tiene que cubrir siempre el viewport entero -- sin esto se
    // podría arrastrar/alejar hasta dejar un borde vacío adentro del recorte.
    function clampOffset() {
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      offsetX = Math.min(0, Math.max(VIEWPORT - w, offsetX));
      offsetY = Math.min(0, Math.max(VIEWPORT - h, offsetY));
    }

    img.onload = () => {
      minScale = Math.max(VIEWPORT / img.naturalWidth, VIEWPORT / img.naturalHeight);
      scale = minScale;
      offsetX = (VIEWPORT - img.naturalWidth * scale) / 2;
      offsetY = (VIEWPORT - img.naturalHeight * scale) / 2;
      applyTransform();
      saveBtn.disabled = false;
    };
    img.onerror = () => {
      hint.textContent = 'No pudimos abrir esa imagen. Probá con otro archivo.';
      hint.classList.add('img-crop__hint--error');
    };
    img.src = objectUrl;

    zoomSlider.addEventListener('input', () => {
      const t = Number(zoomSlider.value) / 100; // 0..1
      const newScale = minScale * (1 + t * (MAX_ZOOM_FACTOR - 1));
      // Mantiene el centro del viewport apuntando al mismo punto de la
      // imagen al hacer zoom, en vez de recentrar de golpe.
      const cx = (VIEWPORT / 2 - offsetX) / scale;
      const cy = (VIEWPORT / 2 - offsetY) / scale;
      scale = newScale;
      offsetX = VIEWPORT / 2 - cx * scale;
      offsetY = VIEWPORT / 2 - cy * scale;
      clampOffset();
      applyTransform();
    });

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;

    viewport.addEventListener('pointerdown', (e) => {
      if (!img.naturalWidth) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startOffsetX = offsetX;
      startOffsetY = offsetY;
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      offsetX = startOffsetX + (e.clientX - startX);
      offsetY = startOffsetY + (e.clientY - startY);
      clampOffset();
      applyTransform();
    });
    function stopDrag() {
      dragging = false;
      viewport.classList.remove('is-dragging');
    }
    viewport.addEventListener('pointerup', stopDrag);
    viewport.addEventListener('pointercancel', stopDrag);

    saveBtn.addEventListener('click', () => {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      // El rectángulo visible del viewport, pasado a coordenadas de la
      // imagen original -- lo que se ve es exactamente lo que se recorta.
      const sx = -offsetX / scale;
      const sy = -offsetY / scale;
      const sSize = VIEWPORT / scale;
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      // PNG conserva transparencia (logos con fondo transparente); el resto
      // se comprime como JPEG para no subir archivos pesados de más.
      const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob((blob) => finish(blob || null), outType, 0.92);
    });
  });
}

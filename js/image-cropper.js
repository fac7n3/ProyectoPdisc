/**
 * image-cropper.js — editor de encuadre de fotos (modal propio)
 * Baradero Local
 *
 * `cropImage(origen, nombre)` abre una tarjeta donde la persona arrastra la foto
 * y le hace zoom para elegir qué parte se usa, con la proporción que prefiera.
 * Devuelve una Promise<File | null> (JPG ya recortado, null si canceló).
 * `origen` es un File/Blob o la URL de una foto ya subida (se baja como blob
 * para que el canvas no quede "contaminado" por ser de otro origen).
 * La cuenta del encuadre vive en js/image-crop-utils.js (con tests).
 */
import { coverScale, clampOffset, sourceRect, outputSize } from './image-crop-utils.js';

const ASPECTS = [
  { label: 'Cuadrada', ratio: 1 },
  { label: 'Horizontal', ratio: 4 / 3 },
  { label: 'Vertical', ratio: 3 / 4 },
];
const MAX_ZOOM = 4;

export async function cropImage(source, fileName = 'foto') {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  const objectUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.src = objectUrl;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'bl-confirm-overlay';
    const card = document.createElement('div');
    card.className = 'bl-confirm-card crop-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Ajustar la foto');
    card.innerHTML = `
      <h3 class="bl-confirm-title">Ajustar la foto</h3>
      <p class="bl-confirm-msg">Arrastrá la foto para elegir qué parte se ve. Con el control o la rueda del mouse acercás o alejás.</p>
      <div class="crop-aspects" role="radiogroup" aria-label="Forma del recuadro"></div>
      <div class="crop-frame" tabindex="0" aria-label="Recuadro: arrastrá la foto, flechas del teclado para moverla"></div>
      <label class="crop-zoom">Zoom
        <input type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="Zoom">
      </label>
      <div class="bl-confirm-actions">
        <button type="button" class="bl-confirm-btn bl-confirm-btn--cancel">Cancelar</button>
        <button type="button" class="bl-confirm-btn bl-confirm-btn--confirm">Usar este encuadre</button>
      </div>`;
    const frame = card.querySelector('.crop-frame');
    const range = card.querySelector('input[type="range"]');
    const aspectsBox = card.querySelector('.crop-aspects');
    const [cancelBtn, okBtn] = card.querySelectorAll('.bl-confirm-btn');
    img.className = 'crop-img';
    img.alt = '';
    img.draggable = false;
    frame.appendChild(img);

    let ratio = ASPECTS[0].ratio;
    let fw = 0;
    let fh = 0;
    let zoom = 1;
    let off = { x: 0, y: 0 };

    const scale = () => coverScale(nw, nh, fw, fh, zoom);
    const paint = () => {
      const s = scale();
      off = clampOffset(off, nw, nh, fw, fh, s);
      img.style.width = `${nw * s}px`;
      img.style.height = `${nh * s}px`;
      img.style.left = `${off.x}px`;
      img.style.top = `${off.y}px`;
    };
    const layout = () => {
      const side = Math.min(320, window.innerWidth - 80);
      fw = Math.round(ratio >= 1 ? side : side * ratio);
      fh = Math.round(ratio >= 1 ? side / ratio : side);
      frame.style.width = `${fw}px`;
      frame.style.height = `${fh}px`;
      zoom = 1;
      range.value = '1';
      const s = scale();
      off = { x: (fw - nw * s) / 2, y: (fh - nh * s) / 2 };
      paint();
    };
    // El zoom se hace sobre el centro del recuadro, no sobre una esquina.
    const setZoom = (z) => {
      const oldS = scale();
      const cx = (fw / 2 - off.x) / oldS;
      const cy = (fh / 2 - off.y) / oldS;
      zoom = Math.min(MAX_ZOOM, Math.max(1, z));
      range.value = String(zoom);
      const s = scale();
      off = { x: fw / 2 - cx * s, y: fh / 2 - cy * s };
      paint();
    };

    const markAspects = () => aspectsBox.querySelectorAll('.crop-aspect').forEach((b, i) => {
      b.setAttribute('aria-checked', String(ASPECTS[i].ratio === ratio));
      b.classList.toggle('is-active', ASPECTS[i].ratio === ratio);
    });
    ASPECTS.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'crop-aspect';
      b.textContent = a.label;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => {
        ratio = a.ratio;
        layout();
        markAspects();
      });
      aspectsBox.appendChild(b);
    });
    markAspects();

    let drag = null;
    frame.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
      frame.setPointerCapture(e.pointerId);
      frame.classList.add('is-dragging');
    });
    frame.addEventListener('pointermove', (e) => {
      if (!drag) return;
      off = { x: drag.ox + e.clientX - drag.x, y: drag.oy + e.clientY - drag.y };
      paint();
    });
    const endDrag = () => {
      drag = null;
      frame.classList.remove('is-dragging');
    };
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);
    frame.addEventListener('wheel', (e) => {
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    }, { passive: false });
    frame.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [20, 0], ArrowRight: [-20, 0], ArrowUp: [0, 20], ArrowDown: [0, -20] }[e.key];
      if (!step) return;
      e.preventDefault();
      off = { x: off.x + step[0], y: off.y + step[1] };
      paint();
    });
    range.addEventListener('input', () => setZoom(Number(range.value)));

    const close = (value) => {
      document.removeEventListener('keydown', onKeydown);
      window.removeEventListener('resize', layout);
      overlay.remove();
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };
    const onKeydown = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', layout);
    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });

    okBtn.addEventListener('click', () => {
      const { sx, sy, sw, sh } = sourceRect(off, scale(), fw, fh);
      const { w, h } = outputSize(sw, sh);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // los PNG con transparencia quedan sobre blanco en el JPG
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      canvas.toBlob((out) => {
        if (!out) return close(null);
        const base = fileName.replace(/\.[^.]+$/, '') || 'foto';
        close(new File([out], `${base}.jpg`, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.92);
    });

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    layout();
    okBtn.focus();
  });
}

/**
 * Fotos de la entrega (retiro del repartidor y recepción del comprador).
 * Viven en el bucket privado `delivery-evidence` (migración 138) con paths
 * `{order_id}/pickup-{ts}.jpg` / `{order_id}/received-{ts}.jpg`, y se ven con
 * URLs firmadas de 60 s, igual que los comprobantes de pago.
 *
 * Las fotos se achican en el teléfono antes de subirlas (lado mayor 1280 px,
 * JPEG): una foto de celular pesa 3-6 MB y acá alcanza con ~200 KB.
 */
import { supabase } from './auth-utils.js';

const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.72;
export const EVIDENCE_BUCKET = 'delivery-evidence';

/** Abre la cámara (o la galería en escritorio) y devuelve el archivo elegido, o null. */
export function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** Foto -> data URL, para mostrar una vista previa (el CSP no permite `blob:` en img-src). */
export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la foto.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
    img.src = dataUrl;
  });
}

/** Achica la foto y la devuelve como Blob JPEG. */
export async function compressPhoto(file) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('Elegí una foto.');
  const img = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('No se pudo preparar la foto.');
  return blob;
}

/**
 * Sube la foto de un pedido y devuelve el path guardado.
 * @param {string} orderId
 * @param {'pickup'|'received'} kind
 * @param {File} file
 */
export async function uploadEvidence(orderId, kind, file) {
  const blob = await compressPhoto(file);
  const path = `${orderId}/${kind}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

/** URL firmada de 60 s para mirar una foto. */
export async function evidenceUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 60);
  if (error) return null;
  return data?.signedUrl || null;
}

const REASON_LABELS = {
  roto: 'Llegó roto',
  faltan: 'Faltan productos',
  otro_producto: 'No era lo que pedí',
  otro: 'Otro problema',
};

export function reasonLabel(key) {
  return REASON_LABELS[key] || key;
}

function figure(title, url, emptyText) {
  const fig = document.createElement('figure');
  fig.className = 'dev-evidence__fig';
  const cap = document.createElement('figcaption');
  cap.textContent = title;
  fig.appendChild(cap);
  if (url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const img = document.createElement('img');
    img.src = url;
    img.alt = title;
    img.loading = 'lazy';
    link.appendChild(img);
    fig.appendChild(link);
  } else {
    const p = document.createElement('p');
    p.className = 'dev-evidence__empty';
    p.textContent = emptyText;
    fig.appendChild(p);
  }
  return fig;
}

/**
 * Muestra las dos fotos de la entrega (retiro y recepción) y lo que respondió el
 * comprador, en una tarjeta encima de la página. Lo usan el comercio y el admin.
 * @returns {Promise<boolean>} false si no hay nada para mostrar
 */
export async function openEvidenceViewer(orderId, { orderLabel = '' } = {}) {
  const { data, error } = await supabase.rpc('get_delivery_evidence', { p_order_id: orderId });
  if (error) throw error;

  const feedback = data?.feedback || null;
  const [pickupUrl, receivedUrl] = await Promise.all([
    evidenceUrl(data?.pickup_photo_path),
    evidenceUrl(feedback?.photo_path),
  ]);

  const overlay = document.createElement('div');
  overlay.className = 'dev-evidence';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `Fotos de la entrega ${orderLabel}`.trim());

  const card = document.createElement('div');
  card.className = 'dev-evidence__card';

  const title = document.createElement('h2');
  title.className = 'dev-evidence__title';
  title.textContent = `Fotos de la entrega ${orderLabel}`.trim();
  card.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'dev-evidence__grid';
  grid.appendChild(figure('Al retirar (repartidor)', pickupUrl, 'El repartidor no subió foto.'));
  grid.appendChild(figure('Al recibir (comprador)', receivedUrl, feedback ? 'El comprador no subió foto.' : 'El comprador todavía no respondió.'));
  card.appendChild(grid);

  if (feedback) {
    const p = document.createElement('p');
    p.className = 'dev-evidence__feedback';
    if (feedback.condition === 'ok') {
      p.textContent = 'El comprador dijo que su pedido llegó bien.';
    } else {
      const reasons = (feedback.reasons || []).map(reasonLabel).join(', ');
      p.textContent = `Reclamo del comprador: ${reasons}${feedback.note ? ` — ${feedback.note}` : ''}`;
    }
    card.appendChild(p);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'dev-evidence__close';
  close.textContent = 'Cerrar';
  const dismiss = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', onKey);
  card.appendChild(close);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  close.focus();
  return Boolean(pickupUrl || receivedUrl || feedback);
}

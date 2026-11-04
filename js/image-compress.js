/**
 * image-compress.js — Achica una foto en el navegador ANTES de subirla.
 *
 * Por qué: ninguna subida pasaba por una compresión. Una foto de celular pesa
 * 3-5 MB y 4000 px; en el Storage ya había fotos de producto de 1,3 MB y un logo
 * de comercio de 361 KB que se bajaba en el inicio y en Comercios. Con comercios
 * reales subiendo desde el teléfono, cada tarjeta habría pesado varios MB.
 *
 * Qué hace: decodifica respetando la orientación EXIF, la pasa a un lado máximo
 * (según el uso: logo 512, producto 1600...) y la guarda como WebP (con
 * transparencia, sirve para logos). Si no hace falta (ya es chica y liviana), si
 * no es una imagen que se pueda achicar (GIF animado, SVG, PDF) o si algo falla,
 * devuelve el archivo ORIGINAL: comprimir nunca puede impedir una subida.
 *
 * La parte que toca el navegador (decodificar y codificar) entra por `env` para
 * poder probar la lógica en Node (js/image-compress.test.mjs).
 */

/** Lado máximo y calidad por tipo de uso. */
export const IMAGE_PRESETS = {
  product: { maxSide: 1600, quality: 0.82 }, // foto de producto: se ve en el modal grande
  banner: { maxSide: 1600, quality: 0.82 },  // banner del comercio (1600 x 400 recomendado)
  promo: { maxSide: 1920, quality: 0.85 },   // publicidad del inicio
  logo: { maxSide: 512, quality: 0.85 },     // logo del comercio
  avatar: { maxSide: 512, quality: 0.85 },   // foto de perfil
  photo: { maxSide: 1200, quality: 0.82 },   // foto de un profesional o de sus trabajos
  attachment: { maxSide: 1600, quality: 0.78 }, // adjunto de una consulta
};

/** Lo que ya es chico y liviano se deja como está: recomprimirlo solo lo empeora. */
const MIN_BYTES_TO_COMPRESS = 120 * 1024;

const COMPRESSIBLE = /^image\/(jpeg|png|webp|heic|heif|bmp)$/i;

/** Dimensiones que entran en un cuadrado de `maxSide`, sin agrandar y sin deformar. */
export function fitWithin(width, height, maxSide) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0, scale: 1 };
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

/** Si vale la pena pasar este archivo por el compresor. */
export function shouldCompress({ type, size }, { width, height }, { maxSide }) {
  if (!COMPRESSIBLE.test(type || '')) return false; // GIF (puede estar animado), SVG, PDF, desconocido
  const needsResize = Math.max(width, height) > maxSide;
  return needsResize || size > MIN_BYTES_TO_COMPRESS;
}

/** `foto.jpg` -> `foto.webp`; sin extensión, se la agrega. */
export function webpName(name) {
  const base = String(name || 'foto').replace(/\.[a-z0-9]{1,5}$/i, '');
  return `${base || 'foto'}.webp`;
}

/** Implementación para el navegador. */
export const browserEnv = {
  /** { width, height, bitmap } con la orientación EXIF ya aplicada. */
  async decode(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { width: bitmap.width, height: bitmap.height, bitmap };
  },
  /** Blob WebP del bitmap a w x h, o null si el navegador no codifica WebP. */
  async encode(decoded, w, h, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    // Safari viejo no sabe WebP y devuelve PNG en silencio: eso no sirve.
    return blob && blob.type === 'image/webp' ? blob : null;
  },
  release(decoded) {
    try { decoded.bitmap.close(); } catch { /* ya liberado */ }
  },
};

/**
 * @param {File} file
 * @param {keyof typeof IMAGE_PRESETS | {maxSide:number, quality:number}} preset
 * @returns {Promise<File>} el archivo achicado (WebP), o el mismo `file` si no hacía falta o falló.
 */
export async function compressImage(file, preset = 'product', env = browserEnv) {
  const opts = typeof preset === 'string' ? IMAGE_PRESETS[preset] : preset;
  if (!file || !opts || !COMPRESSIBLE.test(file.type || '')) return file;
  let decoded;
  try {
    decoded = await env.decode(file);
    if (!shouldCompress(file, decoded, opts)) return file;
    const { width, height } = fitWithin(decoded.width, decoded.height, opts.maxSide);
    const blob = await env.encode(decoded, width, height, opts.quality);
    // Si no salió más liviana (una foto ya muy comprimida), se queda la original.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], webpName(file.name), { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    if (decoded) env.release?.(decoded);
  }
}

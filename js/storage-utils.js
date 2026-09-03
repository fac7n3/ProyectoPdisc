/**
 * Borrado de objetos de Storage a partir de sus URLs públicas.
 *
 * Existe porque al desreferenciar un archivo (quitar la foto de un producto,
 * cambiar el avatar, eliminar un producto entero) se borraba la fila de la DB
 * pero **no** el objeto del bucket: se acumulaba basura que igual se paga.
 *
 * A propósito no importa nada — ni siquiera el cliente de Supabase, que se
 * recibe por parámetro. Así el parseo de la URL, que es la parte con filo
 * (guarda una operación destructiva), se puede correr con
 * `node js/storage-utils.test.mjs` sin credenciales ni navegador.
 */

/** Prefijo de una URL pública de Supabase Storage. */
const PUBLIC_PREFIX = "/storage/v1/object/public/";

/**
 * URL pública -> ruta dentro del bucket, o null si esa URL no es de este
 * bucket (por ejemplo el avatar de Google, o una URL externa pegada a mano).
 * Devolver null es lo que evita que se intente borrar algo ajeno.
 */
export function publicUrlToStoragePath(url, bucket) {
  if (typeof url !== "string" || !bucket) return null;
  const marker = `${PUBLIC_PREFIX}${bucket}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;

  // Cortar la query (?t=... de cache-busting) y el fragmento antes de decodificar.
  const raw = url.slice(at + marker.length).split(/[?#]/)[0];
  if (!raw) return null;

  let path;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null; // porcentaje mal formado: mejor no borrar nada
  }

  // Ninguna ruta legítima sube de carpeta. Si aparece "..", no se toca.
  if (path.split("/").some((seg) => seg === "..")) return null;
  return path;
}

/**
 * Borra del bucket los objetos de esas URLs públicas. Ignora en silencio las
 * que no pertenecen al bucket. No tira: que falle una limpieza no debe
 * romperle la operación al usuario, que ya la dio por hecha.
 *
 * Devuelve las rutas que se pidió borrar (sirve para loguear y para los tests).
 */
export async function removeStoredObjects(supabase, bucket, urls) {
  const paths = [...new Set(
    (urls || [])
      .map((url) => publicUrlToStoragePath(url, bucket))
      .filter(Boolean)
  )];
  if (!paths.length) return [];

  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) {
    console.warn(`No se pudieron borrar archivos viejos de "${bucket}":`, error.message);
  }
  return paths;
}

/**
 * 1536000 -> "1,5 MB". Para que el peso de un archivo se lea, no se calcule.
 * Vive acá (y no en la página que lo estrenó) porque ya lo usan dos flujos de
 * subida distintos: el comprobante de transferencia y los adjuntos de un
 * reclamo.
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
}

/**
 * "uid/1756000000-captura.png" -> "captura.png". Los adjuntos se guardan con
 * un timestamp adelante para que dos archivos con el mismo nombre no se pisen;
 * al mostrarlos ese prefijo es ruido.
 */
export function storedFileName(path) {
  const base = String(path ?? "").split("/").pop() || "";
  return base.replace(/^\d+-/, "") || base;
}

/**
 * product-draft.js — borrador del alta de producto, guardado en el navegador.
 * Baradero Local
 *
 * Va en IndexedDB y no en localStorage porque el borrador incluye las fotos
 * elegidas (File), que localStorage no puede guardar. Es por dispositivo, igual
 * que el resto de los borradores del sitio. Si IndexedDB no está disponible
 * (modo privado, datos bloqueados) todo falla en silencio: simplemente no hay
 * borrador.
 */
const DB_NAME = 'bl_drafts';
const STORE = 'drafts';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export const saveProductDraft = (key, draft) => run('readwrite', (s) => s.put(draft, key)).catch(() => {});
export const loadProductDraft = (key) => run('readonly', (s) => s.get(key)).catch(() => null);
export const clearProductDraft = (key) => run('readwrite', (s) => s.delete(key)).catch(() => {});

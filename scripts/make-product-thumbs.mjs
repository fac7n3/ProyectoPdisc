/**
 * make-product-thumbs.mjs — Versiones chicas de las fotos de producto (520 px) y de las
 * publicidades del inicio (800 px, para celular: public/img/promos/m/).
 *
 *   npm run thumbs
 *
 * public/img/productos/NOMBRE.webp (800 px) -> public/img/productos/s/NOMBRE.webp (520 px).
 * Solo genera las que faltan o quedaron más viejas que la original. Cuando se suban
 * fotos nuevas a public/img/productos/ hay que correrlo: `npm test` falla si una foto
 * no tiene su miniatura (js/product-thumbs.test.mjs), porque la tarjeta pediría un
 * archivo que no existe.
 */
import sharp from 'sharp';
import { mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'public/img/productos');
const out = path.join(src, 's');
const WIDTH = 520;

mkdirSync(out, { recursive: true });
let made = 0, kept = 0, bytes = 0;
for (const name of readdirSync(src).filter((f) => f.endsWith('.webp'))) {
  const from = path.join(src, name);
  const to = path.join(out, name);
  if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) { kept++; continue; }
  const info = await sharp(from).resize({ width: WIDTH, height: WIDTH, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 5 }).toFile(to);
  bytes += info.size;
  made++;
}
console.log(`Miniaturas: ${made} nuevas (${(bytes / 1024).toFixed(0)} KB), ${kept} ya estaban.`);

// Publicidades del inicio: la versión de 800 px es la que se usa en pantallas chicas
// (js/home-promos-utils.js, promoMobileUrl). La imagen ampliada usa la original.
const promosSrc = path.join(root, 'public/img/promos');
const promosOut = path.join(promosSrc, 'm');
mkdirSync(promosOut, { recursive: true });
let pMade = 0, pBytes = 0;
for (const name of readdirSync(promosSrc).filter((f) => f.endsWith('.webp'))) {
  const from = path.join(promosSrc, name);
  const to = path.join(promosOut, name);
  if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) continue;
  const info = await sharp(from).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toFile(to);
  pBytes += info.size;
  pMade++;
}
console.log(`Publicidades (celular): ${pMade} nuevas (${(pBytes / 1024).toFixed(0)} KB).`);

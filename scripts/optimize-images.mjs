// F10-03: convierte a WebP las imágenes fuente pesadas (PNG de mockups IA + fotos de producto)
// y las deja planas en public/ para que Vite las sirva verbatim en /img/*.webp.
// Correr de nuevo si se agregan/regeneran mockups: node scripts/optimize-images.mjs
import sharp from 'sharp';
import { mkdir, stat } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'public/img');

const files = [
  ['Assets/images/mockups/prod_herramientas_1782235368387.png', 'prod-herramientas.webp'],
  ['Assets/images/mockups/prod_tecnologia_1782235378748.png', 'prod-tecnologia.webp'],
  ['Assets/images/mockups/prod_ropa_1782235388688.png', 'prod-ropa.webp'],
  ['Assets/images/mockups/prod_limpieza_1782235399097.png', 'prod-limpieza.webp'],
  ['Assets/images/mockups/prod_panaderia_1782235409695.png', 'prod-panaderia.webp'],
  ['Assets/images/mockups/prod_bebidas_1782235426021.png', 'prod-bebidas.webp'],
  ['Assets/images/mockups/prod_kiosco_1782235437519.png', 'prod-kiosco.webp'],
  ['Assets/images/mockups/logo_ferreteria_1782235257665.png', 'logo-ferreteria.webp'],
  ['Assets/images/mockups/logo_tecno_1782235266278.png', 'logo-tecno.webp'],
  ['Assets/images/mockups/logo_moda_1782235274778.png', 'logo-moda.webp'],
  ['Assets/images/mockups/logo_limpieza_1782235283399.png', 'logo-limpieza.webp'],
  ['Assets/images/mockups/logo_panaderia_1782235292661.png', 'logo-panaderia.webp'],
  ['Assets/images/mockups/logo_bebidas_1782235309803.png', 'logo-bebidas.webp'],
  ['Assets/images/mockups/logo_kiosco_1782235321036.png', 'logo-kiosco.webp'],
  ['Assets/images/mockups/logo_petshop_1782235331554.png', 'logo-petshop.webp'],
  ['Assets/images/mockups/logo_farmacia_1782235340789.png', 'logo-farmacia.webp'],
  ['Assets/images/mockups/logo_deportes_1782235349776.png', 'logo-deportes.webp'],
  ['Assets/images/products/milk.png', 'milk.webp'],
  ['Assets/images/products/coffee.png', 'coffee.webp'],
  ['Assets/images/products/yerba.png', 'yerba.webp'],
  ['Assets/images/products/dulce.png', 'dulce.webp'],
  ['Assets/images/products/galletitas.png', 'galletitas.webp'],
  ['Assets/images/products/bread.png', 'bread.webp'],
  ['Assets/images/products/cleaning.png', 'cleaning.webp'],
];

await mkdir(outDir, { recursive: true });

let totalBefore = 0;
let totalAfter = 0;

for (const [src, outName] of files) {
  const srcPath = resolve(root, src);
  const outPath = resolve(outDir, outName);
  const before = (await stat(srcPath)).size;
  const info = await sharp(srcPath)
    .resize({ width: 1000, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(outPath);
  totalBefore += before;
  totalAfter += info.size;
  console.log(`${src} -> public/img/${outName} (${info.size} bytes)`);
}

console.log(`\nTotal: ${totalAfter} bytes (webp) vs ${totalBefore || 'n/a'} bytes (png fuente)`);

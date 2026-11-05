/**
 * Chequeo de las fotos de producto en dos tamaños (js/product-image.js).
 * Correr con:  node js/product-thumbs.test.mjs
 * Si falla por una miniatura que falta:  npm run thumbs
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { thumbUrl, setProductImage, CARD_IMAGE_SIZES } from "./product-image.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "public/img/productos");

/** <img> mínimo: guarda los atributos como un DOM real. */
const fakeImg = () => { const a = {}; return { a, setAttribute: (k, v) => { a[k] = v; } }; };

console.log("thumbUrl / setProductImage");
check("una foto de /img/productos tiene su miniatura en /s/", () => {
  assert.equal(thumbUrl("/img/productos/pan-frances.webp"), "/img/productos/s/pan-frances.webp");
});
check("lo que no es de /img/productos queda sin miniatura (Supabase Storage, otras, vacío, svg)", () => {
  for (const u of ["https://x.supabase.co/storage/v1/object/public/products/a.jpg", "/img/prod-ropa.webp", "/img/no-image.svg", "", null, undefined,
    "/img/productos/s/ya-chica.webp", "/img/productos/sub/dir/a.webp", "/img/productos/a.png"]) {
    assert.equal(thumbUrl(u), null, String(u));
  }
});
check("setProductImage: src grande (lo leen el modal y el carrito), srcset con las dos y sizes", () => {
  const img = fakeImg();
  setProductImage(img, "/img/productos/a.webp");
  assert.equal(img.a.src, "/img/productos/a.webp");
  assert.equal(img.a.srcset, "/img/productos/s/a.webp 520w, /img/productos/a.webp 800w");
  assert.equal(img.a.sizes, CARD_IMAGE_SIZES);
});
check("setProductImage: sin foto usa el ícono y sin srcset; una foto externa, sin srcset", () => {
  const empty = fakeImg();
  setProductImage(empty, null);
  assert.equal(empty.a.src, "/img/no-image.svg");
  assert.equal(empty.a.srcset, undefined);
  const ext = fakeImg();
  setProductImage(ext, "https://x.supabase.co/a.jpg");
  assert.equal(ext.a.srcset, undefined);
});

console.log("miniaturas en disco");
const photos = readdirSync(dir).filter((f) => f.endsWith(".webp"));
check("hay fotos de producto", () => assert.ok(photos.length > 100));
check("cada foto tiene su miniatura y pesa menos que la original", () => {
  const missing = photos.filter((f) => !existsSync(path.join(dir, "s", f)));
  assert.deepEqual(missing, [], "Faltan miniaturas: corré  npm run thumbs");
  const bigger = photos.filter((f) => statSync(path.join(dir, "s", f)).size >= statSync(path.join(dir, f)).size);
  assert.deepEqual(bigger, [], "una miniatura no puede pesar más que la foto");
});
check("no quedan miniaturas huérfanas (de una foto que ya no existe)", () => {
  const orphans = readdirSync(path.join(dir, "s")).filter((f) => !photos.includes(f));
  assert.deepEqual(orphans, []);
});

console.log("publicidades del inicio para celular");
check("cada publicidad de /img/promos tiene su versión de 800 px en /m/, más liviana", () => {
  const dirP = path.join(root, "public/img/promos");
  const promos = readdirSync(dirP).filter((f) => f.endsWith(".webp"));
  assert.ok(promos.length > 5);
  const missing = promos.filter((f) => !existsSync(path.join(dirP, "m", f)));
  assert.deepEqual(missing, [], "Faltan versiones de celular: corré  npm run thumbs");
  const bigger = promos.filter((f) => statSync(path.join(dirP, "m", f)).size >= statSync(path.join(dirP, f)).size);
  assert.deepEqual(bigger, []);
});

if (process.exitCode) {
  console.error("\nHay fallas.");
} else {
  console.log("\nTodo bien.");
}

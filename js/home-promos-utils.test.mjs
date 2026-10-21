/**
 * Promociones de comercios del home: qué banner se reemplaza y a dónde lleva.
 * Correr con:  node js/home-promos-utils.test.mjs
 */
import assert from "node:assert/strict";
import { HOME_PROMO_SLOTS, slotLabel, isPromoLive, promoHref, promoAriaLabel, promoImages, stepIndex } from "./home-promos-utils.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const STORE = "11111111-1111-1111-1111-111111111111";
const PRODUCT = "22222222-2222-2222-2222-222222222222";
const base = {
  slot: "mosaic_b",
  is_active: true,
  store_id: STORE,
  product_id: PRODUCT,
  image_url: "https://x/storage/v1/object/public/home-promos/mosaic_b/1.webp",
  title: "Combo hamburguesas",
  stores: { name: "Beruru", status: "approved" },
  products: { is_active: true },
};

console.log("HOME_PROMO_SLOTS");
check("son los 6 espacios que acepta el check de la tabla", () => {
  assert.deepEqual(HOME_PROMO_SLOTS.map((s) => s.slot), ["mosaic_a", "mosaic_b", "mosaic_c", "mosaic_d", "mosaic_e", "mosaic_f"]);
});
check("slotLabel cae al id si no lo conoce", () => {
  assert.equal(slotLabel("otro"), "otro");
  assert.match(slotLabel("mosaic_a"), /grande/);
});

console.log("isPromoLive");
check("activa + comercio aprobado + imagen => se muestra", () => assert.equal(isPromoLive(base), true));
check("sin comercio asignado => banner fijo", () => assert.equal(isPromoLive({ ...base, store_id: null }), false));
check("sin imagen todavía => banner fijo", () => assert.equal(isPromoLive({ ...base, image_url: null }), false));
check("apagada por el admin => banner fijo", () => assert.equal(isPromoLive({ ...base, is_active: false }), false));
check("comercio suspendido => banner fijo", () => assert.equal(isPromoLive({ ...base, stores: { name: "X", status: "suspended" } }), false));
check("solo con la imagen 2 o 3 cargada también se muestra", () => {
  assert.equal(isPromoLive({ ...base, image_url: null, image_url_3: "https://x/3.webp" }), true);
});
check("sin datos del comercio (RLS no lo devolvió) => banner fijo", () => assert.equal(isPromoLive({ ...base, stores: null }), false));

console.log("promoHref");
check("con publicación activa lleva a la publicación", () => {
  assert.equal(promoHref(base), `./producto.html?id=${PRODUCT}`);
});
check("publicación pausada => página del comercio", () => {
  assert.equal(promoHref({ ...base, products: { is_active: false } }), `./comercio.html?id=${STORE}`);
});
check("publicación borrada (join vacío) => página del comercio", () => {
  assert.equal(promoHref({ ...base, products: null }), `./comercio.html?id=${STORE}`);
});
check("sin publicación elegida => página del comercio", () => {
  assert.equal(promoHref({ ...base, product_id: null, products: null }), `./comercio.html?id=${STORE}`);
});
check("sin comercio => null", () => assert.equal(promoHref({ ...base, store_id: null }), null));

console.log("promoAriaLabel");
check("con título", () => assert.equal(promoAriaLabel(base), "Promoción de Beruru: Combo hamburguesas"));
check("sin título", () => assert.equal(promoAriaLabel({ ...base, title: "  " }), "Ver promoción de Beruru"));

console.log("promoImages");
check("devuelve las cargadas en orden, sin huecos", () => {
  assert.deepEqual(promoImages({ image_url: "a", image_url_2: null, image_url_3: "c" }), ["a", "c"]);
  assert.deepEqual(promoImages({ image_url: "a", image_url_2: "b", image_url_3: "c" }), ["a", "b", "c"]);
});
check("sin imágenes o sin fila => lista vacía", () => {
  assert.deepEqual(promoImages({ image_url: "", image_url_2: null }), []);
  assert.deepEqual(promoImages(null), []);
});
check("una fila vieja (sin las columnas nuevas) tiene una sola imagen", () => {
  assert.deepEqual(promoImages({ image_url: "a" }), ["a"]);
});

console.log("stepIndex");
check("avanza y da la vuelta", () => {
  assert.equal(stepIndex(0, 1, 3), 1);
  assert.equal(stepIndex(2, 1, 3), 0);
});
check("retrocede y da la vuelta", () => {
  assert.equal(stepIndex(1, -1, 3), 0);
  assert.equal(stepIndex(0, -1, 3), 2);
});
check("sin imágenes no explota", () => assert.equal(stepIndex(0, 1, 0), 0));

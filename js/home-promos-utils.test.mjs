/**
 * Promociones de comercios del home: qué banner se reemplaza y a dónde lleva.
 * Correr con:  node js/home-promos-utils.test.mjs
 */
import assert from "node:assert/strict";
import { HOME_PROMO_SLOTS, slotLabel, isPromoLive, promoHref, promoAriaLabel, promoPosition, groupLivePromosBySlot, stepIndex } from "./home-promos-utils.js";

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

console.log("promoPosition");
check("usa la posición de la fila; sin la columna (antes de la 137) es la 1", () => {
  assert.equal(promoPosition({ position: 3 }), 3);
  assert.equal(promoPosition({}), 1);
  assert.equal(promoPosition(null), 1);
});

console.log("groupLivePromosBySlot");
check("agrupa por espacio y ordena por posición, aunque lleguen mezcladas", () => {
  const rows = [
    { ...base, slot: "mosaic_a", position: 3, title: "tres" },
    { ...base, slot: "mosaic_b", position: 1, title: "b1" },
    { ...base, slot: "mosaic_a", position: 1, title: "uno" },
    { ...base, slot: "mosaic_a", position: 2, title: "dos" },
  ];
  const map = groupLivePromosBySlot(rows);
  assert.deepEqual(map.get("mosaic_a").map((p) => p.title), ["uno", "dos", "tres"]);
  assert.deepEqual(map.get("mosaic_b").map((p) => p.title), ["b1"]);
});
check("las posiciones libres, apagadas o sin imagen no entran: el carrusel solo trae las vivas", () => {
  const rows = [
    { ...base, slot: "mosaic_a", position: 1, title: "viva" },
    { ...base, slot: "mosaic_a", position: 2, store_id: null },
    { ...base, slot: "mosaic_a", position: 3, image_url: null },
    { ...base, slot: "mosaic_c", position: 1, is_active: false },
  ];
  const map = groupLivePromosBySlot(rows);
  assert.deepEqual(map.get("mosaic_a").map((p) => p.title), ["viva"]);
  assert.equal(map.has("mosaic_c"), false);
});
check("comercios distintos en el mismo espacio conservan cada uno el suyo", () => {
  const rows = [
    { ...base, slot: "mosaic_a", position: 1, store_id: "s1", stores: { name: "Uno", status: "approved" } },
    { ...base, slot: "mosaic_a", position: 2, store_id: "s2", stores: { name: "Dos", status: "approved" } },
  ];
  assert.deepEqual(groupLivePromosBySlot(rows).get("mosaic_a").map((p) => p.stores.name), ["Uno", "Dos"]);
  assert.equal(promoHref({ ...rows[1], product_id: null, products: null }), "./comercio.html?id=s2");
});
check("filas viejas sin `position` siguen funcionando como una sola promo", () => {
  assert.equal(groupLivePromosBySlot([base]).get("mosaic_b").length, 1);
});
check("sin filas => mapa vacío", () => assert.equal(groupLivePromosBySlot(null).size, 0));

console.log("stepIndex");
check("avanza y da la vuelta", () => {
  assert.equal(stepIndex(0, 1, 3), 1);
  assert.equal(stepIndex(2, 1, 3), 0);
});
check("retrocede y da la vuelta", () => {
  assert.equal(stepIndex(1, -1, 3), 0);
  assert.equal(stepIndex(0, -1, 3), 2);
});
check("sin promos no explota", () => assert.equal(stepIndex(0, 1, 0), 0));

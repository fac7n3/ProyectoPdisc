import assert from "node:assert/strict";
import {
  normalizeProductTitle, groupSameProducts, rankByPrice, rankByDistance, distanceMeters, formatDistance, offersForProduct,
} from "./price-compare-utils.js";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("  ok ", name); } catch (e) { failed++; console.log("  FAIL", name, "\n    ", e.message); }
}
const p = (id, store_id, title, price, extra = {}) => ({ id, store_id, title, price, ...extra });

console.log("normalizeProductTitle");
check("mayúsculas, acentos y espacios de más", () =>
  assert.equal(normalizeProductTitle("  Leche La Serenísima   Clásica "), "leche la serenisima clasica"));
check("'1L' y '1 l' son lo mismo", () =>
  assert.equal(normalizeProductTitle("Cindor 1L"), normalizeProductTitle("cindor 1 l")));
check("signos fuera", () => assert.equal(normalizeProductTitle("Bananas (kg)"), "bananas kg"));
check("vacío / null", () => { assert.equal(normalizeProductTitle(null), ""); assert.equal(normalizeProductTitle("  "), ""); });

console.log("groupSameProducts");
const prods = [
  p("a1", "S1", "Leche 1L", 2000),
  p("b1", "S2", "Yerba", 3000),
  p("a2", "S2", "leche 1 l", 1900),
  p("a3", "S3", "Leche 1 L", 2100),
  p("c1", "S1", "Yerba", 3100),
  p("d1", "S1", "Pan", 500),
];
const groups = groupSameProducts(prods);
check("junta el mismo nombre de distintos comercios", () => {
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].items.map((i) => i.id).sort(), ["a1", "a2", "a3"]);
});
check("respeta el orden de la búsqueda (primero el que apareció antes)", () =>
  assert.deepEqual(groups.map((g) => g.key), ["leche 1 l", "yerba"]));
check("un producto en un solo comercio no forma grupo", () =>
  assert.equal(groups.some((g) => g.key === "pan"), false));
check("el mismo comercio dos veces cuenta una, la más barata", () => {
  const g = groupSameProducts([p("x", "S1", "Pan", 600), p("y", "S1", "Pan", 500)]);
  assert.equal(g.length, 0);
  const g2 = groupSameProducts([p("x", "S1", "Pan", 600), p("y", "S1", "Pan", 500), p("z", "S2", "Pan", 550)]);
  assert.deepEqual(g2[0].items.map((i) => i.id).sort(), ["y", "z"]);
});
check("ignora filas sin comercio o sin precio", () =>
  assert.equal(groupSameProducts([p("x", null, "Pan", 1), p("y", "S2", "Pan", null), p("z", "S3", "Pan", 2)]).length, 0));

check("usa match_key de la base cuando viene (nombres distintos, mismo producto)", () => {
  const g = groupSameProducts([
    p("a", "S1", "Leche La Serenísima Clásica sachet 1 L", 2000, { match_key: "1000ml clasica leche serenisima" }),
    p("b", "S2", "Serenísima leche clásica 1000 ml", 1900, { match_key: "1000ml clasica leche serenisima" }),
    p("c", "S3", "Leche La Serenísima Clásica 500 ml", 1100, { match_key: "500ml clasica leche serenisima" }),
  ]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].items.map((i) => i.id).sort(), ["a", "b"]);
});
check("match_key manda sobre el nombre (mismo nombre, claves distintas no se juntan)", () =>
  assert.equal(groupSameProducts([
    p("a", "S1", "Sprite", 1500, { match_key: "lata sprite" }),
    p("b", "S2", "Sprite", 13500, { match_key: "pack sprite" }),
  ]).length, 0));

console.log("rankByPrice");
check("más barato primero, empate por nombre de comercio", () => {
  const r = rankByPrice([
    { id: 1, price: 2000, store_name: "Zeta" },
    { id: 2, price: 1900, store_name: "Beta" },
    { id: 3, price: 2000, store_name: "Alfa" },
  ]);
  assert.deepEqual(r.map((i) => i.id), [2, 3, 1]);
});
check("no muta el arreglo original", () => {
  const arr = [{ price: 2 }, { price: 1 }];
  rankByPrice(arr);
  assert.equal(arr[0].price, 2);
});

console.log("distanceMeters / rankByDistance");
const plaza = { lat: -33.8117, lng: -59.5051 };
check("~1 km hacia el norte", () => {
  const d = distanceMeters(plaza, { lat: plaza.lat + 0.009, lng: plaza.lng });
  assert.ok(d > 950 && d < 1050, `dio ${d}`);
});
check("mismo punto = 0", () => assert.equal(distanceMeters(plaza, plaza), 0));
const coords = new Map([
  ["LEJOS", { lat: plaza.lat + 0.02, lng: plaza.lng }],
  ["CERCA", { lat: plaza.lat + 0.002, lng: plaza.lng }],
]);
const items = [
  { store_id: "LEJOS", price: 100 },
  { store_id: "SIN", price: 50 },
  { store_id: "CERCA", price: 300 },
  { store_id: "SIN2", price: 40 },
];
check("más cerca primero, sin ubicación al final (más baratos primero)", () => {
  const r = rankByDistance(items, plaza, coords);
  assert.deepEqual(r.map((i) => i.store_id), ["CERCA", "LEJOS", "SIN2", "SIN"]);
  assert.ok(r[0].distance > 150 && r[0].distance < 300);
  assert.equal(r[2].distance, null);
});
check("sin ubicación de la persona: todo null, ordenado por precio", () => {
  const r = rankByDistance(items, null, coords);
  assert.ok(r.every((i) => i.distance === null));
  assert.deepEqual(r.map((i) => i.price), [40, 50, 100, 300]);
});

console.log("formatDistance");
check("metros redondeados a 50", () => { assert.equal(formatDistance(340), "350 m"); assert.equal(formatDistance(10), "50 m"); });
check("kilómetros con coma", () => assert.equal(formatDistance(1234), "1,2 km"));
check("sin dato => vacío", () => { assert.equal(formatDistance(null), ""); assert.equal(formatDistance(NaN), ""); });

console.log("offersForProduct");
const rowsFicha = [
  { ...p("m1", "S1", "Leche 1L", 2000), match_key: "k", store_name: "Uno" },
  { ...p("m2", "S2", "Leche 1L", 1900), match_key: "k", store_name: "Dos" },
  { ...p("m3", "S3", "Leche 1L", 1900), match_key: "k", store_name: "Tres" },
  { ...p("m4", "S2", "Leche 1L", 2500), match_key: "k", store_name: "Dos" },
];
check("ordena por precio, marca el actual y la diferencia con el mejor", () => {
  const r = offersForProduct(rowsFicha, { productId: "m1", storeId: "S1" });
  assert.deepEqual(r.map((x) => x.store_name), ["Dos", "Tres", "Uno"]);
  assert.deepEqual(r.map((x) => x.isCheapest), [true, true, false]);
  assert.deepEqual(r.map((x) => x.diff), [0, 0, 100]);
  assert.deepEqual(r.map((x) => x.isCurrent), [false, false, true]);
});
check("si el comercio de la ficha no está (sin stock), lista los otros", () => {
  const r = offersForProduct(rowsFicha.slice(1, 3), { productId: "zz", storeId: "S9" });
  assert.equal(r.length, 2);
  assert.equal(r.some((x) => x.isCurrent), false);
});
check("nada con qué comparar: solo el propio comercio, o lista vacía", () => {
  assert.equal(offersForProduct([rowsFicha[0]], { productId: "m1", storeId: "S1" }), null);
  assert.equal(offersForProduct([], { productId: "m1", storeId: "S1" }), null);
  assert.equal(offersForProduct(null, {}), null);
});

if (failed) { console.log(`\n${failed} fallaron`); process.exit(1); }
console.log("\nTodo ok");

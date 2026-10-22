import assert from "node:assert/strict";
import { isOnOffer, offersFirst } from "./store-products-order.js";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("  ok ", name); } catch (e) { failed++; console.log("  FAIL", name, "\n    ", e.message); }
}
const TODAY = "2026-10-22";
const p = (id, price, extra = {}) => ({ id, price, compare_at_price: null, offer_expires_at: null, ...extra });

console.log("isOnOffer");
check("precio tachado mayor al precio => oferta", () => assert.equal(isOnOffer(p("a", 100, { compare_at_price: 150 }), TODAY), true));
check("sin precio tachado => no", () => assert.equal(isOnOffer(p("a", 100), TODAY), false));
check("precio tachado igual o menor => no", () => {
  assert.equal(isOnOffer(p("a", 100, { compare_at_price: 100 }), TODAY), false);
  assert.equal(isOnOffer(p("a", 100, { compare_at_price: 80 }), TODAY), false);
});
check("oferta vencida => no", () => assert.equal(isOnOffer(p("a", 100, { compare_at_price: 150, offer_expires_at: "2026-10-21" }), TODAY), false));
check("vence hoy => todavía vale", () => assert.equal(isOnOffer(p("a", 100, { compare_at_price: 150, offer_expires_at: TODAY }), TODAY), true));
check("sin producto => no explota", () => assert.equal(isOnOffer(null, TODAY), false));

console.log("offersFirst");
check("las ofertas van primero y cada grupo mantiene su orden", () => {
  const list = [p("1", 10), p("2", 10, { compare_at_price: 20 }), p("3", 10), p("4", 10, { compare_at_price: 30 }), p("5", 10)];
  assert.deepEqual(offersFirst(list, TODAY).map((x) => x.id), ["2", "4", "1", "3", "5"]);
});
check("una oferta vencida queda con el resto", () => {
  const list = [p("1", 10), p("2", 10, { compare_at_price: 20, offer_expires_at: "2026-01-01" }), p("3", 10, { compare_at_price: 20 })];
  assert.deepEqual(offersFirst(list, TODAY).map((x) => x.id), ["3", "1", "2"]);
});
check("sin ofertas no cambia nada; no toca la lista original", () => {
  const list = [p("1", 10), p("2", 10)];
  assert.deepEqual(offersFirst(list, TODAY).map((x) => x.id), ["1", "2"]);
  assert.notEqual(offersFirst(list, TODAY), list);
});
check("lista vacía o nula", () => {
  assert.deepEqual(offersFirst([], TODAY), []);
  assert.deepEqual(offersFirst(null, TODAY), []);
});

if (failed) { console.log(`${failed} test(s) fallaron`); process.exit(1); }
console.log("OK");

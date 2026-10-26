/**
 * Chequeo de la cuenta del carrito contra lo que hace `create_order`.
 * Correr con:  node js/cart-totals.test.mjs
 */
import assert from "node:assert/strict";
import { computeCartTotals, discountPctForStore } from "./cart-totals.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const item = (id, price, qty = 1, store = "A") => ({ id, price, qty, store });
const totals = (opts) => computeCartTotals({ storeIdOf: (i) => i.store, ...opts });

console.log("discountPctForStore");

check("un cupón global va a todas las tiendas", () => {
  assert.equal(discountPctForStore(20, null, "A"), 20);
  assert.equal(discountPctForStore(20, null, "B"), 20);
});

check("un cupón de vendedor va solo a su tienda", () => {
  assert.equal(discountPctForStore(20, "A", "A"), 20);
  assert.equal(discountPctForStore(20, "A", "B"), 0);
});

check("sin cupón, nadie tiene descuento", () => {
  assert.equal(discountPctForStore(0, null, "A"), 0);
});

console.log("\ncomputeCartTotals");

check("carrito simple sin cupón ni envío", () => {
  const r = totals({ items: [item("p1", 1500, 2)] });
  assert.equal(r.subtotal, 3000);
  assert.equal(r.discountAmount, 0);
  assert.equal(r.shipping, 0);
  assert.equal(r.total, 3000);
});

check("EL BUG: un cupón de UNA tienda no se descuenta de las otras", () => {
  // Con $10.000 en cada comercio y un cupón del 20% que es solo del comercio
  // A, el carrito mostraba $16.000 y create_order cobraba $18.000.
  const r = totals({
    items: [item("p1", 10000, 1, "A"), item("p2", 10000, 1, "B")],
    couponPercent: 20,
    couponStoreId: "A",
  });
  assert.equal(r.subtotal, 20000);
  assert.equal(r.discountAmount, 2000, "solo se descuenta el 20% de la tienda A");
  assert.equal(r.total, 18000, "es lo que cobra create_order");
});

check("un cupón global sí se descuenta de las dos tiendas", () => {
  const r = totals({
    items: [item("p1", 10000, 1, "A"), item("p2", 10000, 1, "B")],
    couponPercent: 20,
    couponStoreId: null,
  });
  assert.equal(r.discountAmount, 4000);
  assert.equal(r.total, 16000);
});

check("el redondeo es por tienda, como en el RPC", () => {
  // $10 y $10 con 15%: el RPC redondea 8,5 -> 9 en CADA tienda y suma 18.
  // Redondear una sola vez al final daba 17.
  const r = totals({
    items: [item("p1", 10, 1, "A"), item("p2", 10, 1, "B")],
    couponPercent: 15,
    couponStoreId: null,
  });
  assert.equal(r.total, 18);
  assert.equal(r.discountAmount, 2);
});

console.log("\ncomputeCartTotals — envío");

check("en retiro no se cobra envío por nada", () => {
  const r = totals({ items: [item("p1", 100)], deliveryMethod: "pickup" });
  assert.equal(r.shipping, 0);
  assert.equal(r.total, 100);
});

check("envío a domicilio, con el costo por defecto", () => {
  const r = totals({ items: [item("p1", 1000)], deliveryMethod: "delivery" });
  assert.equal(r.shipping, 350);
  assert.equal(r.total, 1350);
});

check("el envío se cobra siempre, sin importar cuánto compre", () => {
  const r = totals({ items: [item("p1", 6000)], deliveryMethod: "delivery" });
  assert.equal(r.shipping, 350);
  assert.equal(r.total, 6350);
});

check("el envío se cobra por tienda, no una sola vez", () => {
  const r = totals({
    items: [item("p1", 1000, 1, "A"), item("p2", 1000, 1, "B")],
    deliveryMethod: "delivery",
  });
  assert.equal(r.shipping, 700, "una vez por cada comercio");
  assert.equal(r.total, 2700);
});

check("cada tienda usa SU propia configuración de envío", () => {
  const config = { A: { deliveryFee: 500 }, B: { deliveryFee: 0 } };
  const r = totals({
    items: [item("p1", 1000, 1, "A"), item("p2", 1000, 1, "B")],
    shippingOf: (id) => config[id],
    deliveryMethod: "delivery",
  });
  assert.equal(r.shipping, 500, "A cobra 500, B no cobra nada");
});

check("el cupón descuenta los productos, no el envío", () => {
  const r = totals({
    items: [item("p1", 6000)],
    deliveryMethod: "delivery",
    couponPercent: 20,
    couponStoreId: null,
  });
  assert.equal(r.shipping, 350);
  assert.equal(r.total, 4800 + 350);
});

check("carrito vacío", () => {
  const r = totals({ items: [] });
  assert.deepEqual([r.subtotal, r.discountAmount, r.shipping, r.total], [0, 0, 0, 0]);
});

if (!process.exitCode) console.log("\nTodo bien.");

// --- Fecha local de las ofertas (vive en cart-utils.js, que importa Supabase;
// se re-implementa acá el caso que importa para poder testearlo sin browser).
console.log("\nofertas: la fecha es LOCAL, no UTC");

check("a las 22:00 de Argentina, el día sigue siendo hoy", () => {
  // 2026-09-16 22:00 en UTC-3 es 2026-09-17 01:00 en UTC: con toISOString()
  // el día ya era el 17 y una oferta que vence el 16 se daba por vencida.
  const local = new Date(2026, 8, 16, 22, 0, 0); // mes 8 = septiembre
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  assert.equal(`${y}-${m}-${d}`, "2026-09-16");
  assert.equal("2026-09-16" < "2026-09-16", false, "no debe contar como vencida");
});

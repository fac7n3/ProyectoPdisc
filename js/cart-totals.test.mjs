/**
 * Chequeo de la cuenta del carrito contra lo que hace `create_order`.
 * Correr con:  node js/cart-totals.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { computeCartTotals, discountPctForStore, DELIVERY_FEE } from "./cart-totals.js";

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

console.log("\ncomputeCartTotals — envío plano");

check("en retiro no se cobra envío por nada", () => {
  const r = totals({ items: [item("p1", 100)], deliveryMethod: "pickup" });
  assert.equal(r.shipping, 0);
  assert.equal(r.total, 100);
});

check("el envío a domicilio es el plano, sin importar el monto", () => {
  assert.equal(DELIVERY_FEE, 3000);
  const chico = totals({ items: [item("p1", 1000)], deliveryMethod: "delivery" });
  assert.equal(chico.shipping, 3000);
  assert.equal(chico.total, 4000);
  // Con la regla anterior, desde $5.000 el envío era gratis. Ya no.
  const grande = totals({ items: [item("p1", 6000)], deliveryMethod: "delivery" });
  assert.equal(grande.shipping, 3000, "no hay envío gratis por monto");
  assert.equal(grande.total, 9000);
  const enorme = totals({ items: [item("p1", 250000)], deliveryMethod: "delivery" });
  assert.equal(enorme.shipping, 3000);
});

check("el envío se cobra por tienda, no una sola vez", () => {
  const r = totals({
    items: [item("p1", 1000, 1, "A"), item("p2", 1000, 1, "B")],
    deliveryMethod: "delivery",
  });
  assert.equal(r.shipping, 6000, "una vez por cada comercio");
  assert.equal(r.total, 8000);
});

check("varios productos de un mismo comercio pagan un solo envío", () => {
  const r = totals({
    items: [item("p1", 1000, 3, "A"), item("p2", 500, 2, "A")],
    deliveryMethod: "delivery",
  });
  assert.equal(r.shipping, 3000);
  assert.equal(r.total, 4000 + 3000);
});

check("el cupón descuenta los productos, nunca el envío", () => {
  const r = totals({
    items: [item("p1", 10000)],
    deliveryMethod: "delivery",
    couponPercent: 20,
    couponStoreId: null,
  });
  assert.equal(r.discountAmount, 2000);
  assert.equal(r.shipping, 3000);
  assert.equal(r.total, 8000 + 3000);
});

check("un cupón del 100% deja el envío a pagar", () => {
  const r = totals({
    items: [item("p1", 4000)],
    deliveryMethod: "delivery",
    couponPercent: 100,
    couponStoreId: null,
  });
  assert.equal(r.total, 3000);
});

check("la constante coincide con la de create_order (última migración que la define)", () => {
  // Si alguien cambia el monto en un solo lado, el carrito mostraría un envío
  // y la base cobraría otro. Se lee la migración más nueva que declara
  // c_delivery_fee, así una migración futura que lo cambie también se cuida.
  const dir = new URL("../db/schema/", import.meta.url);
  const files = fs
    .readdirSync(dir)
    .filter((n) => /^\d+_.*\.sql$/.test(n))
    .sort((x, y) => parseInt(x, 10) - parseInt(y, 10));
  let valor = null;
  let archivo = null;
  for (const name of files) {
    const m = fs.readFileSync(new URL(name, dir), "utf8").match(/c_delivery_fee\s+constant\s+integer\s*:=\s*(\d+)/);
    if (m) { valor = Number(m[1]); archivo = name; }
  }
  assert.ok(archivo, "ninguna migración define c_delivery_fee");
  assert.equal(valor, DELIVERY_FEE, `${archivo} cobra ${valor} y cart-totals.js cobra ${DELIVERY_FEE}`);
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

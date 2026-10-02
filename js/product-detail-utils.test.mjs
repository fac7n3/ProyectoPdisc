/**
 * Chequeo del pedido del detalle de un producto (respaldo si falta la función
 * en la base + pedido adelantado).
 * Correr con:  node js/product-detail-utils.test.mjs
 *
 * Importa porque es el camino de cada click en un producto: si el respaldo
 * falla, apretar un producto muestra un error mientras la migración 118 no
 * esté aplicada; si el pedido adelantado se pasa de listo, muestra stock o
 * precios viejos.
 */
import assert from "node:assert/strict";
import { createProductDetailFetcher, isMissingFunctionError, PREFETCH_TTL_MS } from "./product-detail-utils.js";

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

/** Un RPC/legacy falso que cuenta llamadas y devuelve (o tira) lo que se le pida. */
function fake(result) {
  const calls = [];
  const fn = async (id) => {
    calls.push(id);
    if (typeof result === "function") return result(id);
    if (result instanceof Error) throw result;
    return result;
  };
  fn.calls = calls;
  return fn;
}

const missingFn = () => Object.assign(new Error("Could not find the function public.get_product_detail(p_product_id) in the schema cache"), { code: "PGRST202" });
const DETAIL = { id: "p1", title: "Remera", price: 1000 };

console.log("isMissingFunctionError");

await check("reconoce que la función no existe", () => {
  assert.equal(isMissingFunctionError({ code: "PGRST202" }), true);
  assert.equal(isMissingFunctionError({ code: "42883" }), true);
  assert.equal(isMissingFunctionError({ message: "Could not find the function public.x in the schema cache" }), true);
});

await check("no confunde otros errores con una función faltante", () => {
  // Si esto devolviera true, un corte de red se tomaría por "migración sin
  // aplicar" y se dejaría de usar el RPC para siempre.
  assert.equal(isMissingFunctionError(null), false);
  assert.equal(isMissingFunctionError(undefined), false);
  assert.equal(isMissingFunctionError({ code: "PGRST116" }), false);
  assert.equal(isMissingFunctionError({ code: "57014", message: "canceling statement due to statement timeout" }), false);
  assert.equal(isMissingFunctionError(new TypeError("Failed to fetch")), false);
});

console.log("fetch (camino normal)");

await check("devuelve el detalle del RPC y no toca el respaldo", async () => {
  const rpc = fake(DETAIL);
  const legacy = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy });
  assert.deepEqual(await f.fetch("p1"), DETAIL);
  assert.deepEqual(rpc.calls, ["p1"]);
  assert.deepEqual(legacy.calls, []);
});

await check("un producto que no existe o no se puede ver sale como 'no encontrado'", async () => {
  const rpc = fake(null);
  const legacy = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy });
  await assert.rejects(f.fetch("p1"), (err) => err.code === "PRODUCT_NOT_FOUND");
  // El RPC ya dijo que no: probar por la vía vieja daría lo mismo y duplicaría la espera.
  assert.deepEqual(legacy.calls, []);
});

await check("otro error del RPC se propaga sin caer al respaldo y se reintenta en el próximo click", async () => {
  const boom = Object.assign(new Error("Failed to fetch"), { code: undefined });
  let fail = true;
  const rpc = fake(() => { if (fail) throw boom; return DETAIL; });
  const legacy = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy });
  await assert.rejects(f.fetch("p1"), (err) => err === boom);
  assert.deepEqual(legacy.calls, []);
  fail = false;
  assert.deepEqual(await f.fetch("p1"), DETAIL);
  assert.equal(rpc.calls.length, 2);
});

console.log("fetch (la función todavía no está en la base)");

await check("cae al respaldo y se acuerda de no volver a probar el RPC", async () => {
  const rpc = fake(missingFn());
  const legacy = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy });
  assert.deepEqual(await f.fetch("p1"), DETAIL);
  assert.deepEqual(await f.fetch("p2"), DETAIL);
  assert.deepEqual(rpc.calls, ["p1"]); // un solo intento
  assert.deepEqual(legacy.calls, ["p1", "p2"]);
});

await check("el respaldo también devuelve 'no encontrado'", async () => {
  const f = createProductDetailFetcher({ rpc: fake(missingFn()), legacy: fake(null) });
  await assert.rejects(f.fetch("p1"), (err) => err.code === "PRODUCT_NOT_FOUND");
});

console.log("prefetch (pedido adelantado)");

await check("el click consume el pedido adelantado sin repetirlo", async () => {
  const rpc = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy: fake(null) });
  f.prefetch("p1");
  assert.deepEqual(await f.fetch("p1"), DETAIL);
  assert.deepEqual(rpc.calls, ["p1"]); // uno solo, no dos
});

await check("se consume UNA sola vez: abrir de nuevo pide datos frescos", async () => {
  const rpc = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy: fake(null) });
  f.prefetch("p1");
  await f.fetch("p1");
  await f.fetch("p1");
  assert.deepEqual(rpc.calls, ["p1", "p1"]);
});

await check("pasar el mouse dos veces por la misma tarjeta no duplica el pedido", async () => {
  const rpc = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy: fake(null) });
  f.prefetch("p1");
  f.prefetch("p1");
  await f.fetch("p1");
  assert.deepEqual(rpc.calls, ["p1"]);
});

await check("un pedido adelantado vencido se descarta (nada de stock o precio viejo)", async () => {
  let t = 1000;
  const rpc = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy: fake(null), now: () => t });
  f.prefetch("p1");
  t += PREFETCH_TTL_MS + 1;
  await f.fetch("p1");
  assert.deepEqual(rpc.calls, ["p1", "p1"]);
});

await check("justo antes de vencer todavía se usa", async () => {
  let t = 1000;
  const rpc = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy: fake(null), now: () => t });
  f.prefetch("p1");
  t += PREFETCH_TTL_MS - 1;
  await f.fetch("p1");
  assert.deepEqual(rpc.calls, ["p1"]);
});

await check("un pedido adelantado que falla no queda pegado: el click lo reintenta", async () => {
  let fail = true;
  const rpc = fake(() => { if (fail) throw new Error("Failed to fetch"); return DETAIL; });
  const f = createProductDetailFetcher({ rpc, legacy: fake(null) });
  f.prefetch("p1"); // falla en segundo plano, sin nadie esperando (no debe tirar el proceso)
  await new Promise((resolve) => setTimeout(resolve, 0));
  fail = false;
  assert.deepEqual(await f.fetch("p1"), DETAIL);
  assert.equal(rpc.calls.length, 2);
});

await check("un click que llega con el pedido adelantado todavía en vuelo usa ese mismo pedido", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const rpc = fake(async () => { await gate; return DETAIL; });
  const f = createProductDetailFetcher({ rpc, legacy: fake(null) });
  f.prefetch("p1");
  const clicked = f.fetch("p1");
  release();
  assert.deepEqual(await clicked, DETAIL);
  assert.equal(rpc.calls.length, 1);
});

await check("productos distintos no se pisan", async () => {
  const rpc = fake((id) => ({ id }));
  const f = createProductDetailFetcher({ rpc, legacy: fake(null) });
  f.prefetch("a");
  f.prefetch("b");
  assert.deepEqual(await f.fetch("b"), { id: "b" });
  assert.deepEqual(await f.fetch("a"), { id: "a" });
  assert.deepEqual(rpc.calls.sort(), ["a", "b"]);
});

await check("sin la función en la base NO se adelanta por la vía pesada, y el click igual funciona", async () => {
  // Si el pedido adelantado cayera al respaldo, pasar el mouse por 10 tarjetas
  // dispararía 10 consultas de ~1 s de base: lo opuesto de lo que se busca.
  const rpc = fake(missingFn());
  const legacy = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy });
  f.prefetch("p1");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(legacy.calls, []);
  assert.deepEqual(await f.fetch("p1"), DETAIL); // el click sí usa el respaldo
  assert.deepEqual(legacy.calls, ["p1"]);
});

await check("una vez que se sabe que la función falta, adelantarse no hace ningún pedido", async () => {
  const rpc = fake(missingFn());
  const legacy = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy });
  await f.fetch("p1"); // descubre que falta
  f.prefetch("p2");
  f.prefetch("p3");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(rpc.calls, ["p1"]);
  assert.deepEqual(legacy.calls, ["p1"]);
});

await check("prefetch sin id no hace nada", async () => {
  const rpc = fake(DETAIL);
  const f = createProductDetailFetcher({ rpc, legacy: fake(null) });
  f.prefetch("");
  f.prefetch(undefined);
  assert.deepEqual(rpc.calls, []);
});

if (!process.exitCode) console.log("\nTodo bien.");

/**
 * Chequeo de los mensajes de error que ve la persona: nunca códigos, nombres de
 * campos ni textos en inglés de Postgres/Supabase.
 * Correr con:  node js/friendly-error.test.mjs
 */
import assert from "node:assert/strict";
import { friendlyError, friendlyFunctionError, isHumanMessage } from "./friendly-error.js";

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const FALLBACK = "No se pudo guardar. Probá de nuevo.";

console.log("friendlyError");

await check("deja pasar una excepción nuestra en español", () => {
  const msg = "Ya tenés el Combo Barrio activo hasta el 20/11. Cuando termine podés elegir otro.";
  assert.equal(friendlyError({ code: "23505", message: msg }, FALLBACK), msg);
});

await check("no muestra mensajes de Postgres en inglés", () => {
  for (const message of [
    'duplicate key value violates unique constraint "coupons_code_key"',
    'new row violates row-level security policy for table "products"',
    'null value in column "price" of relation "products" violates not-null constraint',
    "permission denied for table orders",
    'invalid input syntax for type uuid: "abc"',
    "JWT expired",
    "Edge Function returned a non-2xx status code",
  ]) {
    assert.equal(friendlyError({ message }, FALLBACK), FALLBACK, message);
  }
});

await check("no muestra nombres de campos ni códigos sueltos", () => {
  for (const message of ["order_ids requerido.", "tiene_tienda", "42501", "PGRST301", "store_id inválido."]) {
    assert.equal(friendlyError({ message }, FALLBACK), FALLBACK, message);
  }
});

await check("un código conocido se explica en español", () => {
  assert.equal(friendlyError({ code: "42501", message: "permission denied for table x" }, FALLBACK), "No tenés permiso para hacer esto.");
  assert.equal(friendlyError({ code: "23505", message: "duplicate key value" }, FALLBACK), "Ese dato ya existe.");
  assert.equal(friendlyError({ code: "PGRST301", message: "JWT expired" }, FALLBACK), "Tu sesión venció. Volvé a iniciar sesión.");
});

await check("falla de red -> mensaje de conexión", () => {
  assert.match(friendlyError(new TypeError("Failed to fetch"), FALLBACK), /conexión/);
});

await check("demasiados intentos (429)", () => {
  assert.match(friendlyError({ status: 429, message: "email rate limit exceeded" }, FALLBACK), /Demasiados intentos/);
});

await check("sin nada utilizable -> el respaldo", () => {
  assert.equal(friendlyError(null, FALLBACK), FALLBACK);
  assert.equal(friendlyError({}, FALLBACK), FALLBACK);
  assert.equal(friendlyError("", FALLBACK), FALLBACK);
  assert.equal(friendlyError({ message: "[object Object]" }, FALLBACK), FALLBACK);
});

console.log("isHumanMessage");

await check("distingue frases de personas de textos técnicos", () => {
  assert.equal(isHumanMessage("No tenés permiso para publicar productos."), true);
  assert.equal(isHumanMessage("Elegí una categoría."), true);
  assert.equal(isHumanMessage("violates check constraint"), false);
  assert.equal(isHumanMessage("order_ids requerido."), false);
});

console.log("friendlyFunctionError");

await check("lee el motivo del cuerpo de un 4xx (data null + error.context)", async () => {
  const error = {
    message: "Edge Function returned a non-2xx status code",
    context: { json: async () => ({ error: "Este comercio todavía no tiene Mercado Pago vinculado." }) },
  };
  assert.equal(await friendlyFunctionError(error, null, FALLBACK), "Este comercio todavía no tiene Mercado Pago vinculado.");
});

await check("prefiere `message` sobre un `error` que es un código", async () => {
  const error = {
    context: { json: async () => ({ error: "tiene_tienda", message: "Tenés un comercio activo (Panadería). Escribinos desde Soporte." }) },
  };
  assert.match(await friendlyFunctionError(error, null, FALLBACK), /Tenés un comercio activo/);
});

await check("si el cuerpo no se puede leer o es técnico, usa el respaldo", async () => {
  const broken = { message: "Edge Function returned a non-2xx status code", context: { json: async () => { throw new Error("no json"); } } };
  assert.equal(await friendlyFunctionError(broken, null, FALLBACK), FALLBACK);
  assert.equal(await friendlyFunctionError(null, { error: "plan_id inválido." }, FALLBACK), FALLBACK);
});

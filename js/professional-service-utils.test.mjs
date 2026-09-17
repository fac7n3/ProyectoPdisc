import assert from "node:assert/strict";
import {
  PRICE_TYPES,
  formatTarifa,
  parsePrecio,
  validarServicio,
} from "./professional-service-utils.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

console.log("formatTarifa");
check("precio fijo va solo con el monto", () => {
  assert.equal(formatTarifa({ price_type: "fixed", price_pesos: 25000 }), "$25.000");
});

check("'desde' antepone la palabra", () => {
  assert.equal(formatTarifa({ price_type: "from", price_pesos: 25000 }), "Desde $25.000");
});

check("'a convenir' no muestra número", () => {
  assert.equal(formatTarifa({ price_type: "quote", price_pesos: null }), "A convenir");
});

check("un precio roto cae en 'A convenir' en vez de mostrar $0", () => {
  assert.equal(formatTarifa({ price_type: "fixed", price_pesos: null }), "A convenir");
  assert.equal(formatTarifa({ price_type: "fixed", price_pesos: 0 }), "A convenir");
  assert.equal(formatTarifa({}), "A convenir");
  assert.equal(formatTarifa(null), "A convenir");
});

console.log("parsePrecio");
check("acepta lo que la gente realmente tipea", () => {
  assert.equal(parsePrecio("25.000"), 25000);
  assert.equal(parsePrecio("$ 25.000"), 25000);
  assert.equal(parsePrecio("25000"), 25000);
});

check("sin dígitos devuelve null", () => {
  assert.equal(parsePrecio(""), null);
  assert.equal(parsePrecio("a convenir"), null);
  assert.equal(parsePrecio(null), null);
});

console.log("validarServicio");
const ok = { title: "Destapación de cloacas", price_type: "from", price_pesos: 25000 };

check("un servicio bien cargado no da error", () => {
  assert.equal(validarServicio(ok), null);
  assert.equal(validarServicio({ title: "Presupuesto", price_type: "quote" }), null);
});

check("exige un nombre de 3 a 100", () => {
  assert.ok(validarServicio({ ...ok, title: "ab" }));
  assert.ok(validarServicio({ ...ok, title: "x".repeat(101) }));
  assert.ok(validarServicio({ ...ok, title: "   " }));
});

check("exige elegir cómo se muestra el precio", () => {
  assert.ok(validarServicio({ ...ok, price_type: undefined }));
  assert.ok(validarServicio({ ...ok, price_type: "gratis" }));
});

check("con precio fijo o 'desde' exige un monto positivo", () => {
  assert.ok(validarServicio({ ...ok, price_pesos: 0 }));
  assert.ok(validarServicio({ ...ok, price_pesos: null }));
  assert.ok(validarServicio({ ...ok, price_pesos: -5 }));
});

check("'a convenir' no necesita monto", () => {
  assert.equal(validarServicio({ title: "Arreglos varios", price_type: "quote", price_pesos: null }), null);
});

check("los tres tipos de precio están declarados", () => {
  assert.deepEqual(PRICE_TYPES.map((t) => t.value), ["fixed", "from", "quote"]);
  assert.ok(PRICE_TYPES.every((t) => typeof t.label === "string" && t.label));
});

if (!process.exitCode) console.log("\nTodo bien.");

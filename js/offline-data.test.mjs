/**
 * Tests de la copia guardada de datos (js/offline-data.js).
 * Correr con:  node js/offline-data.test.mjs
 */
import assert from "node:assert/strict";
import {
  saveSnapshot, readSnapshot, loadWithSnapshot, describeSavedAt, snapshotNotice,
} from "./offline-data.js";

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

/** localStorage de mentira (con opción de que falle). */
function fakeStorage({ failWrites = false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failWrites) throw new Error("QuotaExceededError"); m.set(k, String(v)); },
    raw: m,
  };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const SHIFTS = [{ id: 1, pharmacies: { name: "Farmacia Central" } }];

console.log("guardar y leer");

await check("lo que se guarda se lee igual, con su fecha", () => {
  const storage = fakeStorage();
  assert.equal(saveSnapshot("farmacias", SHIFTS, { storage, now: 1000 }), true);
  assert.deepEqual(readSnapshot("farmacias", { storage }), { data: SHIFTS, savedAt: 1000 });
});

await check("sin nada guardado devuelve null", () => {
  assert.equal(readSnapshot("farmacias", { storage: fakeStorage() }), null);
});

await check("una copia rota o de otra versión se ignora (no tira)", () => {
  const storage = fakeStorage();
  storage.raw.set("bl_offline_a", "{no es json");
  storage.raw.set("bl_offline_b", JSON.stringify({ v: 99, savedAt: 1, data: [] }));
  storage.raw.set("bl_offline_c", JSON.stringify({ v: 1, savedAt: "ayer", data: [] }));
  storage.raw.set("bl_offline_d", JSON.stringify({ v: 1, savedAt: 1 }));
  for (const k of ["a", "b", "c", "d"]) assert.equal(readSnapshot(k, { storage }), null, k);
});

await check("sin lugar o sin almacenamiento no tira: devuelve false / null", () => {
  assert.equal(saveSnapshot("x", [], { storage: fakeStorage({ failWrites: true }) }), false);
  assert.equal(saveSnapshot("x", [], { storage: null }), false);
  assert.equal(readSnapshot("x", { storage: null }), null);
});

await check("una lista vacía se guarda: es un dato válido (el admin la vació)", () => {
  const storage = fakeStorage();
  saveSnapshot("servicios", [], { storage, now: 5 });
  assert.deepEqual(readSnapshot("servicios", { storage }), { data: [], savedAt: 5 });
});

console.log("\ncargar con respaldo");

/** Corre loadWithSnapshot y anota cada llamada. */
function run(opts) {
  const calls = [];
  const fails = [];
  const promise = loadWithSnapshot({
    key: "farmacias",
    onData: (data, info) => calls.push({ data, ...info }),
    onFail: (e) => fails.push(e),
    now: () => 2000,
    ...opts,
  });
  return { calls, fails, promise };
}

await check("con red: pinta lo fresco una sola vez y lo guarda para la próxima", async () => {
  const storage = fakeStorage();
  const r = run({ storage, fetcher: async () => ({ data: SHIFTS, error: null }) });
  await r.promise;
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].fromSnapshot, false);
  assert.deepEqual(readSnapshot("farmacias", { storage }), { data: SHIFTS, savedAt: 2000 });
});

await check("sin conexión (el aparato lo dice): pinta la copia al toque, sin esperar a la red", async () => {
  const storage = fakeStorage();
  saveSnapshot("farmacias", SHIFTS, { storage, now: 1000 });
  let release;
  const r = run({
    storage, isOnline: () => false,
    fetcher: () => new Promise((res) => { release = res; }),
  });
  await tick();
  assert.equal(r.calls.length, 1, "ya se pintó con la red todavía pendiente");
  assert.deepEqual({ fromSnapshot: r.calls[0].fromSnapshot, reason: r.calls[0].reason, savedAt: r.calls[0].savedAt },
    { fromSnapshot: true, reason: "offline", savedAt: 1000 });
  release({ data: null, error: { message: "Failed to fetch" } });
  await r.promise;
  assert.equal(r.calls.length, 1, "y no se vuelve a pintar");
  assert.equal(r.fails.length, 0);
});

await check("la red falla y hay copia: usa la copia (reason 'error')", async () => {
  const storage = fakeStorage();
  saveSnapshot("farmacias", SHIFTS, { storage, now: 1000 });
  const r = run({ storage, fetcher: async () => ({ data: null, error: { message: "Failed to fetch" } }) });
  await r.promise;
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].reason, "error");
  assert.deepEqual(r.calls[0].data, SHIFTS);
  assert.equal(r.fails.length, 0);
});

await check("el pedido tira una excepción y hay copia: usa la copia", async () => {
  const storage = fakeStorage();
  saveSnapshot("farmacias", SHIFTS, { storage, now: 1000 });
  const r = run({ storage, fetcher: async () => { throw new TypeError("Failed to fetch"); } });
  await r.promise;
  assert.equal(r.calls[0].fromSnapshot, true);
});

await check("la red falla y NO hay copia: avisa el fallo, no pinta nada", async () => {
  const error = { message: "Failed to fetch" };
  const r = run({ storage: fakeStorage(), fetcher: async () => ({ data: null, error }) });
  await r.promise;
  assert.equal(r.calls.length, 0);
  assert.deepEqual(r.fails, [error]);
});

await check("señal lenta: pinta la copia a los slowAfterMs y, si después llega lo fresco, lo reemplaza", async () => {
  const storage = fakeStorage();
  saveSnapshot("farmacias", SHIFTS, { storage, now: 1000 });
  const fresh = [{ id: 2, pharmacies: { name: "Farmacia Nueva" } }];
  let release;
  const r = run({
    storage, slowAfterMs: 20,
    fetcher: () => new Promise((res) => { release = res; }),
  });
  await tick(60);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].reason, "slow");
  release({ data: fresh, error: null });
  await r.promise;
  assert.equal(r.calls.length, 2);
  assert.equal(r.calls[1].fromSnapshot, false);
  assert.deepEqual(r.calls[1].data, fresh);
  assert.deepEqual(readSnapshot("farmacias", { storage }).data, fresh, "la copia quedó actualizada");
});

await check("si la red contesta antes de slowAfterMs, la copia nunca se pinta", async () => {
  const storage = fakeStorage();
  saveSnapshot("farmacias", SHIFTS, { storage, now: 1000 });
  const r = run({ storage, slowAfterMs: 30, fetcher: async () => ({ data: [], error: null }) });
  await r.promise;
  await tick(60);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].fromSnapshot, false);
});

await check("una respuesta fresca vacía pisa la copia (si el admin vació la lista, no se muestra la vieja)", async () => {
  const storage = fakeStorage();
  saveSnapshot("servicios", [{ id: 1 }], { storage, now: 1000 });
  const r = run({ key: "servicios", storage, fetcher: async () => ({ data: [], error: null }) });
  await r.promise;
  assert.deepEqual(r.calls[0].data, []);
  assert.deepEqual(readSnapshot("servicios", { storage }).data, []);
});

await check("un error de la red NO borra la copia guardada", async () => {
  const storage = fakeStorage();
  saveSnapshot("farmacias", SHIFTS, { storage, now: 1000 });
  await run({ storage, fetcher: async () => ({ data: null, error: { message: "x" } }) }).promise;
  assert.deepEqual(readSnapshot("farmacias", { storage }).data, SHIFTS);
});

await check("sin almacenamiento igual muestra lo fresco (solo no puede guardar)", async () => {
  const r = run({ storage: null, fetcher: async () => ({ data: SHIFTS, error: null }) });
  await r.promise;
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].fromSnapshot, false);
});

console.log("\ntextos");

await check("describeSavedAt: hoy con hora; otro día con fecha", () => {
  const now = new Date(2026, 10, 19, 18, 0).getTime();
  assert.equal(describeSavedAt(new Date(2026, 10, 19, 9, 5).getTime(), now), "hoy a las 09:05");
  assert.equal(describeSavedAt(new Date(2026, 10, 18, 23, 59).getTime(), now), "el 18 de noviembre");
  assert.equal(describeSavedAt(new Date(2026, 0, 3, 12, 0).getTime(), now), "el 3 de enero");
});

await check("snapshotNotice: distingue sin conexión de señal lenta y dice de cuándo es", () => {
  const now = new Date(2026, 10, 19, 18, 0).getTime();
  const savedAt = new Date(2026, 10, 18, 10, 0).getTime();
  const off = snapshotNotice({ savedAt, reason: "offline" }, "los turnos", now);
  assert.match(off, /^Sin conexión\./);
  assert.match(off, /los turnos que guardamos el 18 de noviembre/);
  assert.match(off, /pueden haber cambiado/);
  assert.equal(snapshotNotice({ savedAt, reason: "error" }, "los turnos", now), off);
  const slow = snapshotNotice({ savedAt, reason: "slow" }, "los números", now);
  assert.match(slow, /^La conexión está lenta\./);
  assert.match(slow, /los números que guardamos el 18 de noviembre/);
});

if (process.exitCode) {
  console.error("\nHay fallas.");
} else {
  console.log("\nTodo bien.");
}

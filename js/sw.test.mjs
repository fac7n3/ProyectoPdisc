/**
 * Tests del service worker (public/sw.js), corriéndolo en una caja de arena
 * con caches/fetch simulados.
 * Correr con:  node js/sw.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "public/sw.js"), "utf8");
const ORIGIN = "https://proyectopdisc.vercel.app";
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Arma un service worker nuevo con su caché y su red simuladas. */
function makeWorker({ network = {}, cached = {}, otherCaches = [] } = {}) {
  const store = new Map(); // nombre de caché -> Map(url -> respuesta)
  const listeners = {};
  const fetched = [];
  const response = (body, { status = 200, type = "basic" } = {}) => ({
    body, status, ok: status >= 200 && status < 300, type, clone() { return this; },
  });
  const openCache = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      put: async (req, res) => { m.delete(req.url); m.set(req.url, res); },
      match: async (req) => m.get(req.url),
      keys: async () => [...m.keys()].map((url) => ({ url })),
      delete: async (req) => m.delete(req.url),
    };
  };
  for (const name of otherCaches) openCache(name);
  const ctx = {
    URL,
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: {
      open: async (name) => openCache(name),
      keys: async () => [...store.keys()],
      delete: async (name) => store.delete(name),
      match: async (req) => {
        for (const m of store.values()) if (m.has(req.url)) return m.get(req.url);
        return undefined;
      },
    },
    fetch: async (req) => {
      fetched.push(req.url);
      const spec = network[req.url];
      if (spec === undefined || spec === "offline") throw new TypeError("Failed to fetch");
      return response(spec.body, spec);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const cacheName = source.match(/const CACHE_NAME = '([^']+)'/)[1];
  const seed = openCache(cacheName);
  for (const [url, body] of Object.entries(cached)) seed.put({ url }, response(body));

  const request = (p, { mode = "no-cors", method = "GET", range = false } = {}) => ({
    url: p.startsWith("http") ? p : ORIGIN + p, mode, method,
    headers: { has: (h) => range && h.toLowerCase() === "range" },
  });
  async function dispatch(p, opts) {
    let responded = null;
    const waits = [];
    listeners.fetch({
      request: request(p, opts),
      respondWith: (pr) => { responded = pr; },
      waitUntil: (pr) => waits.push(pr),
    });
    const res = responded ? await responded : undefined;
    await Promise.all(waits);
    await tick(); await tick();
    return res;
  }
  async function activate() {
    let done;
    listeners.activate({ waitUntil: (pr) => { done = pr; } });
    await done;
  }
  return { dispatch, activate, store, fetched, cacheName, entries: () => [...(store.get(cacheName)?.keys() || [])] };
}

console.log("service worker");

await check("al activarse borra las cachés de versiones anteriores (la v1 acumulada)", async () => {
  const w = makeWorker({ otherCaches: ["baradero-local-v1"] });
  await w.activate();
  assert.deepEqual([...w.store.keys()], [w.cacheName]);
});

await check("no intercepta otros dominios, ni POST, ni pedidos parciales (Range)", async () => {
  const w = makeWorker();
  assert.equal(await w.dispatch("https://otzhdwuaffcplrveuadc.supabase.co/rest/v1/products"), undefined);
  assert.equal(await w.dispatch("/assets/a-1.js", { method: "POST" }), undefined);
  assert.equal(await w.dispatch("/img/video.webp", { range: true }), undefined);
  assert.equal(w.fetched.length, 0);
});

await check("un 404 o un 500 no se guarda", async () => {
  const w = makeWorker({ network: {
    [`${ORIGIN}/assets/falta-1.js`]: { status: 404, body: "no" },
    [`${ORIGIN}/pages/home.html`]: { status: 500, body: "error" },
  } });
  await w.dispatch("/assets/falta-1.js");
  await w.dispatch("/pages/home.html", { mode: "navigate" });
  assert.deepEqual(w.entries(), []);
});

await check("/assets/ (con hash): si está guardado no va a la red", async () => {
  const w = makeWorker({ cached: { [`${ORIGIN}/assets/home-abc.js`]: "viejo" } });
  const res = await w.dispatch("/assets/home-abc.js");
  assert.equal(res.body, "viejo");
  assert.equal(w.fetched.length, 0);
});

await check("/img/ (sin hash): responde lo guardado y lo actualiza en segundo plano", async () => {
  const url = `${ORIGIN}/img/productos/pan.webp`;
  const w = makeWorker({ cached: { [url]: "foto vieja" }, network: { [url]: { body: "foto nueva" } } });
  const first = await w.dispatch("/img/productos/pan.webp");
  assert.equal(first.body, "foto vieja", "responde al toque con lo guardado");
  assert.deepEqual(w.fetched, [url], "y pide la nueva atrás");
  const second = await w.dispatch("/img/productos/pan.webp");
  assert.equal(second.body, "foto nueva", "la próxima vez ya está la nueva");
});

await check("/img/ sin conexión: sigue mostrando lo guardado", async () => {
  const url = `${ORIGIN}/img/promos/a.webp`;
  const w = makeWorker({ cached: { [url]: "guardada" }, network: { [url]: "offline" } });
  const res = await w.dispatch("/img/promos/a.webp");
  assert.equal(res.body, "guardada");
});

await check("páginas: red primero y, sin conexión, la copia guardada", async () => {
  const url = `${ORIGIN}/pages/home.html`;
  const online = makeWorker({ network: { [url]: { body: "fresca" } }, cached: { [url]: "vieja" } });
  assert.equal((await online.dispatch("/pages/home.html", { mode: "navigate" })).body, "fresca");
  const offline = makeWorker({ network: { [url]: "offline" }, cached: { [url]: "vieja" } });
  assert.equal((await offline.dispatch("/pages/home.html", { mode: "navigate" })).body, "vieja");
});

await check("la caché no pasa del tope: se van las entradas más viejas", async () => {
  const max = Number(source.match(/const MAX_ENTRIES = (\d+)/)[1]);
  const network = {};
  for (let i = 0; i < max + 5; i++) network[`${ORIGIN}/assets/f-${i}.js`] = { body: String(i) };
  const w = makeWorker({ network });
  for (let i = 0; i < max + 5; i++) await w.dispatch(`/assets/f-${i}.js`);
  const entries = w.entries();
  assert.equal(entries.length, max);
  assert.ok(!entries.includes(`${ORIGIN}/assets/f-0.js`), "la primera se borró");
  assert.ok(entries.includes(`${ORIGIN}/assets/f-${max + 4}.js`), "la última quedó");
});

if (process.exitCode) {
  console.error("\nHay fallas.");
} else {
  console.log("\nTodo bien.");
}

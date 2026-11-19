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

/**
 * Arma un service worker nuevo con su caché y su red simuladas.
 * `network`: url -> { body, status } | "offline" (falla) | "hang" (no contesta nunca).
 * `fastTimers`: los setTimeout del worker (el de "red lenta") saltan enseguida.
 * `varyOrigin`: el servidor responde `Vary: Origin` y los pedidos de la página lo mandan, pero lo
 *   guardado por el worker no: sin `ignoreVary` en el match no se encuentra nada (pasó de verdad).
 */
function makeWorker({ network = {}, cached = {}, otherCaches = [], fastTimers = false, varyOrigin = false } = {}) {
  const store = new Map(); // nombre de caché -> Map(url -> respuesta)
  const listeners = {};
  const fetched = [];
  const keyOf = (req) => (typeof req === "string" ? req : req.url);
  const noSearch = (u) => { const x = new URL(u); return x.origin + x.pathname; };
  const find = (m, req, opts) => {
    if (varyOrigin && !opts?.ignoreVary) return undefined;
    const key = keyOf(req);
    if (m.has(key)) return m.get(key);
    if (opts?.ignoreSearch) {
      for (const [k, v] of m) if (noSearch(k) === noSearch(key)) return v;
    }
    return undefined;
  };
  const response = (body, { status = 200, type = "basic" } = {}) => ({
    body, status, ok: status >= 200 && status < 300, type, clone() { return this; }, text: async () => body,
  });
  class FakeResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.headers = init.headers || {};
      this.ok = this.status >= 200 && this.status < 300;
      this.type = "default";
    }
    clone() { return this; }
    async text() { return this.body; }
  }
  const openCache = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      put: async (req, res) => { m.delete(keyOf(req)); m.set(keyOf(req), res); },
      match: async (req, opts) => find(m, req, opts),
      keys: async () => [...m.keys()].map((url) => ({ url })),
      delete: async (req) => m.delete(keyOf(req)),
    };
  };
  for (const name of otherCaches) openCache(name);
  const ctx = {
    URL,
    Response: FakeResponse,
    setTimeout: fastTimers ? (fn) => setTimeout(fn, 0) : setTimeout,
    clearTimeout,
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
      match: async (req, opts) => {
        for (const m of store.values()) {
          const hit = find(m, req, opts);
          if (hit) return hit;
        }
        return undefined;
      },
    },
    fetch: async (req) => {
      const url = keyOf(req);
      fetched.push(url);
      const spec = network[url];
      if (spec === "hang") return new Promise(() => {});
      if (spec === undefined || spec === "offline") throw new TypeError("Failed to fetch");
      return response(spec.body, spec);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const cacheName = source.match(/const CACHE_NAME = '([^']+)'/)[1];
  const offlineCacheName = source.match(/const OFFLINE_CACHE = '([^']+)'/)[1];
  const seed = openCache(cacheName);
  for (const [url, body] of Object.entries(cached)) seed.put({ url }, response(body));
  const seedOffline = (files) => {
    const c = openCache(offlineCacheName);
    for (const [url, body] of Object.entries(files)) c.put({ url }, response(body));
  };

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
    // Como en el navegador, la respuesta no espera al trabajo en segundo plano (que puede quedar colgado).
    await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 30))]);
    await tick(); await tick();
    return res;
  }
  async function activate() {
    let done;
    listeners.activate({ waitUntil: (pr) => { done = pr; } });
    await done;
  }
  /** Le manda al worker el mensaje de la página y espera a que termine de guardar. */
  async function message(data) {
    const waits = [];
    listeners.message({ data, waitUntil: (pr) => waits.push(pr) });
    await Promise.all(waits);
  }
  const entriesOf = (name) => [...(store.get(name)?.keys() || [])];
  return {
    dispatch, activate, message, store, fetched, cacheName, offlineCacheName, seedOffline,
    entries: () => entriesOf(cacheName),
    offlineEntries: () => entriesOf(offlineCacheName),
  };
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

console.log("\nsin conexión (farmacias de turno y emergencias)");

const page = (...refs) => `<html><head>${refs.join("")}</head><body></body></html>`;
const script = (u) => `<script type="module" src="${u}"></script>`;
const sheet = (u) => `<link rel="stylesheet" href="${u}">`;
const ok = (body) => ({ body });

/** Red de un sitio chico con las tres páginas esenciales y sus archivos. */
function siteNetwork(extra = {}) {
  return {
    [`${ORIGIN}/pages/home.html`]: ok(page(script("/assets/home-1.js"), sheet("/assets/home-1.css"))),
    [`${ORIGIN}/pages/farmacias.html`]: ok(page(
      script("/assets/farmacias-1.js"),
      '<link rel="modulepreload" href="/assets/auth-utils-1.js">',
      sheet("/vendor/fontawesome/css/all.min.css?v=2"),
      sheet("/assets/home-1.css"),
      '<img src="/assets/logo-1.png">',
      '<script src="https://cdn.ejemplo.com/x.js"></script>',
    )),
    [`${ORIGIN}/pages/servicios.html`]: ok(page(script("/assets/servicios-1.js"), sheet("/assets/home-1.css"))),
    [`${ORIGIN}/assets/home-1.js`]: ok("js"),
    [`${ORIGIN}/assets/home-1.css`]: ok("@font-face{src:url(/assets/inter-1.woff2)} .a{background:url(data:image/png;base64,AAA)}"),
    [`${ORIGIN}/assets/farmacias-1.js`]: ok("js"),
    [`${ORIGIN}/assets/auth-utils-1.js`]: ok("js"),
    [`${ORIGIN}/assets/servicios-1.js`]: ok("js"),
    [`${ORIGIN}/assets/logo-1.png`]: ok("png"),
    [`${ORIGIN}/assets/inter-1.woff2`]: ok("font"),
    [`${ORIGIN}/vendor/fontawesome/css/all.min.css?v=2`]: ok("@font-face{src:url(../webfonts/fa-solid-900.woff2) format('woff2'),url(../webfonts/fa-solid-900.ttf)}"),
    [`${ORIGIN}/vendor/fontawesome/webfonts/fa-solid-900.woff2`]: ok("fa"),
    ...extra,
  };
}

await check("con un servidor que responde `Vary: Origin` lo guardado igual se encuentra (sin conexión)", async () => {
  const net = siteNetwork();
  for (const k of Object.keys(net)) net[k] = "offline";
  const off = makeWorker({ varyOrigin: true, network: net });
  off.seedOffline({
    [`${ORIGIN}/pages/farmacias.html`]: "pagina",
    [`${ORIGIN}/assets/farmacias-1.js`]: "script",
    [`${ORIGIN}/img/promos/a.webp`]: "foto",
  });
  assert.equal((await off.dispatch("/pages/farmacias.html", { mode: "navigate" })).body, "pagina");
  assert.equal((await off.dispatch("/assets/farmacias-1.js")).body, "script", "asset con hash");
  assert.equal((await off.dispatch("/img/promos/a.webp")).body, "foto", "imagen sin hash");
});

await check("al activarse conserva la caché de las páginas esenciales y borra las demás", async () => {
  const w = makeWorker({ otherCaches: ["baradero-local-v2", "otra"] });
  w.seedOffline({ [`${ORIGIN}/pages/farmacias.html`]: "guardada" });
  await w.activate();
  assert.deepEqual([...w.store.keys()].sort(), [w.cacheName, w.offlineCacheName].sort());
  assert.deepEqual(w.offlineEntries(), [`${ORIGIN}/pages/farmacias.html`], "no se tocó lo guardado");
});

await check("una página esencial se guarda aparte y sin parámetros (utm, etc.)", async () => {
  const w = makeWorker({ network: siteNetwork({ [`${ORIGIN}/pages/farmacias.html?utm_source=wsp`]: ok("html") }) });
  await w.dispatch("/pages/farmacias.html?utm_source=wsp", { mode: "navigate" });
  assert.deepEqual(w.offlineEntries(), [`${ORIGIN}/pages/farmacias.html`]);
  assert.deepEqual(w.entries(), [], "no ocupa lugar en la caché con tope");
  // Sin conexión, la misma página con OTRO parámetro encuentra la copia.
  const off = makeWorker({ network: {} });
  off.seedOffline({ [`${ORIGIN}/pages/farmacias.html`]: "guardada" });
  assert.equal((await off.dispatch("/pages/farmacias.html?otra=1", { mode: "navigate" })).body, "guardada");
});

await check("llenar la caché de fotos y archivos NO borra las páginas esenciales", async () => {
  const max = Number(source.match(/const MAX_ENTRIES = (\d+)/)[1]);
  const network = {};
  for (let i = 0; i < max + 20; i++) network[`${ORIGIN}/img/productos/p-${i}.webp`] = { body: String(i) };
  const w = makeWorker({ network });
  w.seedOffline({ [`${ORIGIN}/pages/servicios.html`]: "html", [`${ORIGIN}/assets/servicios-1.js`]: "js" });
  for (let i = 0; i < max + 20; i++) await w.dispatch(`/img/productos/p-${i}.webp`);
  assert.equal(w.entries().length, max);
  assert.equal(w.offlineEntries().length, 2);
});

await check("el mensaje de la página guarda las 3 páginas con sus scripts, estilos, fuentes e imágenes", async () => {
  const w = makeWorker({ network: siteNetwork() });
  await w.message({ type: "bl-precache" });
  const got = new Set(w.offlineEntries());
  for (const u of [
    "/pages/home.html", "/pages/farmacias.html", "/pages/servicios.html",
    "/assets/home-1.js", "/assets/home-1.css", "/assets/farmacias-1.js", "/assets/auth-utils-1.js",
    "/assets/servicios-1.js", "/assets/logo-1.png",
    "/vendor/fontawesome/css/all.min.css?v=2",
    "/assets/inter-1.woff2", // lo pide el CSS
    "/vendor/fontawesome/webfonts/fa-solid-900.woff2", // url() relativo al CSS
  ]) assert.ok(got.has(ORIGIN + u), `falta ${u}`);
  assert.ok(![...got].some((u) => u.includes("cdn.ejemplo.com")), "no baja nada de otro dominio");
  assert.ok(![...got].some((u) => u.endsWith(".ttf") || u.startsWith("data:")), "ni tipografías de reserva ni data:");
  assert.deepEqual(w.entries(), [], "todo va a la caché sin tope");
});

await check("el mensaje se ignora si no es el de guardado, y no repite lo que ya está guardado", async () => {
  const w = makeWorker({ network: siteNetwork() });
  await w.message({ type: "otra-cosa" });
  assert.equal(w.fetched.length, 0);
  await w.message({ type: "bl-precache" });
  const first = w.fetched.length;
  await w.message({ type: "bl-precache" });
  const again = w.fetched.slice(first);
  assert.equal(again.length, 3, "la 2ª vez solo revisa las 3 páginas (los archivos ya están)");
  assert.ok(again.every((u) => u.endsWith(".html")));
});

await check("al guardar de nuevo se van los archivos de un build anterior", async () => {
  const w = makeWorker({ network: siteNetwork() });
  w.seedOffline({ [`${ORIGIN}/assets/farmacias-0.js`]: "viejo" });
  await w.message({ type: "bl-precache" });
  assert.ok(!w.offlineEntries().includes(`${ORIGIN}/assets/farmacias-0.js`));
});

await check("si una página no se pudo bajar, no se borra nada (mejor sobrar que dejar sin offline)", async () => {
  const w = makeWorker({ network: siteNetwork({ [`${ORIGIN}/pages/servicios.html`]: "offline" }) });
  w.seedOffline({ [`${ORIGIN}/pages/servicios.html`]: "vieja", [`${ORIGIN}/assets/servicios-0.js`]: "viejo" });
  await w.message({ type: "bl-precache" });
  assert.ok(w.offlineEntries().includes(`${ORIGIN}/pages/servicios.html`), "queda la copia que había");
  assert.ok(w.offlineEntries().includes(`${ORIGIN}/assets/servicios-0.js`));
  assert.ok(w.offlineEntries().includes(`${ORIGIN}/pages/farmacias.html`), "las demás sí se guardaron");
});

await check("un 404 al guardar un archivo no se guarda ni se da por completo", async () => {
  const w = makeWorker({ network: siteNetwork({ [`${ORIGIN}/assets/logo-1.png`]: { status: 404, body: "no" } }) });
  w.seedOffline({ [`${ORIGIN}/assets/farmacias-0.js`]: "viejo" });
  await w.message({ type: "bl-precache" });
  assert.ok(!w.offlineEntries().includes(`${ORIGIN}/assets/logo-1.png`));
  assert.ok(w.offlineEntries().includes(`${ORIGIN}/assets/farmacias-0.js`), "con una falla no se limpia");
});

await check("señal colgada: la página esencial se muestra desde la copia sin esperar a la red", async () => {
  const w = makeWorker({ fastTimers: true, network: { [`${ORIGIN}/pages/farmacias.html`]: "hang" } });
  w.seedOffline({ [`${ORIGIN}/pages/farmacias.html`]: "guardada" });
  const res = await Promise.race([
    w.dispatch("/pages/farmacias.html", { mode: "navigate" }),
    new Promise((r) => setTimeout(() => r({ body: "TIMEOUT" }), 500)),
  ]);
  assert.equal(res.body, "guardada");
});

await check("señal colgada y sin copia: espera a la red (no muestra la pantalla de 'sin conexión')", async () => {
  const w = makeWorker({ fastTimers: true, network: { [`${ORIGIN}/pages/farmacias.html`]: "hang" } });
  const res = await Promise.race([
    w.dispatch("/pages/farmacias.html", { mode: "navigate" }),
    new Promise((r) => setTimeout(() => r("sigue esperando"), 100)),
  ]);
  assert.equal(res, "sigue esperando");
});

await check("con red buena la página esencial llega fresca y se guarda la nueva", async () => {
  const url = `${ORIGIN}/pages/farmacias.html`;
  const w = makeWorker({ fastTimers: true, network: { [url]: ok("fresca") } });
  w.seedOffline({ [url]: "vieja" });
  assert.equal((await w.dispatch("/pages/farmacias.html", { mode: "navigate" })).body, "fresca");
  const saved = await w.store.get(w.offlineCacheName).get(url);
  assert.equal(saved.body, "fresca");
});

await check("error del servidor (5xx) con copia guardada: se muestra la copia", async () => {
  const url = `${ORIGIN}/pages/servicios.html`;
  const w = makeWorker({ network: { [url]: { status: 503, body: "caído" } } });
  w.seedOffline({ [url]: "guardada" });
  assert.equal((await w.dispatch("/pages/servicios.html", { mode: "navigate" })).body, "guardada");
});

await check("sin conexión y sin copia: pantalla propia con los accesos a lo guardado", async () => {
  const w = makeWorker();
  const res = await w.dispatch("/pages/perfil.html", { mode: "navigate" });
  assert.equal(res.status, 503);
  assert.match(res.body, /No hay conexión/);
  assert.match(res.body, /href="\/pages\/farmacias\.html"/);
  assert.match(res.body, /href="\/pages\/servicios\.html"/);
});

await check("sin conexión, la raíz '/' abre el inicio guardado", async () => {
  const w = makeWorker();
  w.seedOffline({ [`${ORIGIN}/pages/home.html`]: "inicio guardado" });
  assert.equal((await w.dispatch("/", { mode: "navigate" })).body, "inicio guardado");
});

await check("una página que no es esencial no va a la caché de esenciales", async () => {
  const url = `${ORIGIN}/pages/perfil.html`;
  const w = makeWorker({ network: { [url]: ok("perfil") } });
  await w.dispatch("/pages/perfil.html", { mode: "navigate" });
  assert.deepEqual(w.offlineEntries(), []);
  assert.deepEqual(w.entries(), [url]);
});

if (process.exitCode) {
  console.error("\nHay fallas.");
} else {
  console.log("\nTodo bien.");
}

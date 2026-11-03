/**
 * Tests de la vista previa al compartir (js/og-preview-utils.js, la usa middleware.js).
 * Correr con:  node js/og-preview-utils.test.mjs
 */
import assert from "node:assert/strict";
import vm from "node:vm";
import { isPreviewBot, parseOgTarget, productPreview, storePreview, buildOgHtml, buildPreviewPage, SKIP_PARAM } from "./og-preview-utils.js";

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const O = "https://proyectopdisc.vercel.app";
const PID = "2b42bf96-07ba-4af0-8f7e-a659bb1b6f72";
const SID = "03738e21-514e-4db3-aea6-0e1179e36bb3";

console.log("isPreviewBot");
await check("reconoce los robots de vista previa", () => {
  for (const ua of [
    "WhatsApp/2.23.20.0 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "facebookexternalhit/1.1 Facebot Twitterbot/1.0", // iMessage
    "Twitterbot/1.0", "TelegramBot (like TwitterBot)", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)", "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
    "Pinterestbot/1.0", "Mozilla/5.0 (compatible; Snap URL Preview Service; bot; snapchat; https://developers.snap.com/robots)",
  ]) assert.equal(isPreviewBot(ua), true, ua);
});
await check("NO confunde personas: navegadores y los navegadores internos de las apps", () => {
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 14; SM-G990E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [Pinterest/iOS]",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 Line/14.0.0",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 Snapchat/12.0",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "", null,
  ]) assert.equal(isPreviewBot(ua), false, String(ua));
});

console.log("parseOgTarget");
await check("producto y comercio con id uuid", () => {
  assert.deepEqual(parseOgTarget(`${O}/pages/producto.html?id=${PID}&utm_source=wa`), { kind: "product", id: PID });
  assert.deepEqual(parseOgTarget(`${O}/pages/comercio.html?id=${SID}#store-reviews`), { kind: "store", id: SID });
});
await check("sin id, id que no es uuid, otra página o con bl_full: nada", () => {
  assert.equal(parseOgTarget(`${O}/pages/producto.html`), null);
  assert.equal(parseOgTarget(`${O}/pages/producto.html?id=1;drop`), null);
  assert.equal(parseOgTarget(`${O}/pages/home.html?id=${PID}`), null);
  assert.equal(parseOgTarget(`${O}/pages/producto.html?id=${PID}&${SKIP_PARAM}=1`), null);
});

const product = {
  id: PID, title: "Asado Especial x 1kg", description: "Asado de tira de primera calidad", price: 8500,
  compare_at_price: 10000, offer_expires_at: "2026-11-30T23:59:00Z", stock: 50,
  image_url: "/img/prod-carniceria-asado.webp", stores: { name: "Carnicería El Novillo" },
};
const url = `${O}/pages/producto.html?id=${PID}`;

console.log("productPreview / storePreview");
await check("producto: precio con la oferta, comercio, foto absoluta", () => {
  const p = productPreview(product, { origin: O, url, now: new Date("2026-11-03") });
  assert.equal(p.title, "Asado Especial x 1kg");
  assert.equal(p.description, "$8.500 (antes $10.000) · Carnicería El Novillo. Asado de tira de primera calidad");
  assert.equal(p.image, `${O}/img/prod-carniceria-asado.webp`);
  assert.equal(p.price, 8500);
});
await check("producto sin stock, oferta vencida y sin foto: lo dice y usa la imagen del sitio", () => {
  const p = productPreview({ ...product, stock: 0, image_url: null }, { origin: O, url, now: new Date("2026-12-15") });
  assert.equal(p.description, "$8.500 · Carnicería El Novillo. Sin stock por ahora. Asado de tira de primera calidad");
  assert.equal(p.image, `${O}/og-image.png`);
});
await check("textos largos se recortan (título 90, descripción 200)", () => {
  const p = productPreview({ ...product, title: "x".repeat(200), description: "y".repeat(500) }, { origin: O, url });
  assert.ok(p.title.length <= 90 && p.title.endsWith("…"));
  assert.ok(p.description.length <= 200);
});
await check("comercio: banner o logo, y una descripción de respaldo", () => {
  const s = storePreview({ name: "Carnicería El Novillo", logo_url: "/img/comercios/novillo.webp" }, { origin: O, url: "u" });
  assert.equal(s.image, `${O}/img/comercios/novillo.webp`);
  assert.match(s.description, /Mirá los productos de Carnicería El Novillo/);
  assert.equal(storePreview(null, { origin: O, url: "u" }), null);
});

console.log("buildOgHtml");
await check("tiene las etiquetas og:, precio en ARS y tarjeta grande", () => {
  const html = buildOgHtml(productPreview(product, { origin: O, url, now: new Date("2026-11-03") }));
  for (const needle of [
    `<meta property="og:title" content="Asado Especial x 1kg">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${O}/img/prod-carniceria-asado.webp">`,
    `<meta property="og:image:type" content="image/webp">`,
    `<meta property="product:price:amount" content="8500">`,
    `<meta property="product:price:currency" content="ARS">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="canonical" href="${url}">`,
  ]) assert.ok(html.includes(needle), needle);
});
await check("escapa lo que escribió el comercio (no se puede inyectar HTML)", () => {
  const html = buildOgHtml(storePreview({ name: `"><script>alert(1)</script>`, description: "<img src=x onerror=alert(1)>" }, { origin: O, url: `${O}/pages/comercio.html?id=${SID}` }));
  assert.ok(!html.includes("<script>alert"), "nombre escapado");
  assert.ok(!html.includes("<img src=x"), "descripción escapada");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});
await check("una persona que cae acá salta a la página real con bl_full=1", () => {
  const html = buildOgHtml(productPreview(product, { origin: O, url }));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let replaced = null;
  vm.runInNewContext(script, { location: { replace: (u) => { replaced = u; } } });
  assert.equal(replaced, `${url}&${SKIP_PARAM}=1`);
  assert.equal(parseOgTarget(replaced), null, "y ahí el middleware ya no actúa");
});

console.log("buildPreviewPage");
const fakeFetch = (routes) => async (u, opts) => {
  for (const [match, res] of routes) if (u.includes(match)) return typeof res === "function" ? res(u, opts) : res;
  throw new Error("sin ruta: " + u);
};
await check("producto: llama a get_product_detail con la clave pública", async () => {
  let call;
  const html = await buildPreviewPage({ kind: "product", id: PID }, {
    supabaseUrl: "https://x.supabase.co", key: "anon", origin: O, url, now: new Date("2026-11-03"),
    fetchImpl: fakeFetch([["/rpc/get_product_detail", (u, opts) => { call = opts; return { ok: true, json: async () => product }; }]]),
  });
  assert.equal(call.method, "POST");
  assert.equal(call.headers.apikey, "anon");
  assert.equal(JSON.parse(call.body).p_product_id, PID);
  assert.ok(html.includes("Asado Especial x 1kg"));
});
await check("comercio: solo aprobados, y pide únicamente lo que se muestra", async () => {
  let asked;
  const html = await buildPreviewPage({ kind: "store", id: SID }, {
    supabaseUrl: "https://x.supabase.co", key: "anon", origin: O, url: `${O}/pages/comercio.html?id=${SID}`,
    fetchImpl: fakeFetch([["/stores?", (u) => { asked = u; return { ok: true, json: async () => [{ name: "Carnicería El Novillo" }] }; }]]),
  });
  assert.ok(asked.includes("status=eq.approved"));
  assert.ok(asked.includes("select=name,description,logo_url,banner_url"));
  assert.ok(html.includes("Carnicería El Novillo"));
});
await check("si la base falla, no encuentra nada o no hay claves: null (se sirve la página de siempre)", async () => {
  const base = { supabaseUrl: "https://x.supabase.co", key: "anon", origin: O, url };
  assert.equal(await buildPreviewPage({ kind: "product", id: PID }, { ...base, fetchImpl: fakeFetch([["/rpc/", { ok: false, status: 500 }]]) }), null);
  assert.equal(await buildPreviewPage({ kind: "product", id: PID }, { ...base, fetchImpl: fakeFetch([["/rpc/", { ok: true, json: async () => null }]]) }), null);
  assert.equal(await buildPreviewPage({ kind: "store", id: SID }, { ...base, fetchImpl: fakeFetch([["/stores?", { ok: true, json: async () => [] }]]) }), null);
  assert.equal(await buildPreviewPage({ kind: "store", id: SID }, { ...base, fetchImpl: async () => { throw new Error("sin red"); } }), null);
  assert.equal(await buildPreviewPage({ kind: "product", id: PID }, { ...base, key: undefined }), null);
});

if (process.exitCode) {
  console.error("\nHay fallas.");
} else {
  console.log("\nTodo bien.");
}

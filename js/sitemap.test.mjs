/**
 * Tests del generador de sitemap (scripts/sitemap.mjs).
 * Correr con:  node js/sitemap.test.mjs
 */
import assert from "node:assert/strict";
import { buildSitemapXml, withSitemapLine, resolveOrigin, fetchSitemapRows, STATIC_PAGES, DEFAULT_ORIGIN } from "../scripts/sitemap.mjs";

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
const S1 = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";

console.log("sitemap");
await check("páginas fijas + comercios + productos, con lastmod", () => {
  const xml = buildSitemapXml(O, { stores: [{ id: S1, updated_at: "2026-10-20T13:00:00Z" }], products: [{ id: P1, updated_at: null }] });
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.equal((xml.match(/<url>/g) || []).length, STATIC_PAGES.length + 2);
  assert.ok(xml.includes(`<loc>${O}/pages/comercio.html?id=${S1}</loc>\n    <lastmod>2026-10-20</lastmod>`));
  assert.ok(xml.includes(`<loc>${O}/pages/producto.html?id=${P1}</loc>\n    <changefreq>`), "sin fecha no pone lastmod");
});
await check("escapa & en las URLs y descarta ids que no son uuid", () => {
  const xml = buildSitemapXml(O, { stores: [{ id: "<script>" }, { id: "1 OR 1=1" }] });
  assert.ok(!xml.includes("<script>"));
  assert.equal((xml.match(/<url>/g) || []).length, STATIC_PAGES.length);
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml), "ningún & sin escapar");
});
await check("ninguna página privada en el sitemap", () => {
  const xml = buildSitemapXml(O);
  for (const p of ["login", "perfil", "carrito", "vender", "admin", "profesional", "repartidor"]) assert.ok(!xml.includes(`/${p}.html`), p);
});
await check("robots.txt: agrega Sitemap: y reemplaza uno viejo", () => {
  const out = withSitemapLine("User-agent: *\nAllow: /\nSitemap: https://viejo.com/sitemap.xml\n\n", O);
  assert.equal(out, `User-agent: *\nAllow: /\n\nSitemap: ${O}/sitemap.xml\n`);
});
await check("dominio: SITE_URL > dominio de producción de Vercel > el de siempre", () => {
  assert.equal(resolveOrigin({ SITE_URL: "https://baraderolocal.com.ar/" }), "https://baraderolocal.com.ar");
  assert.equal(resolveOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "www.baraderolocal.com.ar" }), "https://www.baraderolocal.com.ar");
  assert.equal(resolveOrigin({}), DEFAULT_ORIGIN);
  assert.equal(resolveOrigin({ SITE_URL: "no es url" }), DEFAULT_ORIGIN);
});
await check("lee comercios aprobados y productos activos con la clave pública, paginando de a 1000", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, key: opts.headers.apikey });
    const page = Number(new URL(url).searchParams.get("offset")) / 1000;
    const n = url.includes("/products?") && page === 0 ? 1000 : url.includes("/products?") ? 3 : 2;
    return { ok: true, json: async () => Array.from({ length: n }, (_, i) => ({ id: `${page}-${i}` })) };
  };
  const rows = await fetchSitemapRows({ supabaseUrl: "https://x.supabase.co", key: "anon", fetchImpl: fakeFetch });
  assert.equal(rows.stores.length, 2);
  assert.equal(rows.products.length, 1003);
  assert.ok(calls.every((c) => c.key === "anon"));
  assert.ok(calls.some((c) => c.url.includes("stores?select=id,updated_at&status=eq.approved")));
  assert.ok(calls.some((c) => c.url.includes("products?select=id,updated_at&is_active=eq.true")));
});
await check("si la base falla o no hay .env, no tira: devuelve listas vacías", async () => {
  const quiet = { warn: () => {} };
  const failing = async () => ({ ok: false, status: 503 });
  assert.deepEqual(await fetchSitemapRows({ supabaseUrl: "https://x", key: "k", fetchImpl: failing, log: quiet }), { stores: [], products: [] });
  const throwing = async () => { throw new Error("sin red"); };
  assert.deepEqual(await fetchSitemapRows({ supabaseUrl: "https://x", key: "k", fetchImpl: throwing, log: quiet }), { stores: [], products: [] });
  assert.deepEqual(await fetchSitemapRows({ log: quiet }), { stores: [], products: [] });
});

if (process.exitCode) {
  console.error("\nHay fallas.");
} else {
  console.log("\nTodo bien.");
}

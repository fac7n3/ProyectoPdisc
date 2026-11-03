/**
 * Tests de seo-utils.js (canónica y JSON-LD).
 * Correr con:  node js/seo-utils.test.mjs
 */
import assert from "node:assert/strict";
import { canonicalUrl, absoluteUrl, buildProductJsonLd, buildStoreJsonLd, buildSiteJsonLd, serializeJsonLd } from "./seo-utils.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const O = "https://proyectopdisc.vercel.app";

console.log("canonicalUrl");
check("producto: solo conserva el id (saca utm, fbclid y el #)", () => {
  assert.equal(canonicalUrl(`${O}/pages/producto.html?utm_source=wa&id=abc&fbclid=x#resenas`), `${O}/pages/producto.html?id=abc`);
});
check("comercio con id, búsqueda con cat y q", () => {
  assert.equal(canonicalUrl(`${O}/pages/comercio.html?id=s1&foco=1`), `${O}/pages/comercio.html?id=s1`);
  assert.equal(canonicalUrl(`${O}/pages/search.html?q=pan&page=3&cat=panaderia`), `${O}/pages/search.html?cat=panaderia&q=pan`);
});
check("páginas sin parámetros propios quedan limpias", () => {
  assert.equal(canonicalUrl(`${O}/pages/info.html?x=1#faq-cuenta`), `${O}/pages/info.html`);
  assert.equal(canonicalUrl(`${O}/pages/contratar.html?pro=123`), `${O}/pages/contratar.html`);
});
check("las páginas privadas no llevan canónica", () => {
  for (const p of ["login", "perfil", "carrito", "vender", "admin", "profesional", "repartidor", "register"]) {
    assert.equal(canonicalUrl(`${O}/pages/${p}.html`), null, p);
  }
});
check("usa el dominio de la página (sirve el día que haya dominio propio)", () => {
  assert.equal(canonicalUrl("https://www.baraderolocal.com.ar/pages/home.html?a=1"), "https://www.baraderolocal.com.ar/pages/home.html");
});
check("una URL inválida o file:// devuelve null", () => {
  assert.equal(canonicalUrl("no es url"), null);
  assert.equal(canonicalUrl("file:///home/x/pages/home.html"), null);
});

console.log("absoluteUrl");
check("rutas relativas y absolutas del sitio, y URLs de Supabase", () => {
  assert.equal(absoluteUrl("/img/productos/a.webp", O), `${O}/img/productos/a.webp`);
  assert.equal(absoluteUrl("../img/x.webp", O), `${O}/img/x.webp`);
  assert.equal(absoluteUrl("https://x.supabase.co/storage/v1/a.jpg", O), "https://x.supabase.co/storage/v1/a.jpg");
  assert.equal(absoluteUrl("", O), null);
});

console.log("buildProductJsonLd");
const product = {
  id: "p1", title: "  Pan   francés ", description: "Recién horneado", price: 1500, compare_at_price: 2000,
  offer_expires_at: "2026-11-30T23:59:00Z", stock: 4, image_url: "/img/productos/pan.webp",
  product_images: [{ url: "/img/productos/pan.webp" }, { url: "/img/productos/pan2.webp" }],
  stores: { id: "s1", name: "Panadería El Sol" }, review_count: 3, review_average: 4.333,
};
check("arma Product con oferta, precio en ARS, stock, fotos sin repetir y reseñas", () => {
  const ld = buildProductJsonLd(product, { origin: O, url: `${O}/pages/producto.html?id=p1`, now: new Date("2026-11-03") });
  assert.equal(ld["@type"], "Product");
  assert.equal(ld.name, "Pan francés");
  assert.deepEqual(ld.image, [`${O}/img/productos/pan.webp`, `${O}/img/productos/pan2.webp`]);
  assert.equal(ld.offers.price, 1500);
  assert.equal(ld.offers.priceCurrency, "ARS");
  assert.equal(ld.offers.priceValidUntil, "2026-11-30");
  assert.equal(ld.offers.availability, "https://schema.org/InStock");
  assert.equal(ld.offers.seller.name, "Panadería El Sol");
  assert.deepEqual(ld.aggregateRating, { "@type": "AggregateRating", ratingValue: 4.3, reviewCount: 3, bestRating: 5, worstRating: 1 });
});
check("sin stock = OutOfStock; oferta vencida no pone fecha; sin reseñas no hay rating", () => {
  const ld = buildProductJsonLd({ ...product, stock: 0, review_count: 0, review_average: null }, { origin: O, url: "u", now: new Date("2026-12-15") });
  assert.equal(ld.offers.availability, "https://schema.org/OutOfStock");
  assert.equal(ld.offers.priceValidUntil, undefined);
  assert.equal(ld.aggregateRating, undefined);
});
check("sin título no arma nada", () => {
  assert.equal(buildProductJsonLd({ price: 1 }, { origin: O }), null);
});

console.log("buildStoreJsonLd");
check("arma Store con dirección en Baradero, geo y sin teléfono ni datos de cobro", () => {
  const ld = buildStoreJsonLd({ name: "Panadería El Sol", description: "Pan", address: "Mitre 123", phone: "3329",
    transfer_alias: "el.sol", cuit: "20-1", logo_url: "/img/comercios/sol.webp", lat: -33.8, lng: -59.5 },
    { origin: O, url: `${O}/pages/comercio.html?id=s1`, categoryName: "Panadería" });
  assert.equal(ld["@type"], "Store");
  assert.equal(ld.address.streetAddress, "Mitre 123");
  assert.equal(ld.address.addressLocality, "Baradero");
  assert.deepEqual(ld.geo, { "@type": "GeoCoordinates", latitude: -33.8, longitude: -59.5 });
  assert.equal(ld.image, `${O}/img/comercios/sol.webp`);
  const json = JSON.stringify(ld);
  for (const secreto of ["3329", "el.sol", "20-1"]) assert.ok(!json.includes(secreto), `no publica ${secreto}`);
});
check("sin ubicación no pone geo", () => {
  const ld = buildStoreJsonLd({ name: "X", lat: null, lng: null }, { origin: O, url: "u" });
  assert.equal(ld.geo, undefined);
});

console.log("buildSiteJsonLd / serializeJsonLd");
check("el buscador del sitio apunta a search.html?q=", () => {
  const ld = buildSiteJsonLd(O);
  assert.equal(ld["@graph"][0].potentialAction.target.urlTemplate, `${O}/pages/search.html?q={search_term_string}`);
});
check("un </script> en los datos no puede cerrar el bloque", () => {
  const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
  assert.ok(!out.includes("<"));
  assert.equal(JSON.parse(out).name, "</script><script>alert(1)</script>");
});

if (process.exitCode) {
  console.error("\nHay fallas.");
} else {
  console.log("\nTodo bien.");
}

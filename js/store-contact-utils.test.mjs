/**
 * Chequeo del botón "Contactar al vendedor" (teléfono/WhatsApp/ninguno) y de
 * los links de redes sociales del comercio.
 * Correr con:  node js/store-contact-utils.test.mjs
 */
import assert from "node:assert/strict";
import { buildContactAction, buildWhatsappMessage, getVisibleSocialLinks, safeExternalUrl } from "./store-contact-utils.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

console.log("buildWhatsappMessage");

check("incluye el saludo pedido y la referencia a Baradero Local", () => {
  const msg = buildWhatsappMessage();
  assert.ok(msg.startsWith("Hola! Quería realizar una consulta"));
  assert.ok(msg.includes("Baradero Local"));
});

check("con producto, lo menciona en el mensaje", () => {
  assert.equal(
    buildWhatsappMessage("Bolsa de cemento 50kg"),
    'Hola! Quería realizar una consulta sobre "Bolsa de cemento 50kg" (te escribo desde Baradero Local.)'
  );
});

console.log("buildContactAction");

check("sin tienda, no hay acción", () => {
  assert.equal(buildContactAction(null), null);
});

check("contact_method 'none' no muestra botón", () => {
  assert.equal(buildContactAction({ contact_method: "none", whatsapp: "3329123456" }), null);
});

check("el comprador nunca puede llamar: no hay rama tel:, solo wa.me", () => {
  const action = buildContactAction({ contact_method: "whatsapp", whatsapp: "+54 9 3329 123456" }, "Silla de jardín");
  assert.ok(action.href.startsWith("https://wa.me/5493329123456?text="));
  assert.ok(decodeURIComponent(action.href.split("text=")[1]).includes("Silla de jardín"));
});

check("cuentas viejas con contact_method='phone' también arman wa.me (no tel:)", () => {
  const action = buildContactAction({ contact_method: "phone", whatsapp: "3329123456" });
  assert.equal(action.href, "https://wa.me/3329123456?text=Hola!%20Quer%C3%ADa%20realizar%20una%20consulta%20(te%20escribo%20desde%20Baradero%20Local.)");
});

check("sin whatsapp cargado no muestra botón, sea cual sea contact_method", () => {
  assert.equal(buildContactAction({ contact_method: "whatsapp", whatsapp: "" }), null);
  assert.equal(buildContactAction({ contact_method: "phone", whatsapp: "" }), null);
  assert.equal(buildContactAction({ whatsapp: "" }), null);
});

check("sin contact_method definido, se comporta como cualquier método que no sea 'none'", () => {
  const action = buildContactAction({ whatsapp: "3329123456" });
  assert.equal(action.href.startsWith("https://wa.me/3329123456?text="), true);
});

console.log("getVisibleSocialLinks");

check("sin tienda, ninguna red", () => {
  assert.deepEqual(getVisibleSocialLinks(null), []);
});

check("solo muestra las que tienen link Y están activadas", () => {
  const links = getVisibleSocialLinks({
    social_instagram: "https://instagram.com/comercio",
    social_instagram_show: true,
    social_facebook: "https://facebook.com/comercio",
    social_facebook_show: false, // cargado pero oculto -- no se muestra
    social_tiktok: "",
    social_tiktok_show: true, // activado pero sin link -- no se muestra
  });
  assert.deepEqual(links.map((l) => l.key), ["instagram"]);
});

check("respeta el orden fijo de la lista de redes", () => {
  const links = getVisibleSocialLinks({
    social_youtube: "https://youtube.com/comercio",
    social_youtube_show: true,
    social_instagram: "https://instagram.com/comercio",
    social_instagram_show: true,
  });
  assert.deepEqual(links.map((l) => l.key), ["instagram", "youtube"]);
});

check("safeExternalUrl: completa el https:// que falta", () => {
  // El caso de todos los días: el vendedor escribe el usuario, sin esquema.
  // Sin esto el href queda relativo y el link va a un 404 del propio sitio.
  assert.equal(safeExternalUrl("instagram.com/mitienda"), "https://instagram.com/mitienda");
  assert.equal(safeExternalUrl("  www.mitienda.com.ar  "), "https://www.mitienda.com.ar/");
});

check("safeExternalUrl: deja pasar http y https tal cual", () => {
  assert.equal(safeExternalUrl("https://instagram.com/mitienda"), "https://instagram.com/mitienda");
  assert.equal(safeExternalUrl("http://mitienda.com.ar/"), "http://mitienda.com.ar/");
});

check("safeExternalUrl: descarta todo lo que no sea http/https", () => {
  // `javascript:` guardado en el campo llegaba entero al href. Hoy lo salva
  // el target="_blank" del call site; acá se corta de raíz (ver la nota de
  // safeExternalUrl en store-contact-utils.js).
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("JaVaScRiPt:alert(1)"), null);
  assert.equal(safeExternalUrl("java\nscript:alert(1)"), null, "partido con un salto de línea");
  assert.equal(safeExternalUrl("  javascript:alert(1)"), null, "con espacios adelante");
  assert.equal(safeExternalUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeExternalUrl("vbscript:msgbox(1)"), null);
  assert.equal(safeExternalUrl("file:///etc/passwd"), null);
});

check("safeExternalUrl: vacío o basura devuelve null", () => {
  assert.equal(safeExternalUrl(""), null);
  assert.equal(safeExternalUrl("   "), null);
  assert.equal(safeExternalUrl(null), null);
  assert.equal(safeExternalUrl(undefined), null);
  assert.equal(safeExternalUrl("https://"), null, "sin host no sirve de link");
});

check("getVisibleSocialLinks normaliza y descarta lo peligroso", () => {
  const links = getVisibleSocialLinks({
    social_instagram: "instagram.com/mitienda",     // sin esquema -> se completa
    social_instagram_show: true,
    social_website: "javascript:alert(document.cookie)", // -> se descarta
    social_website_show: true,
    social_youtube: "https://youtube.com/@mitienda",
    social_youtube_show: true,
  });
  assert.deepEqual(links.map((l) => l.key), ["instagram", "youtube"]);
  assert.equal(links[0].url, "https://instagram.com/mitienda");
});

if (!process.exitCode) console.log("\nTodo bien.");

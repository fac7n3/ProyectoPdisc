/**
 * Chequeo de accesibilidad (TalkBack) de todas las páginas.
 * Correr con:  node js/a11y-paginas.test.mjs
 *
 * Por qué existe: la adaptación para lectores de pantalla se hizo página por
 * página y tres (contratar, farmacias, servicios) quedaron afuera sin que nada
 * lo avisara. Esto falla si una página nueva o editada pierde alguna de las
 * piezas básicas.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = path.join(root, "pages");
const pages = readdirSync(pagesDir).filter((f) => f.endsWith(".html")).sort();

let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
};

for (const file of pages) {
  const html = readFileSync(path.join(pagesDir, file), "utf8");
  check(`${file}: idioma, skip link, a11y.css, <main> enfocable y <h1>`, () => {
    assert.match(html, /<html[^>]*\slang="es"/, "falta lang=\"es\"");
    assert.match(html, /Assets\/styles\/a11y\.css/, "no carga a11y.css");
    const skip = html.match(/<a\b[^>]*class="skip-link"[^>]*>/) || html.match(/<a\b[^>]*href="#[^"]*"[^>]*class="skip-link"[^>]*>/);
    assert.ok(skip, "falta el skip link");
    const destino = (skip[0].match(/href="#([^"]+)"/) || [])[1];
    assert.ok(destino, "el skip link no apunta a un id");
    const el = (html.match(new RegExp(`<[a-z0-9]+\\b[^>]*\\bid="${destino}"[^>]*>`)) || [])[0];
    assert.ok(el, `no existe el destino #${destino}`);
    assert.match(el, /tabindex="-1"/, `el destino #${destino} no es enfocable (falta tabindex="-1")`);
    assert.ok(/<h1[\s>]/.test(html), "no tiene <h1>");
  });
  check(`${file}: sin <img> sin alt y sin íconos de Font Awesome sin aria-hidden`, () => {
    const sinAlt = (html.match(/<img\b[^>]*>/g) || []).filter((t) => !/\balt=/.test(t));
    assert.deepEqual(sinAlt, [], "hay <img> sin alt");
    const iconos = (html.match(/<i\b[^>]*class="[^"]*\bfa-[^>]*>/g) || []).filter((t) => !/aria-hidden|aria-label|role=|title=/.test(t));
    assert.deepEqual(iconos.slice(0, 3), [], "hay íconos decorativos sin aria-hidden=\"true\"");
  });
}

check("js/: los íconos Font Awesome escritos en plantillas llevan aria-hidden", () => {
  const malos = [];
  for (const f of readdirSync(path.join(root, "js")).filter((n) => n.endsWith(".js"))) {
    const src = readFileSync(path.join(root, "js", f), "utf8");
    for (const t of src.match(/<i\b[^>]*class=["'`][^"'`]*\bfa-[^>]*>/g) || []) {
      if (!/aria-hidden|aria-label|role=|title=/.test(t)) malos.push(`${f}: ${t.slice(0, 60)}`);
    }
  }
  assert.deepEqual(malos.slice(0, 3), []);
});

check("auth-utils exporta markInvalid y login/register lo usan", () => {
  assert.match(readFileSync(path.join(root, "js/auth-utils.js"), "utf8"), /export function markInvalid/);
  for (const f of ["login.js", "register.js"]) {
    assert.match(readFileSync(path.join(root, "js", f), "utf8"), /markInvalid\(/, `${f} no marca campos inválidos`);
  }
});

if (failed) {
  console.log(`\n${failed} chequeo(s) fallaron.`);
  process.exit(1);
}
console.log("\nAccesibilidad de páginas: todo bien.");

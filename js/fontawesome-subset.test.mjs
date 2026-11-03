/**
 * Chequeo de que el Font Awesome recortado (public/vendor/fontawesome) trae
 * TODOS los íconos que el código usa.
 * Correr con:  node js/fontawesome-subset.test.mjs
 *
 * Por qué existe: el sitio no carga Font Awesome entero sino solo los ~165 íconos
 * usados (scripts/subset-fontawesome.mjs). Si alguien escribe `fa-algo-nuevo` en un
 * JS o un HTML y no vuelve a correr el script, ese ícono se ve como un cuadrado
 * vacío en producción y nada se queja. Este test lo caza antes del deploy.
 * Arreglo cuando falla:  npm run subset-icons   (necesita Python con fonttools y brotli)
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import { scanIconUsage, ROOT } from "../scripts/fa-usage.mjs";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const VENDOR = path.join(ROOT, "public/vendor/fontawesome");
const originalCss = readFileSync(path.join(ROOT, "node_modules/@fortawesome/fontawesome-free/css/all.min.css"), "utf8");
const subsetCss = readFileSync(path.join(VENDOR, "css/all.min.css"), "utf8");
const manifest = JSON.parse(readFileSync(path.join(VENDOR, "subset.json"), "utf8"));

/** Nombres de ícono (con sus alias) que define un CSS: `.fa-algo:before{content:"\fXXX"}`. */
function iconNames(css) {
  const names = new Set();
  postcss.parse(css).walkRules((rule) => {
    const hasGlyph = rule.nodes.some((n) => n.prop === "content" && /^"\\[0-9a-f]+"$/i.test(n.value));
    if (!hasGlyph) return;
    for (const sel of rule.selectors) {
      const m = sel.trim().match(/^\.fa-([a-z0-9-]+):{1,2}before$/);
      if (m) names.add(m[1]);
    }
  });
  return names;
}

const allIcons = iconNames(originalCss);
const inSubset = iconNames(subsetCss);
const { icons: usage, files } = scanIconUsage();
const used = [...usage.keys()].filter((n) => allIcons.has(n)); // fa-solid, fa-spin, fa-2x... no son íconos

console.log("Font Awesome recortado");

check("hay íconos usados y el recorte no está vacío", () => {
  assert.ok(used.length > 100, `se esperaban >100 íconos usados, hay ${used.length}`);
  assert.ok(inSubset.size >= used.length);
});

check("cada ícono que el código usa está en el CSS recortado", () => {
  const missing = used.filter((n) => !inSubset.has(n));
  assert.deepEqual(
    missing.map((n) => `fa-${n} (en ${files.get(n).join(", ")})`),
    [],
    "Faltan íconos en el recorte. Corré:  npm run subset-icons",
  );
});

check("cada ícono usado tiene su glifo en alguna de las fuentes recortadas (subset.json)", () => {
  const present = new Set(Object.values(manifest.glyphs).flat());
  const missing = used.filter((n) => !manifest.icons[n] || !present.has(manifest.icons[n]));
  assert.deepEqual(missing, [], "Faltan glifos: corré  npm run subset-icons");
});

check("el recorte no arrastra de más: no hay más de 25 íconos sin usar", () => {
  const extra = [...inSubset].filter((n) => !usage.has(n));
  assert.ok(extra.length <= 25, `${extra.length} íconos de más (${extra.slice(0, 5).join(", ")}...): corré  npm run subset-icons`);
});

check("las fuentes y el CSS pesan una fracción de los originales", () => {
  const kb = (f) => statSync(path.join(VENDOR, f)).size / 1024;
  assert.ok(kb("css/all.min.css") < 40, `CSS ${kb("css/all.min.css").toFixed(0)} KB`);
  assert.ok(kb("webfonts/fa-solid-900.woff2") < 40, "solid");
  assert.ok(!existsSync(path.join(VENDOR, "webfonts/fa-solid-900.ttf")), "los .ttf no se sirven");
});

check("el CSS recortado conserva la licencia y los @font-face de las fuentes que existen", () => {
  assert.match(subsetCss, /Font Awesome Free .* by @fontawesome/);
  for (const f of ["fa-solid-900", "fa-regular-400", "fa-brands-400"]) {
    const hasFile = existsSync(path.join(VENDOR, `webfonts/${f}.woff2`));
    assert.equal(subsetCss.includes(`${f}.woff2`), hasFile, f);
  }
  assert.ok(!/Font Awesome 5|\.ttf/.test(subsetCss), "sin Font Awesome 5 ni .ttf");
});

if (process.exitCode) {
  console.error("\nHay fallas.");
} else {
  console.log("\nTodo bien.");
}

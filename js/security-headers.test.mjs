/**
 * Chequeo de los headers de seguridad que sirve Vercel (vercel.json).
 * Correr con:  node js/security-headers.test.mjs   (también corre con `npm test`)
 *
 * Por qué existe: los headers son controles del hardening SOC 2 / ISO 27701
 * (docs/seguridad/HARDENING-SOC2-ISO27701.md, controles T-01 a T-05) y nadie
 * los mira hasta que falta uno. Este test falla si alguien los saca o los
 * afloja sin querer (por ejemplo, al editar vercel.json para sumar una regla
 * de caché).
 *
 * Ojo con dos cosas al tocarlos:
 *   - El CSP del header NO reemplaza al <meta> de cada página (ver
 *     js/csp.test.mjs): el navegador aplica los dos y se queda con lo más
 *     restrictivo. El header lleva solo lo que un <meta> no puede hacer
 *     (frame-ancestors) y lo que no rompe nada (object-src, base-uri,
 *     form-action, upgrade-insecure-requests).
 *   - geolocation=(self) hace falta: el inicio usa la ubicación para
 *     "Comercios cerca tuyo".
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
const global = (cfg.headers || []).find((h) => h.source === "/(.*)");
const headers = new Map((global?.headers || []).map((h) => [h.key.toLowerCase(), h.value]));
const get = (k) => headers.get(k.toLowerCase()) || "";

check("hay una regla de headers para todo el sitio", () => {
  assert.ok(global, 'falta la regla con source "/(.*)" en vercel.json');
});

check("HSTS de al menos un año con subdominios", () => {
  const v = get("Strict-Transport-Security");
  const maxAge = Number((v.match(/max-age=(\d+)/) || [])[1] || 0);
  assert.ok(maxAge >= 31536000, `max-age=${maxAge}`);
  assert.match(v, /includeSubDomains/);
});

check("CSP del header: no se puede embeber el sitio ni cargar plugins", () => {
  const v = get("Content-Security-Policy");
  for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
    assert.ok(v.includes(d), `falta "${d}" en: ${v}`);
  }
  assert.ok(!/script-src|default-src/.test(v), "script-src/default-src van en el <meta> de cada página, no acá");
});

check("nosniff, X-Frame-Options DENY y Referrer-Policy estricta", () => {
  assert.equal(get("X-Content-Type-Options"), "nosniff");
  assert.equal(get("X-Frame-Options"), "DENY");
  assert.match(get("Referrer-Policy"), /^(strict-origin-when-cross-origin|no-referrer|same-origin|strict-origin)$/);
});

check("Permissions-Policy: cámara y micrófono apagados, ubicación solo propia", () => {
  const v = get("Permissions-Policy");
  assert.match(v, /camera=\(\)/);
  assert.match(v, /microphone=\(\)/);
  assert.match(v, /geolocation=\(self\)/);
  assert.match(v, /payment=\(\)/);
});

check("Cross-Origin-Opener-Policy presente", () => {
  assert.match(get("Cross-Origin-Opener-Policy"), /^same-origin/);
});

const cacheFor = (source) => {
  const rule = (cfg.headers || []).find((h) => h.source === source);
  return rule?.headers?.find((h) => h.key.toLowerCase() === "cache-control")?.value || "";
};

check("los archivos con hash de Vite (/assets) se cachean un año como inmutables", () => {
  assert.match(cacheFor("/assets/(.*)"), /max-age=31536000/);
  assert.match(cacheFor("/assets/(.*)"), /immutable/);
});

// /vendor (Font Awesome) e /img (fotos de productos, banners) NO llevan hash en el
// nombre: si se reemplaza un archivo con el mismo nombre tiene que verse en días,
// no en un año. Nunca `immutable` acá.
check("/vendor e /img con caché acotada (sin immutable)", () => {
  for (const src of ["/vendor/(.*)", "/img/(.*)"]) {
    const v = cacheFor(src);
    assert.ok(v, `falta Cache-Control para ${src}`);
    assert.doesNotMatch(v, /immutable/, `${src} no lleva hash en el nombre: no puede ser immutable`);
    const maxAge = Number((v.match(/max-age=(\d+)/) || [])[1]);
    assert.ok(maxAge > 0 && maxAge <= 7 * 24 * 3600, `${src}: max-age entre 1 s y 7 días (es ${maxAge})`);
  }
});

check("la raíz redirige del lado del servidor al inicio (sin meta refresh)", () => {
  const r = (cfg.redirects || []).find((x) => x.source === "/");
  assert.ok(r, 'falta el redirect de "/" en vercel.json');
  assert.equal(r.destination, "/pages/home.html");
  assert.equal(r.permanent, false, "temporal: si algún día el inicio pasa a /, un 308 quedaría guardado en los navegadores");
});

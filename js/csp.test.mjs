/**
 * Chequeo del CSP (Content-Security-Policy) de las páginas.
 * Correr con:  node js/csp.test.mjs
 *
 * Por qué existe: el CSP está copiado a mano en un <meta> de cada HTML (las
 * páginas de pages/ más index.html) y nadie lo mira hasta que algo se rompe.
 * El 2026-10-02 se publicó el tiempo real (Supabase Realtime) y quedó
 * bloqueado en producción sin que ningún test lo notara: el websocket va por
 * `wss://`, y `connect-src https://*.supabase.co` NO lo cubre (en CSP el
 * esquema https no incluye wss). El navegador lo rechazaba con "Refused to
 * connect" y el sitio caía en silencio al respaldo de 30 s. Los tests que
 * simulan el WebSocket con Playwright (page.routeWebSocket) no lo vieron: ese
 * simulacro reemplaza `WebSocket` dentro de la página y nunca llega al chequeo
 * de CSP del navegador.
 *
 * Esto cubre lo más fácil de que vuelva a pasar: una página nueva armada por
 * copia de una vieja, o una edición que toque el connect-src de una sola.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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

/** El contenido del <meta http-equiv="Content-Security-Policy">, o null si la página no lo tiene. */
export function readCsp(html) {
  const tag = html.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i);
  if (!tag) return null;
  const content = tag[0].match(/content=("([^"]*)"|'([^']*)')/i);
  return content ? (content[2] ?? content[3]) : null;
}

/** Las fuentes de una directiva (ej. connect-src) como lista, o null si la política no la define. */
export function directiveSources(csp, name) {
  const dir = csp.split(";").map((d) => d.trim()).find((d) => d.toLowerCase().startsWith(`${name} `) || d.toLowerCase() === name);
  return dir ? dir.split(/\s+/).slice(1) : null;
}

/** Problemas de una página, en español; lista vacía si está bien. */
export function cspProblems(html) {
  const csp = readCsp(html);
  if (csp === null) return ["no tiene <meta http-equiv=\"Content-Security-Policy\">"];
  const connect = directiveSources(csp, "connect-src");
  if (!connect) return ["el CSP no define connect-src"];
  const problems = [];
  // La API REST y la auth van por https; Realtime por wss. Son dos esquemas distintos.
  if (!connect.includes("https://*.supabase.co")) problems.push("connect-src no permite https://*.supabase.co (API REST y auth)");
  if (!connect.includes("wss://*.supabase.co")) problems.push("connect-src no permite wss://*.supabase.co (Realtime): el websocket queda bloqueado y el tiempo real cae al polling");
  return problems;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = [
  ...readdirSync(path.join(root, "pages")).filter((f) => f.endsWith(".html")).sort().map((f) => path.join("pages", f)),
  "index.html",
];

console.log("CSP de cada página");

check("hay páginas para revisar", () => {
  assert.ok(pages.length >= 20, `solo se encontraron ${pages.length}`);
});

for (const file of pages) {
  check(`${file}: permite https y wss de Supabase en connect-src`, () => {
    const problems = cspProblems(readFileSync(path.join(root, file), "utf8"));
    assert.deepEqual(problems, []);
  });
}

console.log("el chequeo en sí");

check("detecta un CSP sin wss (el bug del 2026-10-02)", () => {
  const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' https://*.supabase.co https://accounts.google.com;">`;
  const problems = cspProblems(html);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /wss:\/\/\*\.supabase\.co/);
});

check("detecta una página sin CSP y un CSP sin connect-src", () => {
  assert.equal(cspProblems("<html><head></head></html>").length, 1);
  assert.deepEqual(cspProblems(`<meta http-equiv="Content-Security-Policy" content="default-src 'self';">`), ["el CSP no define connect-src"]);
});

check("acepta el CSP correcto aunque lleve otras fuentes y use comillas simples", () => {
  const html = `<meta http-equiv='Content-Security-Policy' content='default-src "self"; connect-src "self" https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org;'>`;
  assert.deepEqual(cspProblems(html), []);
});

check("no confunde wss en otra directiva con connect-src", () => {
  // wss en img-src no sirve de nada para el websocket.
  const html = `<meta http-equiv="Content-Security-Policy" content="img-src wss://*.supabase.co; connect-src 'self' https://*.supabase.co;">`;
  assert.equal(cspProblems(html).length, 1);
});

if (!process.exitCode) console.log("\nTodo bien.");

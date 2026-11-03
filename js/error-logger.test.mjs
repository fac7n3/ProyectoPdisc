/**
 * Chequeo de que el logger de errores nunca mande un token de sesión a la
 * base (ver el comentario de sanitizeUrlForLogging en error-logger.js).
 * Correr con:  node js/error-logger.test.mjs
 */
import assert from "node:assert/strict";
import { sanitizeUrlForLogging, isDevHost } from "./error-logger.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

console.log("sanitizeUrlForLogging");

check("saca el hash con el token de un link de recuperación de contraseña", () => {
  const url = sanitizeUrlForLogging(
    "https://proyectopdisc.vercel.app/pages/nueva-contrasena.html#access_token=eyJabc.def&refresh_token=v1.ghi&type=recovery"
  );
  assert.equal(url, "https://proyectopdisc.vercel.app/pages/nueva-contrasena.html");
});

check("saca el hash del callback de OAuth de Google", () => {
  const url = sanitizeUrlForLogging(
    "https://proyectopdisc.vercel.app/pages/login.html#access_token=xyz&provider_token=abc&expires_in=3600"
  );
  assert.equal(url, "https://proyectopdisc.vercel.app/pages/login.html");
});

check("saca access_token/code/token_hash de la query string, no solo del hash", () => {
  const url = sanitizeUrlForLogging(
    "https://proyectopdisc.vercel.app/pages/nueva-contrasena.html?access_token=xyz&code=123&token_hash=abc&foo=bar"
  );
  assert.equal(url, "https://proyectopdisc.vercel.app/pages/nueva-contrasena.html?foo=bar");
});

check("una URL sin nada sensible sale intacta", () => {
  const url = sanitizeUrlForLogging("https://proyectopdisc.vercel.app/pages/search.html?q=pan");
  assert.equal(url, "https://proyectopdisc.vercel.app/pages/search.html?q=pan");
});

check("una URL inválida no revienta, devuelve null", () => {
  assert.equal(sanitizeUrlForLogging("no es una url"), null);
});


console.log("isDevHost");

check("localhost, 127.x, ::1 y redes privadas son desarrollo", () => {
  for (const h of ["localhost", "LOCALHOST", "app.localhost", "127.0.0.1", "127.1.2.3", "::1", "[::1]", "0.0.0.0",
    "192.168.0.10", "10.0.0.5", "172.16.0.1", "172.31.255.1", ""]) {
    assert.equal(isDevHost(h), true, h);
  }
});

check("el sitio publicado, los previews de Vercel y un dominio propio NO son desarrollo", () => {
  for (const h of ["proyectopdisc.vercel.app", "proyectopdisc-git-x-baradero-local.vercel.app",
    "baraderolocal.com.ar", "www.baraderolocal.com.ar", "172.32.0.1", "8.8.8.8", "localhost.com.ar"]) {
    assert.equal(isDevHost(h), false, h);
  }
});

if (process.exitCode) {
  console.error("\nHay fallas.");
} else {
  console.log("\nTodo bien.");
}

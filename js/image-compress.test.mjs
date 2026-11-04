/**
 * Tests de js/image-compress.js (la parte que no toca el navegador).
 * Correr con:  node js/image-compress.test.mjs
 */
import assert from "node:assert/strict";
import { fitWithin, shouldCompress, webpName, compressImage, IMAGE_PRESETS } from "./image-compress.js";

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

const file = (name, type, size) => new File([new Uint8Array(size)], name, { type });
/** Navegador simulado: decodifica a w x h y "codifica" a `outSize` bytes (o devuelve null). */
const fakeEnv = ({ w, h, outSize, outType = "image/webp", fail = null }) => {
  const calls = { encode: [], released: 0 };
  return {
    calls,
    decode: async () => { if (fail === "decode") throw new Error("no se puede decodificar"); return { width: w, height: h }; },
    encode: async (_d, ew, eh, q) => {
      if (fail === "encode") throw new Error("canvas roto");
      calls.encode.push({ ew, eh, q });
      return outSize == null ? null : new Blob([new Uint8Array(outSize)], { type: outType });
    },
    release: () => { calls.released++; },
  };
};
const realBlobEnv = fakeEnv;

console.log("fitWithin");
await check("achica al lado máximo sin deformar", () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200, scale: 0.4 });
  assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600, scale: 0.4 });
});
await check("no agranda lo que ya es chico", () => {
  assert.deepEqual(fitWithin(400, 300, 1600), { width: 400, height: 300, scale: 1 });
});
await check("medidas inválidas no explotan", () => {
  assert.deepEqual(fitWithin(0, 0, 1600), { width: 0, height: 0, scale: 1 });
  assert.equal(fitWithin(5000, 1, 1600).height, 1, "nunca queda en 0 px");
});

console.log("shouldCompress");
await check("un JPG de celular (grande y pesado) sí", () => {
  assert.equal(shouldCompress({ type: "image/jpeg", size: 4_000_000 }, { width: 4000, height: 3000 }, IMAGE_PRESETS.product), true);
});
await check("una foto chica y liviana no se toca", () => {
  assert.equal(shouldCompress({ type: "image/webp", size: 40_000 }, { width: 800, height: 800 }, IMAGE_PRESETS.product), false);
});
await check("liviana pero con más píxeles que el máximo sí (para achicar las medidas)", () => {
  assert.equal(shouldCompress({ type: "image/png", size: 50_000 }, { width: 3000, height: 3000 }, IMAGE_PRESETS.logo), true);
});
await check("GIF, SVG, PDF y tipos raros nunca", () => {
  for (const type of ["image/gif", "image/svg+xml", "application/pdf", "", undefined]) {
    assert.equal(shouldCompress({ type, size: 9_000_000 }, { width: 9000, height: 9000 }, IMAGE_PRESETS.product), false, String(type));
  }
});

console.log("webpName");
await check("cambia la extensión o la agrega", () => {
  assert.equal(webpName("foto.JPG"), "foto.webp");
  assert.equal(webpName("mi.foto.nueva.png"), "mi.foto.nueva.webp");
  assert.equal(webpName("sinextension"), "sinextension.webp");
  assert.equal(webpName(""), "foto.webp");
});

console.log("compressImage");
await check("una foto grande sale en WebP, al lado máximo, más liviana y con el nombre cambiado", async () => {
  const env = realBlobEnv({ w: 4000, h: 3000, outSize: 180_000 });
  const out = await compressImage(file("IMG_2041.jpg", "image/jpeg", 4_200_000), "product", env);
  assert.equal(out.type, "image/webp");
  assert.equal(out.name, "IMG_2041.webp");
  assert.equal(out.size, 180_000);
  assert.deepEqual(env.calls.encode[0], { ew: 1600, eh: 1200, q: 0.82 });
  assert.equal(env.calls.released, 1, "libera el bitmap");
});
await check("el uso cambia el tamaño: un logo sale a 512", async () => {
  const env = realBlobEnv({ w: 2000, h: 1000, outSize: 30_000 });
  await compressImage(file("logo.png", "image/png", 900_000), "logo", env);
  assert.deepEqual(env.calls.encode[0], { ew: 512, eh: 256, q: 0.85 });
});
await check("si ya es chica y liviana devuelve el MISMO archivo, sin codificar", async () => {
  const env = realBlobEnv({ w: 600, h: 600, outSize: 10 });
  const orig = file("a.webp", "image/webp", 30_000);
  assert.equal(await compressImage(orig, "product", env), orig);
  assert.equal(env.calls.encode.length, 0);
});
await check("si el resultado no es más liviano, se queda la original", async () => {
  const env = realBlobEnv({ w: 3000, h: 3000, outSize: 500_000 });
  const orig = file("a.jpg", "image/jpeg", 300_000);
  assert.equal(await compressImage(orig, "product", env), orig);
});
await check("sin WebP en el navegador (encode devuelve null) o si algo falla: la original, nunca un error", async () => {
  const orig = file("a.jpg", "image/jpeg", 3_000_000);
  assert.equal(await compressImage(orig, "product", realBlobEnv({ w: 4000, h: 3000, outSize: null })), orig);
  assert.equal(await compressImage(orig, "product", realBlobEnv({ w: 4000, h: 3000, outSize: 1, fail: "decode" })), orig);
  assert.equal(await compressImage(orig, "product", realBlobEnv({ w: 4000, h: 3000, outSize: 1, fail: "encode" })), orig);
});
await check("un PDF, un GIF, null o un uso inexistente pasan sin tocarse", async () => {
  const env = realBlobEnv({ w: 4000, h: 3000, outSize: 1000 });
  const pdf = file("a.pdf", "application/pdf", 5_000_000);
  const gif = file("a.gif", "image/gif", 5_000_000);
  assert.equal(await compressImage(pdf, "product", env), pdf);
  assert.equal(await compressImage(gif, "product", env), gif);
  assert.equal(await compressImage(null, "product", env), null);
  assert.equal(await compressImage(file("a.jpg", "image/jpeg", 5_000_000), "no-existe", env).then((f) => f.name), "a.jpg");
  assert.equal(env.calls.encode.length, 0);
});

if (process.exitCode) {
  console.error("\nHay fallas.");
} else {
  console.log("\nTodo bien.");
}

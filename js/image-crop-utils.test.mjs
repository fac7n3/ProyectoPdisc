/**
 * Correr con:  node js/image-crop-utils.test.mjs
 */
import assert from "node:assert/strict";
import { coverScale, clampOffset, sourceRect, outputSize } from "./image-crop-utils.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

console.log("image-crop-utils");

check("foto apaisada en marco cuadrado: cubre por el alto", () => {
  assert.equal(coverScale(2000, 1000, 300, 300), 0.3);
  assert.equal(coverScale(2000, 1000, 300, 300, 2), 0.6);
});

check("el desplazamiento no deja bordes vacíos", () => {
  const s = coverScale(2000, 1000, 300, 300); // foto de 600x300
  assert.deepEqual(clampOffset({ x: 50, y: 50 }, 2000, 1000, 300, 300, s), { x: 0, y: 0 });
  assert.deepEqual(clampOffset({ x: -999, y: -999 }, 2000, 1000, 300, 300, s), { x: -300, y: 0 });
});

check("el recorte sale en px de la foto original", () => {
  const s = coverScale(2000, 1000, 300, 300); // 0.3
  const r = sourceRect({ x: -150, y: 0 }, s, 300, 300);
  assert.deepEqual(r, { sx: 500, sy: 0, sw: 1000, sh: 1000 });
});

check("la salida no pasa de 1600 y conserva la proporción", () => {
  assert.deepEqual(outputSize(3200, 2400), { w: 1600, h: 1200 });
  assert.deepEqual(outputSize(800, 600), { w: 800, h: 600 });
});

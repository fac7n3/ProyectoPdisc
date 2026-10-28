/**
 * Correr con:  node js/install-app-utils.test.mjs
 */
import assert from "node:assert/strict";
import { detectMobilePlatform, installCardState } from "./install-app-utils.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

console.log("install-app-utils");

const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-G990E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

check("reconoce Android e iPhone por el navegador", () => {
  assert.equal(detectMobilePlatform({ userAgent: ANDROID }), "android");
  assert.equal(detectMobilePlatform({ userAgent: IPHONE }), "ios");
});

check("un iPad que se presenta como Mac cuenta como iOS; una Mac de verdad no", () => {
  assert.equal(detectMobilePlatform({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 5 }), "ios");
  assert.equal(detectMobilePlatform({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 }), null);
});

check("una computadora no muestra la tarjeta", () => {
  assert.equal(detectMobilePlatform({ userAgent: WINDOWS, platform: "Win32", maxTouchPoints: 10 }), null);
  assert.equal(installCardState({ platform: null, standalone: false, installed: false, canPrompt: true }), "hidden");
});

check("dentro de la app instalada no se ofrece instalarla", () => {
  assert.equal(installCardState({ platform: "android", standalone: true, installed: false, canPrompt: false }), "hidden");
  assert.equal(installCardState({ platform: "ios", standalone: true, installed: true, canPrompt: false }), "hidden");
});

check("con la app ya instalada avisa en vez de ofrecer el botón", () => {
  assert.equal(installCardState({ platform: "android", standalone: false, installed: true, canPrompt: true }), "installed");
});

check("Chrome en Android con el cartel disponible: botón Instalar", () => {
  assert.equal(installCardState({ platform: "android", standalone: false, installed: false, canPrompt: true }), "prompt");
});

check("sin el cartel del navegador: los pasos de cada sistema", () => {
  assert.equal(installCardState({ platform: "android", standalone: false, installed: false, canPrompt: false }), "android-steps");
  assert.equal(installCardState({ platform: "ios", standalone: false, installed: false, canPrompt: false }), "ios-steps");
});

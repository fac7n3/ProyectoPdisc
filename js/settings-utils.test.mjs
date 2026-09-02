/**
 * Chequeo de las preferencias por dispositivo.
 * Correr con:  node js/settings-utils.test.mjs
 *
 * Corto pero vale: acá lo que importa son los defaults (qué pasa con quien
 * nunca entró a Ajustes) y que un storage roto no rompa la página — los dos
 * casos que en el navegador solo se ven cuando ya fallaron.
 *
 * Los stubs se definen ANTES del import: el módulo se evalúa al importarse.
 */
import assert from "node:assert/strict";

const store = new Map();
let storageThrows = false;

globalThis.localStorage = {
  getItem(k) {
    if (storageThrows) throw new Error("storage bloqueado");
    return store.has(k) ? store.get(k) : null;
  },
  setItem(k, v) {
    if (storageThrows) throw new Error("storage bloqueado");
    store.set(k, String(v));
  },
};

const classes = new Set();
globalThis.document = {
  documentElement: {
    classList: {
      toggle(name, on) { on ? classes.add(name) : classes.delete(name); },
    },
  },
};

const { getPref, setPref, applyDevicePreferences } = await import("./settings-utils.js");

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

console.log("settings-utils");

check("sin nada guardado usa el default de cada preferencia", () => {
  store.clear();
  assert.equal(getPref("notifToasts"), true);
  assert.equal(getPref("reduceMotion"), false);
});

check("guarda y vuelve a leer el valor", () => {
  store.clear();
  setPref("notifToasts", false);
  assert.equal(getPref("notifToasts"), false);
  setPref("notifToasts", true);
  assert.equal(getPref("notifToasts"), true);
});

check("una preferencia que no existe no rompe ni escribe nada", () => {
  store.clear();
  assert.equal(getPref("inventada"), false);
  setPref("inventada", true);
  assert.equal(store.size, 0);
});

check("con el storage bloqueado devuelve el default en vez de tirar", () => {
  store.clear();
  storageThrows = true;
  assert.equal(getPref("notifToasts"), true);
  assert.doesNotThrow(() => setPref("reduceMotion", true));
  storageThrows = false;
});

console.log("applyDevicePreferences");

check("prende y apaga la clase de reducir animaciones en <html>", () => {
  store.clear();
  applyDevicePreferences();
  assert.equal(classes.has("bl-reduce-motion"), false);

  setPref("reduceMotion", true);
  assert.equal(classes.has("bl-reduce-motion"), true);

  setPref("reduceMotion", false);
  assert.equal(classes.has("bl-reduce-motion"), false);
});

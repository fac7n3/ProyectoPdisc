import assert from "node:assert/strict";
import {
  BARADERO_CENTER, isValidPoint, roundPoint, isNearBaradero, parseCoordsFromMapsUrl,
  loadUserLocation, saveUserLocation, locationParams,
} from "./store-location-utils.js";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("  ok ", name); } catch (e) { failed++; console.log("  FAIL", name, "\n    ", e.message); }
}

console.log("isValidPoint / roundPoint");
check("punto válido", () => assert.equal(isValidPoint({ lat: -33.8, lng: -59.5 }), true));
check("fuera de rango o faltante", () => {
  assert.equal(isValidPoint({ lat: -91, lng: 0 }), false);
  assert.equal(isValidPoint({ lat: 0, lng: 181 }), false);
  assert.equal(isValidPoint({ lat: NaN, lng: 0 }), false);
  assert.equal(isValidPoint(null), false);
});
check("redondea a 6 decimales", () =>
  assert.deepEqual(roundPoint({ lat: -33.81061234567, lng: -59.50479999999 }), { lat: -33.810612, lng: -59.5048 }));

console.log("isNearBaradero");
check("el centro está cerca", () => assert.equal(isNearBaradero(BARADERO_CENTER), true));
check("Santa Coloma (~20 km) entra", () => assert.equal(isNearBaradero({ lat: -33.6167, lng: -59.5667 }), true));
check("CABA (~140 km) no", () => assert.equal(isNearBaradero({ lat: -34.6037, lng: -58.3816 }), false));
check("punto inválido no", () => assert.equal(isNearBaradero(null), false));

console.log("parseCoordsFromMapsUrl");
check("lugar marcado (!3d!4d) gana al centro de la vista (@)", () =>
  assert.deepEqual(
    parseCoordsFromMapsUrl("https://www.google.com/maps/place/Mitre+1234/@-33.8100,-59.5000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-33.8112346!4d-59.5056789"),
    { lat: -33.811235, lng: -59.505679 }));
check("solo @lat,lng", () =>
  assert.deepEqual(parseCoordsFromMapsUrl("https://www.google.com/maps/@-33.81,-59.505,18z"), { lat: -33.81, lng: -59.505 }));
check("?q=lat,lng y ?query= (codificado)", () => {
  assert.deepEqual(parseCoordsFromMapsUrl("https://maps.google.com/?q=-33.81,-59.50"), { lat: -33.81, lng: -59.5 });
  assert.deepEqual(parseCoordsFromMapsUrl("https://www.google.com/maps/search/?api=1&query=-33.81%2C-59.50"), { lat: -33.81, lng: -59.5 });
});
check("link corto sin coordenadas => null", () => assert.equal(parseCoordsFromMapsUrl("https://maps.app.goo.gl/AbCdEf123"), null));
check("búsqueda por texto => null", () => assert.equal(parseCoordsFromMapsUrl("https://www.google.com/maps/search/Mitre+1234+Baradero"), null));
check("vacío / basura => null", () => {
  assert.equal(parseCoordsFromMapsUrl(""), null);
  assert.equal(parseCoordsFromMapsUrl(null), null);
  assert.equal(parseCoordsFromMapsUrl("https://www.google.com/maps/@999,999,1z"), null);
});

console.log("ubicación de la persona -> parámetros de search_products");
check("sin sessionStorage (node) => sin parámetros", () => {
  assert.equal(loadUserLocation(), null);
  assert.deepEqual(locationParams(), {});
});
check("guardada => p_lat/p_lng; basura => sin parámetros", () => {
  const store = new Map();
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  try {
    assert.deepEqual(locationParams(), {});
    saveUserLocation(-33.81, -59.5);
    assert.deepEqual(locationParams(), { p_lat: -33.81, p_lng: -59.5 });
    store.set("bl_nearby_location", "{roto");
    assert.deepEqual(locationParams(), {});
    store.set("bl_nearby_location", JSON.stringify({ lat: 999, lng: 0 }));
    assert.equal(loadUserLocation(), null);
  } finally {
    delete globalThis.sessionStorage;
  }
});

if (failed) { console.log(`\n${failed} fallaron`); process.exit(1); }
console.log("\nTodo ok");

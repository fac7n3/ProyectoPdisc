/**
 * Chequeo del autocompletado de direcciones.
 * Correr con:  node js/address-suggest-utils.test.mjs
 *
 * Los dos casos que rompían en el navegador: la misma calle repetida una vez
 * por tramo, y el número de puerta desapareciendo al elegir la sugerencia.
 * Los resultados de abajo son la respuesta real de Nominatim para
 * "mitre 1234, Baradero, Buenos Aires, Argentina" (recortada).
 */
import assert from "node:assert/strict";
import {
  houseNumberFrom,
  streetOf,
  areaOf,
  suggestionLabel,
  dedupeByStreet,
} from "./address-suggest-utils.js";

const mitreA = {
  display_name: "Mitre, Maipu, Baradero, Partido de Baradero, Buenos Aires, B2942CDC, Argentina",
  address: { road: "Mitre", residential: "Maipu", town: "Baradero", state: "Buenos Aires", postcode: "B2942CDC" },
};
const mitreB = {
  display_name: "Mitre, Maipu, Baradero, Partido de Baradero, Buenos Aires, B2942CSH, Argentina",
  address: { road: "Mitre", residential: "Maipu", town: "Baradero", state: "Buenos Aires", postcode: "B2942CSH" },
};
const plazaMitre = {
  display_name: "Plaza Mitre, Baradero, Partido de Baradero, Buenos Aires, Argentina",
  address: { town: "Baradero", state: "Buenos Aires" },
};

// El número que escribe la persona se rescata del texto, venga o no de OSM.
assert.equal(houseNumberFrom("mitre 1234"), "1234");
assert.equal(houseNumberFrom("  Mitre 1234  "), "1234");
assert.equal(houseNumberFrom("mitre"), "");
assert.equal(houseNumberFrom(""), "");
assert.equal(houseNumberFrom(null), "");

// Calle y zona salen del address; si no hay road, del display_name.
assert.equal(streetOf(mitreA), "Mitre");
assert.equal(streetOf(plazaMitre), "Plaza Mitre");
assert.equal(areaOf(mitreA), "Maipu, Baradero, Buenos Aires");
assert.equal(areaOf(plazaMitre), "Baradero, Buenos Aires");

// El bug principal: elegir la sugerencia NO puede borrar el número escrito.
assert.equal(suggestionLabel(mitreA, "1234"), "Mitre 1234");
assert.equal(suggestionLabel(mitreA, ""), "Mitre");
// Si OSM sí conoce la altura, esa gana sobre la tipeada.
assert.equal(
  suggestionLabel({ address: { road: "Mitre", house_number: "800" } }, "1234"),
  "Mitre 800"
);

// El otro bug: dos filas idénticas por ser dos tramos de la misma calle.
const rows = dedupeByStreet([mitreA, mitreB, plazaMitre]);
assert.equal(rows.length, 2);
assert.deepEqual(rows.map(streetOf), ["Mitre", "Plaza Mitre"]);
assert.equal(dedupeByStreet([mitreA, mitreB, plazaMitre], 1).length, 1);
assert.deepEqual(dedupeByStreet([]), []);
assert.deepEqual(dedupeByStreet(null), []);

console.log("address-suggest-utils: OK");

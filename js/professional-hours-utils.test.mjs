import assert from "node:assert/strict";
import {
  minutosDeHora,
  formatearHora,
  agruparPorDia,
  formatearFranjas,
  estaAbiertoAhora,
  resumenDisponibilidad,
} from "./professional-hours-utils.js";

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FALLA  ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
};

// Un miércoles cualquiera a la hora que haga falta. Mes 0 = enero.
const miercoles = (hora, minuto = 0) => new Date(2026, 0, 7, hora, minuto);
const franja = (dia, desde, hasta) => ({
  day_of_week: dia,
  open_time: desde,
  close_time: hasta,
});

console.log("minutosDeHora");
check("convierte 'HH:MM:SS' y 'HH:MM'", () => {
  assert.equal(minutosDeHora("09:30:00"), 570);
  assert.equal(minutosDeHora("09:30"), 570);
  assert.equal(minutosDeHora("00:00:00"), 0);
  assert.equal(minutosDeHora("23:59:00"), 1439);
});

check("devuelve null con basura o con horas imposibles", () => {
  assert.equal(minutosDeHora(""), null);
  assert.equal(minutosDeHora(null), null);
  assert.equal(minutosDeHora("mediodía"), null);
  assert.equal(minutosDeHora("25:00"), null);
  assert.equal(minutosDeHora("10:75"), null);
});

console.log("formatearHora");
check("recorta los segundos que trae Postgres", () => {
  assert.equal(formatearHora("09:30:00"), "09:30");
  assert.equal(formatearHora("9:05"), "09:05");
  assert.equal(formatearHora("cualquiera"), "");
});

console.log("agruparPorDia");
check("arma siete días aunque no haya horarios", () => {
  const dias = agruparPorDia([]);
  assert.equal(dias.length, 7);
  assert.deepEqual(dias[3], []);
});

check("ordena las franjas del día por hora de apertura", () => {
  const dias = agruparPorDia([
    franja(3, "16:00:00", "20:00:00"),
    franja(3, "09:00:00", "13:00:00"),
  ]);
  assert.equal(dias[3].length, 2);
  assert.equal(dias[3][0].open_time, "09:00:00");
});

check("descarta filas con día o con hora inválida", () => {
  const dias = agruparPorDia([
    franja(9, "09:00:00", "13:00:00"),
    franja(2, "no es hora", "13:00:00"),
    { day_of_week: 1 },
    null,
  ]);
  assert.deepEqual(dias.flat(), []);
});

console.log("formatearFranjas");
check("une el corte del mediodía con una 'y'", () => {
  assert.equal(
    formatearFranjas([
      { open_time: "09:00:00", close_time: "13:00:00" },
      { open_time: "16:00:00", close_time: "20:00:00" },
    ]),
    "09:00 a 13:00 y 16:00 a 20:00"
  );
});

check("un día sin franjas no muestra nada", () => {
  assert.equal(formatearFranjas([]), "");
  assert.equal(formatearFranjas(undefined), "");
});

console.log("estaAbiertoAhora");
const jornadaPartida = [
  franja(3, "09:00:00", "13:00:00"),
  franja(3, "16:00:00", "20:00:00"),
];

check("está abierto dentro de la franja", () => {
  assert.equal(estaAbiertoAhora({ horarios: jornadaPartida }, miercoles(10)), true);
  assert.equal(estaAbiertoAhora({ horarios: jornadaPartida }, miercoles(17, 30)), true);
});

check("está cerrado en el corte del mediodía y fuera de hora", () => {
  assert.equal(estaAbiertoAhora({ horarios: jornadaPartida }, miercoles(14)), false);
  assert.equal(estaAbiertoAhora({ horarios: jornadaPartida }, miercoles(8, 59)), false);
  assert.equal(estaAbiertoAhora({ horarios: jornadaPartida }, miercoles(22)), false);
});

check("el borde de apertura abre y el de cierre ya no", () => {
  assert.equal(estaAbiertoAhora({ horarios: jornadaPartida }, miercoles(9, 0)), true);
  assert.equal(estaAbiertoAhora({ horarios: jornadaPartida }, miercoles(13, 0)), false);
});

check("no confunde el horario de otro día", () => {
  const soloLunes = [franja(1, "09:00:00", "18:00:00")];
  assert.equal(estaAbiertoAhora({ horarios: soloLunes }, miercoles(10)), false);
});

check("quien atiende urgencias 24 h siempre figura abierto", () => {
  assert.equal(estaAbiertoAhora({ horarios: [], serves24h: true }, miercoles(3)), true);
});

check("sin horarios cargados no está abierto", () => {
  assert.equal(estaAbiertoAhora({}, miercoles(10)), false);
  assert.equal(estaAbiertoAhora({ horarios: [] }, miercoles(10)), false);
});

console.log("resumenDisponibilidad");
check("dice que está abierto cuando lo está", () => {
  assert.equal(resumenDisponibilidad({ horarios: jornadaPartida }, miercoles(10)), "Abierto ahora");
});

check("en el corte del mediodía avisa a qué hora vuelve", () => {
  assert.equal(resumenDisponibilidad({ horarios: jornadaPartida }, miercoles(14)), "Abre a las 16:00");
});

check("después de cerrar salta al próximo día con horario", () => {
  const soloMiercoles = [franja(3, "09:00:00", "13:00:00")];
  // El miércoles a las 22 el próximo turno es recién el miércoles que viene.
  assert.equal(
    resumenDisponibilidad({ horarios: soloMiercoles }, miercoles(22)),
    "Abre el miércoles a las 09:00"
  );
  const miercolesYJueves = [...soloMiercoles, franja(4, "10:00:00", "15:00:00")];
  assert.equal(
    resumenDisponibilidad({ horarios: miercolesYJueves }, miercoles(22)),
    "Abre mañana a las 10:00"
  );
});

check("las urgencias 24 h ganan sobre cualquier horario", () => {
  assert.equal(
    resumenDisponibilidad({ horarios: jornadaPartida, serves24h: true }, miercoles(3)),
    "Atiende urgencias 24 h"
  );
});

check("sin horarios cargados no dice nada", () => {
  assert.equal(resumenDisponibilidad({ horarios: [] }, miercoles(10)), "");
});

if (!process.exitCode) console.log("\nTodo bien.");

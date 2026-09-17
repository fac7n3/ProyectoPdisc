// Zonas de cobertura que puede elegir un profesional/técnico en su panel
// (pages/profesional.html) y que se muestran en su tarjeta de contratar.html.
//
// Lista fija compartida, mismo criterio que professional-categories.js: en la
// base `professional_service_areas.zone_name` es texto con un CHECK de largo
// nomás, así que sumar o renombrar una zona se hace acá y no cuesta una
// migración.
//
// OJO: las cuatro últimas son localidades reales del partido de Baradero; las
// primeras son divisiones genéricas del casco urbano. Conviene repasarlas con
// alguien que camine el pueblo antes de darlas por definitivas.

export const PROFESSIONAL_ZONES = [
  'Centro',
  'Barrio Norte',
  'Barrio Sur',
  'Barrio Este',
  'Barrio Oeste',
  'Zona rural',
  'Santa Coloma',
  'Irineo Portela',
  'Alsina',
  'Villa Alsina',
];

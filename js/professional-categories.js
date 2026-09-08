// Categorías fijas del directorio "Contratar" -- compartidas por el alta
// (vender.js), el admin y la página pública (contratar.js/home.js) para no
// repetir la lista ni arriesgar que se desincronicen.

export const PROFESSIONAL_CATEGORIES = [
  { value: 'hogar', label: 'Hogar y reparaciones', icon: 'fa-solid fa-house-chimney' },
  { value: 'clases', label: 'Clases y particulares', icon: 'fa-solid fa-graduation-cap' },
  { value: 'cuidado', label: 'Cuidado de personas', icon: 'fa-solid fa-hand-holding-heart' },
  { value: 'belleza', label: 'Belleza y estética', icon: 'fa-solid fa-scissors' },
  { value: 'tecnologia', label: 'Tecnología', icon: 'fa-solid fa-laptop' },
  { value: 'eventos', label: 'Eventos y otros', icon: 'fa-solid fa-champagne-glasses' },
];

export function categoryLabel(value) {
  return PROFESSIONAL_CATEGORIES.find((c) => c.value === value)?.label || value;
}

export function categoryIcon(value) {
  return PROFESSIONAL_CATEGORIES.find((c) => c.value === value)?.icon || 'fa-solid fa-briefcase';
}

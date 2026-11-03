/**
 * category-icons.js — Lista CERRADA de íconos que el admin puede elegir para una
 * categoría nueva (antes era un campo de texto donde se escribía cualquier clase
 * de Font Awesome).
 *
 * Por qué cerrada: el sitio carga una versión RECORTADA de Font Awesome con solo
 * los íconos que usa (scripts/subset-fontawesome.mjs). Un ícono escrito a mano
 * que no esté en el recorte se vería como un cuadradito vacío. Esta lista entra
 * en el recorte automáticamente (el script lee todo js/), así que lo que se
 * ofrece acá siempre se ve. Para sumar uno: agregarlo acá y correr
 * `npm run subset-icons`.
 *
 * Incluye los 17 que ya usan las categorías de la base (`categories.icon`).
 */
export const CATEGORY_ICON_OPTIONS = [
  { value: 'fa-solid fa-box', label: 'Caja (almacén)' },
  { value: 'fa-solid fa-basket-shopping', label: 'Canasta' },
  { value: 'fa-solid fa-cart-shopping', label: 'Carrito (supermercado)' },
  { value: 'fa-solid fa-bag-shopping', label: 'Bolsa de compras' },
  { value: 'fa-solid fa-store', label: 'Local' },
  { value: 'fa-solid fa-wine-bottle', label: 'Botella (bebidas)' },
  { value: 'fa-solid fa-mug-hot', label: 'Taza (café, infusiones)' },
  { value: 'fa-solid fa-beer-mug-empty', label: 'Cerveza' },
  { value: 'fa-solid fa-drumstick-bite', label: 'Pata de pollo (carnicería)' },
  { value: 'fa-solid fa-fish', label: 'Pescado' },
  { value: 'fa-solid fa-egg', label: 'Huevo' },
  { value: 'fa-solid fa-cheese', label: 'Queso (lácteos)' },
  { value: 'fa-solid fa-bread-slice', label: 'Pan (panadería)' },
  { value: 'fa-solid fa-cake-candles', label: 'Torta (pastelería)' },
  { value: 'fa-solid fa-ice-cream', label: 'Helado' },
  { value: 'fa-solid fa-candy-cane', label: 'Golosina (kiosco)' },
  { value: 'fa-solid fa-pizza-slice', label: 'Pizza' },
  { value: 'fa-solid fa-burger', label: 'Hamburguesa (comidas)' },
  { value: 'fa-solid fa-apple-whole', label: 'Manzana (verdulería)' },
  { value: 'fa-solid fa-carrot', label: 'Zanahoria' },
  { value: 'fa-solid fa-seedling', label: 'Plantas (vivero)' },
  { value: 'fa-solid fa-paw', label: 'Patita (forrajería, mascotas)' },
  { value: 'fa-solid fa-hammer', label: 'Martillo (ferretería)' },
  { value: 'fa-solid fa-screwdriver-wrench', label: 'Herramientas' },
  { value: 'fa-solid fa-paint-roller', label: 'Pintura' },
  { value: 'fa-solid fa-broom', label: 'Escoba (limpieza)' },
  { value: 'fa-solid fa-spray-can-sparkles', label: 'Aerosol (limpieza)' },
  { value: 'fa-solid fa-pump-soap', label: 'Jabón (perfumería)' },
  { value: 'fa-solid fa-pills', label: 'Pastillas (farmacia)' },
  { value: 'fa-solid fa-stethoscope', label: 'Salud' },
  { value: 'fa-solid fa-shirt', label: 'Remera (ropa)' },
  { value: 'fa-solid fa-gem', label: 'Joyas y accesorios' },
  { value: 'fa-solid fa-baby', label: 'Bebés' },
  { value: 'fa-solid fa-gift', label: 'Regalos' },
  { value: 'fa-solid fa-book', label: 'Libro (librería)' },
  { value: 'fa-solid fa-pencil', label: 'Lápiz (papelería)' },
  { value: 'fa-solid fa-laptop', label: 'Notebook (tecnología)' },
  { value: 'fa-solid fa-mobile-screen', label: 'Celulares' },
  { value: 'fa-solid fa-gamepad', label: 'Videojuegos' },
  { value: 'fa-solid fa-car', label: 'Auto (repuestos)' },
  { value: 'fa-solid fa-bicycle', label: 'Bicicletas' },
  { value: 'fa-solid fa-futbol', label: 'Deportes' },
  { value: 'fa-solid fa-couch', label: 'Muebles y hogar' },
  { value: 'fa-solid fa-guitar', label: 'Música' },
  // Ícono propio (Assets/styles/home.css): una zapatilla. Font Awesome gratis solo trae huellas.
  { value: 'fa-solid bl-icon-zapatilla', label: 'Zapatilla (zapatería)' },
];

const ALLOWED = new Set(CATEGORY_ICON_OPTIONS.map((o) => o.value));

/** true si `value` es un ícono de la lista (o vacío: la categoría queda con el de respaldo). */
export function isAllowedCategoryIcon(value) {
  const v = String(value ?? '').trim();
  return v === '' || ALLOWED.has(v);
}

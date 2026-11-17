// Publica el alto real del navbar como `--bl-navbar-height` (CSS), para que los
// elementos `position: sticky` de una página (ej. el menú lateral de "Mi cuenta")
// se peguen justo debajo de él en vez de quedar tapados. Mismo nombre de variable
// que usa `nav-utils.js` en el resto del sitio.

/** Mide el navbar y escribe la variable. Devuelve el alto (px). */
export function syncNavbarHeight(doc = document) {
  const navbar = doc.querySelector('.navbar');
  const height = navbar ? navbar.getBoundingClientRect().height : 0;
  doc.documentElement.style.setProperty('--bl-navbar-height', `${height}px`);
  return height;
}

/** Sincroniza ahora y cada vez que el navbar cambie de tamaño. Idempotente. */
export function watchNavbarHeight(doc = document, win = window) {
  if (doc.documentElement.dataset.navbarHeightWatch) return;
  doc.documentElement.dataset.navbarHeightWatch = '1';
  syncNavbarHeight(doc);
  const navbar = doc.querySelector('.navbar');
  if (win.ResizeObserver && navbar) {
    new win.ResizeObserver(() => syncNavbarHeight(doc)).observe(navbar);
  } else {
    win.addEventListener('resize', () => syncNavbarHeight(doc), { passive: true });
  }
}

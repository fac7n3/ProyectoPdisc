// Campanita, cuenta y carrito del navbar en las páginas informativas (Ayuda,
// Privacidad, Términos), que no tienen un script propio de página.
import { updateCartBadge } from './cart-utils.js';
import { initNotificationsBell, initAccountMenu } from './nav-utils.js';

updateCartBadge();
initNotificationsBell();
initAccountMenu();

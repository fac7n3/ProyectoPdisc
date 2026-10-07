-- Ícono de Forrajería: una patita de perro (fa-paw) en vez de la espiga de trigo
-- (fa-wheat-awn). Se cambia en la base (lo usan los selectores de rubro de los
-- formularios de vender) y en CATEGORY_ICONS de js/nav-utils.js (menú de categorías).
update categories
set icon = 'fa-solid fa-paw'
where slug = 'forrajeria';

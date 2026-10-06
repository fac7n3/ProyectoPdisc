-- Ícono de Zapatería: una zapatilla en vez de huellas de pies (fa-shoe-prints).
-- `bl-icon-zapatilla` es una clase propia (Assets/styles/home.css) que dibuja
-- /img/icono-zapatilla.svg con el color del texto.
update categories
set icon = 'fa-solid bl-icon-zapatilla'
where slug = 'zapateria';

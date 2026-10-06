-- Alta de la categoría "Zapatería" (a pedido del usuario). Igual que Supermercado
-- (121): es una fila más de `categories`, así que el mega-menú, el buscador, los
-- filtros y los formularios de publicación la toman sola.
-- (Ícono en el menú: ver CATEGORY_ICONS en js/nav-utils.js.)

insert into categories (name, slug, icon)
select 'Zapatería', 'zapateria', 'fa-solid fa-shoe-prints'
where not exists (select 1 from categories where slug = 'zapateria');

-- Alta de la categoría "Supermercado" (a pedido del usuario). Es una fila más de
-- `categories`: el mega-menú, el buscador, los filtros y los formularios de
-- publicación la leen de ahí, así que aparece sola en todas las páginas.
-- (Ícono en el menú: ver CATEGORY_ICONS en js/nav-utils.js.)

insert into categories (name, slug, icon)
select 'Supermercado', 'supermercado', 'fa-solid fa-cart-shopping'
where not exists (select 1 from categories where slug = 'supermercado');

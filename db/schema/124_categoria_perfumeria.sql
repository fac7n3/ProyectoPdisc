-- Alta de la categoría "Perfumería" (2026-10-06), para los productos de
-- perfumería e higiene personal que se cargan con las fotos del Drive
-- (migración 125). Igual que Supermercado (121) y Zapatería (122): es una fila
-- más de `categories`, así que el mega-menú, el buscador, los filtros y los
-- formularios de publicación la toman sola.
-- (Ícono en el menú: ver CATEGORY_ICONS en js/nav-utils.js.)

insert into categories (name, slug, icon)
select 'Perfumería', 'perfumeria', 'fa-solid fa-pump-soap'
where not exists (select 1 from categories where slug = 'perfumeria');
